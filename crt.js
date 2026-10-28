// CRT presenter: draws the C64 frame onto the visible canvas through a WebGL
// shader that adds barrel curvature, rounded tube corners, a soft vignette and
// faint scanlines. Falls back to a plain pixel-scaled 2D copy without WebGL.
(function () {
  'use strict';

  const UPSCALE = 3;   // nearest-neighbour pre-scale keeps pixels crisp under linear filtering

  const VERT = `
    attribute vec2 pos;
    varying vec2 uv;
    void main() {
      uv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
      gl_Position = vec4(pos, 0.0, 1.0);
    }`;

  const FRAG = `
    precision mediump float;
    uniform sampler2D frame;
    uniform vec2 texel;        // size of one source pixel in uv units
    uniform float rows;        // source scanline count
    uniform float scanAmount;  // 0 when the display is too small for scanlines to read
    uniform float roll;        // power-on: vertical hold lost, picture rolls by this much
    uniform float rolling;     // 1 while rolling, shows the black blanking bar between frames
    uniform float jitter;      // power-on: horizontal wobble
    uniform float bright;      // power-on: tube brightness
    uniform float time;
    varying vec2 uv;

    void main() {
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec2 p = 0.5 + c * (1.0 + 0.11 * r2 + 0.03 * r2 * r2) * 0.985;

      // rounded tube outline
      vec2 q = abs(p - 0.5) - (0.5 - 0.035);
      float edge = length(max(q, 0.0)) - 0.035;
      float mask = 1.0 - smoothstep(-0.003, 0.002, edge);

      // lost vertical sync: the frame wraps around, a dark blanking bar between copies
      vec2 s = p;
      s.x += jitter * sin(s.y * 90.0 + time * 40.0);
      s.y = fract(s.y + roll);
      float blank = rolling * (1.0 - step(0.045, s.y));

      // a touch of horizontal phosphor bleed
      vec3 col = texture2D(frame, s).rgb * 0.7
               + texture2D(frame, s + vec2(texel.x * 0.6, 0.0)).rgb * 0.15
               + texture2D(frame, s - vec2(texel.x * 0.6, 0.0)).rgb * 0.15;
      col *= (1.0 - blank) * bright;

      float scan = 0.5 + 0.5 * cos(6.2831853 * p.y * rows);
      col *= 1.0 - scanAmount * scan;
      col *= 1.0 + scanAmount * 0.5;

      col *= 1.0 - 1.6 * r2 * r2;
      gl_FragColor = vec4(col * mask, mask);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  class CRT {
    constructor(display, source) {
      this.display = display; this.source = source;
      this.big = document.createElement('canvas');
      this.big.width = source.width * UPSCALE; this.big.height = source.height * UPSCALE;
      this.bigCtx = this.big.getContext('2d');
      this.bigCtx.imageSmoothingEnabled = false;
      this.gl = null;
      this.fx = { roll: 0, rolling: 0, jitter: 0, bright: 1 };   // power-on effect state
      try { this.initGL(); } catch (e) { this.gl = null; }
      if (!this.gl) {
        this.ctx2d = display.getContext('2d');
        document.body.classList.add('no-webgl');
      }
    }

    initGL() {
      const gl = this.display.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
      if (!gl) return;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.u = {
        texel: gl.getUniformLocation(prog, 'texel'),
        rows: gl.getUniformLocation(prog, 'rows'),
        scanAmount: gl.getUniformLocation(prog, 'scanAmount'),
        roll: gl.getUniformLocation(prog, 'roll'),
        rolling: gl.getUniformLocation(prog, 'rolling'),
        jitter: gl.getUniformLocation(prog, 'jitter'),
        bright: gl.getUniformLocation(prog, 'bright'),
        time: gl.getUniformLocation(prog, 'time'),
      };
      gl.uniform2f(this.u.texel, 1 / this.source.width, 1 / this.source.height);
      gl.uniform1f(this.u.rows, this.source.height);
      this.gl = gl;
    }

    resize(cssW, cssH) {
      const dpr = window.devicePixelRatio || 1;
      this.display.style.width = cssW + 'px';
      this.display.style.height = cssH + 'px';
      this.display.width = Math.round(cssW * dpr);
      this.display.height = Math.round(cssH * dpr);
      if (this.gl) {
        this.gl.viewport(0, 0, this.display.width, this.display.height);
        // Scanlines only once each source line spans enough device pixels not to moire.
        const perLine = this.display.height / this.source.height;
        const amount = Math.max(0, Math.min(1, (perLine - 1.6) / 1.4)) * 0.16;
        this.gl.uniform1f(this.u.scanAmount, amount);
      } else {
        this.ctx2d.imageSmoothingEnabled = false;
      }
    }

    draw() {
      if (this.gl) {
        const gl = this.gl;
        this.bigCtx.drawImage(this.source, 0, 0, this.big.width, this.big.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.big);
        const fx = this.fx;
        gl.uniform1f(this.u.roll, fx.roll);
        gl.uniform1f(this.u.rolling, fx.rolling);
        gl.uniform1f(this.u.jitter, fx.jitter);
        gl.uniform1f(this.u.bright, fx.bright);
        gl.uniform1f(this.u.time, performance.now() / 1000);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        this.ctx2d.drawImage(this.source, 0, 0, this.display.width, this.display.height);
      }
    }
  }

  window.CRT = CRT;
})();
