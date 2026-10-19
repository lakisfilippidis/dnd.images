// Общие куски интерфейса выдачи персонажей: строка «кто играет» и форма
// мастера «выдать персонажа». Пользуются ими блок на странице персонажа
// (character-access.js) и страница мастера «Игры» (games.js). Данные — с
// сервера dice-roller-sync через api() из tg-login.js; модель выдач описана в
// его src/accounts.js: кампания (постоянный владелец) или ваншот (персонаж на
// одну игру, со своим состоянием), игроку или ссылкой-приглашением.

import { api } from "./tg-login.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Индекс персонажей сайта: id → { title, url, image, section } (/characters.json)
let charactersPromise = null;
export function loadCharacters(src) {
  charactersPromise ??= fetch(src).then((r) => r.json()).catch(() => {
    charactersPromise = null;
    return {};
  });
  return charactersPromise;
}

export function inviteUrl(characters, assignment) {
  const c = characters[assignment.characterId];
  return `${location.origin}${c?.url ?? location.pathname}#claim=${assignment.claim}`;
}

function copyButton(text) {
  const button = el("button", "assign-button assign-button--quiet", "Скопировать ссылку");
  button.type = "button";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Скопировано";
    } catch {
      button.textContent = "Не вышло — скопируй вручную";
    }
    setTimeout(() => (button.textContent = "Скопировать ссылку"), 2000);
  });
  return button;
}

// Строка одной выдачи: игрок (или приглашение), кампания/ваншот, для мастера —
// ссылка-приглашение и «Забрать». showCharacter — подписать персонажа (на
// странице «Игры»), иначе он и так понятен.
export function assignmentRow(a, { characters, me, gm, showCharacter = false, onChange }) {
  const row = el("li", "assign-row");
  if (showCharacter) {
    const c = characters[a.characterId];
    const link = el("a", "assign-character", c?.title ?? a.characterId);
    link.href = c?.url ?? "#";
    row.appendChild(link);
  }
  if (a.player) {
    const who = el("span", "assign-player");
    if (a.player.photo) {
      const img = el("img", "assign-avatar");
      img.src = a.player.photo;
      img.alt = "";
      who.appendChild(img);
    }
    who.append(a.player.id === me ? `${a.player.name} — это ты` : a.player.name);
    row.appendChild(who);
  } else {
    row.appendChild(el("span", "assign-player assign-player--invite", "по ссылке-приглашению, пока никто не взял"));
  }
  const kind = a.kind === "campaign" ? "кампания" : a.game ? `ваншот «${a.game.title}»` : "ваншот";
  row.appendChild(el("span", "assign-kind", kind));
  if (gm) {
    const actions = el("span", "assign-actions");
    if (!a.player && a.claim) actions.appendChild(copyButton(inviteUrl(characters, a)));
    const revoke = el("button", "assign-button assign-button--quiet", a.player ? "Забрать" : "Отменить");
    revoke.type = "button";
    revoke.addEventListener("click", async () => {
      if (a.player && !confirm(`Забрать персонажа у ${a.player.name}?`)) return;
      revoke.disabled = true;
      await api(`/assignments/${a.id}`, { method: "DELETE" });
      onChange?.();
    });
    actions.appendChild(revoke);
    row.appendChild(actions);
  }
  return row;
}

// Форма мастера. characterId задан — персонаж фиксирован (страница
// персонажа), иначе выбирается из списка; gameId задан — выдача на эту игру
// (страница «Игры»); kind задан — вид выдачи фиксирован. onDone(assignment) —
// после успешной выдачи.
export function assignForm({ characters, users, games, characterId = null, gameId = null, kind: fixedKind = null, onDone }) {
  const form = el("form", "assign-form");
  const field = (label, control) => {
    const wrap = el("label", "assign-field");
    wrap.append(el("span", "assign-label", label), control);
    form.appendChild(wrap);
    return wrap;
  };

  let characterSelect = null;
  if (!characterId) {
    characterSelect = el("select");
    for (const [id, c] of Object.entries(characters).sort((a, b) => a[1].title.localeCompare(b[1].title, "ru"))) {
      const option = el("option", null, `${c.title}${c.section === "personality" ? " (личность)" : ""}`);
      option.value = id;
      characterSelect.appendChild(option);
    }
    field("Персонаж", characterSelect);
  }

  const playerSelect = el("select");
  const invite = el("option", null, "Ссылкой-приглашением");
  invite.value = "";
  playerSelect.appendChild(invite);
  for (const u of users) {
    const option = el("option", null, u.username ? `${u.name} (@${u.username})` : u.name);
    option.value = String(u.id);
    playerSelect.appendChild(option);
  }
  field("Игрок", playerSelect);

  let kindSelect = null;
  let gameSelect = null;
  let newGame = null;
  if (!gameId && !fixedKind) {
    kindSelect = el("select");
    for (const [value, label] of [["campaign", "В кампанию — персонаж остаётся за игроком"], ["oneshot", "На ваншот — своя копия на одну игру"]]) {
      const option = el("option", null, label);
      option.value = value;
      kindSelect.appendChild(option);
    }
    field("Как", kindSelect);

    gameSelect = el("select");
    const none = el("option", null, "Без игры");
    none.value = "";
    gameSelect.appendChild(none);
    for (const g of games.filter((x) => !x.endedAt)) {
      const option = el("option", null, g.date ? `${g.title}, ${g.date}` : g.title);
      option.value = g.id;
      gameSelect.appendChild(option);
    }
    const create = el("option", null, "Новая игра…");
    create.value = "new";
    gameSelect.appendChild(create);
    const gameField = field("Игра", gameSelect);
    newGame = el("input");
    newGame.type = "text";
    newGame.placeholder = "Название игры";
    newGame.maxLength = 80;
    const newGameField = field("Новая игра", newGame);

    const sync = () => {
      const oneshot = kindSelect.value === "oneshot";
      gameField.hidden = !oneshot;
      newGameField.hidden = !oneshot || gameSelect.value !== "new";
    };
    kindSelect.addEventListener("change", sync);
    gameSelect.addEventListener("change", sync);
    sync();
  }

  const submit = el("button", "assign-button assign-button--primary", "Выдать");
  submit.type = "submit";
  const status = el("p", "assign-status");
  const actions = el("p", "assign-form-actions");
  actions.append(submit);
  form.append(actions, status);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = "";
    try {
      const kind = gameId ? "oneshot" : fixedKind ?? kindSelect.value;
      let game = gameId;
      if (kindSelect && kind === "oneshot") {
        if (gameSelect.value === "new") {
          const title = newGame.value.trim();
          if (!title) {
            status.textContent = "Назови игру";
            return;
          }
          const made = await api("/games", { method: "POST", body: { title } });
          if (made.status !== 201) throw new Error(made.data?.error ?? "игра не создалась");
          game = made.data.game.id;
        } else {
          game = gameSelect.value || null;
        }
      }
      const res = await api("/assignments", {
        method: "POST",
        body: {
          characterId: characterId ?? characterSelect.value,
          kind,
          tgId: playerSelect.value ? Number(playerSelect.value) : null,
          gameId: game,
        },
      });
      if (res.status !== 201) throw new Error(res.data?.error ?? "сервер не ответил");
      const a = res.data.assignment;
      if (!a.player) {
        status.replaceChildren("Ссылка для игрока: ", el("code", null, inviteUrl(characters, a)), " ", copyButton(inviteUrl(characters, a)));
      } else {
        status.textContent = `Выдано: ${a.player.name}`;
      }
      onDone?.(a);
    } catch (err) {
      status.textContent = `Не вышло: ${err.message}`;
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}
