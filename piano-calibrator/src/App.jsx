import React, { useEffect, useMemo, useRef, useState } from 'react';
import QuadEditor from './components/QuadEditor.jsx';
import PreviewCanvas from './components/PreviewCanvas.jsx';
import ExportPanel from './components/ExportPanel.jsx';
import { detectKeyboard } from './lib/detect.js';
import { computeHomography, invert3x3, normalize } from './lib/homography.js';
import { buildShader, buildExportJSON } from './lib/shader.js';

// Defaults for the manual fallback: 4% inset from each edge in a wide rectangle.
function defaultQuad(W, H) {
  const padX = W * 0.05;
  const insetY = H * 0.35;
  return [
    [padX, insetY],
    [W - padX, insetY],
    [W - padX, H - insetY],
    [padX, H - insetY],
  ];
}

function quadAspectExtents(quad) {
  const w = Math.max(
    Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]),
    Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1]),
  );
  const h = Math.max(
    Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]),
    Math.hypot(quad[2][0] - quad[1][0], quad[2][1] - quad[1][1]),
  );
  return { w: Math.round(w), h: Math.round(h) };
}

const STEPS = ['Load image', 'Calibrate', 'Export'];

export default function App() {
  const [step, setStep] = useState(0);
  const [image, setImage] = useState(null); // HTMLImageElement
  const [quad, setQuad] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState('');
  const [outSize, setOutSize] = useState({ w: 1600, h: 200 });
  const [outSizeEdited, setOutSizeEdited] = useState(false);
  const fileInputRef = useRef(null);

  // When a quad lands, recompute a sensible default output size unless the user has touched it.
  useEffect(() => {
    if (!quad || outSizeEdited) return;
    const { w, h } = quadAspectExtents(quad);
    if (w > 0 && h > 0) {
      // Pick a target long edge of 1600px for the preview/export.
      const targetW = 1600;
      const targetH = Math.max(80, Math.round(targetW * (h / w)));
      setOutSize({ w: targetW, h: targetH });
    }
  }, [quad, outSizeEdited]);

  const onFile = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setQuad(defaultQuad(img.naturalWidth, img.naturalHeight));
      setStep(1);
      setDetectMsg('Drag the corners to bound the white-key area, or click Auto-detect.');
      setOutSizeEdited(false);
      // Intentionally NO auto-run of detection here. Manual mode must be
      // usable instantly; auto-detect is opt-in via the toolbar button.
    };
    img.onerror = () => {
      alert('Could not load that image. Try a JPG or PNG.');
    };
    img.src = url;
  };

  const runDetect = async () => {
    if (!image) return;
    setDetecting(true);
    setDetectMsg('Running auto-detect…');
    try {
      const res = await detectKeyboard(image);
      if (res.quad) {
        setQuad(res.quad);
        setDetectMsg(`Detected (${Math.round(res.confidence * 100)}%): ${res.reason}`);
      } else {
        setDetectMsg(`Auto-detect didn't find the keyboard — adjust the corners manually. (${res.reason})`);
      }
    } catch (e) {
      console.error('[detect]', e);
      setDetectMsg(`Auto-detect failed: ${e.message || String(e)}. Manual mode still works — drag the corners.`);
    } finally {
      setDetecting(false);
    }
  };

  // Compute the homography and inverse in UV space.
  const transforms = useMemo(() => {
    if (!image || !quad) return null;
    const W = image.naturalWidth, H = image.naturalHeight;
    const ow = outSize.w, oh = outSize.h;

    // Source quad in source UV space (0..1, top-left).
    const srcUV = quad.map(([x, y]) => [x / W, y / H]);
    // Destination quad in output UV space (full rectangle).
    const dstUV = [[0, 0], [1, 0], [1, 1], [0, 1]];

    const Hfwd = computeHomography(srcUV, dstUV);
    const Hinv = computeHomography(dstUV, srcUV);
    if (!Hfwd || !Hinv) return null;

    const srcQuadPx = quad;
    const dstQuadPx = [[0, 0], [ow, 0], [ow, oh], [0, oh]];

    return {
      Hfwd: normalize(Hfwd),
      Hinv: normalize(Hinv),
      srcW: W, srcH: H, outW: ow, outH: oh,
      srcQuad: srcQuadPx, dstQuad: dstQuadPx,
    };
  }, [image, quad, outSize.w, outSize.h]);

  const shaderText = useMemo(() => {
    if (!transforms) return '';
    return buildShader(transforms.Hinv);
  }, [transforms]);

  const exportJson = useMemo(() => {
    if (!transforms) return null;
    return buildExportJSON(transforms);
  }, [transforms]);

  const onDropFiles = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden />
          <div>
            <div className="brand-title">Keyboard Calibrator</div>
            <div className="brand-sub">Overhead camera → leveled keyboard for OBS</div>
          </div>
        </div>
        <div className="topbar-right">
          <nav className="steps" aria-label="Steps">
            {STEPS.map((label, i) => (
              <button
                key={label}
                className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
                onClick={() => {
                  if (!image && i > 0) return;
                  if (!transforms && i > 1) return;
                  setStep(i);
                }}
                disabled={!image && i > 0}
              >
                <span className="step-num">{i + 1}</span>
                <span className="step-label">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="content">
        {step === 0 && (
          <section className="load-step">
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDropFiles}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            >
              <div className="dropzone-inner">
                <div className="dropzone-title">Load an overhead frame</div>
                <p className="dropzone-help">
                  Drag a still from your camera here, or click to choose a file.
                  PNG or JPG. The camera should be roughly square-on to the keyboard.
                </p>
                <button className="btn primary" type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Choose image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </div>
            </div>
            <aside className="aside-note">
              <h3>What this tool does</h3>
              <p>
                It finds the 88-key span in your overhead frame, lets you nudge the corners
                if needed, then writes a perspective transform you paste into OBS. The camera
                stays fixed during a session, so this only has to be done once per setup.
              </p>
              <h3>What it doesn't do</h3>
              <p>
                Note detection, per-key labels, MIDI, audio — those are separate later steps.
                This is the cropping foundation everything else builds on.
              </p>
            </aside>
          </section>
        )}

        {step === 1 && image && quad && (
          <section className="calibrate-step">
            <div className="cal-main">
              <QuadEditor image={image} quad={quad} onChange={setQuad} />
              <div className="cal-toolbar">
                <button className="btn" onClick={() => runDetect()} disabled={detecting}>
                  {detecting ? 'Detecting…' : 'Auto-detect'}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setQuad((q) => [q[1], q[0], q[3], q[2]])}
                  title="Swap left/right — use if bass is on the wrong end."
                >
                  Flip horizontally
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setQuad((q) => [q[3], q[2], q[1], q[0]])}
                  title="Swap top/bottom — use if the front of the keys is at the wrong edge."
                >
                  Flip vertically
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setQuad(defaultQuad(image.naturalWidth, image.naturalHeight))}
                >
                  Reset corners
                </button>
                <button
                  className="btn primary"
                  onClick={() => setStep(2)}
                  disabled={!transforms}
                >
                  Accept & generate →
                </button>
              </div>
              {detectMsg && <div className="status">{detectMsg}</div>}
            </div>

            <aside className="cal-side">
              <h3>Preview</h3>
              <p className="caption">
                What OBS will output, given the current corner positions.
                The yellow tick marks the front edge of the keys.
              </p>
              <div className="preview-wrap">
                {transforms && (
                  <PreviewCanvas
                    image={image}
                    Hinv={transforms.Hinv}
                    outW={outSize.w}
                    outH={outSize.h}
                  />
                )}
              </div>

              <h3>Output size</h3>
              <p className="caption">
                Defaults to the proportions of the detected quad. Adjust freely; the
                shader operates in normalized UV so this is purely a hint for the preview
                and JSON.
              </p>
              <div className="size-row">
                <label>
                  <span>Width</span>
                  <input
                    type="number"
                    value={outSize.w}
                    min={64}
                    onChange={(e) => { setOutSize((s) => ({ ...s, w: Math.max(64, parseInt(e.target.value, 10) || 64) })); setOutSizeEdited(true); }}
                  />
                </label>
                <label>
                  <span>Height</span>
                  <input
                    type="number"
                    value={outSize.h}
                    min={32}
                    onChange={(e) => { setOutSize((s) => ({ ...s, h: Math.max(32, parseInt(e.target.value, 10) || 32) })); setOutSizeEdited(true); }}
                  />
                </label>
              </div>
            </aside>
          </section>
        )}

        {step === 2 && transforms && (
          <section className="export-step">
            <div className="export-grid">
              <div>
                <h2 className="section-title">Final preview</h2>
                <div className="preview-wrap large">
                  <PreviewCanvas
                    image={image}
                    Hinv={transforms.Hinv}
                    outW={outSize.w}
                    outH={outSize.h}
                  />
                </div>
                <p className="caption">
                  This is what OBS will produce after you paste the shader and crop to the
                  output aspect ratio in step 4 below.
                </p>
              </div>
              <ExportPanel
                shader={shaderText}
                exportJson={exportJson}
                srcW={transforms.srcW}
                srcH={transforms.srcH}
                outW={outSize.w}
                outH={outSize.h}
                onBack={() => setStep(1)}
              />
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Step 1 of the overhead-piano project · runs entirely in your browser.</span>
      </footer>
    </div>
  );
}
