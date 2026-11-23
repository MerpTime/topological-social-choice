/* "Averaging Angles": two draggable voters on S¹ and their average, which
   jumps to the other side of the circle when the voters become opposite. */
(function () {
  "use strict";

  const root = document.getElementById("avg");
  if (!root) return;
  const page = root.closest(".page");
  const cc = document.getElementById("avg-circle");
  const cx2 = cc.getContext("2d");
  const sweepBtn = document.getElementById("avg-sweep");

  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const C = {
    text: tok("--text"), muted: tok("--text-muted"), faint: tok("--text-faint"), line: tok("--line"),
    accent: tok("--accent"), hi: tok("--highlight"),
    v1: tok("--teal"), v2: tok("--red"), jump: tok("--maroon"),
  };
  const SERIF = '"KaTeX_Main", Georgia, serif';
  const MATH = '"KaTeX_Math", Georgia, serif';

  const TAU = Math.PI * 2;
  const wrap = (a) => ((a % TAU) + TAU) % TAU;
  const signed = (a) => { a = wrap(a); return a > Math.PI ? a - TAU : a; };

  /* ---------- The averaging rule (with the anonymous "nearer north" tie-break) ---------- */
  function average(a, b) {
    const x = Math.cos(a) + Math.cos(b), y = Math.sin(a) + Math.sin(b);
    const len = Math.hypot(x, y) / 2;
    if (len < 1e-9) {
      const m1 = wrap(a + Math.PI / 2), m2 = wrap(a - Math.PI / 2);
      return { angle: Math.sin(m1) >= Math.sin(m2) ? m1 : m2, len: 0, x: 0, y: 0 };
    }
    return { angle: wrap(Math.atan2(y, x)), len, x: x / 2, y: y / 2 };
  }

  let A = 0.55, B = 2.2;
  let lastRes = null, flash = null, sweep = null;

  /* ---------- Canvas sizing ---------- */
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

  /* ---------- Circle panel ---------- */
  let circ = { cx: 0, cy: 0, R: 1 };
  function drawCircle(res, now) {
    const [w, h] = fit(cc, cx2);
    const ctx = cx2;
    const cx = w / 2, cy = h / 2 + 8, R = Math.min(w, h) * 0.33;
    circ = { cx, cy, R };
    const P = (t, r = R) => [cx + r * Math.cos(t), cy - r * Math.sin(t)];
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";

    // faint axes
    ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.12; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - R * 1.3, cy); ctx.lineTo(cx + R * 1.3, cy); ctx.moveTo(cx, cy - R * 1.3); ctx.lineTo(cx, cy + R * 1.3); ctx.stroke();
    ctx.globalAlpha = 1;

    // The fault line: the point opposite voter 1
    const opp = P(A + Math.PI);
    ctx.setLineDash([3, 6]); ctx.strokeStyle = C.v1; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(...P(A)); ctx.lineTo(...opp); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // Circle
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    // Opposite-of-voter-1 marker
    ctx.strokeStyle = C.v1; ctx.lineWidth = 1.5; ctx.fillStyle = "#0c0d0f";
    ctx.beginPath(); ctx.arc(opp[0], opp[1], 6, 0, TAU); ctx.fill(); ctx.stroke();

    // Shorter arc between the voters (the one being bisected)
    const d = wrap(B - A);
    const [s, e] = d <= Math.PI ? [A, A + d] : [B, B + (TAU - d)];
    ctx.strokeStyle = C.hi; ctx.globalAlpha = 0.28; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(cx, cy, R, -s, -e, true); ctx.stroke();
    ctx.globalAlpha = 1;

    // Voter vectors
    [[A, C.v1], [B, C.v2]].forEach(([t, col]) => {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...P(t)); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // Jump flash: where the average just leapt from
    if (flash) {
      const age = (now - flash.t) / 900;
      if (age >= 1) flash = null;
      else {
        const f = P(flash.from);
        ctx.globalAlpha = 1 - age;
        ctx.setLineDash([6, 6]); ctx.strokeStyle = C.hi; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(...f); ctx.lineTo(...P(flash.to)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = C.hi; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f[0], f[1], 9 + 18 * age, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Voters + labels
    [[A, C.v1, "1"], [B, C.v2, "2"]].forEach(([t, col, label]) => {
      const p = P(t), q = P(t, R + 24);
      dot(ctx, p[0], p[1], 10, col);
      ctx.fillStyle = col; ctx.font = `17px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, q[0], q[1]);
    });

    // Average point
    const rp = P(res.angle);
    dot(ctx, rp[0], rp[1], 9, C.hi, 18);
    dot(ctx, cx, cy, 2.5, C.text);

    // Legend
    ctx.font = `14px ${SERIF}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    [["voter 1", C.v1], ["voter 2", C.v2], ["average", C.hi]].forEach(([t, col], k) => {
      dot(ctx, 22, 24 + k * 22, 5, col);
      ctx.fillStyle = C.muted; ctx.fillText(t, 34, 24 + k * 22);
    });
  }

  /* ---------- Interaction ---------- */
  let drag = null;
  function stopSweep() { sweep = null; sweepBtn.textContent = "Sweep voter 2 around"; }

  cc.addEventListener("pointerdown", (e) => {
    const r = cc.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const near = (t) => Math.hypot(circ.cx + circ.R * Math.cos(t) - mx, circ.cy - circ.R * Math.sin(t) - my);
    const d1 = near(A), d2 = near(B);
    if (Math.min(d1, d2) > 60) return;
    stopSweep();
    drag = { id: e.pointerId, who: d2 <= d1 ? "B" : "A", el: cc };
    try { cc.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    moveCircle(e);
  });
  function moveCircle(e) {
    const r = cc.getBoundingClientRect();
    const t = wrap(Math.atan2(-(e.clientY - r.top - circ.cy), e.clientX - r.left - circ.cx));
    if (drag.who === "A") A = t; else B = t;
  }

  window.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    moveCircle(e);
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  sweepBtn.addEventListener("click", () => {
    if (sweep) { stopSweep(); return; }
    sweep = { start: performance.now(), d0: wrap(B - A) };
    sweepBtn.textContent = "Stop";
  });

  /* ---------- Loop ---------- */
  let running = false;
  const SWEEP_MS = 8000;
  function frame(now) {
    if (!running) return;
    if (sweep) {
      const f = Math.min(1, (now - sweep.start) / SWEEP_MS);
      B = wrap(A + sweep.d0 + TAU * f);
      if (f >= 1) stopSweep();
    }
    const res = average(A, B);
    if (lastRes !== null && Math.abs(signed(res.angle - lastRes)) > 1.2) {
      flash = { from: lastRes, to: res.angle, t: now };
    }
    lastRes = res.angle;
    drawCircle(res, now);
    requestAnimationFrame(frame);
  }
  window.addEventListener("pagechange", (e) => {
    if (e.detail.id === page.id) { if (!running) { running = true; requestAnimationFrame(frame); } }
    else { running = false; stopSweep(); }
  });
})();
