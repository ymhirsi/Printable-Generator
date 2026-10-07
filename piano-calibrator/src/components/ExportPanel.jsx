import React, { useState } from 'react';

export default function ExportPanel({ shader, exportJson, srcW, srcH, outW, outH, onBack }) {
  const [copied, setCopied] = useState(null);

  const copy = async (text, which) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1400);
    } catch {}
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keyboard-calibration.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadShader = () => {
    const blob = new Blob([shader], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keyboard-warp.shader';
    a.click();
    URL.revokeObjectURL(url);
  };

  const aspect = outW / outH;
  const aspectLabel = `${outW} × ${outH}  (${aspect.toFixed(3)} : 1)`;

  return (
    <div className="export-panel">
      <div className="row">
        <button className="btn ghost" onClick={onBack}>← Adjust corners</button>
      </div>

      <section className="export-section">
        <header>
          <h3>1. Install obs-shaderfilter</h3>
        </header>
        <p>
          Install <a href="https://github.com/exeldro/obs-shaderfilter/releases" target="_blank" rel="noreferrer">
          exeldro/obs-shaderfilter</a> (v2.1 or later). On macOS and Linux, follow the project's install
          instructions; on Windows, run the installer and restart OBS.
        </p>
      </section>

      <section className="export-section">
        <header>
          <h3>2. Add the Shader filter</h3>
        </header>
        <ol>
          <li>Right-click your overhead camera source → <em>Filters</em>.</li>
          <li>Add an Effect Filter → <em>Shader</em>.</li>
          <li>Toggle <em>Use Shader Text</em> and paste the shader below.</li>
        </ol>
      </section>

      <section className="export-section">
        <header>
          <h3>3. Paste this shader</h3>
          <div className="actions">
            <button className="btn" onClick={() => copy(shader, 'shader')}>
              {copied === 'shader' ? 'Copied' : 'Copy'}
            </button>
            <button className="btn ghost" onClick={downloadShader}>Download .shader</button>
          </div>
        </header>
        <pre className="code"><code>{shader}</code></pre>
        <p className="caption">
          The matrix entries are pre-filled. The annotation sliders are there if you want
          to fine-tune; you can otherwise leave every value alone.
        </p>
      </section>

      <section className="export-section">
        <header>
          <h3>4. Crop to the keyboard's aspect ratio</h3>
        </header>
        <p>
          obs-shaderfilter renders at the source's resolution ({srcW} × {srcH}), so the rectified
          keyboard will appear stretched to fit the camera frame. Restore the keyboard's true
          aspect with one of:
        </p>
        <ul>
          <li>
            Set the scene's <em>Base (Canvas) Resolution</em> to <strong>{aspectLabel}</strong>
            and stretch the source to fill it. Best when the camera feed is the only source.
          </li>
          <li>
            Or apply <em>Edit → Transform → Edit Transform…</em> and set the source size to
            {' '}<strong>{aspectLabel}</strong>. Or add a second filter (<em>Crop/Pad</em>) and
            scale the result. Either way the warped output keeps a square-on, level keyboard.
          </li>
        </ul>
        <p className="caption">
          Why this extra step: at the time of writing, obs-shaderfilter cannot change its
          output dimensions independently from its input. The keyboard fills the warped frame,
          but the frame is still source-sized — you finish the crop in the scene.
        </p>
      </section>

      <section className="export-section">
        <header>
          <h3>5. Calibration data (JSON)</h3>
          <div className="actions">
            <button className="btn" onClick={() => copy(JSON.stringify(exportJson, null, 2), 'json')}>
              {copied === 'json' ? 'Copied' : 'Copy'}
            </button>
            <button className="btn ghost" onClick={downloadJson}>Download .json</button>
          </div>
        </header>
        <pre className="code small"><code>{JSON.stringify(exportJson, null, 2)}</code></pre>
        <p className="caption">
          Both the forward and inverse 3×3 matrices are stored in normalized UV space
          (0..1, top-left origin) so they're resolution-independent. Keep this file — a future
          native plugin can read the same matrices directly.
        </p>
      </section>
    </div>
  );
}
