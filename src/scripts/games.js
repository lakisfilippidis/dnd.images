// Страница мастера «Игры» (/Games/): ваншоты и раздача персонажей.
// Новая игра (название и дата), список игр с выданными персонажами, форма
// «Выдать» на каждую идущую игру и «Завершить игру» — после этого все её
// выдачи гаснут. Отдельно — персонажи кампании (постоянные владельцы).
// Видна только мастеру (роль gm с сервера); остальным — пояснение.
//
// Разметка: <games-board characters="/characters.json"> в src/Games/index.html.

import { currentUser, api } from "./tg-login.js";
import { el, loadCharacters, assignmentRow, assignForm } from "./assign-ui.js";

class GamesBoard extends HTMLElement {
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
    if (!user?.token || user.role !== "gm") {
      this.replaceChildren(el("p", "games-note", user?.token ? "Эта страница — для мастера." : "Войди через Телеграм как мастер, чтобы раздавать персонажей."));
      return;
    }
    const [games, users, characters] = await Promise.all([api("/games"), api("/users"), loadCharacters(this.getAttribute("characters"))]);
    if (games.status !== 200 || users.status !== 200) {
      this.replaceChildren(el("p", "games-note", "Сервер не отвечает — попробуй позже."));
      return;
    }
    const changed = () => window.dispatchEvent(new CustomEvent("tg-assignments-change"));
    const ctx = { characters, me: user.id, gm: true, showCharacter: true, onChange: changed };

    const root = el("div", "games-board");
    root.appendChild(this.newGameForm(changed));

    const active = games.data.games.filter((g) => !g.endedAt);
    const ended = games.data.games.filter((g) => g.endedAt);
    if (active.length === 0) root.appendChild(el("p", "games-note", "Идущих игр нет — создай новую."));
    for (const g of active) {
      const card = el("section", "games-card");
      const head = el("div", "games-card-head");
      head.appendChild(el("h2", "games-card-title", g.date ? `${g.title} — ${g.date}` : g.title));
      const end = el("button", "assign-button assign-button--quiet", "Завершить игру");
      end.type = "button";
      end.addEventListener("click", async () => {
        if (!confirm(`Завершить «${g.title}»? Все выданные на неё персонажи вернутся.`)) return;
        end.disabled = true;
        await api(`/games/${g.id}/end`, { method: "POST" });
        changed();
      });
      head.appendChild(end);
      card.appendChild(head);
      const live = g.assignments.filter((a) => a.active);
      if (live.length) {
        const ul = el("ul", "assign-list");
        for (const a of live) ul.appendChild(assignmentRow(a, ctx));
        card.appendChild(ul);
      } else {
        card.appendChild(el("p", "games-note", "Персонажей ещё не раздали."));
      }
      card.appendChild(assignForm({ characters, users: users.data.users, games: games.data.games, gameId: g.id, onDone: changed }));
      root.appendChild(card);
    }

    // Кампания: постоянные владельцы — по персонажам
    const campaign = el("section", "games-card");
    campaign.appendChild(el("h2", "games-card-title", "Кампания"));
    const all = await api("/assignments");
    const owned = (all.status === 200 ? all.data.assignments : []).filter((a) => a.kind === "campaign");
    if (owned.length) {
      const ul = el("ul", "assign-list");
      for (const a of owned) ul.appendChild(assignmentRow(a, ctx));
      campaign.appendChild(ul);
    } else {
      campaign.appendChild(el("p", "games-note", "В кампании персонажей пока не раздали."));
    }
    campaign.appendChild(assignForm({ characters, users: users.data.users, games: [], kind: "campaign", onDone: changed }));
    root.appendChild(campaign);

    if (ended.length) {
      const past = el("details", "games-past");
      past.appendChild(el("summary", null, `Прошедшие игры (${ended.length})`));
      const ul = el("ul", "games-past-list");
      for (const g of ended) {
        const players = g.assignments.filter((a) => a.player).map((a) => `${characters[a.characterId]?.title ?? a.characterId} — ${a.player.name}`);
        ul.appendChild(el("li", null, `${g.date ? `${g.title}, ${g.date}` : g.title}${players.length ? `: ${players.join("; ")}` : ""}`));
      }
      past.appendChild(ul);
      root.appendChild(past);
    }
    this.replaceChildren(root);
  }

  newGameForm(onDone) {
    const form = el("form", "assign-form games-new");
    const title = el("input");
    title.type = "text";
    title.placeholder = "Название игры";
    title.maxLength = 80;
    title.required = true;
    const date = el("input");
    date.type = "date";
    const submit = el("button", "assign-button assign-button--primary", "Новая игра");
    submit.type = "submit";
    const titleField = el("label", "assign-field");
    titleField.append(el("span", "assign-label", "Игра"), title);
    const dateField = el("label", "assign-field");
    dateField.append(el("span", "assign-label", "Дата"), date);
    const actions = el("p", "assign-form-actions");
    actions.appendChild(submit);
    form.append(titleField, dateField, actions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      await api("/games", { method: "POST", body: { title: title.value.trim(), date: date.value || null } });
      submit.disabled = false;
      onDone();
    });
    return form;
  }
}

if (!customElements.get("games-board")) customElements.define("games-board", GamesBoard);
