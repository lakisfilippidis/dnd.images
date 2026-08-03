// Toggle-filter chips for typed list items (see type-filter.njk).
// Each .type-filter toolbar filters the .home-section-item[data-type] links
// inside its own section (or the whole page on list pages). No selection
// means no filtering: all items stay visible.
document.querySelectorAll(".type-filter").forEach((toolbar) => {
  const scope = toolbar.closest("section") ?? document;
  const items = scope.querySelectorAll(".home-section-item[data-type]");
  const status = scope === document ? document.getElementById("status") : null;
  const statusTemplate = status ? status.textContent : null;

  toolbar.addEventListener("click", (e) => {
    const chip = e.target.closest("button[data-type]");
    if (!chip) return;
    chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");

    const active = {};
    let anySelected = false;
    toolbar.querySelectorAll("button[data-type]").forEach((b) => {
      active[b.dataset.type] = b.getAttribute("aria-pressed") === "true";
      if (active[b.dataset.type]) anySelected = true;
    });

    let visible = 0;
    items.forEach((item) => {
      if (!anySelected || active[item.dataset.type]) {
        item.removeAttribute("hidden");
        visible++;
      } else {
        item.setAttribute("hidden", "");
      }
    });

    if (status) {
      status.textContent = statusTemplate.replace(/\d+/, String(visible));
      status.classList.toggle("error", visible === 0);
    }
  });
});
