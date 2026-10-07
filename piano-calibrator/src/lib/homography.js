// 4-point homography via direct linear transform.
// Solves H mapping src[i] -> dst[i] for i in 0..3, with H[2][2] = 1.
// Returns a 3x3 row-major Float64Array.

function solve8(A, b) {
  // Gauss-Jordan on 8x9 augmented matrix. A is 8x8 row-major Float64Array, b length 8.
  const M = new Float64Array(8 * 9);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) M[r * 9 + c] = A[r * 8 + c];
    M[r * 9 + 8] = b[r];
  }
  for (let col = 0; col < 8; col++) {
    // Partial pivot
    let piv = col;
    let pivAbs = Math.abs(M[col * 9 + col]);
    for (let r = col + 1; r < 8; r++) {
      const v = Math.abs(M[r * 9 + col]);
      if (v > pivAbs) { piv = r; pivAbs = v; }
    }
    if (pivAbs < 1e-12) return null;
    if (piv !== col) {
      for (let c = 0; c < 9; c++) {
        const t = M[col * 9 + c]; M[col * 9 + c] = M[piv * 9 + c]; M[piv * 9 + c] = t;
      }
    }
    const inv = 1 / M[col * 9 + col];
    for (let c = 0; c < 9; c++) M[col * 9 + c] *= inv;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = M[r * 9 + col];
      if (f === 0) continue;
      for (let c = 0; c < 9; c++) M[r * 9 + c] -= f * M[col * 9 + c];
    }
  }
  const x = new Float64Array(8);
  for (let r = 0; r < 8; r++) x[r] = M[r * 9 + 8];
  return x;
}

// src, dst: arrays of 4 [x,y] points (any units — the homography is in whatever space you supply).
export function computeHomography(src, dst) {
  const A = new Float64Array(64);
  const b = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    const r1 = i * 2;
    const r2 = i * 2 + 1;
    A[r1 * 8 + 0] = x;  A[r1 * 8 + 1] = y;  A[r1 * 8 + 2] = 1;
    A[r1 * 8 + 3] = 0;  A[r1 * 8 + 4] = 0;  A[r1 * 8 + 5] = 0;
    A[r1 * 8 + 6] = -u * x; A[r1 * 8 + 7] = -u * y;
    b[r1] = u;
    A[r2 * 8 + 0] = 0;  A[r2 * 8 + 1] = 0;  A[r2 * 8 + 2] = 0;
    A[r2 * 8 + 3] = x;  A[r2 * 8 + 4] = y;  A[r2 * 8 + 5] = 1;
    A[r2 * 8 + 6] = -v * x; A[r2 * 8 + 7] = -v * y;
    b[r2] = v;
  }
  const h = solve8(A, b);
  if (!h) return null;
  const H = new Float64Array(9);
  H[0] = h[0]; H[1] = h[1]; H[2] = h[2];
  H[3] = h[3]; H[4] = h[4]; H[5] = h[5];
  H[6] = h[6]; H[7] = h[7]; H[8] = 1;
  return H;
}

export function invert3x3(m) {
  const a = m[0], b = m[1], c = m[2];
  const d = m[3], e = m[4], f = m[5];
  const g = m[6], h = m[7], i = m[8];
  const A =  (e * i - f * h);
  const B = -(d * i - f * g);
  const C =  (d * h - e * g);
  const D = -(b * i - c * h);
  const E =  (a * i - c * g);
  const F = -(a * h - b * g);
  const G =  (b * f - c * e);
  const H = -(a * f - c * d);
  const I =  (a * e - b * d);
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const out = new Float64Array(9);
  out[0] = A * inv; out[1] = D * inv; out[2] = G * inv;
  out[3] = B * inv; out[4] = E * inv; out[5] = H * inv;
  out[6] = C * inv; out[7] = F * inv; out[8] = I * inv;
  return out;
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [
    (H[0] * x + H[1] * y + H[2]) / w,
    (H[3] * x + H[4] * y + H[5]) / w,
  ];
}

// Scale homography so its [2][2] entry equals 1 (canonical form).
export function normalize(H) {
  const s = H[8];
  if (Math.abs(s) < 1e-15) return new Float64Array(H);
  const out = new Float64Array(9);
  for (let i = 0; i < 9; i++) out[i] = H[i] / s;
  return out;
}
