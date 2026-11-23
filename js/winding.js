/* "Winding Numbers":
   1. Drag a point around S¹; the same path is unwound onto a helix, where the
      running angle becomes height. Closed loops end at whole-number heights.
   2. A loop on the torus S¹ × S¹ with winding numbers (m, n), plus its two
      shadows on the θ₁ and θ₂ circles. */
(function () {
  "use strict";

  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const C = {
    text: tok("--text"), muted: tok("--text-muted"), faint: tok("--text-faint"), line: tok("--line"),
    accent: tok("--accent"), hi: tok("--highlight"), v1: tok("--teal"), v2: tok("--red"),
  };
  const SERIF = '"KaTeX_Main", Georgia, serif';
  const TAU = Math.PI * 2;
  const wrap = (a) => ((a % TAU) + TAU) % TAU;
  const signed = (a) => { a = wrap(a); return a > Math.PI ? a - TAU : a; };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const fmt = (x) => (x < -0.005 ? "−" : x > 0.005 ? "+" : "") + Math.abs(x).toFixed(2);

  function fit(cv, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [r.width, r.height];
  }
  function dot(ctx, x, y, r, color, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function ring(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = "#0c0d0f"; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // Draw a running angle as a spiral: one lap per turn, drifting outward for
  // counterclockwise turns and inward for clockwise ones, so laps don't overlap.
  function spiral(ctx, cx, cy, R, a0, lifts, k, color, width) {
    if (lifts.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    lifts.forEach((L, i) => {
      const r = R * (1 + k * L), t = a0 + TAU * L;
      const x = cx + r * Math.cos(t), y = cy - r * Math.sin(t);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  /* =====================================================================
     1 · Winding around S¹, and the helix
     ===================================================================== */
  (function () {
    const root = document.getElementById("wind");
    if (!root) return;
    const page = root.closest(".page");
    const cc = document.getElementById("wind-circle"), cctx = cc.getContext("2d");
    const hc = document.getElementById("wind-helix"), hctx = hc.getContext("2d");
    const turnsEl = document.getElementById("wind-turns");
    const noteEl = document.getElementById("wind-note");

    let a0 = 0.35;          // the starting point (angle on S¹)
    let L = 0;              // running angle, in turns, since the start
    let trail = [0];        // running angle at each sample
    let anim = null;        // preset playback
    let cam = 0;            // helix camera height (turns), eases toward L
    let circ = { cx: 0, cy: 0, R: 1 };

    const SPREAD = 0.06;    // spiral drift per turn on the circle

    function clear() {
      a0 = wrap(a0 + TAU * L);
      L = 0; trail = [0]; anim = null;
    }
    function push(newL) {
      const last = trail[trail.length - 1];
      L = newL;
      // Fill in big steps so the drawn path follows the circle, not a chord
      const steps = Math.ceil(Math.abs(L - last) / 0.008);
      for (let i = 1; i <= steps; i++) trail.push(last + ((L - last) * i) / steps);
      if (trail.length > 4000) trail.splice(0, trail.length - 4000);
    }

    /* ---- Preset: a loop with winding number 1 ---- */
    const PRESETS = {
      "1": (f) => smooth(f),
    };
    root.querySelectorAll("[data-wind-preset]").forEach((b) => b.addEventListener("click", () => {
      clear();
      const k = b.dataset.windPreset;
      anim = { fn: PRESETS[k], t0: performance.now(), dur: 2800 };
    }));
    document.getElementById("wind-clear").addEventListener("click", clear);

    /* ---- Dragging the point ---- */
    let drag = null;
    function angleAt(e) {
      const r = cc.getBoundingClientRect();
      const x = e.clientX - r.left - circ.cx, y = -(e.clientY - r.top - circ.cy);
      return { t: Math.atan2(y, x), d: Math.hypot(x, y) };
    }
    cc.addEventListener("pointerdown", (e) => {
      const p = angleAt(e);
      if (p.d < circ.R * 0.15) return;
      anim = null;
      drag = { id: e.pointerId };
      try { cc.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
      move(e);
    });
    function move(e) {
      const p = angleAt(e);
      if (p.d < circ.R * 0.15) return;          // too close to the centre to tell direction
      const cur = a0 + TAU * L;
      push(L + signed(p.t - cur) / TAU);
    }
    window.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) move(e); });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);

    /* ---- Circle panel ---- */
    function drawCircle() {
      const [w, h] = fit(cc, cctx), ctx = cctx;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
      circ = { cx, cy, R };
      const P = (t, r = R) => [cx + r * Math.cos(t), cy - r * Math.sin(t)];
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.12; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - R * 1.35, cy); ctx.lineTo(cx + R * 1.35, cy); ctx.moveTo(cx, cy - R * 1.35); ctx.lineTo(cx, cy + R * 1.35); ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      // Counterclockwise = positive
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.7;
      const ra = R * 0.32;
      ctx.beginPath(); ctx.arc(cx, cy, ra, -0.35, -1.75, true); ctx.stroke();
      const tip = P(1.75, ra);
      ctx.fillStyle = C.muted;
      ctx.beginPath();
      ctx.moveTo(tip[0] - 6, tip[1] - 3); ctx.lineTo(tip[0] + 2, tip[1] - 7); ctx.lineTo(tip[0] + 1, tip[1] + 2);
      ctx.closePath(); ctx.fill();
      ctx.font = `15px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("+", cx + ra * 0.15, cy - ra * 0.05);
      ctx.globalAlpha = 1;

      spiral(ctx, cx, cy, R, a0, trail, SPREAD, C.hi, 2.5);

      // Start point
      const s = P(a0);
      ring(ctx, s[0], s[1], 7, C.text);
      const sl = P(a0, R * 0.68);
      ctx.fillStyle = C.muted; ctx.font = `14px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("start", sl[0], sl[1]);

      // Current point (on the circle), tied to the end of the spiral
      const t = a0 + TAU * L, p = P(t), q = P(t, R * (1 + SPREAD * L));
      ctx.strokeStyle = C.hi; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
      ctx.globalAlpha = 1;
      dot(ctx, p[0], p[1], 9, C.hi, 18);
    }

    /* ---- Helix panel: height = running angle in turns ---- */
    function drawHelix() {
      const [w, h] = fit(hc, hctx), ctx = hctx;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + 10, cy = h / 2, Rh = Math.min(w * 0.3, h * 0.3), flat = 0.3;
      const pitch = h * 0.19;                   // screen height of one turn
      const span = (h / 2) / pitch + 0.4;       // turns visible above/below the camera
      const X = (ang) => cx + Rh * Math.cos(ang);
      const Y = (ang, ht) => cy - (ht - cam) * pitch - Rh * flat * Math.sin(ang);
      const fade = (ht) => clamp(1.15 - Math.abs(ht - cam) / span, 0, 1);

      // Helix
      const lo = cam - span, hi = cam + span, N = Math.ceil((hi - lo) * 120);
      ctx.lineWidth = 2; ctx.strokeStyle = C.accent;
      for (let i = 0; i < N; i++) {
        const h0 = lo + ((hi - lo) * i) / N, h1 = lo + ((hi - lo) * (i + 1)) / N;
        const g0 = a0 + TAU * h0, g1 = a0 + TAU * h1;
        const back = Math.sin((g0 + g1) / 2) > 0;
        ctx.globalAlpha = (back ? 0.22 : 0.75) * fade((h0 + h1) / 2);
        ctx.beginPath(); ctx.moveTo(X(g0), Y(g0, h0)); ctx.lineTo(X(g1), Y(g1, h1)); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Everything above the start point: whole-number heights
      const xs = X(a0);
      ctx.setLineDash([3, 6]); ctx.strokeStyle = C.text; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xs, 0); ctx.lineTo(xs, h); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.font = `15px ${SERIF}`; ctx.textBaseline = "middle";
      const labelLeft = Math.cos(a0) > 0;
      for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
        const y = Y(a0, k), f = fade(k);
        if (f <= 0) continue;
        ctx.globalAlpha = f;
        ring(ctx, xs, y, k === 0 ? 7 : 5.5, k === 0 ? C.text : C.muted);
        ctx.fillStyle = k === Math.round(L) && Math.abs(L - k) < 0.012 && trail.length > 2 ? C.hi : C.muted;
        ctx.textAlign = labelLeft ? "left" : "right";
        ctx.fillText(k < 0 ? "−" + -k : String(k), xs + (labelLeft ? 14 : -14), y);
      }
      ctx.globalAlpha = 1;

      // The path so far, lifted
      if (trail.length > 1) {
        ctx.strokeStyle = C.hi; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
        for (let i = 1; i < trail.length; i++) {
          const h0 = trail[i - 1], h1 = trail[i], g0 = a0 + TAU * h0, g1 = a0 + TAU * h1;
          const back = Math.sin((g0 + g1) / 2) > 0;
          ctx.globalAlpha = (back ? 0.45 : 1) * fade((h0 + h1) / 2);
          ctx.beginPath(); ctx.moveTo(X(g0), Y(g0, h0)); ctx.lineTo(X(g1), Y(g1, h1)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      const g = a0 + TAU * L;
      dot(ctx, X(g), Y(g, L), 9, C.hi, 18);

      // Caption
      ctx.fillStyle = C.faint; ctx.font = `14px ${SERIF}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText("height = turns so far", 16, 14);
    }

    function updateReadout() {
      turnsEl.textContent = fmt(L);
      let note, closed = false;
      if (trail.length < 2) note = "Drag the point, or try a preset.";
      else if (Math.abs(L - Math.round(L)) < 0.012) {
        const n = Math.round(L);
        note = `Back at the start: winding number ${n < 0 ? "−" + -n : n}`;
        closed = true;
      } else note = "Not back at the start yet.";
      if (noteEl.textContent !== note) noteEl.textContent = note;
      noteEl.classList.toggle("is-closed", closed);
    }

    let running = false;
    function frame(now) {
      if (!running) return;
      if (anim) {
        const f = Math.min(1, (now - anim.t0) / anim.dur);
        push(anim.fn(f));
        if (f >= 1) { L = Math.round(L); trail[trail.length - 1] = L; anim = null; }
      }
      cam += (L - cam) * 0.08;
      drawCircle();
      drawHelix();
      updateReadout();
      requestAnimationFrame(frame);
    }
    window.addEventListener("pagechange", (e) => {
      if (e.detail.id === page.id) { if (!running) { running = true; requestAnimationFrame(frame); } }
      else { running = false; anim = null; }
    });
  })();

  /* =====================================================================
     2 · A loop on the torus, with winding numbers (m, n)
     ===================================================================== */
  (function () {
    const root = document.getElementById("tw");
    if (!root || !window.TorusScene) return;
    const page = root.closest(".page");
    const canvas = document.getElementById("tw-canvas");
    const fx = document.getElementById("tw-x"), fxc = fx.getContext("2d");
    const fy = document.getElementById("tw-y"), fyc = fy.getContext("2d");
    const mEl = document.getElementById("tw-m"), nEl = document.getElementById("tw-n");
    let m = 1, n = 2;

    function drawFactor(cv, ctx, turns, total, color) {
      const [w, h] = fit(cv, ctx);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
      ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      const samples = [];
      const steps = Math.max(2, Math.ceil(Math.abs(turns) * 90));
      for (let i = 0; i <= steps; i++) samples.push((turns * i) / steps);
      spiral(ctx, cx, cy, R, 0, samples, 0.07, C.hi, 2);
      ring(ctx, cx + R, cy, 5, C.text);
      const t = TAU * turns;
      dot(ctx, cx + R * Math.cos(t), cy - R * Math.sin(t), 7, color, 12);
      ctx.fillStyle = C.muted; ctx.font = `15px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(fmt(turns), cx, cy);
      ctx.fillStyle = C.faint; ctx.font = `12px ${SERIF}`;
      ctx.fillText(`of ${total < 0 ? "−" + -total : total}`, cx, cy + 17);
    }

    const scene = TorusScene(canvas, {
      p: m, q: n,
      intro: false,
      startDelay: -2,
      spinSpeed: 0.06,
      loopSeconds: 12,
      trail: 0.35,
      tilt: 1.0,
      guides: [
        { along: "u", at: 0, color: C.v1 },   // the long way: the θ₁ circle
        { along: "v", at: 0, color: C.v2 },   // around the tube: the θ₂ circle
      ],
      frame(W, H) {
        return { cx: W / 2, cy: H / 2, size: Math.min(W * (W < 600 ? 0.43 : 0.34), 380), maxHalfHeight: H / 2 - 44 };
      },
      onFrame(s) {
        drawFactor(fx, fxc, m * s, m, C.v1);
        drawFactor(fy, fyc, n * s, n, C.v2);
      },
    });

    root.querySelectorAll("[data-tw]").forEach((b) => b.addEventListener("click", () => {
      const d = Number(b.dataset.d);
      if (b.dataset.tw === "m") m = clamp(m + d, -3, 3); else n = clamp(n + d, -3, 3);
      const show = (v) => (v < 0 ? "−" + -v : String(v));
      mEl.textContent = show(m); nEl.textContent = show(n);
      scene.setLoop(m, n);
    }));

    window.addEventListener("resize", () => scene.resize());
    window.addEventListener("pagechange", (e) => (e.detail.id === page.id ? scene.start() : scene.stop()));
  })();
})();
