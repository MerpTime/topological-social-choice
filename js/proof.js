/* "Proof by Contradiction!": Chichilnisky's theorem for two voters, told with
   winding numbers. One figure — the torus of vote pairs, the same torus cut
   open into a square, and the output circle — stepped through seven stages. */
(function () {
  "use strict";

  const root = document.getElementById("pf");
  if (!root || !window.TorusScene || !window.Stepper) return;
  const page = root.closest(".page");
  const fig = document.getElementById("pf-fig");
  const panelsEl = fig.querySelector(".proof-fig__panels");
  const torusCv = document.getElementById("pf-torus");
  const sqCv = document.getElementById("pf-square"), sqCtx = sqCv.getContext("2d");
  const outCv = document.getElementById("pf-out"), outCtx = outCv.getContext("2d");
  const ovCv = document.getElementById("pf-overlay"), ovCtx = ovCv.getContext("2d");
  const ledger = document.getElementById("pf-ledger");
  const notes = {};
  fig.querySelectorAll("[data-note]").forEach((el) => (notes[el.dataset.note] = el));

  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const C = {
    text: tok("--text"), muted: tok("--text-muted"), faint: tok("--text-faint"), line: tok("--line"),
    accent: tok("--accent"), hi: tok("--highlight"), a: tok("--teal"), b: tok("--red"),
    s1: tok("--surface-1"), s2: tok("--surface-2"),
  };
  const SERIF = '"KaTeX_Main", Georgia, serif';
  const MATH = '"KaTeX_Math", Georgia, serif';
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

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
  // A math symbol with an optional subscript, e.g. θ₁, centred on (x, y)
  function sym(ctx, base, sub, x, y, size, color) {
    ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `${size}px ${MATH}`;
    const wb = ctx.measureText(base).width;
    ctx.font = `${Math.round(size * 0.7)}px ${SERIF}`;
    const ws = sub ? ctx.measureText(sub).width : 0;
    const x0 = x - (wb + ws) / 2;
    ctx.font = `${size}px ${MATH}`;
    ctx.fillText(base, x0, y);
    if (sub) { ctx.font = `${Math.round(size * 0.7)}px ${SERIF}`; ctx.fillText(sub, x0 + wb, y + size * 0.28); }
  }
  function arrowHead(ctx, x, y, ang, size) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(ang - 0.45), y - size * Math.sin(ang - 0.45));
    ctx.lineTo(x - size * Math.cos(ang + 0.45), y - size * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fill();
  }

  /* ---------- The loops, in square coordinates [0,1]² (θ₁, θ₂ in turns) ---------- */
  const LOOPS = {
    a: (t) => [t, 0],                 // α: voter 1 goes around
    b: (t) => [0, t],                 // β: voter 2 goes around
    d: (t) => [t, t],                 // δ: both together
  };
  // δ slid into "α then β": the straight-line deformation inside the square
  const corner = (t) => (t < 0.5 ? [2 * t, 0] : [1, 2 * t - 1]);
  const slide = (sig) => (t) => {
    const p = corner(t);
    return [(1 - sig) * t + sig * p[0], (1 - sig) * t + sig * p[1]];
  };
  const toUV = (f) => (t) => { const p = f(t); return [TAU * p[0], TAU * p[1]]; };

  /* ---------- What each step shows ---------- */
  const STEPS = [
    { notes: 1, wander: 1 },
    { a: 1, b: 1, d: 1, move: 1 },
    { a: 1, b: 1, d: 0.2, move: 1 },
    { a: 1, b: 1, d: 0.2, move: 1, swap: 1 },
    { a: 0.2, b: 0.2, d: 1, move: 1, out: 1 },
    { a: 0.3, b: 0.3, d: 0.3, slide: 1 },
    { a: 1, b: 1, d: 1 },
  ];
  const KEYS = ["notes", "wander", "a", "b", "d", "move", "swap", "out", "slide"];
  const vis = {}; KEYS.forEach((k) => (vis[k] = 0));
  let step = 0, stepT0 = 0;

  const col = (c) => `\\color{${c}}`;
  const A = `{${col(C.a)}\\alpha}`, B = `{${col(C.b)}\\beta}`, D = `{${col(C.hi)}\\delta}`;
  const LEDGER = [
    ["\\varphi(\\theta_1, \\theta_2) = \\;?"],
    [`${A} : (\\theta, 0)`, `${B} : (0, \\theta)`, `${D} : (\\theta, \\theta)`],
    [`\\varphi(${A}) \\text{ winds } m`, `\\varphi(${B}) \\text{ winds } n`],
    [`\\varphi(${A}) = \\varphi(${B})`, "m = n"],
    ["m = n", `\\varphi(${D}) \\text{ winds } 1`],
    ["m = n", "m + n = 1"],
    ["m = n", "m + n = 1", "!2m = 1"],
  ];
  function renderLedger() {
    ledger.innerHTML = "";
    LEDGER[step].forEach((src, i) => {
      const row = document.createElement("div");
      const bad = src[0] === "!";
      if (bad) { src = src.slice(1); row.className = "is-bad"; }
      row.style.animationDelay = `${i * 0.12}s`;
      if (window.katex) window.katex.render(src, row, { throwOnError: false });
      else row.textContent = src;
      ledger.appendChild(row);
    });
  }
  window.addEventListener("load", renderLedger);

  /* ---------- Torus ---------- */
  let torusState = null;   // what the torus should draw this frame
  const scene = TorusScene(torusCv, {
    drawLoop: false,
    intro: false,
    spinSpeed: 0.05,
    tilt: 1.0,
    frame: (W, H) => ({ cx: W / 2, cy: H / 2, size: Math.min(W * 0.36, 360), maxHalfHeight: H / 2 - 16 }),
    extras(api) {
      const s = torusState;
      if (!s) return;
      s.curves.forEach((c) => c.alpha > 0.02 && api.curve(toUV(c.fn), { color: c.color, alpha: c.alpha, w: c.w || 3 }));
      s.points.forEach((p) => p.alpha > 0.02 && api.point(TAU * p.at[0], TAU * p.at[1], { color: p.color, alpha: p.alpha, r: 7 }));
    },
  });

  /* ---------- Square ---------- */
  let sqGeom = { x0: 0, y0: 0, S: 1 };
  const SQ = (p) => [sqGeom.x0 + p[0] * sqGeom.S, sqGeom.y0 - p[1] * sqGeom.S];

  function drawSquare(state) {
    const [w, h] = fit(sqCv, sqCtx), ctx = sqCtx;
    ctx.clearRect(0, 0, w, h);
    const S = Math.min(w, h) * 0.6;
    sqGeom = { x0: (w - S) / 2 + 8, y0: (h + S) / 2 - 6, S };
    const { x0, y0 } = sqGeom;

    // Faint checkerboard, like the torus surface
    const N = 8, c = S / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      ctx.fillStyle = (i + j) & 1 ? C.s1 : C.s2;
      ctx.globalAlpha = (i + j) & 1 ? 0.16 : 0.22;
      ctx.fillRect(x0 + i * c, y0 - (j + 1) * c, c, c);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1.2;
    ctx.strokeRect(x0, y0 - S, S, S);

    // Gluing marks: single arrows on bottom/top, double on left/right
    ctx.fillStyle = C.muted;
    const chev = (x, y, ang) => arrowHead(ctx, x, y, ang, 8);
    chev(x0 + S / 2 + 4, y0, 0); chev(x0 + S / 2 + 4, y0 - S, 0);
    [x0, x0 + S].forEach((x) => { chev(x, y0 - S / 2 - 4, -Math.PI / 2); chev(x, y0 - S / 2 - 11, -Math.PI / 2); });

    // Axis labels
    ctx.fillStyle = C.faint; ctx.font = `12px ${SERIF}`; ctx.textBaseline = "top"; ctx.textAlign = "center";
    ctx.fillText("0°", x0, y0 + 6); ctx.fillText("360°", x0 + S, y0 + 6);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("0°", x0 - 6, y0 - 2); ctx.fillText("360°", x0 - 6, y0 - S + 2);
    state.axisLabel = [x0 + S / 2, y0 + 20];
    sym(ctx, "θ", "1", x0 + S / 2, y0 + 20, 17, C.a);
    sym(ctx, "θ", "2", x0 - 22, y0 - S / 2, 17, C.b);

    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // Anonymity: α and β are mirror images across the diagonal
    if (vis.swap > 0.02) {
      ctx.setLineDash([2, 5]); ctx.strokeStyle = C.text; ctx.globalAlpha = 0.35 * vis.swap; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...SQ([0, 0])); ctx.lineTo(...SQ([1, 1])); ctx.stroke();
      const pa = SQ(LOOPS.a(state.t)), pb = SQ(LOOPS.b(state.t));
      ctx.globalAlpha = 0.8 * vis.swap; ctx.strokeStyle = C.text;
      ctx.beginPath(); ctx.moveTo(...pa); ctx.lineTo(...pb); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    state.curves.forEach((cv) => {
      if (cv.alpha <= 0.02) return;
      ctx.strokeStyle = cv.color; ctx.globalAlpha = cv.alpha; ctx.lineWidth = cv.w || 3;
      ctx.beginPath();
      for (let k = 0; k <= 120; k++) {
        const p = SQ(cv.fn(k / 120));
        if (k) ctx.lineTo(...p); else ctx.moveTo(...p);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (cv.label) {
        const p = SQ(cv.label.at);
        ctx.globalAlpha = cv.alpha;
        sym(ctx, cv.label.text, "", p[0], p[1], 19, cv.color);
        ctx.globalAlpha = 1;
      }
    });
    state.points.forEach((p) => {
      if (p.alpha <= 0.02) return;
      ctx.globalAlpha = p.alpha;
      const q = SQ(p.at);
      dot(ctx, q[0], q[1], 7, p.color, 14);
      ctx.globalAlpha = 1;
    });
  }

  /* ---------- Output circle ---------- */
  let outGeom = { cx: 0, cy: 0, R: 1 };
  function drawOut(state) {
    const [w, h] = fit(outCv, outCtx), ctx = outCtx;
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w * 0.27, h * 0.22), cx = w / 2, cy = h * 0.36;
    outGeom = { cx, cy, R };
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.fillStyle = C.faint; ctx.font = `13px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("output", cx, cy - R - 10);

    // Unanimity: the output along δ is just θ, once around
    if (vis.out > 0.02) {
      const t = state.t, ang = TAU * t;
      ctx.globalAlpha = vis.out;
      ctx.strokeStyle = C.hi; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, -ang, true); ctx.stroke();
      dot(ctx, cx + R * Math.cos(ang), cy - R * Math.sin(ang), 8, C.hi, 16);
      ctx.fillStyle = C.text; ctx.font = `18px ${SERIF}`; ctx.textBaseline = "middle";
      ctx.fillText(t.toFixed(2), cx, cy);
      ctx.globalAlpha = 1;
    }
    // Anything else: we don't know where φ sends it
    const g = 1 - vis.out;
    if (g > 0.02) {
      const ang = Math.PI / 3, gx = cx + R * Math.cos(ang), gy = cy - R * Math.sin(ang);
      ctx.globalAlpha = g;
      ctx.setLineDash([3, 3]); ctx.strokeStyle = C.hi; ctx.lineWidth = 1.6; ctx.fillStyle = "#0c0d0f";
      ctx.beginPath(); ctx.arc(gx, gy, 9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.hi; ctx.font = `13px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("?", gx, gy + 1);
      ctx.globalAlpha = 1;
      state.ghost = [gx, gy];
    }
  }

  /* ---------- Overlay: the φ arrow and the step-1 callouts ---------- */
  function offsetOf(el) {
    const f = fig.getBoundingClientRect(), r = el.getBoundingClientRect();
    return [r.left - f.left, r.top - f.top];
  }

  const NOTE_LAYOUT = {
    wide: { top: [["torus", 0.13], ["point", 0.43], ["phi", 0.78]], bottom: [[["square", 0.32], ["axes", 0.57], ["out", 0.85]]] },
    narrow: { top: [["torus", 0.25], ["point", 0.75]], bottom: [[["square", 0.25], ["out", 0.75]], [["axes", 0.25], ["phi", 0.75]]] },
  };
  let padTop = 0, padBottom = 0;
  function layoutNotes() {
    const W = fig.clientWidth;
    const L = W < 600 ? NOTE_LAYOUT.narrow : NOTE_LAYOUT.wide;
    const place = (name, fx, y) => {
      const el = notes[name], w = el.offsetWidth;
      el.style.left = `${clamp(fx * W - w / 2, 8, W - w - 8)}px`;
      el.style.top = `${y}px`;
    };
    const topH = Math.max(...L.top.map(([n]) => notes[n].offsetHeight));
    padTop = topH + 60;
    L.top.forEach(([n, fx]) => place(n, fx, padTop - 50 - notes[n].offsetHeight));
    let y = padTop + panelsEl.offsetHeight + 48;
    L.bottom.forEach((row) => {
      const rh = Math.max(...row.map(([n]) => notes[n].offsetHeight));
      row.forEach(([n, fx]) => place(n, fx, y));
      y += rh + 22;
    });
    padBottom = y - (padTop + panelsEl.offsetHeight) - 6;
    fig.style.paddingTop = `${padTop * vis.notes}px`;
    fig.style.paddingBottom = `${padBottom * vis.notes}px`;
  }

  function callout(ctx, name, targets) {
    const el = notes[name];
    const x = el.offsetLeft + el.offsetWidth / 2;
    const fromTop = el.offsetTop < padTop;
    targets.forEach((tg, i) => {
      if (!tg) return;
      const sx = x + (targets.length > 1 ? (i - 0.5) * 40 : 0);
      const sy = fromTop ? el.offsetTop + el.offsetHeight + 6 : el.offsetTop - 6;
      const dx = tg[0] - sx, dy = tg[1] - sy, len = Math.hypot(dx, dy);
      const ex = tg[0] - (dx / len) * 12, ey = tg[1] - (dy / len) * 12;
      const mx = (sx + ex) / 2 + dy * 0.12, my = (sy + ey) / 2 - dx * 0.12;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      arrowHead(ctx, ex, ey, Math.atan2(ey - my, ex - mx), 8);
    });
  }

  function drawOverlay(state) {
    const [w, h] = fit(ovCv, ovCtx), ctx = ovCtx;
    ctx.clearRect(0, 0, w, h);
    const sqOff = offsetOf(sqCv), outOff = offsetOf(outCv), toOff = offsetOf(torusCv);

    // φ: square → output circle
    const sx = sqOff[0] + sqGeom.x0 + sqGeom.S + 16, sy = sqOff[1] + sqGeom.y0 - sqGeom.S / 2;
    const ex = outOff[0] + outGeom.cx - outGeom.R - 14, ey = outOff[1] + outGeom.cy;
    const mx = (sx + ex) / 2, my = Math.min(sy, ey) - 26;
    ctx.strokeStyle = C.accent; ctx.fillStyle = C.accent; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    arrowHead(ctx, ex, ey, Math.atan2(ey - my, ex - mx), 10);
    const phiAt = [(sx + 2 * mx + ex) / 4, (sy + 2 * my + ey) / 4];
    ctx.font = `italic 22px ${MATH}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("φ", phiAt[0], phiAt[1] - 4);

    if (vis.notes > 0.02) {
      ctx.globalAlpha = vis.notes;
      ctx.strokeStyle = C.muted; ctx.fillStyle = C.muted; ctx.lineWidth = 1.3;
      const tc = torusCv.getBoundingClientRect();
      const add = (off, p) => (p ? [off[0] + p[0], off[1] + p[1]] : null);
      const wp = state.wanderAt;
      callout(ctx, "torus", [[toOff[0] + tc.width * 0.22, toOff[1] + tc.height * 0.42]]);
      callout(ctx, "point", [add(toOff, scene.toScreen(TAU * wp[0], TAU * wp[1])), add(sqOff, SQ(wp))]);
      callout(ctx, "phi", [[phiAt[0], phiAt[1] - 6]]);
      callout(ctx, "square", [add(sqOff, [sqGeom.x0 + sqGeom.S + 2, sqGeom.y0 - sqGeom.S * 0.5])]);
      callout(ctx, "axes", [add(sqOff, [state.axisLabel[0], state.axisLabel[1] + 10])]);
      callout(ctx, "out", [add(outOff, state.ghost)]);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Frame ---------- */
  const LOOP_S = 6;   // seconds to trace a loop once
  function buildState(now) {
    const t = ((now - stepT0) / 1000 / LOOP_S) % 1;
    const ts = (now - stepT0) / 1000;
    const st = { t, curves: [], points: [] };

    // A pair of votes the reader can drag (step 1)
    st.wanderAt = manual || [0.6, 0.15];
    if (vis.wander > 0.02) st.points.push({ at: st.wanderAt, color: C.hi, alpha: vis.wander });

    st.curves.push({ fn: LOOPS.a, color: C.a, alpha: vis.a, label: { text: "α", at: [0.25, 0.08] } });
    st.curves.push({ fn: LOOPS.b, color: C.b, alpha: vis.b, label: { text: "β", at: [0.08, 0.25] } });
    st.curves.push({ fn: LOOPS.d, color: C.hi, alpha: vis.d, label: { text: "δ", at: [0.62, 0.5] } });
    if (vis.move > 0.02) {
      ["a", "b", "d"].forEach((k) => st.points.push({ at: LOOPS[k](t), color: k === "a" ? C.a : k === "b" ? C.b : C.hi, alpha: vis.move * vis[k] }));
    }

    // Continuity: δ slides into α then β and back
    if (vis.slide > 0.02) {
      const cyc = ts % 7;
      const sig = cyc < 1 ? 0 : cyc < 3.5 ? smooth((cyc - 1) / 2.5) : cyc < 4.5 ? 1 : smooth(1 - (cyc - 4.5) / 2.5);
      const f = slide(sig);
      st.curves.push({ fn: f, color: C.hi, alpha: vis.slide, w: 3.5 });
      st.points.push({ at: f(t), color: C.hi, alpha: vis.slide });
    }
    return st;
  }

  /* ---------- Step 1: drag the pair of votes on the square or the torus ---------- */
  let manual = null, drag = null;
  const wrap01 = (x) => ((x % 1) + 1) % 1;
  function local(cv, e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function fromSquare(e) {
    const [x, y] = local(sqCv, e);
    return [clamp((x - sqGeom.x0) / sqGeom.S, 0, 1), clamp((sqGeom.y0 - y) / sqGeom.S, 0, 1)];
  }
  function fromTorus(e, maxDist) {
    const [x, y] = local(torusCv, e);
    const uv = scene.pick(x, y, maxDist);
    return uv ? [wrap01(uv[0] / TAU), wrap01(uv[1] / TAU)] : null;
  }
  sqCv.addEventListener("pointerdown", (e) => {
    if (step !== 0 || e.button !== 0) return;
    const [x, y] = local(sqCv, e), g = sqGeom;
    if (x < g.x0 - 20 || x > g.x0 + g.S + 20 || y < g.y0 - g.S - 20 || y > g.y0 + 20) return;
    drag = { id: e.pointerId, on: "square" };
    try { sqCv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    manual = fromSquare(e);
  });
  torusCv.addEventListener("pointerdown", (e) => {
    if (step !== 0 || e.button !== 0) return;
    const p = fromTorus(e, 18);
    if (!p) return;
    drag = { id: e.pointerId, on: "torus" };
    try { torusCv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    manual = p;
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = drag.on === "square" ? fromSquare(e) : fromTorus(e, 40);
    if (p) manual = p;
  });
  const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  let running = false, lastNow = 0;
  function frame(now) {
    if (!running) return;
    const target = STEPS[step];
    KEYS.forEach((k) => (vis[k] += ((target[k] || 0) - vis[k]) * 0.12));
    fig.classList.toggle("show-notes", step === 0);
    const st = buildState(now);
    torusState = st;
    scene.renderAt(now / 1000);
    // Step 1: start the point somewhere visible on the front of the torus
    if (step === 0 && !manual && !drag) {
      const r = torusCv.getBoundingClientRect();
      for (const [fx, fy] of [[0.5, 0.74], [0.3, 0.6], [0.7, 0.6]]) {
        const uv = scene.pick(fx * r.width, fy * r.height, 24);
        if (uv) { manual = [wrap01(uv[0] / TAU), wrap01(uv[1] / TAU)]; break; }
      }
    }
    // …and let it drift when nobody is holding it. It wraps around the edges,
    // since opposite edges of the square are the same place on the torus.
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    if (step === 0 && manual && !drag) {
      const ts = now / 1000;
      const dir = 0.7 + 1.3 * Math.sin(ts * 0.21) + 0.8 * Math.sin(ts * 0.13 + 2);
      manual = [wrap01(manual[0] + 0.035 * Math.cos(dir) * dt), wrap01(manual[1] + 0.035 * Math.sin(dir) * dt)];
    }
    drawSquare(st);
    drawOut(st);
    layoutNotes();
    drawOverlay(st);
    requestAnimationFrame(frame);
  }

  Stepper(root, (i) => {
    step = i;
    manual = null;
    sqCv.classList.toggle("is-draggable", i === 0);
    torusCv.classList.toggle("is-draggable", i === 0);
    scene.setSpin(i === 0 ? 0 : 0.05);   // hold the torus still on step 1
    stepT0 = performance.now();
    renderLedger();
  });

  window.addEventListener("resize", () => scene.resize());
  window.addEventListener("pagechange", (e) => {
    if (e.detail.id === page.id) {
      scene.resize();
      if (!running) { running = true; requestAnimationFrame(frame); }
    } else running = false;
  });
})();
