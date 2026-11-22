/* "Averaging Angles": two draggable voters on S¹, their average, and a graph
   of the average against the angle between them, which jumps at 180°. */
(function () {
  "use strict";

  const root = document.getElementById("avg");
  if (!root) return;
  const page = root.closest(".page");
  const cc = document.getElementById("avg-circle");
  const gc = document.getElementById("avg-graph");
  const cx2 = cc.getContext("2d");
  const gx2 = gc.getContext("2d");
  const statusEl = document.getElementById("avg-status");
  const sweepBtn = document.getElementById("avg-sweep");
  const resetBtn = document.getElementById("avg-reset");

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
  const deg = (a) => Math.round((a * 180) / Math.PI);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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

  const DEFAULT = { a: 0.55, b: 2.2 };
  let A = DEFAULT.a, B = DEFAULT.b;
  let lastRes = null, flash = null, jumps = 0, sweep = null;

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

    // Average of the two vectors (shrinks to zero as they become opposite)
    const tip = [cx + R * res.x, cy - R * res.y];
    const rp = P(res.angle);
    ctx.setLineDash([4, 5]); ctx.strokeStyle = C.hi; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(...tip); ctx.lineTo(...rp); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (res.len > 0.02) {
      ctx.strokeStyle = C.hi; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...tip); ctx.stroke();
    }

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
    dot(ctx, rp[0], rp[1], 9, C.hi, 18);
    dot(ctx, cx, cy, 2.5, C.text);

    // Legend
    ctx.font = `14px ${SERIF}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    [["voter 1", C.v1], ["voter 2", C.v2], ["average", C.hi]].forEach(([t, col], k) => {
      dot(ctx, 22, 24 + k * 22, 5, col);
      ctx.fillStyle = C.muted; ctx.fillText(t, 34, 24 + k * 22);
    });
  }

  /* ---------- Graph panel ---------- */
  let plot = { x: 0, y: 0, w: 1, h: 1 };
  const gxOf = (d) => plot.x + (d / TAU) * plot.w;
  const gyOf = (r) => plot.y + (1 - (r + Math.PI / 2) / Math.PI) * plot.h;

  function drawGraph(res) {
    const [w, h] = fit(gc, gx2);
    const ctx = gx2;
    plot = { x: 70, y: 40, w: w - 70 - 28, h: h - 40 - 92 };
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";

    // Grid
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
    [0, 1, 2, 3, 4].forEach((k) => {
      const x = gxOf((k * TAU) / 4);
      ctx.globalAlpha = 0.1;
      ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
    });
    [-1, -0.5, 0, 0.5, 1].forEach((k) => {
      const y = gyOf((k * Math.PI) / 2);
      ctx.globalAlpha = k === 0 ? 0.25 : 0.1;
      ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // Axes
    ctx.strokeStyle = C.text; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(plot.x, plot.y); ctx.lineTo(plot.x, plot.y + plot.h); ctx.lineTo(plot.x + plot.w, plot.y + plot.h); ctx.stroke();
    ctx.globalAlpha = 1;

    // Tick labels
    ctx.fillStyle = C.faint; ctx.font = `13px ${SERIF}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, 90, 180, 270, 360].forEach((v) => ctx.fillText(`${v}°`, gxOf((v / 360) * TAU), plot.y + plot.h + 8));
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [[-90, "−90°"], [0, "0°"], [90, "+90°"]].forEach(([v, t]) => ctx.fillText(t, plot.x - 10, gyOf((v * Math.PI) / 180)));

    // Axis titles
    ctx.fillStyle = C.muted; ctx.font = `15px ${SERIF}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("angle from voter 1 to voter 2", plot.x + plot.w / 2, plot.y + plot.h + 34);
    ctx.save();
    ctx.translate(20, plot.y + plot.h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "middle";
    ctx.fillText("average, measured from voter 1", 0, 0);
    ctx.restore();

    // The discontinuity
    const xj = gxOf(Math.PI);
    ctx.setLineDash([3, 5]); ctx.strokeStyle = C.jump; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xj, gyOf(Math.PI / 2)); ctx.lineTo(xj, gyOf(-Math.PI / 2)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.jump; ctx.font = `italic 14px ${SERIF}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("jump of 180°", xj + 10, gyOf(0) + 16);

    // The curve: two pieces
    ctx.strokeStyle = C.hi; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gxOf(0), gyOf(0)); ctx.lineTo(gxOf(Math.PI), gyOf(Math.PI / 2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gxOf(Math.PI), gyOf(-Math.PI / 2)); ctx.lineTo(gxOf(TAU), gyOf(0)); ctx.stroke();
    // Open ends at the jump, filled at the tie-break value
    const tie = signed(average(A, A + Math.PI).angle - A);
    [Math.PI / 2, -Math.PI / 2].forEach((r) => {
      const filled = Math.abs(r - tie) < 1e-6;
      ctx.fillStyle = filled ? C.hi : "#0c0d0f"; ctx.strokeStyle = C.hi; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(xj, gyOf(r), 5.5, 0, TAU); ctx.fill(); ctx.stroke();
    });

    // Current state
    const d = wrap(B - A), r = signed(res.angle - A);
    const px = gxOf(d), py = gyOf(r);
    ctx.setLineDash([2, 5]); ctx.strokeStyle = C.v2; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, plot.y + plot.h); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    dot(ctx, px, plot.y + plot.h, 5, C.v2);
    dot(ctx, px, py, 8, C.hi, 16);
  }

  /* ---------- Status line ---------- */
  let lastStatus = "";
  function updateStatus() {
    const d = wrap(B - A), gap = Math.min(d, TAU - d), g = deg(gap);
    let s;
    if (gap > Math.PI - 0.009) s = "The voters are exactly opposite. Both midpoints are equally good, and the average of the two vectors is zero, so the rule has to fall back on its tie-break.";
    else if (g >= 150) s = `The voters are ${g}° apart, almost opposite. The average arrow has nearly vanished, and a tiny nudge to either voter can flip the result to the other side of the circle.`;
    else s = `The voters are ${g}° apart. The average sits halfway between them, on the shorter arc.`;
    if (jumps > 0) s += ` The average has jumped across the circle ${jumps === 1 ? "once" : jumps + " times"}.`;
    if (s !== lastStatus) { statusEl.textContent = s; lastStatus = s; }
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

  gc.addEventListener("pointerdown", (e) => {
    stopSweep();
    drag = { id: e.pointerId, who: "graph", el: gc };
    try { gc.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    moveGraph(e);
  });
  function moveGraph(e) {
    const r = gc.getBoundingClientRect();
    const d = clamp((e.clientX - r.left - plot.x) / plot.w, 0, 0.9999) * TAU;
    B = wrap(A + d);
  }

  window.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.who === "graph") moveGraph(e); else moveCircle(e);
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  sweepBtn.addEventListener("click", () => {
    if (sweep) { stopSweep(); return; }
    sweep = { start: performance.now(), d0: wrap(B - A) };
    sweepBtn.textContent = "Stop";
  });
  resetBtn.addEventListener("click", () => {
    stopSweep();
    A = DEFAULT.a; B = DEFAULT.b; jumps = 0; flash = null; lastRes = null;
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
      jumps++;
    }
    lastRes = res.angle;
    drawCircle(res, now);
    drawGraph(res);
    updateStatus();
    requestAnimationFrame(frame);
  }
  window.addEventListener("pagechange", (e) => {
    if (e.detail.id === page.id) { if (!running) { running = true; requestAnimationFrame(frame); } }
    else { running = false; stopSweep(); }
  });
})();
