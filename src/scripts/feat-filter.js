// Фильтр карточек черт (см. шорткод featList в eleventy.config.js).
// Три оси — группа, сфера влияния, доступность. Внутри оси выбор работает как
// ИЛИ, между осями — И: «Клинок или Шпага» и при этом «Бой». Пустая ось не
// фильтрует. Страница класса приходит с уже нажатым чипом своего класса,
// поэтому фильтр применяется сразу, а не только по клику.
const AXES = ["group", "sphere", "classes"];

document.querySelectorAll(".feat-filter").forEach((toolbar) => {
  const scope = toolbar.parentElement ?? document;
  const cards = scope.querySelectorAll(".feat-card[data-group]");
  if (cards.length === 0) return;

  function apply() {
    const selected = {};
    for (const axis of AXES) {
      const on = [...toolbar.querySelectorAll(`[data-axis="${axis}"][aria-pressed="true"]`)];
      selected[axis] = on.map((b) => b.dataset.value);
    }
    for (const card of cards) {
      const fits = AXES.every((axis) => {
        if (selected[axis].length === 0) return true;
        const value = card.dataset[axis === "classes" ? "classes" : axis] ?? "";
        const own = value.split(" ").filter(Boolean);
        // Черта без класса общая: её показывает и чип «Общие», и чип класса —
        // общие черты доступны всем, значит и тому классу, что выбран.
        if (axis === "classes" && own.includes("all")) return true;
        return own.some((v) => selected[axis].includes(v));
      });
      card.toggleAttribute("hidden", !fits);
    }
  }

  toolbar.addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-axis]");
    if (!chip) return;
    chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
    apply();
  });

  apply();
});
