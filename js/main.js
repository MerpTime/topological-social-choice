/* Navigation: builds the right-hand menu from the <section class="page">
   elements in index.html, and switches between them with #/hash URLs. */
(function () {
  "use strict";

  const stage = document.getElementById("stage");
  const pages = Array.from(document.querySelectorAll(".page"));
  const list = document.getElementById("menu-list");
  const menu = document.getElementById("menu");
  const toggle = document.querySelector(".menu-toggle");
  const siteTitle = document.title;
  const pad = (n) => String(n).padStart(2, "0");
  const labelOf = (p) => p.dataset.tab || p.id;

  /* ---- Build menu, section numbers, and prev/next links ---- */
  const links = pages.map((p, i) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "menu__item";
    a.href = "#/" + p.id;
    a.innerHTML = '<span class="menu__num"></span><span class="menu__label"></span>';
    a.querySelector(".menu__num").textContent = pad(i);
    a.querySelector(".menu__label").textContent = labelOf(p);
    li.appendChild(a);
    list.appendChild(li);

    const num = p.querySelector(".page__num");
    if (num) num.textContent = pad(i);

    const inner = p.querySelector(".page__inner");
    if (inner) {
      const nav = document.createElement("nav");
      nav.className = "page__nav";
      nav.setAttribute("aria-label", "Section navigation");
      if (i > 0) nav.appendChild(navLink(pages[i - 1], "Previous", "prev"));
      if (i < pages.length - 1) nav.appendChild(navLink(pages[i + 1], "Next", "next"));
      inner.appendChild(nav);
    }
    return a;
  });

  function navLink(target, kind, cls) {
    const a = document.createElement("a");
    a.className = cls;
    a.href = "#/" + target.id;
    const small = document.createElement("small");
    small.textContent = kind;
    const span = document.createElement("span");
    span.textContent = (cls === "prev" ? "← " : "") + labelOf(target) + (cls === "next" ? " →" : "");
    a.append(small, span);
    return a;
  }

  /* ---- Routing ---- */
  function indexFromHash() {
    const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const i = pages.findIndex((p) => p.id === id);
    return i < 0 ? 0 : i;
  }

  let current = -1;
  function show(i) {
    if (i === current) return;
    current = i;
    pages.forEach((p, k) => p.classList.toggle("is-active", k === i));
    links.forEach((a, k) => (k === i ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    stage.scrollTop = 0;
    document.title = i === 0 ? siteTitle : labelOf(pages[i]) + " · " + siteTitle;
    setMenu(false);
    window.dispatchEvent(new CustomEvent("pagechange", { detail: { id: pages[i].id, index: i } }));
  }

  function go(i) {
    i = Math.max(0, Math.min(pages.length - 1, i));
    location.hash = "#/" + pages[i].id;
  }

  window.addEventListener("hashchange", () => show(indexFromHash()));

  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(current + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(current - 1); }
    else if (e.key === "Escape") setMenu(false);
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goto]");
    if (!btn) return;
    const to = btn.dataset.goto;
    go(to === "next" ? current + 1 : to === "prev" ? current - 1 : pages.findIndex((p) => p.id === to));
  });

  /* ---- Mobile menu ---- */
  function setMenu(open) {
    menu.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close sections menu" : "Open sections menu");
  }
  toggle.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));

  show(indexFromHash());
})();
