/* Title screen: a circle of preferences (S¹) with voters drifting around it.
   The yellow arrow is their average direction; watch it lurch when the voters
   spread out and their preferences nearly cancel. */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Split the title into letters for the "Write" animation ---- */
  const title = document.getElementById("main-title");
  if (title) {
    const text = title.textContent.trim();
    title.textContent = "";
    title.setAttribute("aria-label", text);
    let i = 0;
    text.split(" ").forEach((word, wi, words) => {
      const w = document.createElement("span");
      w.className = "word";
      w.setAttribute("aria-hidden", "true");
      for (const c of word) {
        const s = document.createElement("span");
        s.className = "ch";
        s.textContent = c;
        s.style.setProperty("--i", i++);
        w.appendChild(s);
      }
      title.appendChild(w);
      if (wi < words.length - 1) title.appendChild(document.createTextNode(" "));
    });
  }

  /* ---- Canvas scene ---- */
  const page = document.getElementById("title");
  const canvas = document.getElementById("title-canvas");
  if (!page || !canvas) return;
  const ctx = canvas.getContext("2d");
  const block = page.querySelector(".title-block");
  const beginWrap = page.querySelector(".begin-wrap");

  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const C = {
    accent: token("--accent"),
    highlight: token("--highlight"),
    text: token("--text"),
    voters: ["--blue", "--teal", "--green", "--red", "--purple"].map(token),
  };
  C.voters[0] = token("--maroon"); // keep the circle's blue distinct from the first voter

  // Timeline (seconds)
  const T = {
    grid:   [0.1, 1.6],
    circle: [0.5, 2.1],
    voters: [1.8, 2.5],   // start, duration of each voter's pop-in
    result: [3.0, 3.9],
    drift:  3.2,
  };

  const voters = C.voters.map((color, k) => ({
    color,
    base: (k / C.voters.length) * Math.PI * 2 + 0.4 + (Math.random() - 0.5) * 0.9,
    speed: (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.22),
    wobble: 0.35 + Math.random() * 0.5,
    freq: 0.15 + Math.random() * 0.25,
    phase: Math.random() * Math.PI * 2,
  }));

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const smooth = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const pop = (x) => { // ease-out with a little overshoot
    const c1 = 1.70158, c3 = c1 + 1;
    return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  let W = 0, H = 0, cx = 0, cy = 0, R = 100;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const top = block ? block.getBoundingClientRect().bottom - rect.top : H * 0.35;
    const bottom = beginWrap ? beginWrap.getBoundingClientRect().top - rect.top : H * 0.9;
    const room = Math.max(bottom - top, 160);
    R = clamp(room / 2 - 44, 60, Math.min(230, W * 0.34));
    cx = W / 2;
    cy = top + room / 2;
  }

  function angleOf(v, t) {
    const d = Math.max(0, t - T.drift);
    return v.base + v.speed * d + v.wobble * Math.sin(v.freq * d + v.phase) - v.wobble * Math.sin(v.phase);
  }

  function arrow(x0, y0, x1, y1, color, width, head) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;
    const h = Math.min(head, len * 0.6);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * h - uy * h * 0.5, y1 - uy * h + ux * h * 0.5);
    ctx.lineTo(x1 - ux * h + uy * h * 0.5, y1 - uy * h - ux * h * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    /* Background coordinate grid, growing out from the centre */
    const g = smooth(prog(t, ...T.grid));
    if (g > 0) {
      const step = R / 2;
      const spanX = (W / 2 + step) * g, spanY = (H / 2 + step) * g;
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.accent;
      for (let k = -Math.ceil(W / step); k <= Math.ceil(W / step); k++) {
        const x = cx + k * step;
        ctx.globalAlpha = (k === 0 ? 0.22 : 0.07) * g;
        ctx.beginPath(); ctx.moveTo(x, cy - spanY); ctx.lineTo(x, cy + spanY); ctx.stroke();
      }
      for (let k = -Math.ceil(H / step); k <= Math.ceil(H / step); k++) {
        const y = cy + k * step;
        ctx.globalAlpha = (k === 0 ? 0.22 : 0.07) * g;
        ctx.beginPath(); ctx.moveTo(cx - spanX, y); ctx.lineTo(cx + spanX, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* The circle S¹, drawn in like Manim's Create */
    const c = smooth(prog(t, ...T.circle));
    if (c > 0) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c);
      ctx.stroke();

      // Label S¹
      ctx.globalAlpha = c;
      ctx.fillStyle = C.accent;
      const lx = cx + R * Math.cos(-Math.PI / 4) + 18, ly = cy + R * Math.sin(-Math.PI / 4) - 10;
      ctx.font = "italic 26px KaTeX_Math, Georgia, serif";
      ctx.fillText("S", lx, ly);
      ctx.font = "17px KaTeX_Main, Georgia, serif";
      ctx.fillText("1", lx + 16, ly - 11);
      ctx.globalAlpha = 1;
    }

    /* Voters */
    let sx = 0, sy = 0;
    voters.forEach((v, k) => {
      const a = angleOf(v, t);
      sx += Math.cos(a); sy += Math.sin(a);
      const start = T.voters[0] + k * 0.14;
      const p = prog(t, start, start + (T.voters[1] - T.voters[0]));
      if (p <= 0) return;
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);

      ctx.globalAlpha = 0.32 * smooth(p);
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (x - cx) * smooth(p), cy + (y - cy) * smooth(p));
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(x, y, 7.5 * pop(p), 0, Math.PI * 2);
      ctx.fill();
    });

    /* The "average" preference: mean of the unit vectors */
    const r = smooth(prog(t, ...T.result));
    if (r > 0) {
      const mx = sx / voters.length, my = sy / voters.length;
      const dir = Math.atan2(my, mx);
      const px = cx + R * Math.cos(dir), py = cy + R * Math.sin(dir);
      const tipX = cx + R * mx * r, tipY = cy + R * my * r;

      ctx.globalAlpha = 0.45 * r;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = C.highlight;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = r;

      arrow(cx, cy, tipX, tipY, C.highlight, 3.5, 14);

      ctx.save();
      ctx.shadowColor = C.highlight;
      ctx.shadowBlur = 18;
      ctx.fillStyle = C.highlight;
      ctx.beginPath(); ctx.arc(px, py, 9 * pop(r), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* Origin */
    if (g > 0) {
      ctx.fillStyle = C.text;
      ctx.globalAlpha = g;
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---- Loop (only runs while the title page is visible) ---- */
  const t0 = performance.now();
  let running = false;

  function frame(now) {
    if (!running) return;
    draw((now - t0) / 1000);
    requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    layout();
    if (reduceMotion) { draw(T.drift); return; }
    running = true;
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  window.addEventListener("resize", () => { layout(); if (reduceMotion) draw(T.drift); });
  window.addEventListener("pagechange", (e) => (e.detail.id === "title" ? start() : stop()));

  // Re-measure once the web fonts have arrived (title height changes)
  if (document.fonts) {
    document.fonts.load('italic 26px "KaTeX_Math"').catch(() => {});
    document.fonts.ready.then(() => { layout(); if (reduceMotion && page.classList.contains("is-active")) draw(T.drift); });
  }
})();
