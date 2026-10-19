// Блок «Кто играет» на странице персонажа или личности: кому мастер выдал
// персонажа — в кампанию или на ваншот. Виден только вошедшим через Телеграм
// (с сессией сервера); мастеру — ещё приглашения, «Забрать» и кнопка
// «Выдать», которая открывает форму в диалоге.
//
// Разметка: <character-access character-id="suren" characters="/characters.json">
// в сайдбаре (character-access.njk). Данные — GET /characters/<id>/assignments,
// для мастера ещё /users и /games; интерфейс выдачи — assign-ui.js.

import { currentUser, api } from "./tg-login.js";
import { el, loadCharacters, assignmentRow, assignForm } from "./assign-ui.js";

class CharacterAccess extends HTMLElement {
  connectedCallback() {
    this._refresh = () => this.render();
    window.addEventListener("tg-auth-change", this._refresh);
    window.addEventListener("tg-assignments-change", this._refresh);
    this.render();
  }

  disconnectedCallback() {
    window.removeEventListener("tg-auth-change", this._refresh);
    window.removeEventListener("tg-assignments-change", this._refresh);
  }

  async render() {
    const user = currentUser();
    if (!user?.token) {
      this.replaceChildren();
      return;
    }
    const id = this.getAttribute("character-id");
    const gm = user.role === "gm";
    const [res, characters] = await Promise.all([
      api(`/characters/${id}/assignments`),
      loadCharacters(this.getAttribute("characters")),
    ]);
    if (res.status !== 200) {
      this.replaceChildren();
      return;
    }
    const list = res.data.assignments;
    if (list.length === 0 && !gm) {
      this.replaceChildren();
      return;
    }

    const box = el("section", "character-access");
    box.appendChild(el("p", "character-access-title", "Кто играет"));
    if (list.length) {
      const ul = el("ul", "assign-list");
      const changed = () => {
        window.dispatchEvent(new CustomEvent("tg-assignments-change"));
      };
      for (const a of list) ul.appendChild(assignmentRow(a, { characters, me: user.id, gm, onChange: changed }));
      box.appendChild(ul);
    } else {
      box.appendChild(el("p", "character-access-empty", "Никому не выдан"));
    }
    if (gm) box.appendChild(this.giveButton(id, characters));
    this.replaceChildren(box);
  }

  giveButton(id, characters) {
    const button = el("button", "assign-button", "Выдать игроку");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      const [users, games] = await Promise.all([api("/users"), api("/games")]);
      button.disabled = false;
      if (users.status !== 200 || games.status !== 200) return;
      const dialog = el("dialog", "assign-dialog");
      const head = el("div", "assign-dialog-head");
      head.appendChild(el("p", "assign-dialog-title", `Выдать: ${characters[id]?.title ?? id}`));
      const close = el("button", "assign-button assign-button--quiet", "Закрыть");
      close.type = "button";
      close.addEventListener("click", () => dialog.close());
      head.appendChild(close);
      dialog.appendChild(head);
      dialog.appendChild(
        assignForm({
          characters,
          users: users.data.users,
          games: games.data.games,
          characterId: id,
          onDone: () => window.dispatchEvent(new CustomEvent("tg-assignments-change")),
        }),
      );
      dialog.addEventListener("close", () => dialog.remove());
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      document.body.appendChild(dialog);
      dialog.showModal();
    });
    return button;
  }
}

if (!customElements.get("character-access")) customElements.define("character-access", CharacterAccess);
