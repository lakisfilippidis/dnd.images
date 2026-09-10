// Фильтр и группировка карточек черт (см. шорткод featList в eleventy.config.js).
//
// Фильтр — три оси: группа, сфера влияния, доступность. Внутри оси выбор
// работает как ИЛИ, между осями — И: «Клинок или Шпага» и при этом «Бой».
// Пустая ось не фильтрует. Страница класса приходит с уже нажатым чипом своего
// класса, поэтому фильтр применяется сразу, а не только по клику.
//
// Группировка — четвёртый ряд, та же ось, но не сужает список, а раскладывает
// его по секциям с заголовками. Ось одна за раз (чипы ведут себя как радио),
// пустое значение возвращает плоский список. Группируются только карточки,
// прошедшие фильтр, поэтому пустых секций не бывает.
const AXES = ["group", "sphere", "classes"];

document.querySelectorAll(".feat-filter").forEach((toolbar) => {
  const scope = toolbar.parentElement ?? document;
  const container = scope.querySelector(".feat-cards--filtered");
  const cards = [...scope.querySelectorAll(".feat-card[data-group]")];
  if (cards.length === 0) return;

  // Порядок карточек из шаблона: он же порядок внутри секции и в плоском виде.
  const order = new Map(cards.map((card, i) => [card, i]));
  let titles = {};
  try {
    titles = JSON.parse(container?.dataset.titles ?? "{}");
  } catch {
    titles = {};
  }

  // Ось группировки для карточки. Класс у черты всегда один (общие идут как
  // "all"), так что карточка попадает ровно в одну корзину.
  function bucketOf(card, axis) {
    const value = card.dataset[axis] ?? "";
    return axis === "classes" ? (value.split(" ").filter(Boolean)[0] ?? "all") : value;
  }

  function titleOf(axis, id) {
    return titles[axis]?.[id] ?? id;
  }

  function visibleCards() {
    const selected = {};
    for (const axis of AXES) {
      const on = [...toolbar.querySelectorAll(`[data-axis="${axis}"][aria-pressed="true"]`)];
      selected[axis] = on.map((b) => b.dataset.value);
    }
    return cards.filter((card) =>
      AXES.every((axis) => {
        if (selected[axis].length === 0) return true;
        const own = (card.dataset[axis] ?? "").split(" ").filter(Boolean);
        // Черта без класса общая: её показывает и чип «Общие», и чип класса —
        // общие черты доступны всем, значит и тому классу, что выбран.
        if (axis === "classes" && own.includes("all")) return true;
        return own.some((v) => selected[axis].includes(v));
      })
    );
  }

  function currentGroupBy() {
    const on = toolbar.querySelector("[data-groupby][aria-pressed='true']");
    return on?.dataset.groupby ?? "";
  }

  function apply() {
    if (!container) return;
    const shown = new Set(visibleCards());
    for (const card of cards) card.toggleAttribute("hidden", !shown.has(card));

    // Секции пересобираются с нуля: карточки — те же узлы, они переезжают.
    container.querySelectorAll(".feat-group-section").forEach((section) => section.remove());
    const axis = currentGroupBy();
    const kept = cards.filter((card) => shown.has(card));

    if (axis === "") {
      container.classList.remove("feat-cards--grouped");
      // Обратно в плоский список — в исходном порядке шаблона.
      for (const card of [...cards].sort((a, b) => order.get(a) - order.get(b))) {
        container.append(card);
      }
      return;
    }

    container.classList.add("feat-cards--grouped");
    const buckets = new Map();
    for (const card of kept) {
      const id = bucketOf(card, axis);
      if (!buckets.has(id)) buckets.set(id, []);
      buckets.get(id).push(card);
    }
    // Порядок секций — по первой карточке, то есть по порядку из шаблона.
    const ids = [...buckets.keys()].sort(
      (a, b) => order.get(buckets.get(a)[0]) - order.get(buckets.get(b)[0])
    );
    for (const id of ids) {
      const section = document.createElement("section");
      section.className = "feat-group-section";
      const heading = document.createElement("h3");
      heading.className = "feat-group-title";
      heading.textContent = titleOf(axis, id);
      const count = document.createElement("span");
      count.className = "feat-group-count";
      count.textContent = buckets.get(id).length;
      heading.append(count);
      const grid = document.createElement("div");
      grid.className = "feat-group-cards";
      grid.append(...buckets.get(id));
      section.append(heading, grid);
      container.append(section);
    }
  }

  toolbar.addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-axis], button[data-groupby]");
    if (!chip) return;
    if (chip.dataset.groupby === undefined) {
      chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
    } else {
      // Радио: ось группировки одна, повторный клик по нажатому чипу не снимает
      // выбор, а «Без группировки» — обычный чип этого же ряда.
      for (const other of toolbar.querySelectorAll("[data-groupby]")) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
    }
    apply();
  });

  apply();
});
