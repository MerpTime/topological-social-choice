/* Reusable 3D torus scene (canvas, no libraries).
   A shaded, slowly spinning torus with a point tracing a (p, q) loop on it:
   p times around the long way, q times around the tube.

   Usage:
     const scene = TorusScene(canvas, {
       p: 2, q: 3,                       // winding numbers of the traced loop
       frame: (W, H) => ({ cx, cy, size }), // where to draw; size = half-width in px
     });
     scene.start();  scene.stop();  scene.resize();
*/
(function () {
  "use strict";

  const css = getComputedStyle(document.documentElement);
  const token = (n, fallback) => css.getPropertyValue(n).trim() || fallback;
  const hexToRgb = (hex) => {
    const m = hex.replace("#", "");
    const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const smooth = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  window.TorusScene = function (canvas, options) {
    const o = Object.assign({
      p: 2, q: 3,             // loop: p times around the hole, q times around the tube
      majorR: 1, minorR: 0.42,
      nu: 56, nv: 26,         // mesh resolution
      tilt: 1.05,             // radians; 0 = looking straight down the hole
      spinSpeed: 0.1,         // radians per second, about the torus's own axis
      loopSeconds: 26,        // time for the point to trace the full loop once
      trail: 0.4,             // fraction of the loop kept as a glowing trail
      showPath: true,         // faint full loop
      grid: false,            // faint background grid
      intro: true,            // build-in animation
      startDelay: 0,          // seconds before the intro begins
      orbit: true,            // right-click + drag to rotate the view
      guides: [],             // circles drawn on the surface: { along: "u" | "v", at, color }
      onFrame: null,          // called each frame with the loop parameter s in [0, 1)
      drawLoop: true,         // draw the built-in (p, q) loop and its moving point
      extras: null,           // extras(api): add curves/points each frame (see below)
      frame: null,
    }, options || {});

    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S1 = hexToRgb(token("--surface-1", "#29ABCA"));
    const S2 = hexToRgb(token("--surface-2", "#236B8E"));
    const LINE = token("--accent", "#58C4DD");
    const HI = token("--highlight", "#F4D345");
    const TEXT = token("--text", "#ece8e1");

    const { majorR: R, minorR: r, nu, nv } = o;
    const TAU = Math.PI * 2;

    // Model space: torus axis along z
    const surf = (u, v, rr) => [
      (R + rr * Math.cos(v)) * Math.cos(u),
      (R + rr * Math.cos(v)) * Math.sin(u),
      rr * Math.sin(v),
    ];

    // Precompute mesh vertices and per-quad normals
    const verts = [];
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) verts.push(surf((i / nu) * TAU, (j / nv) * TAU, r));
    }
    const quadNormals = [];
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const u = ((i + 0.5) / nu) * TAU, v = ((j + 0.5) / nv) * TAU;
        quadNormals.push([Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v)]);
      }
    }

    // Light direction (view space), normalised
    const L = (() => { const l = [-0.45, 0.65, 0.62]; const n = Math.hypot(...l); return l.map((x) => x / n); })();

    let W = 0, H = 0, cx = 0, cy = 0, scale = 100, fitW = 100, fitH = Infinity;
    let phi = 0, cosA = 1, sinA = 0, cosP = 1, sinP = 0;
    let tilt = o.tilt, spinOffset = 0;   // changed by right-drag orbiting
    let loopT0 = o.startDelay + 2.0;     // time at which the traced point left the start
    let lastT = 0;
    const D = 7; // camera distance (model units)

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = o.frame ? o.frame(W, H) : { cx: W / 2, cy: H / 2, size: Math.min(W, H) * 0.4 };
      cx = f.cx; cy = f.cy; fitW = f.size; fitH = f.maxHalfHeight || Infinity;
    }

    // Model → view: spin about z, then tilt about x. View: X right, Y up, Z toward viewer.
    function view(m) {
      const x1 = m[0] * cosP - m[1] * sinP;
      const y1 = m[0] * sinP + m[1] * cosP;
      const z1 = m[2];
      return [x1, y1 * cosA - z1 * sinA, y1 * sinA + z1 * cosA];
    }
    function project(v) {
      const k = D / (D - v[2]);
      return [cx + v[0] * scale * k, cy - v[1] * scale * k];
    }

    function drawGrid(alpha) {
      const step = scale * 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = LINE;
      ctx.globalAlpha = 0.06 * alpha;
      ctx.beginPath();
      for (let x = cx % step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = cy % step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const surfAt = (uv) => surf(uv[0], uv[1], r * 1.05);

    function loopPoint(s) { // s in [0,1)
      return surf(TAU * o.p * s, TAU * o.q * s, r * 1.05);
    }

    function draw(t) {
      lastT = t;
      ctx.clearRect(0, 0, W, H);
      const ti = t - o.startDelay;
      const build = o.intro ? smooth(prog(ti, 0, 2.2)) : 1;
      const dotIn = o.intro ? smooth(prog(ti, 2.0, 2.8)) : 1;

      if (o.grid) drawGrid(o.intro ? smooth(prog(ti, 0, 1.2)) : 1);

      phi = t * o.spinSpeed + spinOffset;
      cosP = Math.cos(phi); sinP = Math.sin(phi);
      cosA = Math.cos(tilt); sinA = Math.sin(tilt);
      // Fit the torus to the frame at the current tilt (taller when seen from above)
      scale = Math.min(fitW / (R + r), fitH / ((R + r) * Math.abs(cosA) + r * Math.abs(sinA)));

      // Transform + project every vertex once
      const vv = new Array(verts.length), pp = new Array(verts.length);
      for (let k = 0; k < verts.length; k++) { vv[k] = view(verts[k]); pp[k] = project(vv[k]); }
      const idx = (i, j) => i * (nv + 1) + j;

      const items = [];

      // Surface quads (built in sweeping around the hole)
      const shown = Math.ceil(nu * build);
      for (let i = 0; i < shown; i++) {
        for (let j = 0; j < nv; j++) {
          const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
          const depth = (vv[a][2] + vv[b][2] + vv[c][2] + vv[d][2]) / 4;
          items.push({ kind: 0, depth, a, b, c, d, n: view(quadNormals[i * nv + j]), check: (i + j) & 1 });
        }
      }

      // Guide circles on the surface (e.g. the two directions around the torus)
      for (const g of o.guides) {
        const N = 120, at = (k) => {
          const a = (k / N) * TAU;
          return view(g.along === "u" ? surf(a, g.at, r * 1.03) : surf(g.at, a, r * 1.03));
        };
        let prev = at(0);
        for (let k = 1; k <= N; k++) {
          const cur = at(k);
          items.push({ kind: 1, depth: (prev[2] + cur[2]) / 2 + 0.08, p0: prev, p1: cur, alpha: 0.75 * build, w: 2, color: g.color });
          prev = cur;
        }
      }

      // Extra curves and points supplied by the page:
      //   api.curve(fn, { color, alpha, w, n })  fn(s) -> [u, v] for s in [0, 1]
      //   api.point(u, v, { color, r, alpha, hollow })
      if (o.extras) {
        o.extras({
          curve(fn, st) {
            const N = st.n || 160;
            let prev = view(surfAt(fn(0)));
            for (let k = 1; k <= N; k++) {
              const cur = view(surfAt(fn(k / N)));
              items.push({ kind: 1, depth: (prev[2] + cur[2]) / 2 + 0.1, p0: prev, p1: cur, alpha: st.alpha == null ? 1 : st.alpha, w: st.w || 3, color: st.color });
              prev = cur;
            }
          },
          point(u, v, st) {
            const pt = view(surf(u, v, r * 1.05));
            items.push({ kind: 2, depth: pt[2] + 0.12, p: pt, alpha: st.alpha == null ? 1 : st.alpha, color: st.color, r: st.r, hollow: st.hollow });
          },
        });
      }

      // Traced loop: faint full path + glowing trail + point
      const elapsed = Math.max(0, t - loopT0);
      const s = (elapsed / o.loopSeconds) % 1;
      if (o.onFrame) o.onFrame(s);
      if (dotIn > 0 && o.drawLoop) {
        if (o.showPath) {
          const N = 360;
          let prev = view(loopPoint(0));
          for (let k = 1; k <= N; k++) {
            const cur = view(loopPoint(k / N));
            items.push({ kind: 1, depth: (prev[2] + cur[2]) / 2 + 0.09, p0: prev, p1: cur, alpha: 0.3 * dotIn, w: 1.6 });
            prev = cur;
          }
        }
        const trailLen = Math.min(o.trail, elapsed / o.loopSeconds);
        const N = 140;
        let prev = view(loopPoint(s - trailLen));
        for (let k = 1; k <= N; k++) {
          const f = k / N;
          const cur = view(loopPoint(s - trailLen * (1 - f)));
          items.push({ kind: 1, depth: (prev[2] + cur[2]) / 2 + 0.1, p0: prev, p1: cur, alpha: Math.pow(f, 1.3) * dotIn, w: 4 });
          prev = cur;
        }
        const pt = view(loopPoint(s));
        items.push({ kind: 2, depth: pt[2] + 0.12, p: pt, alpha: dotIn });
      }

      items.sort((x, y) => x.depth - y.depth);

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const it of items) {
        if (it.kind === 0) {
          let n = it.n;
          // Shade by the side facing the camera
          if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
          const lit = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
          const k = 0.28 + 0.85 * lit;
          const base = it.check ? S1 : S2;
          const col = `rgb(${Math.min(255, base[0] * k) | 0},${Math.min(255, base[1] * k) | 0},${Math.min(255, base[2] * k) | 0})`;
          const A = pp[it.a], B = pp[it.b], C = pp[it.c], Dd = pp[it.d];
          ctx.beginPath();
          ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(Dd[0], Dd[1]);
          ctx.closePath();
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = col;
          ctx.fill();
          ctx.globalAlpha = 0.18 + 0.25 * lit;
          ctx.strokeStyle = col;
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.globalAlpha = 0.10 + 0.12 * lit;
          ctx.strokeStyle = TEXT;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else if (it.kind === 1) {
          const a = project(it.p0), b = project(it.p1);
          ctx.globalAlpha = it.alpha;
          ctx.strokeStyle = it.color || HI;
          ctx.lineWidth = it.w;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        } else {
          const a = project(it.p);
          const col = it.color || HI;
          ctx.save();
          ctx.globalAlpha = it.alpha;
          if (it.hollow) {
            ctx.fillStyle = "#0c0d0f"; ctx.strokeStyle = col; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(a[0], a[1], it.r || 6, 0, TAU); ctx.fill(); ctx.stroke();
          } else {
            ctx.shadowColor = col;
            ctx.shadowBlur = 20;
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(a[0], a[1], (it.r || 8.5) * (it.r ? 1 : it.alpha), 0, TAU); ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    const t0 = performance.now();
    let running = false;
    function frame(now) {
      if (!running) return;
      draw((now - t0) / 1000);
      requestAnimationFrame(frame);
    }

    /* ---- Right-click + drag to orbit ----
       Horizontal drag turns the torus about its axis; vertical drag tilts it. */
    if (o.orbit) {
      let drag = null;
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 2) return;
        e.preventDefault();
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
        canvas.classList.add("is-orbiting");
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        spinOffset -= (e.clientX - drag.x) * 0.008;
        tilt = clamp(tilt - (e.clientY - drag.y) * 0.008, 0, Math.PI);
        drag.x = e.clientX; drag.y = e.clientY;
        if (!running) draw(o.startDelay + 6);
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        canvas.classList.remove("is-orbiting");
      };
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
    }

    return {
      /* Draw one frame at time t (seconds), for pages that run their own animation loop. */
      renderAt(t) { draw(t); },
      /* Change the spin speed without the torus jumping to a new angle. */
      setSpin(speed) {
        spinOffset += lastT * (o.spinSpeed - speed);
        o.spinSpeed = speed;
      },
      /* The visible surface point (u, v) nearest the canvas position (x, y), or null. */
      pick(x, y, maxDist = 18) {
        let best = null, bestZ = -Infinity;
        for (let i = 0; i < 120; i++) {
          for (let j = 0; j < 60; j++) {
            const u = (i / 120) * TAU, v = (j / 60) * TAU;
            const vp = view(surf(u, v, r));
            const pp = project(vp);
            if (Math.hypot(pp[0] - x, pp[1] - y) > maxDist) continue;
            if (vp[2] > bestZ) { bestZ = vp[2]; best = [u, v]; }
          }
        }
        return best;
      },
      /* Screen position (canvas px) of the surface point (u, v), as of the last frame drawn. */
      toScreen(u, v) { return project(view(surf(u, v, r * 1.05))); },
      /* Change the traced loop's winding numbers; the point restarts from the start. */
      setLoop(p, q) {
        o.p = p; o.q = q;
        loopT0 = lastT;
        if (!running) draw(lastT || o.startDelay + 6);
      },
      resize() { resize(); if (!running) draw(o.startDelay + 6); },
      start() {
        resize();
        if (reduceMotion) { draw(o.startDelay + 6); return; }
        if (running) return;
        running = true;
        requestAnimationFrame(frame);
      },
      stop() { running = false; },
    };
  };
})();
