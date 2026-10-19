// <tg-login> — "log in with Telegram": who the player is and which
// characters they play.
//
// Usage:
//   <script type="module" src="tg-login.js"></script>
//   <tg-login bot-id="1234567890" server="https://…" characters="/characters.json"
//             games="/Games/"></tg-login>
//
// Flow: click opens Telegram's OAuth popup (widget JS is loaded lazily). With
// `server` set, the popup's signed answer goes to the dice-roller-sync server
// (POST /auth/telegram), which checks Telegram's signature and returns a
// session token and the role (player / gm). Without a server, or when it is
// down, the unverified profile is kept as before — it only labels things on
// the player's own device. The login lives in localStorage (attribute
// `storage-key`), synced across tabs via the `storage` event.
//
// Clicking the name opens a menu: the player's characters (GET /me, titles
// and links from the `characters` JSON that Eleventy builds), for the game
// master a link to the `games` page, and logout. An invite link
// (#claim=<code>, made by the GM on a character page) is taken after login.
//
// For other scripts: currentUser() (profile + token + role), api(path, opts)
// (fetch to the server with the session; a 401 logs out), the
// `tg-auth-change` event on window, and `tg-assignments-change` after an
// invite is taken or the GM changes assignments. Renders nothing until
// `bot-id` is set. Theming via --tg-* custom properties.

const DEFAULT_KEY = "dnd-tg-user";
const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

const STRINGS = {
  login: "Войти",
  loginTitle: "Войти через Телеграм",
  logout: "Выйти",
  error: "Не вышло",
  menu: "Мои персонажи",
  none: "Пока никого — мастер выдаст персонажа",
  games: "Игры и выдача персонажей",
  claimed: "Персонаж теперь твой",
  claimFailed: "Приглашение уже занято или устарело",
  oneshot: "ваншот",
};
const CLAIM_KEY = "dnd-tg-claim";

// Paper plane in the spirit of the Telegram logo, drawn to currentColor.
const PLANE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.7 3.1 2.9 10.4c-1 .4-1 1.4-.2 1.7l4.6 1.5 1.8 5.6c.2.7 1 .9 1.5.4l2.6-2.5 4.7 3.5c.6.4 1.4.1 1.6-.6l3-15.6c.2-1-.5-1.6-1.8-1.3ZM9.9 14.3l8.7-7.9c.3-.3-.1-.4-.5-.2L7.4 12.9l2.5 1.4Z"/></svg>`;

const CSS = `
  /* Хост и обе обёртки выравнивают контент по baseline: базовая линия
     текста прорастает наружу, и в шапке (align-items: baseline) логин
     встаёт в строку с пунктами меню. Картинки без своей базовой линии
     (иконка, аватарка) опускаются чуть ниже неё трансформом. */
  :host {
    display: inline-flex;
    align-items: baseline;
    font-family: inherit;
  }

  button {
    appearance: none;
    display: inline-flex;
    align-items: baseline;
    gap: 0.4em;
    font: inherit;
    line-height: normal;
    padding: 0;
    border: none;
    background: none;
    color: var(--tg-fg, #1e1e1e);
    cursor: pointer;
  }
  button:hover { color: var(--tg-accent, #a00); }
  button:disabled { color: var(--tg-muted, #666); cursor: default; }
  button svg { width: 1.1em; height: 1.1em; align-self: center; transform: translateY(0.1em); }

  .who {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4em;
    color: var(--tg-fg, #1e1e1e);
  }
  .avatar {
    width: 1.5em;
    height: 1.5em;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--tg-border, #ddd);
    align-self: center;
    transform: translateY(0.1em);
  }
  .initial {
    width: 1.5em;
    height: 1.5em;
    border-radius: 50%;
    border: 1px solid var(--tg-border, #ddd);
    font-size: 0.8em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--tg-muted, #666);
    align-self: center;
    transform: translateY(0.1em);
  }

  :host { position: relative; }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    min-width: 15em;
    max-width: min(22em, calc(100vw - 32px));
    padding: 0.4em 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    background: var(--tg-bg, #fff);
    border: 1px solid var(--tg-border, #ddd);
    border-radius: 8px;
    box-shadow: var(--tg-shadow, 0 4px 16px rgb(0 0 0 / 0.15));
    font-size: 0.95em;
  }
  .menu[hidden] { display: none; }
  .menu-title {
    padding: 0.2em 0.9em 0.3em;
    font-size: 0.85em;
    color: var(--tg-muted, #666);
  }
  .menu a, .menu button {
    display: flex;
    align-items: center;
    gap: 0.6em;
    padding: 0.35em 0.9em;
    color: var(--tg-fg, #1e1e1e);
    text-decoration: none;
    text-align: left;
  }
  .menu a:hover, .menu button:hover { color: var(--tg-accent, #a00); background: var(--tg-hover, rgb(0 0 0 / 0.04)); }
  .menu img { width: 2em; height: 2em; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
  .menu .tag { margin-left: auto; font-size: 0.8em; color: var(--tg-muted, #666); }
  .menu .empty { padding: 0.2em 0.9em 0.4em; color: var(--tg-muted, #666); font-size: 0.9em; }
  .menu hr { width: 100%; margin: 0.35em 0; border: none; border-top: 1px solid var(--tg-border, #ddd); }
  .notice {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 21;
    padding: 0.4em 0.8em;
    white-space: nowrap;
    background: var(--tg-bg, #fff);
    border: 1px solid var(--tg-border, #ddd);
    border-radius: 8px;
    box-shadow: var(--tg-shadow, 0 4px 16px rgb(0 0 0 / 0.15));
  }
`;

function readLogin(key = DEFAULT_KEY) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    return s?.user?.id ? s : null;
  } catch {
    return null;
  }
}

// The profile ({ id, first_name, … }) plus `token` and `role` when the server
// verified the login; null when nobody is logged in.
export function currentUser(key = DEFAULT_KEY) {
  const s = readLogin(key);
  return s ? { ...s.user, token: s.token ?? null, role: s.role ?? null, server: s.server ?? null } : null;
}

function writeLogin(record, key = DEFAULT_KEY) {
  try {
    if (record) localStorage.setItem(key, JSON.stringify(record));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent("tg-auth-change", { detail: { user: record ? currentUser(key) : null } }));
}

// fetch() to the account server with the session token. Resolves
// { status, data }; status 0 when there is no session or the network failed.
// A 401 means the session is gone (expired, secret rotated): log out.
export async function api(path, { method = "GET", body, key = DEFAULT_KEY } = {}) {
  const s = readLogin(key);
  if (!s?.token || !s.server) return { status: 0, data: null };
  try {
    const res = await fetch(s.server + path, {
      method,
      headers: { Authorization: `Bearer ${s.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) writeLogin(null, key);
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

let widgetPromise = null;
function loadWidget() {
  if (window.Telegram?.Login) return Promise.resolve();
  widgetPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.onload = resolve;
    script.onerror = () => {
      widgetPromise = null;
      reject(new Error("widget load failed"));
    };
    document.head.appendChild(script);
  });
  return widgetPromise;
}

export class TgLogin extends HTMLElement {
  get storageKey() {
    return this.getAttribute("storage-key") ?? DEFAULT_KEY;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this._root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = CSS;
      this._box = document.createElement("span");
      this._root.append(style, this._box);
      this._box.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (btn?.dataset.action === "login") this._login();
        if (btn?.dataset.action === "logout") this._logout();
        if (btn?.dataset.action === "menu") this._toggleMenu();
      });
      this._onStorage = (e) => {
        if (e.key === this.storageKey) this._refresh();
      };
      this._onOutside = (e) => {
        if (!e.composedPath().includes(this)) this._toggleMenu(false);
      };
      this._onAssignments = () => this._refresh();
    }
    window.addEventListener("storage", this._onStorage);
    window.addEventListener("tg-assignments-change", this._onAssignments);
    document.addEventListener("pointerdown", this._onOutside);
    this._render();
    this._refresh();
    this._takeClaim();
  }

  disconnectedCallback() {
    window.removeEventListener("storage", this._onStorage);
    window.removeEventListener("tg-assignments-change", this._onAssignments);
    document.removeEventListener("pointerdown", this._onOutside);
  }

  async _login() {
    const botId = this.getAttribute("bot-id");
    const btn = this._box.querySelector("button");
    btn.disabled = true;
    try {
      await loadWidget();
      const tgUser = await new Promise((resolve) => {
        window.Telegram.Login.auth({ bot_id: botId, request_access: false }, resolve);
      });
      if (!tgUser) return; // окно закрыли или отказали — не ошибка
      const { id, first_name, last_name, username, photo_url } = tgUser;
      const user = { id, first_name, last_name, username, photo_url };
      const record = { v: 2, user, at: Date.now() };
      const server = this.getAttribute("server");
      if (server) {
        // Подпись Телеграма проверяет сервер; 401 — подделка или чужой бот.
        // Сервер недоступен — входим как раньше, без сессии.
        try {
          const res = await fetch(`${server}/auth/telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tgUser),
          });
          if (res.status === 401) throw new Error("bad signature");
          if (res.ok) {
            const data = await res.json();
            Object.assign(record, { token: data.token, role: data.user.role, server });
          }
        } catch (err) {
          if (err.message === "bad signature") throw err;
        }
      }
      writeLogin(record, this.storageKey);
    } catch {
      btn.querySelector("span")?.replaceChildren(STRINGS.error);
      setTimeout(() => this._render(), 2000);
      return;
    } finally {
      btn.disabled = false;
    }
    this._render();
    await this._refresh();
    this._takeClaim();
  }

  _logout() {
    this._assignments = [];
    this._toggleMenu(false);
    writeLogin(null, this.storageKey);
    this._render();
  }

  // Мои персонажи и роль — с сервера; без сессии список пуст
  async _refresh() {
    const user = currentUser(this.storageKey);
    if (!user?.token) {
      this._assignments = [];
      this._render();
      return;
    }
    const [me, characters] = await Promise.all([api("/me", { key: this.storageKey }), this._characters()]);
    if (me.status === 200) {
      this._assignments = me.data.assignments;
      if (me.data.user.role !== user.role) {
        const s = readLogin(this.storageKey);
        writeLogin({ ...s, role: me.data.user.role }, this.storageKey);
      }
    }
    this._characterIndex = characters;
    this._render();
  }

  async _characters() {
    const src = this.getAttribute("characters");
    if (!src) return {};
    this._charactersPromise ??= fetch(src).then((r) => r.json()).catch(() => {
      this._charactersPromise = null;
      return {};
    });
    return this._charactersPromise;
  }

  // Приглашение #claim=<код>: берём сразу, если вошли с сессией, иначе
  // запоминаем до входа
  async _takeClaim() {
    const match = location.hash.match(/^#claim=([a-z0-9]+)$/);
    let code = match?.[1] ?? null;
    if (match) history.replaceState(null, "", location.pathname + location.search);
    try {
      if (code) sessionStorage.setItem(CLAIM_KEY, code);
      code ??= sessionStorage.getItem(CLAIM_KEY);
    } catch {
      /* storage unavailable */
    }
    if (!code || !currentUser(this.storageKey)?.token) return;
    try {
      sessionStorage.removeItem(CLAIM_KEY);
    } catch {
      /* storage unavailable */
    }
    const res = await api(`/claims/${code}`, { method: "POST", key: this.storageKey });
    this._notice(res.status === 200 ? STRINGS.claimed : STRINGS.claimFailed);
    if (res.status === 200) {
      window.dispatchEvent(new CustomEvent("tg-assignments-change"));
    }
  }

  _notice(text) {
    this._root.querySelector(".notice")?.remove();
    const el = document.createElement("div");
    el.className = "notice";
    el.textContent = text;
    this._root.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  _toggleMenu(open) {
    const menu = this._box.querySelector(".menu");
    if (!menu) return;
    menu.hidden = open === undefined ? !menu.hidden : !open;
  }

  _render() {
    if (!this.getAttribute("bot-id")) {
      this._box.replaceChildren();
      return;
    }
    const user = currentUser(this.storageKey);
    const wasOpen = this._box.querySelector(".menu")?.hidden === false;
    this._box.replaceChildren(user ? this._renderUser(user) : this._renderLogin());
    if (user && wasOpen) this._toggleMenu(true);
  }

  _renderLogin() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.action = "login";
    btn.title = STRINGS.loginTitle;
    btn.innerHTML = PLANE_ICON;
    const label = document.createElement("span");
    label.textContent = STRINGS.login;
    btn.appendChild(label);
    return btn;
  }

  _renderUser(user) {
    const wrap = document.createElement("span");
    wrap.className = "who";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.action = "menu";
    trigger.title = STRINGS.menu;
    if (user.photo_url) {
      const img = document.createElement("img");
      img.className = "avatar";
      img.src = user.photo_url;
      img.alt = "";
      img.loading = "lazy";
      trigger.appendChild(img);
    } else {
      const initial = document.createElement("span");
      initial.className = "initial";
      initial.textContent = (user.first_name ?? "?").slice(0, 1);
      trigger.appendChild(initial);
    }
    const name = document.createElement("span");
    name.textContent = user.first_name ?? user.username ?? "";
    trigger.appendChild(name);
    wrap.append(trigger, this._renderMenu(user));
    return wrap;
  }

  _renderMenu(user) {
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.hidden = true;
    if (user.token) {
      const title = document.createElement("div");
      title.className = "menu-title";
      title.textContent = STRINGS.menu;
      menu.appendChild(title);
      const index = this._characterIndex ?? {};
      const list = this._assignments ?? [];
      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = STRINGS.none;
        menu.appendChild(empty);
      }
      for (const a of list) {
        const c = index[a.characterId];
        const link = document.createElement("a");
        link.href = c?.url ?? "#";
        if (c?.image) {
          const img = document.createElement("img");
          img.src = c.image;
          img.alt = "";
          link.appendChild(img);
        }
        const label = document.createElement("span");
        label.textContent = c?.title ?? a.characterId;
        link.appendChild(label);
        if (a.kind === "oneshot") {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = a.game?.title ?? STRINGS.oneshot;
          link.appendChild(tag);
        }
        menu.appendChild(link);
      }
      if (user.role === "gm" && this.getAttribute("games")) {
        menu.appendChild(document.createElement("hr"));
        const games = document.createElement("a");
        games.href = this.getAttribute("games");
        games.textContent = STRINGS.games;
        menu.appendChild(games);
      }
      menu.appendChild(document.createElement("hr"));
    }
    const logout = document.createElement("button");
    logout.type = "button";
    logout.dataset.action = "logout";
    logout.textContent = STRINGS.logout;
    menu.appendChild(logout);
    return menu;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("tg-login")) {
  customElements.define("tg-login", TgLogin);
}
