/* Stepper: sub-steps inside a section (tabs + captions + Back/Next).
   Markup:
     .stepper
       [data-step-tab]       one per step (buttons)
       [data-step-caption]   one per step
       [data-step-dir="-1"|"1"], .stepper__count
   The ← → keys walk through the steps first, then move on to the
   neighbouring section (see main.js).

   const s = Stepper(rootEl, (index, previous) => { ... });
*/
(function () {
  "use strict";
  window.pageSteppers = window.pageSteppers || {};

  window.Stepper = function (root, onChange) {
    const tabs = Array.from(root.querySelectorAll("[data-step-tab]"));
    const captions = Array.from(root.querySelectorAll("[data-step-caption]"));
    const count = root.querySelector(".stepper__count");
    const prevBtn = root.querySelector('[data-step-dir="-1"]');
    const nextBtn = root.querySelector('[data-step-dir="1"]');
    const hints = Array.from(root.querySelectorAll("[data-hint-steps]"));
    const n = tabs.length;
    let index = -1;

    function set(i) {
      i = Math.max(0, Math.min(n - 1, i));
      if (i === index) return;
      const previous = index;
      index = i;
      tabs.forEach((t, k) => {
        t.setAttribute("aria-selected", String(k === i));
        t.tabIndex = k === i ? 0 : -1;
      });
      captions.forEach((c, k) => c.classList.toggle("is-active", k === i));
      hints.forEach((h) => h.classList.toggle("is-active", h.dataset.hintSteps.split(",").map(Number).includes(i)));
      if (count) count.textContent = `${i + 1} / ${n}`;
      if (prevBtn) prevBtn.disabled = i === 0;
      if (nextBtn) nextBtn.disabled = i === n - 1;
      root.dataset.step = String(i);
      if (onChange) onChange(i, previous);
    }

    tabs.forEach((t, k) => t.addEventListener("click", () => set(k)));
    if (prevBtn) prevBtn.addEventListener("click", () => set(index - 1));
    if (nextBtn) nextBtn.addEventListener("click", () => set(index + 1));

    const page = root.closest(".page");
    const api = {
      get index() { return index; },
      set,
      next() { if (index < n - 1) { set(index + 1); return true; } return false; },
      prev() { if (index > 0) { set(index - 1); return true; } return false; },
    };
    if (page) window.pageSteppers[page.id] = api;

    set(0);
    return api;
  };
})();
