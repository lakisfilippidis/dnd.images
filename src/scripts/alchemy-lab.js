// Конструктор дозы: открывается кнопкой в диалоге; выбираешь ступень, основу,
// ингредиенты — и видишь, какие эффекты попадут в дозу и какой силы. Данные
// приходят из шорткода alchemyLab (eleventy.config.js) в атрибуте data-lab
// (JSON в base64 — markdown-типограф не трогает). Правила те же, что в разделе
// Алхимии: эффект попадает в дозу, если есть хотя бы у двух ингредиентов,
// сила — их число минус один (не больше трёх долей); ступень задаёт число
// ингредиентов (capacity) и бонус в Сл (bonus), обе величины приходят из
// tiers в данных.
//
// На странице персонажа (options.id задан) у конструктора есть сумка: пачки трав
// по краям (одна пачка — один ингредиент любой травы края), поштучные трофеи и
// порох, сваренные дозы и рецепты. Сумка живёт в localStorage под ключом
// dnd-alchemy-<id>; стартовое содержимое приходит в data.start из front matter.
// Без options.id (страница Черт) конструктор эфемерный — все травы, ничего не хранится.

const MAX_STACKS = 3;
const LOG_LIMIT = 8;

function dolesWord(n) {
  return n === 1 ? "доля" : "доли";
}

function packsWord(n) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 19) return "пачек";
  if (last === 1) return "пачка";
  if (last >= 2 && last <= 4) return "пачки";
  return "пачек";
}

function storageKey(id) {
  return `dnd-alchemy-${id}`;
}

function cleanCounts(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) out[k] = n;
  }
  return out;
}

// Приводит сумку из хранилища или из импорта к ожидаемой форме; лишнее выбрасывает
function normalizeBag(data) {
  if (!data || typeof data !== "object") throw new Error("not an object");
  return {
    packs: cleanCounts(data.packs),
    items: cleanCounts(data.items),
    doses: Array.isArray(data.doses) ? data.doses.filter((d) => d && typeof d.name === "string" && Array.isArray(d.effects)) : [],
    recipes: Array.isArray(data.recipes) ? data.recipes.filter((r) => r && typeof r.name === "string" && Array.isArray(r.ingredients)).map((r) => ({ name: r.name, base: r.base ?? "blade", ingredients: r.ingredients, remove: Array.isArray(r.remove) ? r.remove : [] })) : [],
    log: Array.isArray(data.log) ? data.log.filter((l) => typeof l === "string").slice(0, LOG_LIMIT) : [],
  };
}

function load(id) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    return normalizeBag(JSON.parse(raw));
  } catch {
    return null; // приватное окно, закрытые куки, испорченный JSON — начинаем со стартовой сумки
  }
}

function save(id, bag) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(bag));
  } catch {
    // Хранилище недоступно — конструктор работает, просто сумка не переживёт перезагрузку
  }
}

function fromStart(start) {
  return {
    packs: cleanCounts(start?.packs),
    items: cleanCounts(start?.items),
    doses: [],
    recipes: (start?.recipes ?? []).map((r) => ({ name: r.name, base: r.base ?? "blade", ingredients: [...r.ingredients], remove: [...(r.remove ?? [])] })),
    log: [],
  };
}

// Та же функция, что alchemy.brew в src/_data/alchemy.js — копии должны совпадать
function brewRows(ingredientIds, ingredientById, effectById, area = false) {
  const count = new Map();
  for (const id of ingredientIds) {
    const ingredient = ingredientById.get(id);
    if (!ingredient) continue;
    for (const e of ingredient.effects) count.set(e, (count.get(e) ?? 0) + 1);
  }
  const rows = [];
  for (const [effectId, n] of count) {
    if (n < 2) continue;
    const effect = effectById.get(effectId);
    if (!area && effect.areaOnly) continue;
    let stacks = Math.min(n - 1, MAX_STACKS);
    if (area) stacks = effect.areaFloor ? Math.max(1, stacks - 1) : stacks - 1;
    if (stacks < 1) continue;
    rows.push({
      effect,
      count: n,
      stacks,
      extra: effect.kind === "harm" && effect.id !== "damage" ? Math.max(0, n - 4) : 0,
    });
  }
  rows.sort((a, b) => (a.effect.kind === b.effect.kind ? b.count - a.count : a.effect.kind === "harm" ? -1 : 1));
  return rows;
}

// Та же функция, что alchemy.tierGap в src/_data/alchemy.js — копии должны совпадать
function tierGapOf(rows, removedIds, tierId, tiers) {
  const removed = new Set(removedIds);
  const index = (id) => tiers.findIndex((t) => t.id === id);
  const own = index(tierId);
  let gap = 0;
  for (const row of rows) {
    if (removed.has(row.effect.id) || !row.effect.tier) continue;
    gap = Math.max(gap, index(row.effect.tier) - own);
  }
  return gap;
}

// Та же функция, что alchemy.brewMinutes в src/_data/alchemy.js — копии должны совпадать
function brewMinutesOf(dc) {
  return Math.min(60, Math.max(5, 5 * (dc - 10)));
}

// Та же функция, что alchemy.brewDc в src/_data/alchemy.js — копии должны совпадать
function brewDcOf(rows, removedIds, gap = 0) {
  const removed = new Set(removedIds);
  let dc = 10 + 5 * gap;
  for (const row of rows) dc += removed.has(row.effect.id) ? 2 : row.stacks;
  return dc;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function initLab(root) {
  const bytes = Uint8Array.from(atob(root.dataset.lab), (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  const effectById = new Map(data.effects.map((e) => [e.id, e]));
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const tierById = new Map(data.tiers.map((t) => [t.id, t]));
  const regionById = new Map(data.regions.map((r) => [r.id, r]));
  const baseById = new Map(data.bases.map((b) => [b.id, b]));
  const packRegions = data.regions.filter((r) => !r.item);
  const itemRegions = data.regions.filter((r) => r.item);

  const options = data.options ?? {};
  const bagId = options.id ?? null;

  const state = {
    tier: options.tier && tierById.has(options.tier) ? options.tier : data.tiers[0].id,
    base: "blade",
    intMod: Number(options.int ?? 2) || 0,
    still: Number(options.still ?? 0) || 0,   // Перегонный куб — сколько полезных эффектов можно убрать
    retort: Number(options.retort ?? 0) || 0, // Реторта — сколько вредных
    scope: bagId ? "bag" : "all",
    selected: new Map(), // id ингредиента → число порций
    removed: new Set(),
    bag: bagId ? (load(bagId) ?? fromStart(data.start)) : null,
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
      <select data-field="tier">${data.tiers.map((t) => `<option value="${t.id}">${t.title} — ${t.feats} ${t.feats === 1 ? "черта" : "черт" + (t.feats < 5 ? "ы" : "")}, с ${t.level}-го ур., ${t.capacity} в дозе</option>`).join("")}</select>
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

  // Сумка: пачки по краям, поштучные ингредиенты, сбор трав. Форма сбора создаётся
  // один раз, чтобы перерисовка не сбрасывала введённое; список пачек — в bagList.
  let bagList = null;
  let gatherForm = null;
  let scopeBar = null;
  if (state.bag) {
    const bagBox = document.createElement("section");
    bagBox.className = "alchemy-lab-bag";
    bagBox.innerHTML = `<p class="alchemy-lab-section-title">Сумка</p>`;
    bagList = document.createElement("div");
    bagList.className = "alchemy-lab-bag-list";
    bagBox.append(bagList);

    gatherForm = document.createElement("form");
    gatherForm.className = "alchemy-lab-gather";
    gatherForm.innerHTML = `
      <span class="alchemy-lab-gather-title">Собрать травы</span>
      <label class="alchemy-lab-field">Край
        <select data-gather="region">${packRegions.map((r) => `<option value="${r.id}">${r.title}</option>`).join("")}</select>
      </label>
      <label class="alchemy-lab-field">Проверка Природы
        <input type="number" data-gather="result" min="1" max="40" step="1" placeholder="17">
      </label>
      <button type="submit" class="alchemy-lab-button">Собрать</button>
      <span class="alchemy-lab-gather-hint" data-gather="hint"></span>
    `;
    gatherForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const regionId = gatherForm.querySelector("[data-gather=region]").value;
      const input = gatherForm.querySelector("[data-gather=result]");
      const result = Number(input.value);
      if (!Number.isInteger(result) || result < 1) return;
      const got = gatherYield(result);
      if (got > 0) state.bag.packs[regionId] = (state.bag.packs[regionId] ?? 0) + got;
      note(`${regionById.get(regionId).title}: Природа ${result} → ${got ? `+${got} ${packsWord(got)}` : "ничего"}`);
      input.value = "";
      commit();
    });
    gatherForm.addEventListener("input", updateGatherHint);
    bagBox.append(gatherForm);

    const addItem = document.createElement("div");
    addItem.className = "alchemy-lab-add-item";
    addItem.innerHTML = `
      <label class="alchemy-lab-field">Добавить поштучно
        <select data-add-item>${itemRegions.map((r) => `<optgroup label="${r.title}">${data.ingredients.filter((i) => i.region === r.id).map((i) => `<option value="${i.id}">${i.name}</option>`).join("")}</optgroup>`).join("")}</select>
      </label>
      <button type="button" class="alchemy-lab-button" data-act="add-item">+1</button>
    `;
    addItem.querySelector("[data-act=add-item]").addEventListener("click", () => {
      const id = addItem.querySelector("[data-add-item]").value;
      state.bag.items[id] = (state.bag.items[id] ?? 0) + 1;
      note(`+1 ${ingredientById.get(id).name}`);
      commit();
    });
    bagBox.append(addItem);
    root.append(bagBox);

    bagList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pack],[data-item]");
      if (!button) return;
      const d = Number(button.dataset.d);
      if (button.dataset.pack) {
        const id = button.dataset.pack;
        const n = Math.max(0, (state.bag.packs[id] ?? 0) + d);
        if (n) state.bag.packs[id] = n;
        else delete state.bag.packs[id];
      } else {
        const id = button.dataset.item;
        const n = Math.max(0, (state.bag.items[id] ?? 0) + d);
        if (n) state.bag.items[id] = n;
        else delete state.bag.items[id];
      }
      commit();
    });

    // Переключатель списка: что есть в сумке или все травы, что есть в Алхимии
    scopeBar = document.createElement("div");
    scopeBar.className = "alchemy-lab-scope";
    scopeBar.innerHTML = `<button type="button" class="alchemy-lab-scope-button is-on" data-scope="bag">Из сумки</button><button type="button" class="alchemy-lab-scope-button" data-scope="all">Все травы (${data.ingredients.length})</button>`;
    scopeBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-scope]");
      if (!button) return;
      state.scope = button.dataset.scope;
      for (const b of scopeBar.querySelectorAll("[data-scope]")) b.classList.toggle("is-on", b === button);
      render();
    });
    root.append(scopeBar);
  }

  const picker = document.createElement("div");
  picker.className = "alchemy-lab-picker";
  root.append(picker);

  const result = document.createElement("div");
  result.className = "alchemy-lab-result";
  root.append(result);

  // Действия над собранной дозой: имя, сварить, записать рецепт. Создаются один раз.
  let actions = null;
  let recipesBox = null;
  let dosesBox = null;
  let logBox = null;
  if (state.bag) {
    actions = document.createElement("div");
    actions.className = "alchemy-lab-actions";
    actions.innerHTML = `
      <input type="text" class="alchemy-lab-name" data-field="doseName" placeholder="Название" maxlength="60">
      <label class="alchemy-lab-field">Проверка набора
        <input type="number" data-check min="1" max="40" step="1" placeholder="14">
      </label>
      <button type="button" class="alchemy-lab-button alchemy-lab-button--primary" data-act="brew">Сварить</button>
      <button type="button" class="alchemy-lab-button" data-act="save-recipe">Записать рецепт</button>
      <span class="alchemy-lab-actions-hint" data-act-hint></span>
    `;
    actions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-act]");
      if (!button) return;
      const nameInput = actions.querySelector("[data-field=doseName]");
      if (button.dataset.act === "brew") {
        brewDose(nameInput.value.trim());
        nameInput.value = "";
      } else if (button.dataset.act === "save-recipe") {
        saveRecipe(nameInput.value.trim());
        nameInput.value = "";
      }
    });
    actions.addEventListener("input", (event) => {
      if (event.target.matches("[data-check]")) render();
    });
    root.append(actions);

    recipesBox = document.createElement("section");
    recipesBox.className = "alchemy-lab-recipes";
    recipesBox.addEventListener("click", (event) => {
      const button = event.target.closest("[data-recipe]");
      if (!button) return;
      const index = Number(button.dataset.recipe);
      const recipe = state.bag.recipes[index];
      if (!recipe) return;
      if (button.dataset.act === "brew") brewRecipe(recipe);
      else if (button.dataset.act === "load") loadRecipe(recipe);
      else if (button.dataset.act === "delete") {
        state.bag.recipes.splice(index, 1);
        note(`Рецепт «${recipe.name}» вычеркнут`);
        commit();
      }
    });
    root.append(recipesBox);

    dosesBox = document.createElement("section");
    dosesBox.className = "alchemy-lab-doses";
    dosesBox.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dose]");
      if (!button) return;
      const index = Number(button.dataset.dose);
      const dose = state.bag.doses[index];
      if (!dose) return;
      state.bag.doses.splice(index, 1);
      note(button.dataset.act === "use" ? `Использована «${dose.name}»` : `Выброшена «${dose.name}»`);
      commit();
    });
    dosesBox.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-dose-name]");
      if (!input) return;
      const dose = state.bag.doses[Number(input.dataset.doseName)];
      if (!dose) return;
      dose.name = input.value.trim() || dose.name;
      input.value = dose.name;
      save(bagId, state.bag);
    });
    root.append(dosesBox);

    logBox = document.createElement("div");
    logBox.className = "alchemy-lab-log-box";
    logBox.addEventListener("click", (event) => {
      if (!event.target.closest("[data-act=reset]")) return;
      if (!confirm("Вернуть сумку к начальному запасу со страницы? Сваренные дозы и записанные рецепты пропадут.")) return;
      state.bag = fromStart(data.start);
      commit();
    });
    root.append(logBox);

    // Перенос сумки между устройствами: JSON в поле (скопировать и вставить)
    // или файлом. Создаётся один раз, чтобы перерисовка не трогала вставленный текст.
    const transfer = document.createElement("div");
    transfer.className = "alchemy-lab-transfer";
    transfer.innerHTML = `
      <p class="alchemy-lab-transfer-actions">
        <button type="button" class="alchemy-lab-button" data-act="export">Экспорт</button>
        <button type="button" class="alchemy-lab-button" data-act="download">Скачать файл</button>
        <button type="button" class="alchemy-lab-button" data-act="upload">Загрузить файл</button>
        <button type="button" class="alchemy-lab-button" data-act="import">Импорт из поля</button>
        <input type="file" accept="application/json,.json" data-transfer-file hidden>
        <span class="alchemy-lab-actions-hint" data-transfer-hint></span>
      </p>
      <textarea class="alchemy-lab-transfer-text" data-transfer-text rows="4" placeholder="Сюда ляжет JSON сумки при экспорте; вставь чужой — и нажми «Импорт из поля»" spellcheck="false"></textarea>
    `;
    const textarea = transfer.querySelector("[data-transfer-text]");
    const fileInput = transfer.querySelector("[data-transfer-file]");
    const hint = transfer.querySelector("[data-transfer-hint]");
    transfer.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-act]");
      if (!button) return;
      const act = button.dataset.act;
      if (act === "export") {
        textarea.value = exportJson();
        textarea.select();
        try {
          await navigator.clipboard.writeText(textarea.value);
          hint.textContent = "Скопировано в буфер";
        } catch {
          hint.textContent = "Скопируй текст из поля";
        }
      } else if (act === "download") {
        const blob = new Blob([exportJson()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `alchemy-${bagId}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else if (act === "upload") {
        fileInput.value = "";
        fileInput.click();
      } else if (act === "import") {
        hint.textContent = importBag(textarea.value) ? "Сумка загружена" : "Не разобрать: нужен JSON, что даёт экспорт";
      }
    });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      hint.textContent = importBag(await file.text()) ? `Сумка загружена из ${file.name}` : `Не разобрать ${file.name}`;
    });
    root.append(transfer);
  }

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

  function tier() {
    return tierById.get(state.tier);
  }

  function baseSlots(baseId = state.base) {
    return baseById.get(baseId)?.slots ?? 0;
  }

  // бомба, зажигательная и дым бьют по площади — эффекты там на долю слабее
  function isArea(baseId = state.base) {
    return baseById.get(baseId)?.area ?? false;
  }

  function capacity() {
    return Math.max(0, tier().capacity - baseSlots());
  }

  function dc() {
    return 8 + tier().bonus + state.intMod;
  }

  function selectedCount() {
    let n = 0;
    for (const c of state.selected.values()) n += c;
    return n;
  }

  function selectedIds() {
    const ids = [];
    for (const [id, n] of state.selected) for (let i = 0; i < n; i++) ids.push(id);
    return ids;
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

  function note(text) {
    state.bag.log.unshift(text);
    state.bag.log = state.bag.log.slice(0, LOG_LIMIT);
  }

  function commit() {
    save(bagId, state.bag);
    render();
  }

  function exportJson() {
    return JSON.stringify({ id: bagId, exported: new Date().toISOString(), ...state.bag }, null, 2);
  }

  // Импорт заменяет сумку целиком; неизвестные этому реестру травы и края выпадают
  function importBag(text) {
    let bag;
    try {
      bag = normalizeBag(JSON.parse(text));
    } catch {
      return false;
    }
    for (const id of Object.keys(bag.packs)) if (!regionById.has(id) || regionById.get(id).item) delete bag.packs[id];
    for (const id of Object.keys(bag.items)) if (!ingredientById.has(id) || !regionById.get(ingredientById.get(id).region)?.item) delete bag.items[id];
    bag.recipes = bag.recipes.filter((r) => r.ingredients.every((id) => ingredientById.has(id)) && baseById.has(r.base));
    bag.doses = bag.doses.filter((d) => d.effects.every((e) => e && effectById.has(e.id)));
    state.bag = bag;
    note("Сумка загружена из импорта");
    commit();
    return true;
  }

  // Сколько пачек даёт проверка Природы: строка лестницы по min ≤ результат,
  // доза ступени — полная ёмкость ступени, без учёта основы
  function gatherYield(result) {
    let doses = 0;
    for (const row of data.gather) if (result >= row.min) doses = row.doses;
    return Math.ceil(doses * tier().capacity);
  }

  function updateGatherHint() {
    const hint = gatherForm.querySelector("[data-gather=hint]");
    const result = Number(gatherForm.querySelector("[data-gather=result]").value);
    if (!Number.isInteger(result) || result < 1) {
      hint.textContent = `Час в крае; доза ${tier().title.toLowerCase()}а — ${tier().capacity}`;
      return;
    }
    const got = gatherYield(result);
    hint.textContent = got ? `→ ${got} ${packsWord(got)}` : "→ ничего";
  }

  // Сколько ингредиентов набора берётся из каждого края и каждого поштучного
  function usage(ids) {
    const packs = new Map();
    const items = new Map();
    for (const id of ids) {
      const ingredient = ingredientById.get(id);
      const region = regionById.get(ingredient.region);
      if (region.item) items.set(id, (items.get(id) ?? 0) + 1);
      else packs.set(region.id, (packs.get(region.id) ?? 0) + 1);
    }
    return { packs, items };
  }

  // Чего не хватает в сумке для набора; пустой список — всё есть
  function shortage(ids) {
    if (!state.bag) return [];
    const { packs, items } = usage(ids);
    const missing = [];
    for (const [regionId, n] of packs) {
      const have = state.bag.packs[regionId] ?? 0;
      if (n > have) missing.push(`${regionById.get(regionId).title}: ${n - have}`);
    }
    for (const [id, n] of items) {
      const have = state.bag.items[id] ?? 0;
      if (n > have) missing.push(`${ingredientById.get(id).name}: ${n - have}`);
    }
    return missing;
  }

  function spend(ids) {
    const { packs, items } = usage(ids);
    for (const [regionId, n] of packs) {
      const left = (state.bag.packs[regionId] ?? 0) - n;
      if (left > 0) state.bag.packs[regionId] = left;
      else delete state.bag.packs[regionId];
    }
    for (const [id, n] of items) {
      const left = (state.bag.items[id] ?? 0) - n;
      if (left > 0) state.bag.items[id] = left;
      else delete state.bag.items[id];
    }
  }

  // Остаток края или поштучного ингредиента с учётом уже выбранного
  function remaining(ingredient) {
    if (!state.bag) return Infinity;
    const { packs, items } = usage(selectedIds());
    const region = regionById.get(ingredient.region);
    if (region.item) return (state.bag.items[ingredient.id] ?? 0) - (items.get(ingredient.id) ?? 0);
    return (state.bag.packs[region.id] ?? 0) - (packs.get(region.id) ?? 0);
  }

  function autoName(rows, removed) {
    const kept = rows.filter((r) => !removed.has(r.effect.id));
    if (kept.length === 0) return "Пустая доза";
    return kept.slice(0, 2).map((r) => `${r.effect.name} ${r.stacks}`).join(", ");
  }

  function makeDose(name, baseId, rows, removed, ids) {
    return {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name,
      base: baseId,
      dc: dc(),
      ingredients: ids,
      effects: rows.map((r) => ({ id: r.effect.id, stacks: r.stacks, extra: r.extra, removed: removed.has(r.effect.id) })),
    };
  }

  // Сл варки с надбавкой за эффекты выше текущей ступени
  function doseDc(rows, removed) {
    return brewDcOf(rows, removed, tierGapOf(rows, removed, state.tier, data.tiers));
  }

  // На сколько ступеней эффект выше текущей; 0 — в пределах ступени
  function overTier(effect) {
    if (!effect.tier) return 0;
    const index = (id) => data.tiers.findIndex((t) => t.id === id);
    return Math.max(0, index(effect.tier) - index(state.tier));
  }

  // Общие эффекты набора, что срабатывают только на площади (Взрыв, Горение) —
  // на неметательной основе они выпадают, конструктор об этом предупреждает
  function areaOnlyLost() {
    if (isArea()) return [];
    const count = new Map();
    for (const id of selectedIds()) for (const e of ingredientById.get(id).effects) count.set(e, (count.get(e) ?? 0) + 1);
    return [...count].filter(([id, n]) => n >= 2 && effectById.get(id).areaOnly).map(([id]) => effectById.get(id).name);
  }

  // Результат проверки набора алхимика из поля; null — не вписан
  function checkResult() {
    const raw = actions?.querySelector("[data-check]").value.trim() ?? "";
    const n = Number(raw);
    return raw !== "" && Number.isInteger(n) ? n : null;
  }

  // Варка — проверка: вписанный результат набора алхимика + бонус ступени против
  // Сл варки. Ингредиенты уходят в любом случае; провал на data.mishap и больше —
  // авария: один случайный эффект из оставшихся в дозе действует на самого алхимика,
  // как выпитый. Возвращает null без проверки,
  // иначе — удалось ли.
  function attempt(ids, rows, removed, name, baseId) {
    const check = checkResult();
    if (check === null) return null;
    const total = check + tier().bonus;
    const target = doseDc(rows, removed);
    spend(ids);
    actions.querySelector("[data-check]").value = "";
    if (total >= target) {
      const dose = makeDose(name, baseId, rows, new Set(removed), ids);
      state.bag.doses.unshift(dose);
      note(`Сварена «${dose.name}»: ${total} против Сл ${target}`);
      return true;
    }
    if (target - total < data.mishap) {
      note(`Не вышло «${name}»: ${total} против Сл ${target}, ингредиенты пропали`);
      return false;
    }
    const kept = rows.filter((r) => !removed.has(r.effect.id));
    const what = kept.length === 1
      ? `на тебе ${kept[0].effect.name} ${kept[0].stacks}, как выпитый`
      : `брось d${kept.length} — на тебе как выпитый: ${kept.map((r, i) => `${i + 1} ${r.effect.name} ${r.stacks}`).join(", ")}`;
    note(`Авария с «${name}»: ${total} против Сл ${target}, ингредиенты пропали — ${what}`);
    return false;
  }

  function brewDose(name) {
    const ids = selectedIds();
    const rows = brewRows(ids, ingredientById, effectById, isArea());
    if (ids.length < 2 || rows.length === 0 || shortage(ids).length) return;
    const ok = attempt(ids, rows, state.removed, name || autoName(rows, state.removed), state.base);
    if (ok === null) return;
    if (ok) {
      state.selected.clear();
      state.removed.clear();
    }
    commit();
  }

  function saveRecipe(name) {
    const ids = selectedIds();
    const rows = brewRows(ids, ingredientById, effectById, isArea());
    if (ids.length < 2 || rows.length === 0) return;
    const recipe = {
      name: name || autoName(rows, state.removed),
      base: state.base,
      ingredients: ids,
      remove: [...state.removed].filter((id) => rows.some((r) => r.effect.id === id)),
    };
    state.bag.recipes.push(recipe);
    note(`Записан рецепт «${recipe.name}»`);
    commit();
  }

  // Рецепт влезает в дозу при текущей ступени со своей основой, а куба и реторты
  // хватает на то, что он убирает
  function recipeProblem(recipe) {
    const rows = brewRows(recipe.ingredients, ingredientById, effectById, isArea(recipe.base));
    if (recipe.ingredients.length + baseSlots(recipe.base) > tier().capacity) return "не влезает в дозу этой ступени";
    const removedBoons = recipe.remove.filter((id) => effectById.get(id)?.kind === "boon").length;
    const removedHarms = recipe.remove.length - removedBoons;
    if (removedBoons > state.still) return "не хватает перегонных кубов";
    if (removedHarms > state.retort) return "не хватает реторт";
    if (rows.length === 0) return "общих эффектов нет";
    const missing = shortage(recipe.ingredients);
    if (missing.length) return `не хватает — ${missing.join(", ")}`;
    return null;
  }

  function brewRecipe(recipe) {
    if (recipeProblem(recipe)) return;
    const rows = brewRows(recipe.ingredients, ingredientById, effectById, isArea(recipe.base));
    if (attempt([...recipe.ingredients], rows, new Set(recipe.remove), recipe.name, recipe.base) === null) return;
    commit();
  }

  function loadRecipe(recipe) {
    state.base = baseById.has(recipe.base) ? recipe.base : "blade";
    controls.querySelector("[data-field=base]").value = state.base;
    state.selected = new Map();
    for (const id of recipe.ingredients) state.selected.set(id, (state.selected.get(id) ?? 0) + 1);
    state.removed = new Set(recipe.remove);
    trim();
    if (actions) actions.querySelector("[data-field=doseName]").value = recipe.name;
    render();
    picker.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function effectLine(row, removed, doseDc) {
    const effect = effectById.get(row.effect?.id ?? row.id);
    const stacks = row.stacks;
    const extra = row.extra ?? 0;
    const save = effect.kind === "harm" ? ` · ${effect.save}, Сл ${doseDc + extra}` : "";
    return `<span class="alchemy-lab-mini alchemy-lab-mini--${effect.kind}${removed ? " is-removed" : ""}">${effect.kind === "harm" ? "−" : "+"}${effect.name} ${stacks}${save}</span>`;
  }

  function ingredientsLine(ids) {
    const portions = new Map();
    for (const id of ids) portions.set(id, (portions.get(id) ?? 0) + 1);
    return [...portions].map(([id, n]) => `${ingredientById.get(id)?.name ?? id}${n > 1 ? ` ×${n}` : ""}`).join(", ");
  }

  function renderBag() {
    const packRows = packRegions.map((r) => {
      const n = state.bag.packs[r.id] ?? 0;
      return `<div class="alchemy-lab-bag-row${n ? "" : " is-empty"}"><span class="alchemy-lab-bag-name">${r.title}</span><button type="button" class="alchemy-lab-count-button" data-pack="${r.id}" data-d="-1" aria-label="Минус пачка"${n ? "" : " disabled"}>−</button><strong class="alchemy-lab-count">${n}</strong><button type="button" class="alchemy-lab-count-button" data-pack="${r.id}" data-d="1" aria-label="Плюс пачка">+</button></div>`;
    });
    const itemRows = Object.entries(state.bag.items).map(([id, n]) => {
      const ingredient = ingredientById.get(id);
      if (!ingredient) return "";
      return `<div class="alchemy-lab-bag-row alchemy-lab-bag-row--item"><span class="alchemy-lab-bag-name">${ingredient.name}</span><button type="button" class="alchemy-lab-count-button" data-item="${id}" data-d="-1" aria-label="Минус">−</button><strong class="alchemy-lab-count">${n}</strong><button type="button" class="alchemy-lab-count-button" data-item="${id}" data-d="1" aria-label="Плюс">+</button></div>`;
    });
    bagList.innerHTML = [...packRows, ...itemRows].join("");
    updateGatherHint();
  }

  function renderPicker(cap) {
    const onlyBag = state.scope === "bag" && state.bag;
    picker.innerHTML = data.regions.map((region) => {
      const items = data.ingredients.filter((i) => i.region === region.id && (!onlyBag || remaining(i) > 0 || state.selected.has(i.id)));
      if (items.length === 0) return "";
      const packsLeft = state.bag && !region.item ? remaining(items[0]) : null;
      const title = packsLeft === null ? region.title : `${region.title} <span class="alchemy-lab-region-count">${packsLeft > 0 ? `${packsLeft} ${packsWord(packsLeft)}` : "нет пачек"}</span>`;
      return `<div class="alchemy-lab-region"><p class="alchemy-lab-region-title">${title}</p><div class="alchemy-lab-chips">${items.map((i) => {
        const portions = state.selected.get(i.id) ?? 0;
        const on = portions > 0;
        const left = remaining(i);
        const foreign = state.bag && left <= 0;
        const disabled = selectedCount() >= cap || (onlyBag && left <= 0);
        const effects = i.effects.map((e) => {
          const effect = effectById.get(e);
          return `<span class="alchemy-lab-mini alchemy-lab-mini--${effect.kind}">${effect.kind === "harm" ? "−" : "+"}${effect.name}</span>`;
        }).join("");
        return `<button type="button" class="alchemy-lab-chip${on ? " is-on" : ""}${foreign ? " is-foreign" : ""}" data-ingredient="${i.id}"${disabled ? " disabled" : ""}${foreign ? ` title="${region.item ? "Этого нет в сумке" : "Пачки этого края кончились"}"` : ""}><span class="alchemy-lab-chip-name">${i.name}${portions > 1 ? ` <span class="alchemy-lab-chip-count">×${portions}</span>` : ""}</span><span class="alchemy-lab-chip-effects">${effects}</span></button>${on ? `<button type="button" class="alchemy-lab-chip-minus" data-minus="${i.id}" title="Убрать порцию">−</button>` : ""}`;
      }).join("")}</div></div>`;
    }).join("");
  }

  function renderResult(rows) {
    const used = selectedCount() + baseSlots();
    const total = tier().capacity;
    const stillUsed = rows.filter((r) => r.effect.kind === "boon" && state.removed.has(r.effect.id)).length;
    const retortUsed = rows.filter((r) => r.effect.kind === "harm" && state.removed.has(r.effect.id)).length;

    let body = "";
    if (selectedCount() < 2) {
      body = `<p class="alchemy-lab-empty">Выбери хотя бы два ингредиента.</p>`;
    } else if (rows.length === 0) {
      body = `<p class="alchemy-lab-empty">${isArea() ? "На площади ничего не осталось: общих эффектов нет или им не хватило долей." : "Общих эффектов нет — ингредиенты пропали."}</p>`;
    } else {
      body = rows.map((r) => {
        const removed = state.removed.has(r.effect.id);
        const canRemove = r.effect.kind === "boon"
          ? removed || stillUsed < state.still
          : removed || retortUsed < state.retort;
        const over = removed ? 0 : overTier(r.effect);
        const label = `${r.stacks} ${dolesWord(r.stacks)}${r.extra ? `, +${r.extra} к Сл` : ""}${over ? ` · порог ${tierById.get(r.effect.tier).title}, +${5 * over} к Сл варки` : ""}`;
        const save = r.effect.kind === "harm" ? ` · спасбросок ${r.effect.save}, Сл ${dc() + r.extra}` : "";
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

    result.innerHTML = `<p class="alchemy-lab-summary">В дозе занято <strong>${used}</strong> из <strong>${total}</strong> мест${baseSlots() ? ` (основа — ${baseSlots()})` : ""}. Сл спасброска от ядов: <strong>${dc()}</strong>.${rows.length ? ` Сл варки: <strong>${doseDc(rows, state.removed)}</strong>, варится ${brewMinutesOf(doseDc(rows, state.removed))} мин — проверка набора алхимика +${tier().bonus} за ступень.` : ""}${isArea() ? " На площади каждый эффект на долю слабее; Урон, Взрыв и Горение — не слабее одной доли." : ""}${areaOnlyLost().length ? ` ${areaOnlyLost().join(" и ")} срабатывают только в метательных основах — здесь выпадают.` : ""}</p>${body}`;
  }

  function renderActions(rows) {
    const ids = selectedIds();
    const missing = shortage(ids);
    const ready = ids.length >= 2 && rows.length > 0;
    const unchecked = checkResult() === null;
    actions.querySelector("[data-act=brew]").disabled = !ready || missing.length > 0 || unchecked;
    actions.querySelector("[data-act=save-recipe]").disabled = !ready;
    actions.querySelector("[data-act-hint]").textContent = ready && missing.length
      ? `Не хватает — ${missing.join(", ")}`
      : ready && unchecked ? "Брось проверку набора алхимика и впиши результат" : "";
  }

  function renderRecipes() {
    if (state.bag.recipes.length === 0) {
      recipesBox.innerHTML = `<p class="alchemy-lab-section-title">Рецепты</p><p class="alchemy-lab-empty">Собери дозу и нажми «Записать рецепт» — он останется здесь.</p>`;
      return;
    }
    recipesBox.innerHTML = `<p class="alchemy-lab-section-title">Рецепты</p>${state.bag.recipes.map((r, index) => {
      const rows = brewRows(r.ingredients, ingredientById, effectById, isArea(r.base));
      const removed = new Set(r.remove);
      const base = baseById.get(r.base);
      const problem = recipeProblem(r);
      const blocked = problem ?? (checkResult() === null ? "сначала впиши проверку набора" : null);
      return `<div class="alchemy-lab-card">
        <p class="alchemy-lab-card-head"><strong class="alchemy-lab-card-name">«${escapeHtml(r.name)}»</strong><span class="alchemy-lab-card-meta">${base && base.slots ? `${base.name} · ` : ""}${ingredientsLine(r.ingredients)} · Сл варки ${doseDc(rows, removed)}, ${brewMinutesOf(doseDc(rows, removed))} мин</span></p>
        <p class="alchemy-lab-card-effects">${rows.map((row) => effectLine(row, removed.has(row.effect.id), dc())).join("")}</p>
        <p class="alchemy-lab-card-actions">
          <button type="button" class="alchemy-lab-button alchemy-lab-button--primary" data-recipe="${index}" data-act="brew"${blocked ? ` disabled title="${escapeHtml(blocked)}"` : ""}>Сварить</button>
          <button type="button" class="alchemy-lab-button" data-recipe="${index}" data-act="load">В конструктор</button>
          <button type="button" class="alchemy-lab-button alchemy-lab-button--quiet" data-recipe="${index}" data-act="delete">Вычеркнуть</button>
          ${problem ? `<span class="alchemy-lab-actions-hint">${escapeHtml(problem)}</span>` : ""}
        </p>
      </div>`;
    }).join("")}`;
  }

  function renderDoses() {
    const n = state.bag.doses.length;
    if (n === 0) {
      dosesBox.innerHTML = `<p class="alchemy-lab-section-title">Готовые дозы</p><p class="alchemy-lab-empty">Пока пусто — всё, что сваришь, ляжет сюда.</p>`;
      return;
    }
    dosesBox.innerHTML = `<p class="alchemy-lab-section-title">Готовые дозы <span class="alchemy-lab-region-count">${n}</span></p>${state.bag.doses.map((d, index) => {
      const base = baseById.get(d.base);
      return `<div class="alchemy-lab-card alchemy-lab-card--dose">
        <p class="alchemy-lab-card-head"><input type="text" class="alchemy-lab-name alchemy-lab-name--dose" data-dose-name="${index}" value="${escapeHtml(d.name)}" maxlength="60" aria-label="Название дозы"><span class="alchemy-lab-card-meta">${base ? base.name : d.base} · Сл ${d.dc} · ${ingredientsLine(d.ingredients ?? [])}</span></p>
        <p class="alchemy-lab-card-effects">${d.effects.map((e) => effectLine(e, e.removed, d.dc)).join("")}</p>
        <p class="alchemy-lab-card-actions">
          <button type="button" class="alchemy-lab-button alchemy-lab-button--primary" data-dose="${index}" data-act="use">Использовать</button>
          <button type="button" class="alchemy-lab-button alchemy-lab-button--quiet" data-dose="${index}" data-act="drop">Выбросить</button>
        </p>
      </div>`;
    }).join("")}`;
  }

  function renderLog() {
    logBox.innerHTML = `${state.bag.log.length ? `<ul class="alchemy-lab-log">${state.bag.log.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : ""}
      <p class="alchemy-lab-foot"><button type="button" class="alchemy-lab-reset" data-act="reset">Сбросить сумку к начальному запасу</button></p>`;
  }

  function render() {
    const cap = capacity();
    const rows = brewRows(selectedIds(), ingredientById, effectById, isArea());
    const activeIds = new Set(rows.map((r) => r.effect.id));
    for (const id of [...state.removed]) if (!activeIds.has(id)) state.removed.delete(id);

    if (state.bag) renderBag();
    renderPicker(cap);
    renderResult(rows);
    if (state.bag) {
      renderActions(rows);
      renderRecipes();
      renderDoses();
      renderLog();
    }
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
