// <initiative-tracker> + <add-to-battle> — self-contained web components for
// running combat on a static RPG site.
//
// Usage:
//   <script type="module" src="init-tracker.js"></script>
//   <initiative-tracker timer-label="30 сек"></initiative-tracker>
//   <add-to-battle name="Волк" ac="13" hp="11" url="/wolf/">В бой</add-to-battle>
//
// The tracker is a fixed corner button (attribute `position`, top-right by
// default) opening a manual popover with the combat table. State lives in
// localStorage (attribute `storage-key`) and syncs across tabs via the
// `storage` event plus a 2s poll; the panel's open state is part of the state.
// Rows carry a <roll-dice compact> chip when that component is defined.
// Theming via --it-* custom properties set on the host (defaults inline).
//
// Non-goals: multiple tracker instances per page; changing storage-key at
// runtime (both read once on connect).

const DEFAULT_KEY = "dnd-init-tracker";

const STRINGS = {
  trackerLabel: "Трекер инициативы",
  round: "Раунд",
  nextTurn: "Следующий ход",
  close: "Закрыть",
  timer: "таймер",
  init: "Иниц.",
  name: "Имя",
  hp: "Хиты",
  ac: "КБ",
  remove: "Убрать",
  openPage: "Открыть страницу",
  add: "Добавить",
  sort: "Сортировать",
  clear: "Очистить",
  confirmClear: "Очистить трекер?",
  empty: "Нет участников",
  defaultName: "Существо",
  addToBattle: "Добавить в бой",
  added: "Добавлено",
};

// Icons from Sergey Chikin's free set (https://sergeychikin.ru/365/):
// 170-weapon/weapon.svg and 190-science/stopwatch.svg.
const WEAPON_ICON = `<svg viewBox="0 0 150 190" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M120.12,145c-6.1,6.36-15.55-.75-13.75-7.35l-10.89-9.13-14,7-2.94-4.74,6.32-6.48-9.25-9.17-8.46,8.49,3.27,5.81C62.19,137.62,51.88,132,51.88,132L41.41,141.2l1.48,3c-9.23,9.08-21-3-12-11.89l2.9,1.33L43,123.06s-5.13-11.38,2.31-18.7L51,107.68l8.92-8.09L35.27,75.19l-1.7-15,15.11.62L74.84,86.06,99.5,63.7l17-2.7L114,76.72l-23.91,24,9.22,8.89,5.31-5.44,4.88,3-6.67,12.69,10,11.91C119.65,130.34,125.77,139.11,120.12,145ZM107.63,76.18l3.21-9.49L101,69.47S60.59,108,56,112.19s2.34,11.87,7.53,6.91S107.63,76.18,107.63,76.18Z"/></svg>`;
const STOPWATCH_ICON = `<svg viewBox="0 0 150 190" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M81.61,71.32,72.29,71V68.11l-4-.83V58.56H86v9.22l-4,.5ZM38.12,78.41l9.76-9,5.53,7.5-8.78,7.79ZM76.66,74.5c48.53,0,48.22,74.14.83,74.14C25.6,148.64,28,74.5,76.66,74.5Zm.63,68.32c39.95,0,40.21-62.5-.7-62.5C35.52,80.32,33.54,142.82,77.29,142.82ZM93.87,93.18,96.32,95s-13.83,18.93-15.15,20.57c-5.64,7-14.7-2.14-7.85-7.78C74.6,106.73,93.87,93.18,93.87,93.18Zm-44,15.6,9.05.46v6l-8.59.61ZM81,128.73l.46,9-7-.46.61-8.58Zm21.37-13.81-8.58-.61v-6l9-.46ZM74.11,95l-.61-8.58,7-.46-.46,9Z"/></svg>`;

// Offsets --it-top / --it-right are the vertical / horizontal distance from
// the corner chosen by the `position` attribute.
const TRACKER_CSS = `
  :host {
    display: contents;
    font-family: inherit;
  }

  .fab {
    position: fixed;
    inset: auto;
    z-index: var(--it-z, 1001);
    width: var(--it-fab-size, 6rem);
    height: var(--it-fab-size, 6rem);
    padding: calc(var(--it-fab-size, 6rem) * 0.13);
    box-sizing: border-box;
    border: 1px solid var(--it-border, #ddd);
    border-radius: 50%;
    background: var(--it-bg, #fff);
    color: var(--it-fg, #1e1e1e);
    box-shadow: var(--it-shadow, 0 0 8px rgb(0 0 0 / 0.2));
    cursor: pointer;
  }
  .fab:hover { box-shadow: var(--it-shadow-strong, 0 0 12px rgb(0 0 0 / 0.3)); }
  .fab svg { width: 100%; height: 100%; display: block; }

  .panel[popover] {
    position: fixed;
    inset: auto;
    width: 50vw;
    min-width: min(24rem, calc(100vw - 2.5rem));
    max-width: calc(100vw - 2.5rem);
    max-height: var(--it-panel-max-height, calc(100dvh - var(--it-top, 1.25rem) - var(--it-fab-size, 6rem) - 3rem));
    overflow-y: auto;
    margin: 0;
    padding: 0;
    border: 1px solid var(--it-border, #ddd);
    border-radius: var(--it-radius, 8px);
    background: var(--it-bg, #fff);
    box-shadow: var(--it-shadow-strong, 0 0 12px rgb(0 0 0 / 0.3));
    color: var(--it-fg, #1e1e1e);
  }

  :host([position="top-right"]) .fab { top: var(--it-top, 1.25rem); right: var(--it-right, 1.25rem); }
  :host([position="top-left"]) .fab { top: var(--it-top, 1.25rem); left: var(--it-right, 1.25rem); }
  :host([position="bottom-right"]) .fab { bottom: var(--it-top, 1.25rem); right: var(--it-right, 1.25rem); }
  :host([position="bottom-left"]) .fab { bottom: var(--it-top, 1.25rem); left: var(--it-right, 1.25rem); }
  :host([position="top-right"]) .panel[popover] { top: calc(var(--it-top, 1.25rem) + var(--it-fab-size, 6rem) + 0.5rem); right: var(--it-right, 1.25rem); }
  :host([position="top-left"]) .panel[popover] { top: calc(var(--it-top, 1.25rem) + var(--it-fab-size, 6rem) + 0.5rem); left: var(--it-right, 1.25rem); }
  :host([position="bottom-right"]) .panel[popover] { bottom: calc(var(--it-top, 1.25rem) + var(--it-fab-size, 6rem) + 0.5rem); right: var(--it-right, 1.25rem); }
  :host([position="bottom-left"]) .panel[popover] { bottom: calc(var(--it-top, 1.25rem) + var(--it-fab-size, 6rem) + 0.5rem); left: var(--it-right, 1.25rem); }

  header,
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
  }
  header { border-bottom: 1px solid var(--it-border, #ddd); }
  footer { border-top: 1px solid var(--it-border, #ddd); }

  .round {
    margin-right: auto;
    font-family: var(--it-heading-font, inherit);
    font-size: 1.1rem;
    color: var(--it-heading-fg, #1e1e1e);
  }

  .btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: inherit;
    font-size: 0.85rem;
    padding: 4px 10px;
    border: 1px solid var(--it-border, #ddd);
    border-radius: var(--it-radius, 8px);
    background: var(--it-btn-bg, #f3f3f3);
    color: var(--it-fg, #1e1e1e);
    cursor: pointer;
  }
  .btn:hover { background: var(--it-btn-hover-bg, #e8e8e8); }
  .btn svg { height: 1.1em; width: auto; }
  .timer-label { min-width: 3em; text-align: center; }

  .close,
  .remove {
    appearance: none;
    border: none;
    background: none;
    padding: 0 4px;
    font: inherit;
    font-size: 1.2rem;
    line-height: 1;
    color: var(--it-muted, #666);
    cursor: pointer;
  }
  .close:hover,
  .remove:hover { color: var(--it-accent, #a00); }

  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    padding: 6px 8px;
    font-size: 0.7rem;
    font-weight: normal;
    text-align: left;
    color: var(--it-muted, #666);
    border-bottom: 1px solid var(--it-border, #ddd);
  }
  td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--it-border, #ddd);
  }
  tr.active {
    background: rgb(from var(--it-accent, #a00) r g b / 0.08);
    box-shadow: inset 3px 0 0 var(--it-accent, #a00);
  }

  input {
    font: inherit;
    color: var(--it-fg, #1e1e1e);
    border: 1px solid transparent;
    border-radius: var(--it-radius-small, 4px);
    background: none;
    padding: 2px 4px;
    box-sizing: border-box;
  }
  input:hover,
  input:focus {
    border-color: var(--it-border, #ddd);
    background: var(--it-bg, #fff);
  }
  input[type="number"] { width: 3.5em; }

  .cell-init { white-space: nowrap; }
  .cell-init roll-dice { font-size: 0.8rem; margin-inline-start: 4px; }
  roll-dice:not(:defined) { display: none; }

  .cell-name { width: 100%; }
  .cell-name input { width: calc(100% - 1.5em); min-width: 6em; }
  .cell-name a { color: var(--it-muted, #666); text-decoration: none; }
  .cell-name a:hover { color: var(--it-fg, #1e1e1e); }

  .cell-hp { white-space: nowrap; }
  .hp-max { font-size: 0.8rem; color: var(--it-muted, #666); }

  .empty {
    text-align: center;
    color: var(--it-muted, #666);
    padding: 16px;
  }

  @media (orientation: portrait) {
    .panel[popover] {
      left: 0;
      right: 0;
      min-width: 0;
      width: 100vw;
      max-width: none;
      border-left: none;
      border-right: none;
      border-radius: 0;
    }
  }
`;

const ADD_CSS = `
  :host { display: block; }
  button {
    appearance: none;
    font: inherit;
    font-size: 0.9rem;
    width: 100%;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid var(--it-border, #ddd);
    border-radius: var(--it-radius, 8px);
    background: var(--it-bg, #fff);
    color: var(--it-fg, #1e1e1e);
    box-shadow: var(--it-shadow, 0 0 8px rgb(0 0 0 / 0.2));
    cursor: pointer;
  }
  button:hover:not(:disabled) { box-shadow: var(--it-shadow-strong, 0 0 12px rgb(0 0 0 / 0.3)); }
  button:disabled { color: var(--it-muted, #666); cursor: default; }
  button.done slot { display: none; }
  .feedback { display: none; }
  button.done .feedback { display: inline; }
`;

// ---------------------------------------------------------------------------
// Pure state helpers (exported for <add-to-battle>'s fallback path and tests)
// ---------------------------------------------------------------------------

export function defaultState() {
  return { v: 1, open: false, round: 1, activeId: null, combatants: [], updatedAt: 0 };
}

export function loadState(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (s && Array.isArray(s.combatants)) return s;
  } catch {
    /* storage unavailable or corrupt */
  }
  return defaultState();
}

// Persists the state and returns its serialized form (null if storage failed).
export function saveState(key, state) {
  state.updatedAt = Date.now();
  const raw = JSON.stringify(state);
  try {
    localStorage.setItem(key, raw);
  } catch {
    return null;
  }
  return raw;
}

export function addCombatant(state, { name, init = null, hp = null, hpMax = null, ac = null, url = null }) {
  const base = (name || STRINGS.defaultName).replace(/ \d+$/, "");
  const taken = state.combatants.filter((c) => c.name.replace(/ \d+$/, "") === base).length;
  const finalName = taken ? `${base} ${taken + 1}` : name || STRINGS.defaultName;
  const id = Math.random().toString(36).slice(2, 8);
  state.combatants.push({ id, name: finalName, init, hp, hpMax, ac, url });
  return state.combatants[state.combatants.length - 1];
}

export function nextTurn(state) {
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
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------------------------------------------------------------------------
// <initiative-tracker>
// ---------------------------------------------------------------------------

export class InitiativeTracker extends HTMLElement {
  get storageKey() {
    return this.getAttribute("storage-key") ?? DEFAULT_KEY;
  }

  get timerSeconds() {
    const n = parseInt(this.getAttribute("timer-seconds"), 10);
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  get timerLabel() {
    return this.getAttribute("timer-label") ?? STRINGS.timer;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this._root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = TRACKER_CSS;
      this._root.appendChild(style);

      this._fab = el("button", "fab");
      this._fab.type = "button";
      this._fab.setAttribute("popovertarget", "panel");
      this._fab.setAttribute("aria-label", STRINGS.trackerLabel);
      this._fab.innerHTML = WEAPON_ICON;

      this._panel = el("div", "panel");
      this._panel.id = "panel";
      this._panel.setAttribute("popover", "manual");

      const header = el("header");
      const round = el("span", "round");
      round.append(document.createTextNode(STRINGS.round + " "));
      this._round = el("b", null, "1");
      round.appendChild(this._round);

      const timerBtn = el("button", "btn");
      timerBtn.type = "button";
      timerBtn.dataset.action = "timer";
      timerBtn.innerHTML = STOPWATCH_ICON;
      this._timerLabel = el("span", "timer-label", this.timerLabel);
      timerBtn.appendChild(this._timerLabel);

      const nextBtn = el("button", "btn", STRINGS.nextTurn);
      nextBtn.type = "button";
      nextBtn.dataset.action = "next";

      const closeBtn = el("button", "close", "×");
      closeBtn.type = "button";
      closeBtn.setAttribute("popovertarget", "panel");
      closeBtn.setAttribute("popovertargetaction", "hide");
      closeBtn.setAttribute("aria-label", STRINGS.close);
      header.append(round, timerBtn, nextBtn, closeBtn);

      const table = el("table");
      const thead = el("thead");
      const headRow = el("tr");
      for (const label of [STRINGS.init, STRINGS.name, STRINGS.hp, STRINGS.ac, ""])
        headRow.appendChild(el("th", null, label));
      thead.appendChild(headRow);
      this._tbody = el("tbody");
      table.append(thead, this._tbody);

      const footer = el("footer");
      for (const [action, label] of [["add", STRINGS.add], ["sort", STRINGS.sort], ["clear", STRINGS.clear]]) {
        const btn = el("button", "btn", label);
        btn.type = "button";
        btn.dataset.action = action;
        footer.appendChild(btn);
      }

      this._panel.append(header, table, footer);
      this._root.append(this._fab, this._panel);

      this._panel.addEventListener("click", (e) => this._onAction(e));
      this._panel.addEventListener("change", (e) => this._onFieldChange(e));
      this._panel.addEventListener("focusout", () => {
        if (!this._dirty) return;
        this._dirty = false;
        this._render();
      });
      this._panel.addEventListener("toggle", (e) => {
        const open = e.newState === "open";
        if (open === this._state.open) return;
        this._state.open = open;
        this._save();
      });

      this._timerId = null;
      this._onStorage = (e) => {
        if (e.key === this.storageKey) this._refreshFromStorage();
      };
      this._onKeydown = (e) => {
        if (e.key === "Escape" && this._panel.matches(":popover-open")) this._panel.hidePopover();
      };
      this._refresh = () => this._refreshFromStorage();
    }

    if (!this.hasAttribute("position")) this.setAttribute("position", "top-right");
    this._state = loadState(this.storageKey);
    this._lastRaw = JSON.stringify(this._state);
    this._dirty = false;
    window.addEventListener("storage", this._onStorage);
    document.addEventListener("keydown", this._onKeydown);
    this._pollId = setInterval(this._refresh, 2000);
    queueMicrotask(() => this._render());
  }

  disconnectedCallback() {
    window.removeEventListener("storage", this._onStorage);
    document.removeEventListener("keydown", this._onKeydown);
    clearInterval(this._pollId);
    this._stopTimer();
  }

  // Public API: add a combatant ({name, init, hp, hpMax, ac, url}).
  add(data) {
    addCombatant(this._state, data);
    this._save();
  }

  _save() {
    this._lastRaw = saveState(this.storageKey, this._state) ?? JSON.stringify(this._state);
    this._render();
  }

  _refreshFromStorage() {
    let raw = null;
    try {
      raw = localStorage.getItem(this.storageKey);
    } catch {
      return;
    }
    if (raw === this._lastRaw) return;
    this._lastRaw = raw;
    this._state = loadState(this.storageKey);
    // не затирать активный ввод: дорендерим после потери фокуса
    if (this.shadowRoot.activeElement !== null) {
      this._dirty = true;
      return;
    }
    this._render();
  }

  _render() {
    const isOpen = this._panel.matches(":popover-open");
    try {
      if (this._state.open && !isOpen) this._panel.showPopover();
      else if (!this._state.open && isOpen) this._panel.hidePopover();
    } catch {
      /* not connected yet */
    }
    this._round.textContent = this._state.round;

    if (!this._state.combatants.length) {
      this._tbody.innerHTML = `<tr><td class="empty" colspan="5">${STRINGS.empty}</td></tr>`;
      return;
    }
    const numOrEmpty = (v) => v ?? "";
    this._tbody.innerHTML = this._state.combatants
      .map((c) => {
        const active = c.id === this._state.activeId ? ' class="active"' : "";
        const link = c.url ? `<a href="${esc(c.url)}" title="${STRINGS.openPage}">&#8599;</a>` : "";
        const max = c.hpMax != null ? `<span class="hp-max">/ ${c.hpMax}</span>` : "";
        return `<tr${active} data-id="${c.id}">
          <td class="cell-init"><input type="number" data-field="init" value="${numOrEmpty(c.init)}"><roll-dice compact>1d20</roll-dice></td>
          <td class="cell-name"><input type="text" data-field="name" value="${esc(c.name)}">${link}</td>
          <td class="cell-hp"><input type="number" data-field="hp" value="${numOrEmpty(c.hp)}">${max}</td>
          <td><input type="number" data-field="ac" value="${numOrEmpty(c.ac)}"></td>
          <td><button type="button" class="remove" data-action="remove" aria-label="${STRINGS.remove}">&times;</button></td>
        </tr>`;
      })
      .join("");
    // Слушатель на самом элементе: реролл в оверлее стреляет с уже
    // отсоединённого узла (после перерисовки) и до делегата бы не дошёл
    for (const chip of this._tbody.querySelectorAll("roll-dice")) {
      const id = chip.closest("[data-id]").dataset.id;
      chip.addEventListener("roll", (e) => {
        const c = this._state.combatants.find((x) => x.id === id);
        if (!c) return;
        c.init = e.detail.total;
        this._save();
      });
    }
  }

  _onAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "timer") {
      if (this._timerId) this._stopTimer();
      else this._startTimer();
    } else if (action === "next") {
      nextTurn(this._state);
      this._save();
    } else if (action === "add") {
      this.add({ name: STRINGS.defaultName });
    } else if (action === "sort") {
      this._state.combatants.sort((a, b) => (b.init ?? -Infinity) - (a.init ?? -Infinity));
      this._save();
    } else if (action === "clear") {
      if (this._state.combatants.length && !confirm(STRINGS.confirmClear)) return;
      this._state = { ...defaultState(), open: this._state.open };
      this._save();
    } else if (action === "remove") {
      const id = btn.closest("[data-id]")?.dataset.id;
      this._state.combatants = this._state.combatants.filter((c) => c.id !== id);
      if (this._state.activeId === id) this._state.activeId = null;
      this._save();
    }
  }

  _onFieldChange(e) {
    const input = e.target.closest("[data-field]");
    if (!input) return;
    const id = input.closest("[data-id]")?.dataset.id;
    const c = this._state.combatants.find((x) => x.id === id);
    if (!c) return;
    if (input.dataset.field === "name") {
      c.name = input.value.trim() || c.name;
    } else {
      const n = input.valueAsNumber;
      c[input.dataset.field] = Number.isFinite(n) ? n : null;
    }
    this._save();
  }

  _startTimer() {
    let left = this.timerSeconds;
    this._timerLabel.textContent = left;
    this._timerId = setInterval(() => {
      left -= 1;
      if (left > 0) {
        this._timerLabel.textContent = left;
        return;
      }
      this._stopTimer();
      nextTurn(this._state);
      this._save();
    }, 1000);
  }

  _stopTimer() {
    clearInterval(this._timerId);
    this._timerId = null;
    if (this._timerLabel) this._timerLabel.textContent = this.timerLabel;
  }
}

// ---------------------------------------------------------------------------
// <add-to-battle> — a button that feeds its attributes to the page's tracker
// ---------------------------------------------------------------------------

export class AddToBattle extends HTMLElement {
  get storageKey() {
    return this.getAttribute("storage-key") ?? DEFAULT_KEY;
  }

  connectedCallback() {
    if (this.shadowRoot) return;
    this._root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ADD_CSS;
    this._btn = el("button");
    this._btn.type = "button";
    const slot = document.createElement("slot");
    slot.textContent = STRINGS.addToBattle;
    this._btn.append(slot, el("span", "feedback", STRINGS.added));
    this._btn.addEventListener("click", () => this._add());
    this._root.append(style, this._btn);
  }

  _add() {
    const hp = parseInt(this.getAttribute("hp"), 10) || null;
    const data = {
      name: this.getAttribute("name"),
      hp,
      hpMax: hp,
      ac: parseInt(this.getAttribute("ac"), 10) || null,
      url: this.getAttribute("url") ?? null,
    };
    const tracker = document.querySelector("initiative-tracker");
    if (tracker && typeof tracker.add === "function") {
      tracker.add(data);
    } else {
      const state = loadState(this.storageKey);
      addCombatant(state, data);
      saveState(this.storageKey, state);
    }
    this._btn.disabled = true;
    this._btn.classList.add("done");
    setTimeout(() => {
      this._btn.disabled = false;
      this._btn.classList.remove("done");
    }, 1500);
  }
}

if (typeof customElements !== "undefined") {
  if (!customElements.get("initiative-tracker")) customElements.define("initiative-tracker", InitiativeTracker);
  if (!customElements.get("add-to-battle")) customElements.define("add-to-battle", AddToBattle);
}
