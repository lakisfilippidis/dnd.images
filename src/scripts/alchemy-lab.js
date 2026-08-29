// Конструктор дозы: открывается кнопкой в диалоге; выбираешь ступень, основу,
// ингредиенты — и видишь, какие эффекты попадут в дозу и какой силы. Данные
// приходят из шорткода alchemyLab (eleventy.config.js) в атрибуте data-lab
// (JSON в base64 — markdown-типограф не трогает). Правила те же, что в
// Рецептуре: эффект попадает в дозу, если есть хотя бы у двух ингредиентов,
// сила — их число минус один (не больше трёх долей), эффекты выше ступени не
// попадают. На странице персонажа (options.known = "page") в выбор идут только
// травы из его карточек — список лежит в data-known-ingredients у ingredientPicks.

const CAPACITY = { apprentice: 2, journeyman: 3, master: 4, virtuoso: 5, legend: 7 };
const PROFICIENCY = { apprentice: 2, journeyman: 3, master: 4, virtuoso: 5, legend: 6 };
const MAX_STACKS = 3;

function dolesWord(n) {
  return n === 1 ? "доля" : "доли";
}

function initLab(root) {
  const bytes = Uint8Array.from(atob(root.dataset.lab), (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  const tierIndex = new Map(data.tiers.map((t, i) => [t.id, i]));
  const effectById = new Map(data.effects.map((e) => [e.id, e]));

  const options = data.options ?? {};
  const knownList = options.known === "page"
    ? (document.querySelector("[data-known-ingredients]")?.dataset.knownIngredients ?? "").split(",").filter(Boolean)
    : [];
  const known = new Set(knownList);

  const state = {
    tier: options.tier && CAPACITY[options.tier] ? options.tier : "apprentice",
    base: "blade",
    intMod: Number(options.int ?? 2) || 0,
    still: Number(options.still ?? 0) || 0,   // Перегонный куб — сколько полезных эффектов можно убрать
    retort: Number(options.retort ?? 0) || 0, // Реторта — сколько вредных
    onlyKnown: known.size > 0,
    selected: new Set(),
    removed: new Set(),
  };

  root.innerHTML = "";
  root.classList.add("alchemy-lab--ready");

  const head = document.createElement("div");
  head.className = "alchemy-lab-head";
  head.innerHTML = `<p class="alchemy-lab-title">Конструктор дозы</p><button type="button" class="alchemy-lab-close" aria-label="Закрыть">Закрыть</button>`;
  root.append(head);
  head.querySelector(".alchemy-lab-close").addEventListener("click", () => root.closest("dialog")?.close());

  const controls = document.createElement("div");
  controls.className = "alchemy-lab-controls";
  controls.innerHTML = `
    <label class="alchemy-lab-field">Ступень
      <select data-field="tier">${data.tiers.map((t) => `<option value="${t.id}">${t.title} — ${CAPACITY[t.id]} в дозе</option>`).join("")}</select>
    </label>
    <label class="alchemy-lab-field">Основа
      <select data-field="base">${data.bases.map((b) => `<option value="${b.id}">${b.name}${b.slots ? ` (−${b.slots})` : ""}</option>`).join("")}</select>
    </label>
    <label class="alchemy-lab-field">Модификатор Интеллекта
      <input type="number" data-field="intMod" value="2" min="-2" max="6" step="1">
    </label>
    <label class="alchemy-lab-field">Перегонный куб
      <input type="number" data-field="still" value="0" min="0" max="4" step="1" title="Сколько раз взят Отравитель: столько полезных эффектов можно убрать">
    </label>
    <label class="alchemy-lab-field">Реторта
      <input type="number" data-field="retort" value="0" min="0" max="4" step="1" title="Сколько раз взят Аптекарь: столько вредных эффектов можно убрать">
    </label>
    ${known.size ? `<label class="alchemy-lab-field alchemy-lab-field--check"><input type="checkbox" data-field="onlyKnown" checked> только известные травы</label>` : ""}
  `;
  controls.querySelector("[data-field=tier]").value = state.tier;
  controls.querySelector("[data-field=intMod]").value = state.intMod;
  controls.querySelector("[data-field=still]").value = state.still;
  controls.querySelector("[data-field=retort]").value = state.retort;
  root.append(controls);

  const picker = document.createElement("div");
  picker.className = "alchemy-lab-picker";
  root.append(picker);

  const result = document.createElement("div");
  result.className = "alchemy-lab-result";
  root.append(result);

  controls.addEventListener("change", (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    if (field === "tier" || field === "base") state[field] = event.target.value;
    else if (field === "onlyKnown") state.onlyKnown = event.target.checked;
    else state[field] = Number(event.target.value) || 0;
    trim();
    render();
  });

  picker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ingredient]");
    if (!button) return;
    const id = button.dataset.ingredient;
    if (state.selected.has(id)) state.selected.delete(id);
    else if (state.selected.size < capacity()) state.selected.add(id);
    render();
  });

  result.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const id = button.dataset.remove;
    if (state.removed.has(id)) state.removed.delete(id);
    else state.removed.add(id);
    render();
  });

  function baseSlots() {
    return data.bases.find((b) => b.id === state.base)?.slots ?? 0;
  }

  function capacity() {
    return Math.max(0, CAPACITY[state.tier] - baseSlots());
  }

  // Если ёмкость уменьшилась — лишние ингредиенты выпадают, последние первыми
  function trim() {
    const cap = capacity();
    const list = [...state.selected];
    while (list.length > cap) list.pop();
    state.selected = new Set(list);
  }

  function brew() {
    const count = new Map();
    for (const id of state.selected) {
      const ingredient = data.ingredients.find((i) => i.id === id);
      for (const e of ingredient.effects) count.set(e, (count.get(e) ?? 0) + 1);
    }
    const brewerTier = tierIndex.get(state.tier);
    const rows = [];
    for (const [effectId, n] of count) {
      if (n < 2) continue;
      const effect = effectById.get(effectId);
      rows.push({
        effect,
        count: n,
        stacks: Math.min(n - 1, MAX_STACKS),
        extra: effect.kind === "harm" && effect.id !== "damage" ? Math.max(0, n - 4) : 0,
        locked: tierIndex.get(effect.tier) > brewerTier,
      });
    }
    rows.sort((a, b) => (a.effect.kind === b.effect.kind ? b.count - a.count : a.effect.kind === "harm" ? -1 : 1));
    return rows;
  }

  function render() {
    const cap = capacity();
    const rows = brew();
    const activeIds = new Set(rows.filter((r) => !r.locked).map((r) => r.effect.id));
    for (const id of [...state.removed]) if (!activeIds.has(id)) state.removed.delete(id);

    picker.innerHTML = data.regions.map((region) => {
      const items = data.ingredients.filter((i) => i.region === region.id && (!state.onlyKnown || known.has(i.id)));
      if (items.length === 0) return "";
      return `<div class="alchemy-lab-region"><p class="alchemy-lab-region-title">${region.title}</p><div class="alchemy-lab-chips">${items.map((i) => {
        const on = state.selected.has(i.id);
        const disabled = !on && state.selected.size >= cap;
        const effects = i.effects.map((e) => {
          const effect = effectById.get(e);
          return `<span class="alchemy-lab-mini alchemy-lab-mini--${effect.kind}">${effect.kind === "harm" ? "−" : "+"}${effect.name}</span>`;
        }).join("");
        return `<button type="button" class="alchemy-lab-chip${on ? " is-on" : ""}" data-ingredient="${i.id}"${disabled ? " disabled" : ""}><span class="alchemy-lab-chip-name">${i.name}</span><span class="alchemy-lab-chip-effects">${effects}</span></button>`;
      }).join("")}</div></div>`;
    }).join("");

    const used = state.selected.size + baseSlots();
    const total = CAPACITY[state.tier];
    const dc = 8 + PROFICIENCY[state.tier] + state.intMod + (state.still > 0 ? 1 : 0);
    const stillUsed = rows.filter((r) => r.effect.kind === "boon" && state.removed.has(r.effect.id)).length;
    const retortUsed = rows.filter((r) => r.effect.kind === "harm" && state.removed.has(r.effect.id)).length;

    let body = "";
    if (state.selected.size < 2) {
      body = `<p class="alchemy-lab-empty">Выбери хотя бы два ингредиента.</p>`;
    } else if (rows.length === 0) {
      body = `<p class="alchemy-lab-empty">Общих эффектов нет — ингредиенты пропали.</p>`;
    } else {
      body = rows.map((r) => {
        const removed = state.removed.has(r.effect.id);
        const canRemove = !r.locked && (r.effect.kind === "boon"
          ? removed || stillUsed < state.still
          : removed || retortUsed < state.retort);
        const label = r.locked
          ? `не по ступени — с ${data.tiers[tierIndex.get(r.effect.tier)].title.replace(/ь$/, "я").replace(/к$/, "ка")}`
          : `${r.stacks} ${dolesWord(r.stacks)}${r.extra ? `, +${r.extra} к Сл` : ""}`;
        const save = r.effect.kind === "harm" && !r.locked ? ` · спасбросок ${r.effect.save}, Сл ${dc + r.extra}` : "";
        const text = r.locked ? "" : `<p class="alchemy-lab-effect-text">${r.effect.stacks[r.stacks - 1]}</p>`;
        const button = canRemove
          ? `<button type="button" class="alchemy-lab-remove" data-remove="${r.effect.id}">${removed ? "вернуть" : r.effect.kind === "boon" ? "убрать кубом" : "убрать ретортой"}</button>`
          : "";
        return `<div class="alchemy-lab-effect alchemy-lab-effect--${r.effect.kind}${removed ? " is-removed" : ""}${r.locked ? " is-locked" : ""}">
          <p class="alchemy-lab-effect-head"><span class="alchemy-lab-effect-sign">${r.effect.kind === "harm" ? "−" : "+"}</span><strong>${r.effect.name}</strong> <span class="alchemy-lab-effect-meta">${label}${save}</span>${button}</p>
          ${text}
        </div>`;
      }).join("");
    }

    result.innerHTML = `<p class="alchemy-lab-summary">В дозе занято <strong>${used}</strong> из <strong>${total}</strong> мест${baseSlots() ? ` (основа — ${baseSlots()})` : ""}. Сл спасброска от ядов: <strong>${dc}</strong>.</p>${body}`;
  }

  render();
}

// Диалог собирается при первом открытии — на странице может быть только кнопка
for (const button of document.querySelectorAll(".alchemy-lab-open")) {
  const dialog = button.parentElement.nextElementSibling;
  if (!(dialog instanceof HTMLDialogElement)) continue;
  button.addEventListener("click", () => {
    const root = dialog.querySelector(".alchemy-lab");
    if (root && !root.classList.contains("alchemy-lab--ready")) initLab(root);
    dialog.showModal();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
