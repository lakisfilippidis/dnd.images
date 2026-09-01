// Трекер шкалы Тени и Куража: открывается кнопкой в диалоге, как конструктор дозы.
// Шкала идёт от Тени 3 через 0 к Куражу 3; в бою она двигается шагами, а траты
// (Исчезнуть, Контрудар и черты со стороной) сдвигают её на шаг к центру.
// Данные приходят из шорткода scaleTracker (eleventy.config.js) в атрибуте
// data-scale (JSON в base64 — markdown-типограф не трогает кавычки внутри script).
//
// Состояние живёт в localStorage под ключом dnd-scale-<id>: у каждого персонажа
// свой, чтобы шкала Сурена не путалась со шкалой Ширин. Хранится только позиция
// и журнал — всё остальное считается из данных.

const MAX = 3; // Тень 3 ... 0 ... Кураж 3
const LOG_LIMIT = 8;

// position: −3..0..+3, отрицательное — Тень, положительное — Кураж
function label(pos) {
  if (pos === 0) return "0";
  return `${pos < 0 ? "Тень" : "Кураж"} ${Math.abs(pos)}`;
}

function storageKey(id) {
  return `dnd-scale-${id}`;
}

function load(id) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const data = JSON.parse(raw);
    const pos = Number(data.position);
    if (!Number.isInteger(pos) || Math.abs(pos) > MAX) return null;
    return { position: pos, log: Array.isArray(data.log) ? data.log.slice(0, LOG_LIMIT) : [] };
  } catch {
    return null; // приватное окно, закрытые куки, испорченный JSON — начинаем с нуля
  }
}

function save(id, state) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify({ position: state.position, log: state.log }));
  } catch {
    // Хранилище недоступно — трекер продолжает работать, просто не переживёт перезагрузку
  }
}

function initTracker(root) {
  const bytes = Uint8Array.from(atob(root.dataset.scale), (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  const options = data.options ?? {};
  const id = options.id ?? location.pathname;
  const sideTitle = Object.fromEntries(data.sides.map((s) => [s.id, s.title]));

  const saved = load(id);
  const state = {
    position: saved?.position ?? 0,
    log: saved?.log ?? [],
  };

  root.innerHTML = "";
  root.classList.add("scale-tracker--ready");

  const head = document.createElement("div");
  head.className = "alchemy-lab-head";
  head.innerHTML = `<p class="alchemy-lab-title">Тень и Кураж${options.name ? ` — ${options.name}` : ""}</p><button type="button" class="alchemy-lab-close" aria-label="Закрыть">Закрыть</button>`;
  root.append(head);
  head.querySelector(".alchemy-lab-close").addEventListener("click", () => root.closest("dialog")?.close());

  const body = document.createElement("div");
  body.className = "scale-tracker-body";
  root.append(body);

  function note(text) {
    state.log.unshift(text);
    state.log = state.log.slice(0, LOG_LIMIT);
  }

  // Шаг к своей стороне; с противоположной — сначала к центру
  function step(dir, why) {
    const next = Math.max(-MAX, Math.min(MAX, state.position + dir));
    if (next === state.position) return;
    state.position = next;
    note(`${why} → ${label(next)}`);
    save(id, state);
    render();
  }

  // Трата: шаг к центру, только со своей стороны
  function spend(side, why) {
    const dir = side === "shadow" ? 1 : -1;
    const own = side === "shadow" ? state.position < 0 : state.position > 0;
    if (!own) return;
    state.position += dir;
    note(`${why} → ${label(state.position)}`);
    save(id, state);
    render();
  }

  function reset() {
    state.position = 0;
    state.log = [];
    save(id, state);
    render();
  }

  body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const act = button.dataset.act;
    if (act === "shadow") step(-1, "Шаг к Тени");
    else if (act === "panache") step(1, "Шаг к Куражу");
    else if (act === "vanish") spend("shadow", "Исчезнуть");
    else if (act === "riposte") spend("panache", "Контрудар");
    else if (act === "reset") reset();
    else if (act === "set") {
      state.position = Number(button.dataset.value);
      note(`Поставлено вручную → ${label(state.position)}`);
      save(id, state);
      render();
    }
  });

  function render() {
    const pos = state.position;
    const side = pos < 0 ? "shadow" : pos > 0 ? "panache" : null;
    const atThreshold = Math.abs(pos) >= 2;

    // Деления от Тени 3 до Куража 3
    const marks = [];
    for (let v = -MAX; v <= MAX; v++) {
      const on = v === pos;
      const cls = v < 0 ? "shadow" : v > 0 ? "panache" : "zero";
      marks.push(`<button type="button" class="scale-tracker-mark scale-tracker-mark--${cls}${on ? " is-on" : ""}" data-act="set" data-value="${v}" title="${label(v)}" aria-pressed="${on}">${v === 0 ? "0" : Math.abs(v)}</button>`);
    }

    const threshold = !atThreshold
      ? `<p class="scale-tracker-threshold">До порога ${pos === 0 ? "два шага в любую сторону" : `${2 - Math.abs(pos)} шаг`}.</p>`
      : side === "shadow"
        ? `<p class="scale-tracker-threshold is-on"><strong>Тень 2.</strong> Скрытая атака без условий по цели, которая тебя не видит.</p>`
        : `<p class="scale-tracker-threshold is-on"><strong>Кураж 2.</strong> Скрытая атака без условий по цели в 5 футах, которая тебя видит, если рядом с тобой нет других существ.</p>`;

    // Черты стороны, на которой сейчас шкала: им есть что тратить
    const own = data.feats.filter((f) => f.side === side);
    const featList = side && own.length
      ? `<p class="scale-tracker-feats">Работают на ${sideTitle[side]}: ${own.map((f) => `<a href="${data.href}#feat-${f.id}">${f.name}</a>`).join(", ")}</p>`
      : "";

    const canVanish = pos < 0;
    const canRiposte = pos > 0;

    body.innerHTML = `
      <p class="scale-tracker-value scale-tracker-value--${side ?? "zero"}">${label(pos)}</p>
      <div class="scale-tracker-marks">${marks.join("")}</div>
      ${threshold}
      <div class="scale-tracker-actions">
        <button type="button" class="scale-tracker-button" data-act="shadow">Шаг к Тени</button>
        <button type="button" class="scale-tracker-button" data-act="panache">Шаг к Куражу</button>
      </div>
      <p class="scale-tracker-hint">В конце хода: шаг к Тени, если тебя не видел ни один противник, или к Куражу, если ты действовал на виду.</p>
      <div class="scale-tracker-actions">
        <button type="button" class="scale-tracker-button scale-tracker-button--spend" data-act="vanish"${canVanish ? "" : " disabled"} title="Бонусным действием ты скрыт до начала своего следующего хода">Исчезнуть (шаг Тени)</button>
        <button type="button" class="scale-tracker-button scale-tracker-button--spend" data-act="riposte"${canRiposte ? "" : " disabled"} title="Реакцией атаковать промахнувшегося по тебе в 5 футах">Контрудар (шаг Куража)</button>
      </div>
      ${featList}
      ${state.log.length ? `<ul class="scale-tracker-log">${state.log.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
      <p class="scale-tracker-foot"><button type="button" class="scale-tracker-reset" data-act="reset">Длинный отдых — сбросить в 0</button></p>
    `;
  }

  render();
}

// Диалог собирается при первом открытии — на странице может быть только кнопка
for (const button of document.querySelectorAll(".scale-tracker-open")) {
  const dialog = button.parentElement.nextElementSibling;
  if (!(dialog instanceof HTMLDialogElement)) continue;
  button.addEventListener("click", () => {
    const root = dialog.querySelector(".scale-tracker");
    if (root && !root.classList.contains("scale-tracker--ready")) initTracker(root);
    dialog.showModal();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
