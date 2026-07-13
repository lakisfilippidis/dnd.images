const KEY = "dnd-init-tracker";
const tracker = document.getElementById("init-tracker");
const tbody = tracker.querySelector("[data-rows]");
const roundEl = tracker.querySelector("[data-round]");

let state = load();
let lastRaw = JSON.stringify(state);
let dirty = false;

function defaultState() {
  return { v: 1, open: false, round: 1, activeId: null, combatants: [], updatedAt: 0 };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.combatants)) return s;
  } catch {}
  return defaultState();
}

function save() {
  state.updatedAt = Date.now();
  lastRaw = JSON.stringify(state);
  localStorage.setItem(KEY, lastRaw);
  render();
}

function refreshFromStorage() {
  const raw = localStorage.getItem(KEY);
  if (raw === lastRaw) return;
  lastRaw = raw;
  state = load();
  // не затирать активный ввод: дорендерим после потери фокуса
  if (tracker.contains(document.activeElement)) {
    dirty = true;
    return;
  }
  render();
}

function newId() {
  return Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function numOrEmpty(v) {
  return v ?? "";
}

function render() {
  const isOpen = tracker.matches(":popover-open");
  if (state.open && !isOpen) tracker.showPopover();
  else if (!state.open && isOpen) tracker.hidePopover();
  roundEl.textContent = state.round;
  if (!state.combatants.length) {
    tbody.innerHTML = '<tr><td class="init-empty" colspan="5">Нет участников</td></tr>';
    return;
  }
  tbody.innerHTML = state.combatants
    .map((c) => {
      const active = c.id === state.activeId ? " active" : "";
      const link = c.url ? `<a href="${esc(c.url)}" title="Открыть страницу">&#8599;</a>` : "";
      const max = c.hpMax != null ? `<span class="init-hpmax">/ ${c.hpMax}</span>` : "";
      return `<tr class="init-row${active}" data-id="${c.id}">
        <td class="init-cell"><input type="number" data-field="init" value="${numOrEmpty(c.init)}"><roll-dice compact class="init-roll">1d20</roll-dice></td>
        <td class="init-name"><input type="text" data-field="name" value="${esc(c.name)}">${link}</td>
        <td class="init-hp"><input type="number" data-field="hp" value="${numOrEmpty(c.hp)}">${max}</td>
        <td><input type="number" data-field="ac" value="${numOrEmpty(c.ac)}"></td>
        <td><button type="button" class="init-remove" data-action="remove" aria-label="Убрать">&times;</button></td>
      </tr>`;
    })
    .join("");
  // Слушатель на самом элементе: реролл в оверлее стреляет с уже
  // отсоединённого узла (после перерисовки) и до делегата бы не дошёл
  for (const el of tbody.querySelectorAll(".init-roll")) {
    const id = el.closest("[data-id]").dataset.id;
    el.addEventListener("roll", (e) => {
      const c = state.combatants.find((x) => x.id === id);
      if (!c) return;
      c.init = e.detail.total;
      save();
    });
  }
}

function addCombatant({ name, init = null, hp = null, hpMax = null, ac = null, url = null }) {
  const base = (name || "Существо").replace(/ \d+$/, "");
  const taken = state.combatants.filter((c) => c.name.replace(/ \d+$/, "") === base).length;
  const finalName = taken ? `${base} ${taken + 1}` : name || "Существо";
  state.combatants.push({ id: newId(), name: finalName, init, hp, hpMax, ac, url });
  save();
}

function nextTurn() {
  const list = state.combatants;
  if (!list.length) return;
  const idx = list.findIndex((c) => c.id === state.activeId);
  if (idx === -1) {
    state.activeId = list[0].id;
  } else if (idx === list.length - 1) {
    state.activeId = list[0].id;
    state.round += 1;
  } else {
    state.activeId = list[idx + 1].id;
  }
  save();
}

const timerLabel = tracker.querySelector("[data-timer-label]");
let timerId = null;

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  timerLabel.textContent = "заебал";
}

function startTimer() {
  let left = 30;
  timerLabel.textContent = left;
  timerId = setInterval(() => {
    left -= 1;
    if (left > 0) {
      timerLabel.textContent = left;
      return;
    }
    stopTimer();
    nextTurn();
  }, 1000);
}

tracker.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "timer") (timerId ? stopTimer : startTimer)();
  else if (action === "next") nextTurn();
  else if (action === "add") addCombatant({ name: "Существо" });
  else if (action === "sort") {
    state.combatants.sort((a, b) => (b.init ?? -Infinity) - (a.init ?? -Infinity));
    save();
  } else if (action === "clear") {
    if (state.combatants.length && !confirm("Очистить трекер?")) return;
    state = { ...defaultState(), open: state.open };
    save();
  } else if (action === "remove") {
    const id = btn.closest("[data-id]")?.dataset.id;
    state.combatants = state.combatants.filter((c) => c.id !== id);
    if (state.activeId === id) state.activeId = null;
    save();
  }
});

tracker.addEventListener("change", (e) => {
  const input = e.target.closest("[data-field]");
  if (!input) return;
  const id = input.closest("[data-id]")?.dataset.id;
  const c = state.combatants.find((x) => x.id === id);
  if (!c) return;
  if (input.dataset.field === "name") {
    c.name = input.value.trim() || c.name;
  } else {
    const n = input.valueAsNumber;
    c[input.dataset.field] = Number.isFinite(n) ? n : null;
  }
  save();
});

tracker.addEventListener("focusout", () => {
  if (!dirty) return;
  dirty = false;
  render();
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".add-to-battle");
  if (!btn) return;
  const d = btn.dataset;
  addCombatant({
    name: d.name,
    hp: parseInt(d.hp, 10) || null,
    hpMax: parseInt(d.hp, 10) || null,
    ac: parseInt(d.ac, 10) || null,
    url: d.url || null,
  });
  const label = btn.textContent;
  btn.textContent = "Добавлено";
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = label;
    btn.disabled = false;
  }, 1500);
});

tracker.addEventListener("toggle", (e) => {
  const open = e.newState === "open";
  if (open === state.open) return;
  state.open = open;
  save();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && tracker.matches(":popover-open")) tracker.hidePopover();
});

window.addEventListener("storage", (e) => {
  if (e.key === KEY) refreshFromStorage();
});
setInterval(refreshFromStorage, 2000);

render();
