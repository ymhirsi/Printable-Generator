import React, { useEffect, useRef } from 'react';

// Renders a WebGL preview of the rectified keyboard.
// We upload the source image as a texture and apply the same inverse homography
// (output_uv -> source_uv) that the OBS shader will use, per output pixel.
//
// props:
//   image:  HTMLImageElement
//   Hinv:   Float64Array length 9 (output_uv -> source_uv)
//   outW, outH: integer output canvas size (display pixels)

export default function PreviewCanvas({ image, Hinv, outW, outH }) {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const progRef = useRef(null);
  const texRef = useRef(null);
  const matLocRef = useRef(null);

  // Init WebGL on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
    if (!gl) return;
    glRef.current = gl;

    const vsrc = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;
    const fsrc = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform mat3 u_H;
void main() {
  vec3 p = u_H * vec3(v_uv, 1.0);
  vec2 s = p.xy / p.z;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = texture2D(u_tex, s);
}
`;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
    }
    progRef.current = prog;
    matLocRef.current = gl.getUniformLocation(prog, 'u_H');

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    texRef.current = tex;
  }, []);

  // Upload (or re-upload) the texture whenever the image changes.
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !image) return;
    gl.bindTexture(gl.TEXTURE_2D, texRef.current);
    // Upload flipped so the texture's (0,0) corresponds to the image's top-left pixel,
    // matching the top-left UV convention used by the homography and the OBS shader.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }, [image]);

  // Render on every Hinv or size change.
  useEffect(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas || !Hinv) return;
    canvas.width = Math.max(2, Math.round(outW));
    canvas.height = Math.max(2, Math.round(outH));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progRef.current);
    // WebGL mat3 uniforms are column-major; transpose row-major H into column-major.
    const cm = new Float32Array(9);
    cm[0] = Hinv[0]; cm[1] = Hinv[3]; cm[2] = Hinv[6];
    cm[3] = Hinv[1]; cm[4] = Hinv[4]; cm[5] = Hinv[7];
    cm[6] = Hinv[2]; cm[7] = Hinv[5]; cm[8] = Hinv[8];
    gl.uniformMatrix3fv(matLocRef.current, false, cm);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texRef.current);
    const uTex = gl.getUniformLocation(progRef.current, 'u_tex');
    gl.uniform1i(uTex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [Hinv, outW, outH, image]);

  return (
    <canvas ref={canvasRef} className="preview-canvas" style={{ width: '100%', height: 'auto', display: 'block' }} />
  );
}
