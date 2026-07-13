// <tg-login> — "log in with Telegram" for a static site, to know who the
// player is (name + avatar). Identification only: the popup's answer is
// trusted as is, without checking Telegram's signature — the profile only
// ever labels things on the player's own device, so forging it fools no one
// but yourself. If a shared backend ever appears, verification belongs there
// (HMAC with the bot token, see https://core.telegram.org/widgets/login).
//
// Usage:
//   <script type="module" src="tg-login.js"></script>
//   <tg-login bot-id="1234567890"></tg-login>
//
// Flow: click opens Telegram's OAuth popup (widget JS is loaded lazily) and
// the profile is kept in localStorage (attribute `storage-key`), synced
// across tabs via the `storage` event. Other scripts can read it with
// currentUser() or listen for the `tg-auth-change` event on window.
// Renders nothing until `bot-id` is set. Theming via --tg-* custom
// properties.

const DEFAULT_KEY = "dnd-tg-user";
const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

const STRINGS = {
  login: "Войти",
  loginTitle: "Войти через Телеграм",
  logout: "Выйти",
  error: "Не вышло",
};

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

  .logout {
    font-size: 1em;
    line-height: 1;
    padding: 0 0.2em;
    color: var(--tg-muted, #666);
  }
  .logout:hover { color: var(--tg-accent, #a00); }
`;

export function currentUser(key = DEFAULT_KEY) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    return s?.user?.id ? s.user : null;
  } catch {
    return null;
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
        if (btn?.dataset.action === "logout") this._setUser(null);
      });
      this._onStorage = (e) => {
        if (e.key === this.storageKey) this._render();
      };
    }
    window.addEventListener("storage", this._onStorage);
    this._render();
  }

  disconnectedCallback() {
    window.removeEventListener("storage", this._onStorage);
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
      this._setUser({ id, first_name, last_name, username, photo_url });
    } catch {
      btn.querySelector("span")?.replaceChildren(STRINGS.error);
      setTimeout(() => this._render(), 2000);
      return;
    } finally {
      btn.disabled = false;
    }
    this._render();
  }

  _setUser(user) {
    try {
      if (user) localStorage.setItem(this.storageKey, JSON.stringify({ v: 1, user, at: Date.now() }));
      else localStorage.removeItem(this.storageKey);
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new CustomEvent("tg-auth-change", { detail: { user } }));
    this._render();
  }

  _render() {
    if (!this.getAttribute("bot-id")) {
      this._box.replaceChildren();
      return;
    }
    const user = currentUser(this.storageKey);
    this._box.replaceChildren(user ? this._renderUser(user) : this._renderLogin());
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
    if (user.photo_url) {
      const img = document.createElement("img");
      img.className = "avatar";
      img.src = user.photo_url;
      img.alt = "";
      img.loading = "lazy";
      wrap.appendChild(img);
    } else {
      const initial = document.createElement("span");
      initial.className = "initial";
      initial.textContent = (user.first_name ?? "?").slice(0, 1);
      wrap.appendChild(initial);
    }
    const name = document.createElement("span");
    name.textContent = user.first_name ?? user.username ?? "";
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "logout";
    logout.dataset.action = "logout";
    logout.title = STRINGS.logout;
    logout.textContent = "×";
    wrap.append(name, logout);
    return wrap;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("tg-login")) {
  customElements.define("tg-login", TgLogin);
}
