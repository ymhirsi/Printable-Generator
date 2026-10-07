// Vanilla-canvas keyboard auto-detect. No WASM, no async runtime — synchronous
// pixel work via the Canvas 2D API.
//
// Pipeline:
//   1. Downscale to ~1280 px wide for speed; remember the scale to map corners
//      back to full-resolution coordinates.
//   2. For every pixel, compute (a) a "whiteness" flag (bright + low saturation)
//      and (b) a YCbCr skin flag.
//   3. Find the keyboard's vertical extent: per-row whiteness profile
//      (skin-excluded) → first rising edge above threshold is the top of the
//      white-key band, last is the bottom.
//   4. Find horizontal extent the same way inside that band.
//   5. For each of N column strips along the band, find the topmost and
//      bottommost whiteness-dominant row. For each of M row strips inside the
//      lateral body, find the leftmost and rightmost whiteness-dominant column.
//   6. The TRUE top edge is at the LOW percentile of the per-column topmost
//      rows: most strips' topmost-white row sits just below where the black
//      keys cover the back of the white keys, but the strips that fall between
//      black-key groups reach the true back-of-keys. The same percentile-tail
//      logic gives the bottom, left, and right edges robust to hand occlusion.
//   7. Least-squares fit a line through the inliers of each edge, intersect
//      pairwise to get the four trapezoid corners.
//   8. Verify orientation with the black-key pattern (the 88-key span starts
//      with an isolated B♭0 group of 1 on the left and ends with the A♯7
//      group of 3 on the right), flipping the quad if needed.
//   9. Map the corners back to full-resolution pixel space.
//
// Returns { quad: [TL, TR, BR, BL] | null, confidence, reason }.

const TL = 0, TR = 1, BR = 2, BL = 3;

export async function detectKeyboard(imageEl) {
  const FULL_W = imageEl.naturalWidth;
  const FULL_H = imageEl.naturalHeight;

  // 1. Downscale to ~1280 px wide.
  const targetW = Math.min(1280, FULL_W);
  const scale = targetW / FULL_W;
  const W = Math.max(2, Math.round(FULL_W * scale));
  const H = Math.max(2, Math.round(FULL_H * scale));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageEl, 0, 0, W, H);
  const imageData = ctx.getImageData(0, 0, W, H);
  const px = imageData.data;

  // 2. Per-pixel features. Use Otsu on the luminance histogram to pick a
  // bright/dark threshold that adapts to lighting; combine with a saturation
  // ceiling to reject colored bright things (gold strings, warm wood, etc.).
  const yHist = new Uint32Array(256);
  const lum = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const Y = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    lum[i] = Y;
    yHist[Y]++;
  }
  const otsuY = otsu(yHist, W * H);
  // Otsu tends to sit at the trough between dark and bright; pull the
  // whiteness threshold a touch above it so the keys-only side wins.
  const yThr = Math.max(120, Math.min(220, otsuY + 10));

  const isWhite = new Uint8Array(W * H);
  const isSkin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const Y = lum[i];

    // Saturation proxy (max - min on RGB). Pure white = 0, warm cream ≈ 20,
    // wood ≈ 40-80, skin ≈ 40-90, saturated colors ≥ 80.
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const sat = mx - mn;

    isWhite[i] = (Y >= yThr && sat <= 45) ? 1 : 0;

    // YCbCr skin detection (ITU-R BT.601). Cb < 127 (yellowish) and Cr > 133
    // (reddish) captures most skin tones across pigmentation; the Y range
    // excludes specular highlights on white keys.
    const Cb = -0.169 * r - 0.331 * g + 0.5   * b + 128;
    const Cr =  0.5   * r - 0.419 * g - 0.081 * b + 128;
    isSkin[i] = (Y > 60 && Y < 240 && Cb > 77 && Cb < 127 && Cr > 133 && Cr < 175) ? 1 : 0;
  }

  // Whiteness with skin excluded — this is the signal we sample for edges.
  // Combine into a single byte so the inner loops stay tight.
  const keyMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) keyMask[i] = (isWhite[i] && !isSkin[i]) ? 1 : 0;

  // 3. Vertical extent from row whiteness profile.
  const rowSum = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    const base = y * W;
    for (let x = 0; x < W; x++) s += keyMask[base + x];
    rowSum[y] = s;
  }
  let rowMax = 0;
  for (let y = 0; y < H; y++) if (rowSum[y] > rowMax) rowMax = rowSum[y];
  if (rowMax < W * 0.15) {
    return { quad: null, confidence: 0, reason: 'no bright key-like region found' };
  }
  const rowThr = Math.max(rowMax * 0.35, W * 0.10);
  let bandTop = -1, bandBot = -1;
  for (let y = 0; y < H; y++) if (rowSum[y] >= rowThr) { bandTop = y; break; }
  for (let y = H - 1; y >= 0; y--) if (rowSum[y] >= rowThr) { bandBot = y; break; }
  if (bandTop < 0 || bandBot - bandTop < H * 0.04) {
    return { quad: null, confidence: 0, reason: 'no horizontal key band detected' };
  }

  // 4. Horizontal extent within the band.
  const colSum = new Int32Array(W);
  for (let y = bandTop; y <= bandBot; y++) {
    const base = y * W;
    for (let x = 0; x < W; x++) colSum[x] += keyMask[base + x];
  }
  let colMax = 0;
  for (let x = 0; x < W; x++) if (colSum[x] > colMax) colMax = colSum[x];
  const colThr = Math.max(colMax * 0.40, (bandBot - bandTop) * 0.15);
  let bandLeft = -1, bandRight = -1;
  for (let x = 0; x < W; x++) if (colSum[x] >= colThr) { bandLeft = x; break; }
  for (let x = W - 1; x >= 0; x--) if (colSum[x] >= colThr) { bandRight = x; break; }
  if (bandLeft < 0 || bandRight - bandLeft < W * 0.25) {
    return { quad: null, confidence: 0, reason: 'no lateral key extent detected' };
  }

  // Sanity: aspect ratio of the rough box. 88 keys ≈ 10–14:1 from overhead.
  const roughAspect = (bandRight - bandLeft) / (bandBot - bandTop);
  if (roughAspect < 3.5 || roughAspect > 22) {
    return { quad: null, confidence: 0, reason: `key band aspect ${roughAspect.toFixed(1)} not keyboard-like` };
  }

  // 5. Per-strip edge sampling.
  // Sample with a vertical padding so the search reaches the true back-of-keys
  // even when the rough band started below it (rare but possible).
  const padY = Math.max(8, Math.round((bandBot - bandTop) * 0.25));
  const yStart = Math.max(0, bandTop - padY);
  const yEnd   = Math.min(H - 1, bandBot + padY);
  const padX = Math.max(4, Math.round((bandRight - bandLeft) * 0.02));
  const xStart = Math.max(0, bandLeft - padX);
  const xEnd   = Math.min(W - 1, bandRight + padX);

  const bandW = bandRight - bandLeft;
  const bandH = bandBot - bandTop;
  const colStripCount = Math.max(40, Math.min(140, Math.round(bandW / 10)));
  const rowStripCount = Math.max(12, Math.min(40, Math.round(bandH / 6)));

  const topPts = [], bottomPts = [];
  for (let i = 0; i < colStripCount; i++) {
    const x0 = bandLeft + Math.floor((i * bandW) / colStripCount);
    const x1 = bandLeft + Math.floor(((i + 1) * bandW) / colStripCount);
    if (x1 <= x0) continue;
    const cx = (x0 + x1) / 2;
    const span = x1 - x0;
    const need = Math.max(2, Math.floor(span * 0.5));

    let topY = -1;
    for (let y = yStart; y <= yEnd; y++) {
      let cnt = 0;
      const base = y * W;
      for (let x = x0; x < x1; x++) cnt += keyMask[base + x];
      if (cnt >= need) { topY = y; break; }
    }
    let botY = -1;
    for (let y = yEnd; y >= yStart; y--) {
      let cnt = 0;
      const base = y * W;
      for (let x = x0; x < x1; x++) cnt += keyMask[base + x];
      if (cnt >= need) { botY = y; break; }
    }
    if (topY >= 0) topPts.push([cx, topY]);
    if (botY >= 0) bottomPts.push([cx, botY]);
  }

  // Sample left/right strictly inside the band so the search isn't biased by
  // the perspective-stretched top/bottom corner pixels.
  const leftPts = [], rightPts = [];
  const yInner0 = bandTop + Math.floor(bandH * 0.25);
  const yInner1 = bandTop + Math.floor(bandH * 0.75);
  const innerH = yInner1 - yInner0;
  for (let i = 0; i < rowStripCount; i++) {
    const y0 = yInner0 + Math.floor((i * innerH) / rowStripCount);
    const y1 = yInner0 + Math.floor(((i + 1) * innerH) / rowStripCount);
    if (y1 <= y0) continue;
    const cy = (y0 + y1) / 2;
    const span = y1 - y0;
    const need = Math.max(2, Math.floor(span * 0.5));

    let leftX = -1;
    for (let x = xStart; x <= xEnd; x++) {
      let cnt = 0;
      for (let y = y0; y < y1; y++) cnt += keyMask[y * W + x];
      if (cnt >= need) { leftX = x; break; }
    }
    let rightX = -1;
    for (let x = xEnd; x >= xStart; x--) {
      let cnt = 0;
      for (let y = y0; y < y1; y++) cnt += keyMask[y * W + x];
      if (cnt >= need) { rightX = x; break; }
    }
    if (leftX >= 0) leftPts.push([leftX, cy]);
    if (rightX >= 0) rightPts.push([rightX, cy]);
  }

  if (topPts.length < 6 || bottomPts.length < 6 || leftPts.length < 3 || rightPts.length < 3) {
    return { quad: null, confidence: 0, reason: 'too few edge samples for line fits' };
  }

  // 6. Percentile-based inlier selection.
  const slackY = Math.max(6, Math.round(bandH * 0.06));
  const slackX = Math.max(4, Math.round(bandW * 0.005));
  const topInliers    = inliersLowPct (topPts,    1, 0.08, slackY);
  const bottomInliers = inliersHighPct(bottomPts, 1, 0.92, slackY);
  const leftInliers   = inliersLowPct (leftPts,   0, 0.10, slackX);
  const rightInliers  = inliersHighPct(rightPts,  0, 0.90, slackX);

  // 7. Least-squares line fits.
  const topLine    = fitLine(topInliers,    'horizontal');
  const bottomLine = fitLine(bottomInliers, 'horizontal');
  const leftLine   = fitLine(leftInliers,   'vertical');
  const rightLine  = fitLine(rightInliers,  'vertical');
  if (!topLine || !bottomLine || !leftLine || !rightLine) {
    return { quad: null, confidence: 0, reason: 'edge line fits failed' };
  }

  const tl = intersectLines(topLine,    leftLine);
  const tr = intersectLines(topLine,    rightLine);
  const br = intersectLines(bottomLine, rightLine);
  const bl = intersectLines(bottomLine, leftLine);
  if (!tl || !tr || !br || !bl) {
    return { quad: null, confidence: 0, reason: 'edge intersections failed' };
  }

  // 8. Orientation analysis on the downscaled image.
  let quadDs = [tl, tr, br, bl];
  const orient = analyzeBlackKeyPattern(lum, W, H, quadDs);
  if (orient.flipHorizontal) quadDs = [quadDs[TR], quadDs[TL], quadDs[BL], quadDs[BR]];
  if (orient.flipVertical)   quadDs = [quadDs[BL], quadDs[BR], quadDs[TR], quadDs[TL]];

  // 9. Map back to full-resolution coordinates.
  const inv = 1 / scale;
  const quad = quadDs.map(([x, y]) => [
    Math.max(0, Math.min(FULL_W - 1, x * inv)),
    Math.max(0, Math.min(FULL_H - 1, y * inv)),
  ]);

  const ratio = (topInliers.length + bottomInliers.length + leftInliers.length + rightInliers.length)
              / (topPts.length + bottomPts.length + leftPts.length + rightPts.length);
  const edgeConfidence = 0.5 + 0.4 * ratio;
  const reason = `edges from ${topInliers.length}+${bottomInliers.length}+${leftInliers.length}+${rightInliers.length} inlier strips; ${orient.reason}`;

  return {
    quad,
    confidence: Math.min(edgeConfidence, orient.confidence),
    reason,
  };
}

// ---- Helpers ----

function otsu(hist, total) {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; thr = t; }
  }
  return thr;
}

function inliersLowPct(pts, axis, pct, slack) {
  const vals = pts.map(p => p[axis]).slice().sort((a, b) => a - b);
  const ref = vals[Math.floor(pct * (vals.length - 1))];
  return pts.filter(p => p[axis] <= ref + slack);
}
function inliersHighPct(pts, axis, pct, slack) {
  const vals = pts.map(p => p[axis]).slice().sort((a, b) => a - b);
  const ref = vals[Math.floor(pct * (vals.length - 1))];
  return pts.filter(p => p[axis] >= ref - slack);
}

function fitLine(pts, orientation) {
  if (pts.length < 2) return null;
  const horizontal = orientation === 'horizontal';
  let sa = 0, sb = 0, saa = 0, sab = 0;
  for (const [px, py] of pts) {
    const a = horizontal ? px : py;
    const b = horizontal ? py : px;
    sa += a; sb += b; saa += a * a; sab += a * b;
  }
  const n = pts.length;
  const det = n * saa - sa * sa;
  if (Math.abs(det) < 1e-9) return { orientation, m: 0, c: sb / n };
  const m = (n * sab - sa * sb) / det;
  const c = (sb - m * sa) / n;
  return { orientation, m, c };
}

// h: y = mh*x + ch    v: x = mv*y + cv
function intersectLines(h, v) {
  const denom = 1 - h.m * v.m;
  if (Math.abs(denom) < 1e-9) return null;
  const y = (h.m * v.c + h.c) / denom;
  const x = v.m * y + v.c;
  return [x, y];
}

// --- Orientation: identify bass end via the black-key cluster sizes. ---
//
// The 88-key span low→high (left→right) starts with an isolated B♭0 (group of 1),
// then alternates 2,3,2,3,…,2,3 up to the A♯7 group of 3 at the high end. If our
// detected quad is mirrored, the leftmost group would be 3 instead of 1.

function analyzeBlackKeyPattern(lum, W, H, quad) {
  const sample = (u, v) => {
    const x = (1 - u) * (1 - v) * quad[TL][0] + u * (1 - v) * quad[TR][0]
            + u * v * quad[BR][0] + (1 - u) * v * quad[BL][0];
    const y = (1 - u) * (1 - v) * quad[TL][1] + u * (1 - v) * quad[TR][1]
            + u * v * quad[BR][1] + (1 - u) * v * quad[BL][1];
    const xi = Math.max(0, Math.min(W - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(H - 1, Math.round(y)));
    return lum[yi * W + xi];
  };

  const N = 400;
  let topSum = 0, botSum = 0;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const M = 5;
    let s1 = 0, s2 = 0;
    for (let j = 0; j < M; j++) {
      const v1 = 0.05 + (j / (M - 1)) * 0.4;
      const v2 = 0.55 + (j / (M - 1)) * 0.4;
      s1 += sample(u, v1);
      s2 += sample(u, v2);
    }
    topSum += s1 / M;
    botSum += s2 / M;
  }
  const flipVertical = (botSum / N) < (topSum / N);
  const stripV = flipVertical ? 0.78 : 0.22;

  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const M = 3;
    let s = 0;
    for (let j = 0; j < M; j++) {
      const v = stripV + (j - 1) * 0.04;
      s += sample(u, v);
    }
    samples[i] = s / M;
  }

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    if (samples[i] < lo) lo = samples[i];
    if (samples[i] > hi) hi = samples[i];
  }
  const thr = (lo + hi) * 0.5;

  const runs = [];
  let inRun = false, runStart = 0;
  for (let i = 0; i < N; i++) {
    const dark = samples[i] < thr;
    if (dark && !inRun) { inRun = true; runStart = i; }
    else if (!dark && inRun) { inRun = false; runs.push([runStart, i - 1]); }
  }
  if (inRun) runs.push([runStart, N - 1]);

  if (runs.length < 8) {
    return { flipHorizontal: false, flipVertical, confidence: 0.4, reason: 'few black-key runs found' };
  }

  const mids = runs.map(([a, b]) => (a + b) / 2);
  const gaps = [];
  for (let i = 1; i < mids.length; i++) gaps.push(mids[i] - mids[i - 1]);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const cluster = [];
  let cur = [0];
  for (let i = 1; i < mids.length; i++) {
    if (mids[i] - mids[i - 1] < median * 0.7) cur.push(i);
    else { cluster.push(cur); cur = [i]; }
  }
  cluster.push(cur);

  const sizes = cluster.map(c => c.length);
  const leftSize = sizes[0];
  const rightSize = sizes[sizes.length - 1];

  if (leftSize === 1 && rightSize === 3) {
    return { flipHorizontal: false, flipVertical, confidence: 0.95,
             reason: 'black-key pattern matches 88-key low→high left-to-right' };
  }
  if (leftSize === 3 && rightSize === 1) {
    return { flipHorizontal: true, flipVertical, confidence: 0.95,
             reason: 'mirror corrected from black-key pattern' };
  }
  if (leftSize < rightSize) {
    return { flipHorizontal: false, flipVertical, confidence: 0.7,
             reason: 'tentative orientation from black-key group sizes' };
  }
  if (leftSize > rightSize) {
    return { flipHorizontal: true, flipVertical, confidence: 0.7,
             reason: 'tentative mirror correction from black-key group sizes' };
  }
  return { flipHorizontal: false, flipVertical, confidence: 0.4, reason: 'orientation ambiguous' };
}
