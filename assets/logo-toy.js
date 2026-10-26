/* The logo at the foot of the page, to play with (after the face on Super Mario 64's title screen): grab any part of it and
   pull, and it stretches like warm fudge; let go and it springs back with a wobble. At rest it is VF's own vector, exactly as
   drawn (assets/logo.js): the stretchy copy is drawn only while it moves, then the vector comes back. A slow brass glint
   crosses the bars now and then (light only; the logo's shape and colours never change at rest). */
(function () {
  "use strict";
  var box = document.getElementById("logo-toy");
  if (!box || !window.VFLogo) return;
  var holder = box.querySelector(".logo-toy-svg");
  var svgText = window.VFLogo.svg();
  holder.innerHTML = svgText;
  var full = svgText.indexOf("xmlns=") > -1 ? svgText : svgText.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  box.style.setProperty("--logo-mask", 'url("data:image/svg+xml,' + encodeURIComponent(full) + '")');
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the stretchy copy: a WebGL mesh over a raster of the vector, in a canvas larger than the logo so a pull has room
  var canvas = document.createElement("canvas"); canvas.className = "logo-toy-gl"; canvas.setAttribute("aria-hidden", "true");
  box.appendChild(canvas);
  var gl = null, prog = null, posBuf = null, uvBuf = null, idxBuf = null, tex = null, nIdx = 0, ready = false, loading = false;
  var NX = 36, NY = 18, PADX = 0.5, PADY = 0.75;   // grid, and the canvas margin around the logo (in logo widths and heights)
  var BW = 0, BH = 0, CW = 0, CH = 0, OX = 0, OY = 0, dpr = 1;
  var rest = null, pos = null, vel = null, wts = null, posF = null;
  var grab = null, raf = 0, last = 0;

  function measure() {
    var r = box.getBoundingClientRect(); BW = r.width; BH = r.height;
    var room = Math.min(r.left, document.documentElement.clientWidth - r.right);   // never past the screen's edge
    OX = Math.max(0, Math.min(BW * PADX, Math.floor(room))); OY = BH * PADY; CW = BW + 2 * OX; CH = BH + 2 * OY;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.left = -OX + "px"; canvas.style.top = -OY + "px"; canvas.style.width = CW + "px"; canvas.style.height = CH + "px";
    canvas.width = Math.round(CW * dpr); canvas.height = Math.round(CH * dpr);
    var n = (NX + 1) * (NY + 1);
    rest = new Float32Array(n * 2); pos = new Float32Array(n * 2); vel = new Float32Array(n * 2); wts = new Float32Array(n); posF = new Float32Array(n * 2);
    for (var j = 0; j <= NY; j++) for (var i = 0; i <= NX; i++) {
      var k = (j * (NX + 1) + i) * 2; rest[k] = OX + BW * i / NX; rest[k + 1] = OY + BH * j / NY; pos[k] = rest[k]; pos[k + 1] = rest[k + 1];
    }
  }
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  function setup(done) {
    if (ready || loading) return; loading = true;
    gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) { loading = false; return; }
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; attribute vec2 uv; uniform vec2 res; varying vec2 v; void main(){ v = uv; vec2 c = p / res * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float; uniform sampler2D t; varying vec2 v; void main(){ gl_FragColor = texture2D(t, v); }"));
    gl.linkProgram(prog);
    measure();
    var uv = new Float32Array(rest.length);
    for (var j = 0; j <= NY; j++) for (var i = 0; i <= NX; i++) { var k = (j * (NX + 1) + i) * 2; uv[k] = i / NX; uv[k + 1] = j / NY; }
    var idx = []; for (var y = 0; y < NY; y++) for (var x = 0; x < NX; x++) { var a = y * (NX + 1) + x, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    nIdx = idx.length;
    posBuf = gl.createBuffer(); uvBuf = gl.createBuffer(); idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, pos.byteLength, gl.DYNAMIC_DRAW);
    raster(function () { ready = true; loading = false; if (done) done(); });
  }
  // the raster: the vector drawn at the logo's own size on screen, so at rest it lands pixel for pixel where the vector was
  var rasterW = 0;
  function raster(done) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas"); c.width = Math.round(BW * dpr); c.height = Math.round(BH * dpr);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); rasterW = BW;
      if (!tex) tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      URL.revokeObjectURL(img.src); done();
    };
    img.onerror = function () { loading = false; };   // no raster, no toy: the vector simply stays
    img.src = URL.createObjectURL(new Blob([full], { type: "image/svg+xml" }));
  }
  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog);
    for (var k = 0; k < pos.length; k++) posF[k] = pos[k];
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, posF);
    var lp = gl.getAttribLocation(prog, "p"), lu = gl.getAttribLocation(prog, "uv");
    gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.enableVertexAttribArray(lu); gl.vertexAttribPointer(lu, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(prog, "res"), CW, CH);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(prog, "t"), 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);
  }
  // springs: a held region follows the hand closely; let go, and it rings back to rest
  function step(dt) {
    var held = !!grab, K = held ? 900 : 240, C = held ? 2 * Math.sqrt(K) * 0.9 : 2 * Math.sqrt(K) * (reduce ? 1 : 0.16);
    var dx = 0, dy = 0;
    if (held) { dx = grab.x - grab.x0; dy = grab.y - grab.y0; var m = Math.hypot(dx, dy), lim = BW * 0.85; if (m > lim) { dx *= lim / m; dy *= lim / m; } }
    var moving = false;
    for (var n = 0; n < wts.length; n++) {
      var k = n * 2, tx = rest[k] + (held ? wts[n] * dx : 0), ty = rest[k + 1] + (held ? wts[n] * dy : 0);
      var ax = K * (tx - pos[k]) - C * vel[k], ay = K * (ty - pos[k + 1]) - C * vel[k + 1];
      vel[k] += ax * dt; vel[k + 1] += ay * dt; pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt;
      if (Math.abs(pos[k] - rest[k]) > 0.08 || Math.abs(pos[k + 1] - rest[k + 1]) > 0.08 || Math.abs(vel[k]) > 0.5 || Math.abs(vel[k + 1]) > 0.5) moving = true;
    }
    return moving || held;
  }
  function loop(t) {
    raf = 0;
    var dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000)); last = t;
    var live = true;
    for (var s = 0, n = Math.ceil(dt / (1 / 240)); s < n; s++) live = step(dt / n);
    draw();
    if (live) raf = requestAnimationFrame(loop);
    else { for (var k = 0; k < pos.length; k++) { pos[k] = rest[k]; vel[k] = 0; } box.classList.remove("stretching"); }   // at rest: the vector again
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function local(e) { var r = box.getBoundingClientRect(); return { x: e.clientX - r.left + OX, y: e.clientY - r.top + OY }; }
  function begin(p) {
    var R = BW * 0.2;
    for (var n = 0; n < wts.length; n++) { var ex = rest[n * 2] - p.x, ey = rest[n * 2 + 1] - p.y; wts[n] = Math.exp(-(ex * ex + ey * ey) / (R * R)); }
    grab = { x0: p.x, y0: p.y, x: p.x, y: p.y };
    draw(); box.classList.add("stretching"); kick();
  }
  function start(e) {
    if (e.button > 0) return;
    e.preventDefault(); try { box.setPointerCapture(e.pointerId); } catch (err) {}
    box.focus({ preventScroll: true });
    var go = function () { begin(local(e)); };
    if (!ready) { setup(go); return; }
    if (Math.abs(box.getBoundingClientRect().width - rasterW) > 0.5) { measure(); raster(go); } else go();
  }
  box.addEventListener("pointerdown", start);
  box.addEventListener("pointermove", function (e) { if (!grab) return; var p = local(e); grab.x = p.x; grab.y = p.y; });
  function end() { if (!grab) return; grab = null; kick(); }
  box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end); box.addEventListener("lostpointercapture", end);
  // a poke from the keyboard: a corner of the logo pulled out and let go
  box.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault();
    var go = function () {
      var p = { x: OX + BW * (0.25 + 0.5 * Math.random()), y: OY + BH * 0.35 };
      begin(p); grab.x = p.x + BW * 0.18; grab.y = p.y - BH * 0.3; setTimeout(end, 260);
    };
    if (ready) go(); else setup(go);
  });
  window.VFLogoToy = { state: function () { return { ready: ready, held: !!grab, stretching: box.classList.contains("stretching") }; },
    frame: function (t) { if (raf) { cancelAnimationFrame(raf); raf = 0; } loop(t); } };   // (for tests: one frame at time t)
})();
