/* Title screen: "Write" animation for the title, plus a spinning torus
   with a point winding around it (see torus.js). */
(function () {
  "use strict";

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

  /* ---- Torus ---- */
  const page = document.getElementById("title");
  const canvas = document.getElementById("title-canvas");
  if (!page || !canvas || !window.TorusScene) return;
  const block = page.querySelector(".title-block");
  const beginWrap = page.querySelector(".begin-wrap");

  const scene = TorusScene(canvas, {
    p: 2, q: 3,          // winds twice around the hole, three times around the tube
    grid: true,
    startDelay: 0.3,
    frame(W, H) {
      const rect = canvas.getBoundingClientRect();
      const top = block ? block.getBoundingClientRect().bottom - rect.top : H * 0.3;
      const bottom = beginWrap ? beginWrap.getBoundingClientRect().top - rect.top : H * 0.9;
      const room = Math.max(bottom - top, 160);
      // Torus at this tilt is roughly 0.62× as tall as it is wide
      const size = Math.max(70, Math.min(W * 0.4, (room / 2 - 30) / 0.62, 340));
      return { cx: W / 2, cy: top + room / 2, size, maxHalfHeight: room / 2 - 24 };
    },
  });

  window.addEventListener("resize", () => scene.resize());
  window.addEventListener("pagechange", (e) => (e.detail.id === "title" ? scene.start() : scene.stop()));
  if (document.fonts) document.fonts.ready.then(() => scene.resize());
})();
