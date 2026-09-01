// Конструктор дозы: открывается кнопкой в диалоге; выбираешь ступень, основу,
// ингредиенты — и видишь, какие эффекты попадут в дозу и какой силы. Данные
// приходят из шорткода alchemyLab (eleventy.config.js) в атрибуте data-lab
// (JSON в base64 — markdown-типограф не трогает). Правила те же, что в разделе
// Алхимии: эффект попадает в дозу, если есть хотя бы у двух ингредиентов,
// сила — их число минус один (не больше трёх долей); ступень задаёт число
// ингредиентов (capacity) и бонус в Сл (bonus), обе величины приходят из
// tiers в данных. На странице персонажа (options.known = "page") в выбор идут
// только травы из его карточек — список лежит в data-known-ingredients у ingredientPicks.

const MAX_STACKS = 3;

function dolesWord(n) {
  return n === 1 ? "доля" : "доли";
}

function initLab(root) {
  const bytes = Uint8Array.from(atob(root.dataset.lab), (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  const effectById = new Map(data.effects.map((e) => [e.id, e]));
  const tierById = new Map(data.tiers.map((t) => [t.id, t]));

  const options = data.options ?? {};
  const knownList = options.known === "page"
    ? (document.querySelector("[data-known-ingredients]")?.dataset.knownIngredients ?? "").split(",").filter(Boolean)
    : [];
  const known = new Set(knownList);

  const state = {
    tier: options.tier && tierById.has(options.tier) ? options.tier : data.tiers[0].id,
    base: "blade",
    intMod: Number(options.int ?? 2) || 0,
    still: Number(options.still ?? 0) || 0,   // Перегонный куб — сколько полезных эффектов можно убрать
    retort: Number(options.retort ?? 0) || 0, // Реторта — сколько вредных
    onlyKnown: known.size > 0,
    selected: new Map(), // id ингредиента → число порций
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
      <select data-field="tier">${data.tiers.map((t) => `<option value="${t.id}">${t.title} — ${t.feats} ${t.feats === 1 ? "черта" : "черт" + (t.feats < 5 ? "ы" : "")}, ${t.capacity} в дозе</option>`).join("")}</select>
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
  `;
  controls.querySelector("[data-field=tier]").value = state.tier;
  controls.querySelector("[data-field=intMod]").value = state.intMod;
  controls.querySelector("[data-field=still]").value = state.still;
  controls.querySelector("[data-field=retort]").value = state.retort;
  root.append(controls);

  // Переключатель списка: свои травы персонажа или все, что есть в Алхимии
  if (known.size) {
    const scope = document.createElement("div");
    scope.className = "alchemy-lab-scope";
    scope.innerHTML = `<button type="button" class="alchemy-lab-scope-button" data-scope="known">Свои травы (${known.size})</button><button type="button" class="alchemy-lab-scope-button" data-scope="all">Все травы (${data.ingredients.length})</button>`;
    scope.addEventListener("click", (event) => {
      const button = event.target.closest("[data-scope]");
      if (!button) return;
      state.onlyKnown = button.dataset.scope === "known";
      for (const b of scope.querySelectorAll("[data-scope]")) b.classList.toggle("is-on", b === button);
      render();
    });
    scope.querySelector("[data-scope=known]").classList.add("is-on");
    root.append(scope);
  }

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
    else state[field] = Number(event.target.value) || 0;
    trim();
    render();
  });

  picker.addEventListener("click", (event) => {
    const minus = event.target.closest("[data-minus]");
    if (minus) {
      const id = minus.dataset.minus;
      const n = (state.selected.get(id) ?? 0) - 1;
      if (n > 0) state.selected.set(id, n);
      else state.selected.delete(id);
      render();
      return;
    }
    const button = event.target.closest("[data-ingredient]");
    if (!button) return;
    const id = button.dataset.ingredient;
    if (selectedCount() < capacity()) state.selected.set(id, (state.selected.get(id) ?? 0) + 1);
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
    return Math.max(0, tierById.get(state.tier).capacity - baseSlots());
  }

  function selectedCount() {
    let n = 0;
    for (const c of state.selected.values()) n += c;
    return n;
  }

  // Если ёмкость уменьшилась — лишние порции выпадают, последние первыми
  function trim() {
    const cap = capacity();
    while (selectedCount() > cap) {
      const lastId = [...state.selected.keys()].pop();
      const n = state.selected.get(lastId) - 1;
      if (n > 0) state.selected.set(lastId, n);
      else state.selected.delete(lastId);
    }
  }

  function brew() {
    const count = new Map();
    for (const [id, portions] of state.selected) {
      const ingredient = data.ingredients.find((i) => i.id === id);
      for (const e of ingredient.effects) count.set(e, (count.get(e) ?? 0) + portions);
    }
    const rows = [];
    for (const [effectId, n] of count) {
      if (n < 2) continue;
      const effect = effectById.get(effectId);
      rows.push({
        effect,
        count: n,
        stacks: Math.min(n - 1, MAX_STACKS),
        extra: effect.kind === "harm" && effect.id !== "damage" ? Math.max(0, n - 4) : 0,
      });
    }
    rows.sort((a, b) => (a.effect.kind === b.effect.kind ? b.count - a.count : a.effect.kind === "harm" ? -1 : 1));
    return rows;
  }

  function render() {
    const cap = capacity();
    const rows = brew();
    const activeIds = new Set(rows.map((r) => r.effect.id));
    for (const id of [...state.removed]) if (!activeIds.has(id)) state.removed.delete(id);

    picker.innerHTML = data.regions.map((region) => {
      const items = data.ingredients.filter((i) => i.region === region.id && (!state.onlyKnown || known.has(i.id)));
      if (items.length === 0) return "";
      return `<div class="alchemy-lab-region"><p class="alchemy-lab-region-title">${region.title}</p><div class="alchemy-lab-chips">${items.map((i) => {
        const portions = state.selected.get(i.id) ?? 0;
        const on = portions > 0;
        const disabled = selectedCount() >= cap;
        const effects = i.effects.map((e) => {
          const effect = effectById.get(e);
          return `<span class="alchemy-lab-mini alchemy-lab-mini--${effect.kind}">${effect.kind === "harm" ? "−" : "+"}${effect.name}</span>`;
        }).join("");
        const foreign = known.size > 0 && !known.has(i.id);
        return `<button type="button" class="alchemy-lab-chip${on ? " is-on" : ""}${foreign ? " is-foreign" : ""}" data-ingredient="${i.id}"${disabled ? " disabled" : ""}${foreign ? ` title="Этой травы персонаж пока не знает"` : ""}><span class="alchemy-lab-chip-name">${i.name}${portions > 1 ? ` <span class="alchemy-lab-chip-count">×${portions}</span>` : ""}</span><span class="alchemy-lab-chip-effects">${effects}</span></button>${on ? `<button type="button" class="alchemy-lab-chip-minus" data-minus="${i.id}" title="Убрать порцию">−</button>` : ""}`;
      }).join("")}</div></div>`;
    }).join("");

    const used = selectedCount() + baseSlots();
    const total = tierById.get(state.tier).capacity;
    const dc = 8 + tierById.get(state.tier).bonus + state.intMod;
    const stillUsed = rows.filter((r) => r.effect.kind === "boon" && state.removed.has(r.effect.id)).length;
    const retortUsed = rows.filter((r) => r.effect.kind === "harm" && state.removed.has(r.effect.id)).length;

    let body = "";
    if (selectedCount() < 2) {
      body = `<p class="alchemy-lab-empty">Выбери хотя бы два ингредиента.</p>`;
    } else if (rows.length === 0) {
      body = `<p class="alchemy-lab-empty">Общих эффектов нет — ингредиенты пропали.</p>`;
    } else {
      body = rows.map((r) => {
        const removed = state.removed.has(r.effect.id);
        const canRemove = r.effect.kind === "boon"
          ? removed || stillUsed < state.still
          : removed || retortUsed < state.retort;
        const label = `${r.stacks} ${dolesWord(r.stacks)}${r.extra ? `, +${r.extra} к Сл` : ""}`;
        const save = r.effect.kind === "harm" ? ` · спасбросок ${r.effect.save}, Сл ${dc + r.extra}` : "";
        const text = `<p class="alchemy-lab-effect-text">${r.effect.stacks[r.stacks - 1]}</p>`;
        const button = canRemove
          ? `<button type="button" class="alchemy-lab-remove" data-remove="${r.effect.id}">${removed ? "вернуть" : r.effect.kind === "boon" ? "убрать кубом" : "убрать ретортой"}</button>`
          : "";
        return `<div class="alchemy-lab-effect alchemy-lab-effect--${r.effect.kind}${removed ? " is-removed" : ""}">
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
