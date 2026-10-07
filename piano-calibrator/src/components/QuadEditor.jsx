import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';

// Renders the source image at a responsive fit-to-container scale, with an SVG overlay
// that draws the quad and four draggable corner handles. While a handle is being dragged,
// a magnifier loupe shows a 6x zoom of the pixels under the corner, with a crosshair,
// so the user can land the corner exactly on an edge.
//
// props:
//   image:    HTMLImageElement (loaded)
//   quad:     [[x,y]*4] in image-pixel space, ordered [TL,TR,BR,BL]
//   onChange(newQuad)
//   disabled: bool

const LABELS = ['TL', 'TR', 'BR', 'BL'];
const LOUPE_DISPLAY = 192;   // CSS pixels
const LOUPE_ZOOM = 6;        // 6x zoom

export default function QuadEditor({ image, quad, onChange, disabled }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const loupeCanvasRef = useRef(null);
  const [drag, setDrag] = useState(null); // { index, pointerId }

  const W = image.naturalWidth;
  const H = image.naturalHeight;

  const clientToImage = useCallback((evt) => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return [p.x, p.y];
  }, []);

  const drawLoupe = useCallback((x, y) => {
    const canvas = loupeCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = LOUPE_DISPLAY * dpr;
    canvas.height = LOUPE_DISPLAY * dpr;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Source rectangle (centered on the corner)
    const srcW = LOUPE_DISPLAY / LOUPE_ZOOM;
    const srcH = LOUPE_DISPLAY / LOUPE_ZOOM;
    const sx = x - srcW / 2;
    const sy = y - srcH / 2;
    ctx.drawImage(image, sx, sy, srcW, srcH, 0, 0, canvas.width, canvas.height);

    // Crosshair
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - 7 * dpr);
    ctx.moveTo(cx, cy + 7 * dpr); ctx.lineTo(cx, canvas.height);
    ctx.moveTo(0, cy); ctx.lineTo(cx - 7 * dpr, cy);
    ctx.moveTo(cx + 7 * dpr, cy); ctx.lineTo(canvas.width, cy);
    ctx.stroke();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, 4 * dpr, 0, Math.PI * 2);
    ctx.stroke();
  }, [image]);

  // Refresh the loupe whenever the dragged corner moves.
  useEffect(() => {
    if (drag == null) return;
    drawLoupe(quad[drag.index][0], quad[drag.index][1]);
  }, [drag, quad, drawLoupe]);

  const onPointerDown = (i) => (evt) => {
    if (disabled) return;
    evt.preventDefault();
    const [ix, iy] = clientToImage(evt);
    const offsetX = quad[i][0] - ix;
    const offsetY = quad[i][1] - iy;
    dragRef.current = { offsetX, offsetY };
    setDrag({ index: i, pointerId: evt.pointerId });
    try { evt.currentTarget.setPointerCapture(evt.pointerId); } catch {}
  };

  const dragRef = useRef({ offsetX: 0, offsetY: 0 });

  const onPointerMove = (evt) => {
    if (!drag) return;
    if (evt.pointerId !== drag.pointerId) return;
    const [ix, iy] = clientToImage(evt);
    const x = Math.max(0, Math.min(W, ix + dragRef.current.offsetX));
    const y = Math.max(0, Math.min(H, iy + dragRef.current.offsetY));
    const next = quad.map((p, idx) => (idx === drag.index ? [x, y] : p));
    onChange(next);
  };

  const onPointerUp = (evt) => {
    if (!drag) return;
    if (evt.pointerId !== drag.pointerId) return;
    try { evt.currentTarget.releasePointerCapture(evt.pointerId); } catch {}
    setDrag(null);
  };

  const [renderScale, setRenderScale] = useState(1);
  useLayoutEffect(() => {
    const update = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const sx = r.width / W;
      const sy = r.height / H;
      setRenderScale(Math.min(sx, sy));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [W, H]);

  const handleR = Math.max(10, Math.round(18 / Math.max(0.0001, renderScale)));
  const strokeW = Math.max(2, Math.round(3 / Math.max(0.0001, renderScale)));
  const tickW = Math.max(1.5, Math.round(2 / Math.max(0.0001, renderScale)));

  const polyPoints = quad.map(([x, y]) => `${x},${y}`).join(' ');

  // Place the loupe in the corner of the editor OPPOSITE to the dragged handle so the
  // user's finger / cursor never covers it.
  const loupeCorner = drag != null ? oppositeCorner(drag.index) : 'top-right';

  return (
    <div className="quad-editor" ref={wrapRef}>
      <img
        src={image.src}
        alt=""
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="quad-svg"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <polygon
          points={polyPoints}
          fill="rgba(220,235,255,0.06)"
          stroke="#7cc4ff"
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />
        {(() => {
          const [bl, br] = [quad[3], quad[2]];
          const mx = (bl[0] + br[0]) / 2;
          const my = (bl[1] + br[1]) / 2;
          const [tl, tr] = [quad[0], quad[1]];
          const tmx = (tl[0] + tr[0]) / 2;
          const tmy = (tl[1] + tr[1]) / 2;
          const dx = tmx - mx, dy = tmy - my;
          const len = Math.hypot(dx, dy) || 1;
          const k = Math.min(W, H) * 0.02;
          const ix = mx + (dx / len) * k;
          const iy = my + (dy / len) * k;
          return (
            <line x1={mx} y1={my} x2={ix} y2={iy} stroke="#ffd166" strokeWidth={tickW * 1.5} strokeLinecap="round" />
          );
        })()}
        {quad.map(([x, y], i) => (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={handleR}
              fill="rgba(14,15,18,0.85)"
              stroke="#7cc4ff"
              strokeWidth={strokeW}
              onPointerDown={onPointerDown(i)}
              style={{ touchAction: 'none', cursor: disabled ? 'default' : 'grab' }}
            />
            <text
              x={x}
              y={y}
              dy={handleR * 0.35}
              textAnchor="middle"
              fontSize={handleR * 0.9}
              fontFamily="ui-sans-serif, system-ui, -apple-system, Inter, sans-serif"
              fontWeight="600"
              fill="#e8edf2"
              pointerEvents="none"
            >
              {LABELS[i]}
            </text>
          </g>
        ))}
      </svg>

      {drag != null && (
        <div className={`loupe loupe-${loupeCorner}`} aria-hidden>
          <canvas
            ref={loupeCanvasRef}
            style={{ width: LOUPE_DISPLAY, height: LOUPE_DISPLAY, display: 'block' }}
          />
          <div className="loupe-caption">
            {LABELS[drag.index]} · {Math.round(quad[drag.index][0])}, {Math.round(quad[drag.index][1])}
          </div>
        </div>
      )}
    </div>
  );
}

function oppositeCorner(index) {
  // 0 TL → bottom-right, 1 TR → bottom-left, 2 BR → top-left, 3 BL → top-right
  return ['bottom-right', 'bottom-left', 'top-left', 'top-right'][index];
}
