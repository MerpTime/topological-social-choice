/* "How to Represent a Vote"
   Step 1  one axis: military spending
   Step 2  second axis: research spending (the plane of budgets)
   Step 3  third axis: personal utility, as a surface over the plane
   Step 4  pick a budget → gradient there → its direction as a point on S¹
*/
(function () {
  "use strict";

  const root = document.getElementById("rep");
  if (!root || !window.Stepper) return;
  const page = root.closest(".page");
  const canvas = document.getElementById("rep-canvas");
  const ctx = canvas.getContext("2d");
  const s1Panel = document.getElementById("rep-s1");
  const s1Canvas = document.getElementById("rep-s1-canvas");
  const s1ctx = s1Canvas.getContext("2d");
  const thetaEl = document.getElementById("rep-theta");
  const descEl = document.getElementById("rep-desc");

  /* ---------- Design tokens ---------- */
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const rgb = (hex) => { const n = parseInt(hex.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const C = {
    text: tok("--text"), muted: tok("--text-muted"), faint: tok("--text-faint"),
    accent: tok("--accent"), hi: tok("--highlight"),
    mil: tok("--gold"), res: tok("--green"),
    s1: rgb(tok("--surface-1")), s2: rgb(tok("--surface-2")),
  };
  const SERIF = '"KaTeX_Main", Georgia, serif';

  /* ---------- Axis content (edit freely) ---------- */
  const AXES = {
    x: { title: "Military spending ($ billions)", max: 1000, ticks: [200, 400, 600, 800, 1000] },
    y: { title: "Research spending ($ billions)", max: 500, ticks: [100, 200, 300, 400, 500] },
    z: { title: "Personal utility" },
  };

  /* ---------- The voter's utility over (military, research), both scaled to [0,1] ----------
     Locally non-satiated, as Chichilnisky requires: ∇u is never zero.
     u = a·ln(1 + KX·x) + b·ln(1 + KY·y) has diminishing returns in each issue, and
     ∂u/∂x ≥ a·KX/(1+KX) > 0, ∂u/∂y ≥ b·KY/(1+KY) > 0 everywhere. The gradient's
     direction still changes from budget to budget (roughly 12° to 70°). */
  const KX = 3, KY = 2;
  const UMAX = Math.log(1 + KX) + Math.log(1 + KY);
  function utility(x, y) {
    return (Math.log(1 + KX * x) + Math.log(1 + KY * y)) / UMAX;
  }
  function gradient(x, y) {
    const h = 1e-4;
    return [
      (utility(x + h, y) - utility(x - h, y)) / (2 * h),
      (utility(x, y + h) - utility(x, y - h)) / (2 * h),
    ];
  }
  const HZ = 0.45; // world height of utility = 1

  /* ---------- Contour lines (marching squares, computed once) ---------- */
  const CONTOURS = (() => {
    const N = 60, levels = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], segs = [];
    const U = [];
    for (let i = 0; i <= N; i++) { U.push([]); for (let j = 0; j <= N; j++) U[i].push(utility(i / N, j / N)); }
    for (const L of levels) {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
          const pts = [];
          for (let e = 0; e < 4; e++) {
            const [a, b] = [c[e], c[(e + 1) % 4]];
            const va = U[a[0]][a[1]], vb = U[b[0]][b[1]];
            if ((va - L) * (vb - L) < 0) {
              const t = (L - va) / (vb - va);
              pts.push([(a[0] + (b[0] - a[0]) * t) / N, (a[1] + (b[1] - a[1]) * t) / N]);
            }
          }
          if (pts.length >= 2) segs.push([pts[0], pts[1], L]);
          if (pts.length === 4) segs.push([pts[2], pts[3], L]);
        }
      }
    }
    return segs;
  })();

  /* ---------- Per-step camera + visibility targets ---------- */
  // yaw/pitch in radians (pitch 0 = looking straight down), target point, zoom (× canvas height)
  const STEPS = [
    { yaw: 0,    pitch: 0,     tx: 0.5, ty: 0,   tz: 0,    zoom: 1.12, ax: 1, ay: 0, grid: 0, az: 0, surf: 0, cont: 0, pick: 0 },
    { yaw: 0,    pitch: 0,     tx: 0.5, ty: 0.5, tz: 0,    zoom: 0.74, ax: 1, ay: 1, grid: 1, az: 0, surf: 0, cont: 0, pick: 0 },
    { yaw: 0.42, pitch: -1.1,  tx: 0.5, ty: 0.5, tz: 0.1, zoom: 0.8, ax: 1, ay: 1, grid: 1, az: 1, surf: 1, cont: 0, pick: 0 },
    { yaw: 0.42, pitch: -0.95, tx: 0.5, ty: 0.5, tz: 0.1, zoom: 0.8, ax: 1, ay: 1, grid: 1, az: 1, surf: 1, cont: 1, pick: 1 },
  ];
  const KEYS = Object.keys(STEPS[0]);
  const state = Object.assign({ oy: 0, op: 0 }, STEPS[0], { ax: 0 });
  let from = null, to = Object.assign({ oy: 0, op: 0 }, STEPS[0]), animStart = 0;
  const DUR = 1400;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  let sel = { x: 0.3, y: 0.3 };

  /* ---------- Projection ---------- */
  let W = 0, H = 0, S = 100;
  const D = 4;
  function view(p) {
    const x = p[0] - state.tx, y = p[1] - state.ty, z = p[2] - state.tz;
    const yaw = state.yaw + state.oy, pitch = state.pitch + state.op;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    const ca = Math.cos(pitch), sa = Math.sin(pitch);
    return [x1, y1 * ca - z * sa, y1 * sa + z * ca];
  }
  function P(p) {
    const v = view(p), k = D / (D - v[2]);
    return [W / 2 + v[0] * k * S, H / 2 - v[1] * k * S, v[2]];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const s = s1Canvas.getBoundingClientRect();
    if (s.width) {
      s1Canvas.width = Math.round(s.width * dpr); s1Canvas.height = Math.round(s.height * dpr);
      s1ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /* ---------- Drawing helpers ---------- */
  function line(a, b, color, width, alpha, dash) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.setLineDash([]);
  }
  function arrowHead(a, b, color, size, alpha) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(b[0] + ux * size * 0.35, b[1] + uy * size * 0.35);
    ctx.lineTo(b[0] - ux * size * 0.65 - uy * size * 0.45, b[1] - uy * size * 0.65 + ux * size * 0.45);
    ctx.lineTo(b[0] - ux * size * 0.65 + uy * size * 0.45, b[1] - uy * size * 0.65 - ux * size * 0.45);
    ctx.closePath(); ctx.fill();
  }
  // Text placed beside the screen segment a→b, offset along its left normal (negative = right side)
  function sideText(a, b, text, off, opts) {
    const o = Object.assign({ rotate: false, size: 15, color: C.muted, alpha: 1, italic: false }, opts);
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const nx = Math.sin(ang), ny = -Math.cos(ang);
    const mx = (a[0] + b[0]) / 2 + nx * off, my = (a[1] + b[1]) / 2 + ny * off;
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    ctx.save();
    ctx.globalAlpha = o.alpha;
    ctx.fillStyle = o.color;
    ctx.font = `${o.italic ? "italic " : ""}${o.size}px ${SERIF}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.translate(mx, my);
    if (o.rotate) ctx.rotate(ang);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawAxis(dir, prog, color, def) {
    if (prog <= 0) return;
    const L = 1.08 * (dir === "z" ? HZ : 1);
    const end = (t) => (dir === "x" ? [t, 0, 0] : dir === "y" ? [0, t, 0] : [0, 0, t]);
    const o = P([0, 0, 0]), e = P(end(L * prog));
    line(o, e, C.text, 2, 0.85);
    arrowHead(P(end(L * prog * 0.97)), e, C.text, 12, 0.85 * Math.min(1, prog * 3));

    // Ticks + labels
    if (def.ticks) {
      const span = def.max;
      def.ticks.forEach((v) => {
        const t = v / span;
        const a = clamp((prog * L - t) / 0.08, 0, 1);
        if (a <= 0) return;
        const perp = dir === "x" ? [0, 0.014, 0] : [0.014, 0, 0];
        const p = end(t);
        const q0 = P([p[0] - perp[0], p[1] - perp[1], 0]), q1 = P([p[0] + perp[0], p[1] + perp[1], 0]);
        line(q0, q1, C.text, 1.5, 0.7 * a);
        const near = P(end(t - 0.0001));
        // label on the outside of the plane
        sideText(near, P(end(t)), String(v), dir === "x" ? -18 : 22, { size: 13, color: C.faint, alpha: a });
      });
    }
    // Title (outside of the plane, rotated along the axis; the vertical axis gets it above the tip)
    const ta = clamp((prog - 0.6) / 0.4, 0, 1);
    if (ta > 0 && dir === "z") {
      ctx.save();
      ctx.globalAlpha = ta; ctx.fillStyle = color;
      ctx.font = `16px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(12, 13, 15, 0.85)";
      ctx.strokeText(def.title, e[0], e[1] - 14);
      ctx.fillText(def.title, e[0], e[1] - 14);
      ctx.restore();
    } else if (ta > 0) {
      const half = P(end(L * 0.25)), threeq = P(end(L * 0.75));
      const off = dir === "x" ? -44 : 50;
      sideText(half, threeq, def.title, off, { rotate: true, size: 16, color, alpha: ta });
    }
  }

  /* ---------- Main draw ---------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // Narrow screens need more room around the plot for axis labels
    S = state.zoom * Math.min(H, W / (W < 600 ? 2 : 1.5));

    // Floor grid
    if (state.grid > 0.001) {
      for (let k = 1; k <= 10; k++) {
        const t = k / 10;
        line(P([t, 0, 0]), P([t, 1, 0]), C.accent, 1, 0.13 * state.grid);
        line(P([0, t, 0]), P([1, t, 0]), C.accent, 1, 0.13 * state.grid);
      }
    }

    // Contours on the floor
    if (state.cont > 0.001) {
      for (const [a, b, L] of CONTOURS) {
        line(P([a[0], a[1], 0]), P([b[0], b[1], 0]), C.accent, 1.3, (0.25 + 0.6 * L) * state.cont);
      }
    }

    drawAxis("x", state.ax, C.mil, AXES.x);
    drawAxis("y", state.ay, C.res, AXES.y);

    // Utility surface (painter's algorithm)
    if (state.surf > 0.001) {
      const N = 34, quads = [];
      const pts = [];
      for (let i = 0; i <= N; i++) {
        pts.push([]);
        for (let j = 0; j <= N; j++) {
          const x = i / N, y = j / N;
          pts[i].push(P([x, y, utility(x, y) * HZ * state.surf]));
        }
      }
      const light = [-0.4, 0.55, 0.73];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const x = (i + 0.5) / N, y = (j + 0.5) / N;
          const g = gradient(x, y);
          // world normal → view normal (rotation only)
          let n = [-g[0] * HZ * state.surf, -g[1] * HZ * state.surf, 1];
          const nl = Math.hypot(...n); n = n.map((v) => v / nl);
          const o = view([state.tx, state.ty, state.tz]);
          const vn = view([state.tx + n[0], state.ty + n[1], state.tz + n[2]]).map((v, k) => v - o[k]);
          const lit = Math.max(0, vn[0] * light[0] + vn[1] * light[1] + vn[2] * light[2]);
          const a = pts[i][j], b = pts[i + 1][j], c = pts[i + 1][j + 1], d = pts[i][j + 1];
          quads.push({ a, b, c, d, depth: (a[2] + b[2] + c[2] + d[2]) / 4, lit, check: (i + j) & 1 });
        }
      }
      quads.sort((p, q) => p.depth - q.depth);
      const alpha = (0.93 - 0.4 * state.pick) * Math.min(1, state.surf * 2);
      for (const q of quads) {
        const base = q.check ? C.s1 : C.s2, k = 0.35 + 0.8 * q.lit;
        const col = `rgb(${Math.min(255, base[0] * k) | 0},${Math.min(255, base[1] * k) | 0},${Math.min(255, base[2] * k) | 0})`;
        ctx.beginPath();
        ctx.moveTo(q.a[0], q.a[1]); ctx.lineTo(q.b[0], q.b[1]); ctx.lineTo(q.c[0], q.c[1]); ctx.lineTo(q.d[0], q.d[1]);
        ctx.closePath();
        ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = alpha * 0.5; ctx.strokeStyle = col; ctx.lineWidth = 0.7; ctx.stroke();
      }
    }

    drawAxis("z", state.az, C.text, AXES.z);

    // Picked point + gradient
    if (state.pick > 0.001) {
      const u = utility(sel.x, sel.y);
      const top = P([sel.x, sel.y, u * HZ * state.surf]), floor = P([sel.x, sel.y, 0]);
      line(top, floor, C.hi, 1.5, 0.7 * state.pick, [4, 5]);

      const g = gradient(sel.x, sel.y), gl = Math.hypot(g[0], g[1]);
      if (gl > 0.05) {
        const L = 0.17, tip = [sel.x + (g[0] / gl) * L, sel.y + (g[1] / gl) * L, 0];
        const T = P(tip), T0 = P([sel.x + (g[0] / gl) * L * 0.92, sel.y + (g[1] / gl) * L * 0.92, 0]);
        line(floor, T0, C.hi, 3.5, state.pick);
        arrowHead(T0, T, C.hi, 15, state.pick);
        ctx.globalAlpha = state.pick;
        ctx.fillStyle = C.hi;
        ctx.font = `italic 17px ${SERIF}`;
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText("∇u", T[0] + 10, T[1] - 4);
      }
      ctx.globalAlpha = state.pick;
      ctx.fillStyle = C.hi;
      ctx.beginPath(); ctx.arc(floor[0], floor[1], 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.shadowColor = C.hi; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(top[0], top[1], 7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- S¹ panel ---------- */
  function describe(th) {
    const c = Math.cos(th), s = Math.sin(th);
    const m = c > 0 ? "more" : "less", r = s > 0 ? "more" : "less";
    const ac = Math.abs(c), as = Math.abs(s);
    if (as < 0.2) return `This voter mainly wants ${m} military spending.`;
    if (ac < 0.2) return `This voter mainly wants ${r} research spending.`;
    if (ac > as * 1.4) return `This voter wants ${m} military spending most, and ${r} research spending to a lesser degree.`;
    if (as > ac * 1.4) return `This voter wants ${r} research spending most, and ${m} military spending to a lesser degree.`;
    return `This voter wants ${m} military and ${r} research spending, about equally.`;
  }
  let lastS1 = "";
  function drawS1() {
    const r = s1Canvas.getBoundingClientRect();
    const w = r.width, h = r.height;
    if (!w) return;
    const g = gradient(sel.x, sel.y), gl = Math.hypot(g[0], g[1]);
    const key = `${w}|${sel.x.toFixed(4)}|${sel.y.toFixed(4)}`;
    if (key === lastS1) return;
    lastS1 = key;

    const c = s1ctx, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32;
    c.clearRect(0, 0, w, h);
    c.lineCap = "round";
    // axes
    c.strokeStyle = C.faint; c.lineWidth = 1; c.globalAlpha = 0.8;
    c.beginPath(); c.moveTo(cx - R * 1.35, cy); c.lineTo(cx + R * 1.35, cy); c.moveTo(cx, cy + R * 1.35); c.lineTo(cx, cy - R * 1.35); c.stroke();
    c.globalAlpha = 1;
    c.font = `13px ${SERIF}`;
    c.textBaseline = "middle";
    c.fillStyle = C.mil; c.textAlign = "left"; c.fillText("military", cx + R * 1.38 - 46, cy + 14);
    c.fillStyle = C.res; c.textAlign = "left"; c.fillText("research", cx + 6, cy - R * 1.38 + 4);
    // circle
    c.strokeStyle = C.accent; c.lineWidth = 2.5;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.fillStyle = C.accent; c.font = `italic 18px ${SERIF}`; c.textAlign = "left";
    c.fillText("S", cx + R * 0.74 + 8, cy + R * 0.74 + 10);
    c.font = `12px ${SERIF}`; c.fillText("1", cx + R * 0.74 + 19, cy + R * 0.74 + 3);

    if (gl > 0.05) {
      const th = Math.atan2(g[1], g[0]);
      const px = cx + R * Math.cos(th), py = cy - R * Math.sin(th);
      c.strokeStyle = C.hi; c.fillStyle = C.hi; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + R * 0.82 * Math.cos(th), cy - R * 0.82 * Math.sin(th)); c.stroke();
      c.save(); c.shadowColor = C.hi; c.shadowBlur = 16;
      c.beginPath(); c.arc(px, py, 8, 0, Math.PI * 2); c.fill(); c.restore();
      let deg = Math.round((th * 180) / Math.PI); if (deg < 0) deg += 360;
      thetaEl.textContent = `θ = ${deg}°`;
      descEl.textContent = describe(th);
    }
    c.fillStyle = C.text; c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
  }

  /* ---------- Steps ---------- */
  const stepper = Stepper(root, (i) => {
    from = Object.assign({}, state);
    to = Object.assign({}, STEPS[i], { oy: 0, op: 0 });
    animStart = performance.now();
    s1Panel.hidden = i !== 3;
    canvas.classList.toggle("is-pickable", i === 3);
    lastS1 = "";
  });

  /* ---------- Pointer: left = pick (step 4), right = orbit (steps 3–4) ---------- */
  let orbit = null, picking = false;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  function pickAt(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const N = 70;
    let best = null, bestDepth = -Infinity, nearest = null, nd = Infinity;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = i / N, y = j / N;
        const p = P([x, y, utility(x, y) * HZ * state.surf]);
        const d = Math.hypot(p[0] - mx, p[1] - my);
        if (d < 10 && p[2] > bestDepth) { bestDepth = p[2]; best = { x, y }; }
        if (d < nd) { nd = d; nearest = { x, y }; }
      }
    }
    const pick = best || (nd < 40 ? nearest : null);
    if (pick) { sel = pick; }
  }

  canvas.addEventListener("pointerdown", (e) => {
    const step = stepper.index;
    if (e.button === 2 && step >= 2) {
      e.preventDefault();
      orbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else if (e.button === 0 && step === 3) {
      picking = e.pointerId;
      pickAt(e);
    } else return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (orbit && e.pointerId === orbit.id) {
      const dy = (e.clientX - orbit.x) * 0.008, dp = (e.clientY - orbit.y) * 0.008;
      orbit.x = e.clientX; orbit.y = e.clientY;
      state.oy -= dy; to.oy -= dy;
      const pitch = clamp(state.pitch + state.op + dp, -1.5, 0);
      const op = pitch - state.pitch;
      to.op += op - state.op; state.op = op;
    } else if (picking === e.pointerId) {
      pickAt(e);
    }
  });
  const end = (e) => {
    if (orbit && e.pointerId === orbit.id) orbit = null;
    if (picking === e.pointerId) picking = false;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  /* ---------- Loop ---------- */
  let running = false;
  function frame(now) {
    if (!running) return;
    if (from) {
      const e = smooth(clamp((now - animStart) / DUR, 0, 1));
      KEYS.concat(["oy", "op"]).forEach((k) => { state[k] = from[k] + (to[k] - from[k]) * e; });
      if (e >= 1) from = null;
    }
    draw();
    if (!s1Panel.hidden) drawS1();
    requestAnimationFrame(frame);
  }
  function start() {
    resize();
    if (running) return;
    running = true;
    // Animate the first axis in on arrival
    if (stepper.index === 0 && state.ax === 0) { from = Object.assign({}, state); to = Object.assign({}, STEPS[0], { oy: 0, op: 0 }); animStart = performance.now(); }
    requestAnimationFrame(frame);
  }

  window.addEventListener("pagechange", (e) => (e.detail.id === page.id ? start() : (running = false)));
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { resize(); lastS1 = ""; });
    ro.observe(canvas); ro.observe(s1Canvas);
  }
  window.addEventListener("resize", () => { resize(); lastS1 = ""; });
})();
