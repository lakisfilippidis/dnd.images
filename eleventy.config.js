const fs = require("node:fs");
const path = require("node:path");

module.exports = async function (eleventyConfig) {
  const { eleventyImageTransformPlugin } = await import("@11ty/eleventy-img");

  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    extensions: "html",
    formats: ["webp"],
    // The transform plugin is pathPrefix-unaware: img src attributes must stay
    // prefix-free, the prefix lives only in urlPath
    outputDir: "_site/img/",
    urlPath: "/dnd.images/img/",
    widths: [800, 1200],
    // The on-request dev endpoint emits URLs without the pathPrefix and 404s;
    // generating for real in serve mode is cheap since existing files are reused
    transformOnRequest: false,
    htmlOptions: {
      imgAttributes: { loading: "lazy", decoding: "async" },
    },
  });

  eleventyConfig.addPassthroughCopy("src/styles");
  eleventyConfig.addPassthroughCopy("src/scripts");
  eleventyConfig.addPassthroughCopy("src/icons");
  eleventyConfig.addPassthroughCopy("src/**/*.jpg");
  eleventyConfig.addPassthroughCopy("src/**/*.png");

  // Картинка-превью страницы (главная, «В бой»): первая из preview /
  // portrait / gallery[0], которая реально лежит рядом с index.md. Раздел
  // задаёт preview: head.jpg по умолчанию, а голову рисуют не всем — без
  // проверки главная падала на первом персонаже без head.jpg.
  eleventyConfig.addGlobalData("eleventyComputed", {
    previewImage: (data) => {
      if (!data.page?.inputPath) return "";
      const dir = path.dirname(data.page.inputPath);
      const candidates = [data.preview, data.portrait, data.gallery?.[0], data.illustrations?.[0]];
      return candidates.find((f) => typeof f === "string" && f !== "" && fs.existsSync(path.join(dir, f))) ?? "";
    },
    // Иллюстрации историй (src/Stories): в шаблон попадают только те файлы
    // из illustrations:, которые реально лежат рядом с index.md.
    illustrationFiles: (data) => {
      if (!data.page?.inputPath || !Array.isArray(data.illustrations)) return [];
      const dir = path.dirname(data.page.inputPath);
      return data.illustrations.filter((f) => typeof f === "string" && fs.existsSync(path.join(dir, f)));
    },
  });


  // Карточки черт (src/_data/feats.js). Черты общие для всех классов: поле
  // classes у черты задаёт доступность (нет поля — доступна всем), по нему,
  // группе и сфере фильтрует src/scripts/feat-filter.js. Каноническое место
  // каждой черты — страница /Feats/, туда и ведут ссылки с других страниц.
  const feats = require("./src/_data/feats.js");
  const featById = new Map(feats.feats.map((f) => [f.id, f]));
  const groupById = new Map(feats.groups.map((g) => [g.id, g]));
  const sphereById = new Map(feats.spheres.map((sp) => [sp.id, sp]));
  const classById = new Map(feats.classes.map((c) => [c.id, c]));
  const sideById = new Map(feats.sides.map((s) => [s.id, s]));
  const url = (p) => eleventyConfig.getFilter("url")(p);

  function featIcon(meta, extraClass = "") {
    return `<img class="feat-card-icon${extraClass}" eleventy:ignore src="${url("/icons/" + meta.icon)}" alt="${meta.title}" title="${meta.title}" width="40" height="40">`;
  }

  function featCardHtml(feat, { level = null, note = null, link = false } = {}) {
    const group = groupById.get(feat.group);
    if (!group) throw new Error(`feat "${feat.id}": unknown group "${feat.group}"`);
    const sphere = feat.sphere ? sphereById.get(feat.sphere) : null;
    if (feat.sphere && !sphere) throw new Error(`feat "${feat.id}": unknown sphere "${feat.sphere}"`);
    const side = sideById.get(feat.side);
    if (feat.side && !side) throw new Error(`feat "${feat.id}": unknown side "${feat.side}"`);
    for (const id of feat.classes ?? []) {
      if (!classById.has(id)) throw new Error(`feat "${feat.id}": unknown class "${id}"`);
    }
    const name = link
      ? `<a href="${url("/Feats/")}#feat-${feat.id}">${feat.name}</a>`
      : feat.name;
    // Ссылки внутри desc записаны коротко ("#feat-poisoner"): карточка рендерится и на
    // страницах классов, поэтому якорь разворачивается в канонический — на /Feats/.
    const desc = feat.desc.replace(/href="#/g, `href="${url("/Feats/")}#`);
    return [
      `<article class="feat-card${side ? ` feat-card--${side.id}` : ""}"${link ? "" : ` id="feat-${feat.id}"`}`,
      ` data-group="${feat.group}" data-sphere="${feat.sphere ?? ""}" data-classes="${(feat.classes ?? ["all"]).join(" ")}">`,
      `<header class="feat-card-header">`,
      level == null ? "" : `<span class="feat-card-level" title="Уровень ${level}">${level}</span>`,
      `<h4 class="feat-card-name">${name}</h4>`,
      sphere ? featIcon(sphere) : "", featIcon(group), side ? featIcon(side) : "",
      `</header>`,
      feat.req ? `<p class="feat-card-req">${feat.req}</p>` : "",
      `<div class="feat-card-desc">${desc}</div>`,
      note ? `<p class="feat-card-note">${note}</p>` : "",
      `</article>`,
    ].join("");
  }

  // Все черты одной группы — точечный вывод. Второй аргумент true — карточки без id,
  // имя ведёт на /Feats/: так группа «Стиль» встраивается в страницы классов.
  eleventyConfig.addShortcode("featCards", function (groupId, link = false) {
    if (!groupById.has(groupId)) throw new Error(`featCards: unknown group "${groupId}"`);
    const cards = feats.feats
      .filter((f) => f.group === groupId)
      .map((f) => featCardHtml(f, { link: Boolean(link) }));
    return `<div class="feat-cards">${cards.join("")}</div>`;
  });

  // Полный список черт с фильтрами по группе, сфере и доступности.
  // Аргумент — id класса: его чип включается сразу, страница класса открывается
  // уже отфильтрованной, но фильтр можно снять и увидеть все черты. Карточки на
  // странице класса идут без id: каноническое место черты — /Feats/.
  //
  // Последний ряд — группировка: та же ось разбивает карточки на секции с
  // заголовками. Это не фильтр, а раскладка, поэтому чипы ведут себя как радио:
  // группировка идёт по одной оси, «Без группировки» возвращает плоский список.
  // Заголовки секций пишет feat-filter.js по data-titles ниже.
  //
  // Тулбар общий для черт и снаряжения (weaponList / armorList): ряды осей
  // задаются списком, feat-filter.js читает оси из data-axis чипов.
  // rows: [{ axis, caption, items, active?, empty? }] — empty подписывает
  // корзину карточек без значения по этой оси при группировке.
  // groupBy: [{ axis, title }], defaultGroupBy — ось, нажатая при загрузке
  // ("" — плоский список); feat-filter.js применяет её сразу.
  function filterToolbar({ label, rows, groupBy, defaultGroupBy = "" }) {
    const chip = (meta, axis, on = false) =>
      `<button type="button" class="feat-filter-chip" data-axis="${axis}" data-value="${meta.id}"` +
      ` aria-pressed="${on}" title="${meta.title}">${featIcon(meta, " feat-filter-icon")}` +
      `<span class="feat-filter-label">${meta.title}</span></button>`;
    const row = ({ items, axis, caption, active = null }) =>
      `<div class="feat-filter-row"><span class="feat-filter-caption">${caption}</span>` +
      items.map((m) => chip(m, axis, m.id === active)).join("") + `</div>`;
    // Чип группировки без иконки: ось — это не значение, картинки у неё нет.
    const groupByChip = (value, title, on = false) =>
      `<button type="button" class="feat-filter-chip feat-filter-chip--radio" data-groupby="${value}"` +
      ` aria-pressed="${on}" title="${title}"><span class="feat-filter-label">${title}</span></button>`;
    const groupByRow = [
      `<div class="feat-filter-row feat-filter-row--groupby">`,
      `<span class="feat-filter-caption">Группировка</span>`,
      groupByChip("", "Без группировки", defaultGroupBy === ""),
      groupBy.map(({ axis, title }) => groupByChip(axis, title, axis === defaultGroupBy)).join(""),
      `</div>`,
    ].join("");
    // Названия корзин для заголовков секций: id → заголовок по каждой оси.
    const titles = JSON.stringify(Object.fromEntries(rows.map((r) => [
      r.axis,
      { ...Object.fromEntries(r.items.map((m) => [m.id, m.title])), ...(r.empty ? { "": r.empty } : {}) },
    ])));
    const panel = [
      `<div class="feat-filter" role="toolbar" aria-label="${label}">`,
      rows.map(row).join(""),
      groupByRow,
      `</div>`,
    ].join("");
    return { panel, titles };
  }

  eleventyConfig.addShortcode("featList", function (classId = "") {
    const active = String(classId).trim();
    if (active && !classById.has(active)) throw new Error(`featList: unknown class "${active}"`);
    const { panel, titles } = filterToolbar({
      label: "Фильтр черт",
      rows: [
        { axis: "group", caption: "Группа", items: feats.groups },
        { axis: "sphere", caption: "Влияние", items: feats.spheres, empty: "Без сферы" },
        { axis: "classes", caption: "Доступность", items: feats.classes, active },
      ],
      groupBy: [
        { axis: "group", title: "По группе" },
        { axis: "sphere", title: "По влиянию" },
        { axis: "classes", title: "По доступности" },
      ],
      defaultGroupBy: "sphere",
    });
    const cards = feats.feats.map((f) => featCardHtml(f, { link: active !== "" }));
    return `${panel}<div class="feat-cards feat-cards--filtered" data-titles='${titles}'>${cards.join("")}</div>`;
  });

  // Снаряжение (src/_data/equipment.js): оружие и доспехи. Каноническое место
  // карточек — /Equipment/ (#weapon-<id>, #armor-<id>); на страницах персонажей
  // карточки идут без id и считают меткость, урон и КБ из stats страницы.
  const equipment = require("./src/_data/equipment.js");
  const weaponById = new Map(equipment.weapons.map((w) => [w.id, w]));
  const armorById = new Map(equipment.armor.map((a) => [a.id, a]));
  const weaponGroupById = new Map(equipment.groups.map((g) => [g.id, g]));
  const tierById2 = new Map(equipment.tiers.map((t) => [t.id, t]));
  const damageTypeById = new Map(equipment.damageTypes.map((t) => [t.id, t]));
  const propById = new Map(equipment.props.map((p) => [p.id, p]));
  const slotById = new Map(equipment.slots.map((s) => [s.id, s]));
  const weightById = new Map(equipment.weights.map((w) => [w.id, w]));
  const equipmentUrl = () => url("/Equipment/");

  const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const dice = (base, bonus) => `<roll-dice>${base}${bonus === 0 ? "" : signed(bonus)}</roll-dice>`;
  const abilityMod = (value) => Math.floor((Number(value) - 10) / 2);
  // Описания снаряжения ссылаются коротко (#weapon-shield-bash): на чужих
  // страницах якорь разворачивается в канонический, как у черт.
  const expandAnchors = (html) => html.replace(/href="#/g, `href="${equipmentUrl()}#`);

  // Делит запись picks на не больше чем n частей по двоеточию: последняя часть
  // (заметка) может содержать двоеточия сама.
  function splitPick(entry, n) {
    const parts = [];
    let rest = entry;
    while (parts.length < n - 1) {
      const i = rest.indexOf(":");
      if (i < 0) break;
      parts.push(rest.slice(0, i));
      rest = rest.slice(i + 1);
    }
    parts.push(rest);
    return parts.map((p) => p.trim());
  }

  const ABILITIES = ["Сила", "Ловкость", "Харизма"];

  // Front matter страницы из шорткода: в Liquid (страницы .md) this.ctx —
  // объект Context с методом get, в Nunjucks — просто данные.
  function pageData(ctx, key) {
    if (!ctx) return undefined;
    return typeof ctx.get === "function" ? ctx.get([key]) : ctx[key];
  }

  // Модификаторы записи weaponPicks: "владение 2, Арсеналист +1, дуэлянт +2 к урону, Харизма".
  function parseWeaponMods(text, label) {
    const mods = { prof: null, ability: null, hit: [], damage: [] };
    for (const raw of text.split(",")) {
      const token = raw.trim();
      if (!token) continue;
      let m;
      if ((m = token.match(/^владение\s*\+?(\d+)$/i))) mods.prof = Number(m[1]);
      else if (ABILITIES.includes(token)) mods.ability = token;
      else if ((m = token.match(/^(.+?)\s*([+-]\d+)\s*(?:к урону|урона)$/))) mods.damage.push({ label: m[1], value: Number(m[2]) });
      else if ((m = token.match(/^(.+?)\s*([+-]\d+)$/))) mods.hit.push({ label: m[1], value: Number(m[2]) });
      else throw new Error(`${label}: непонятный модификатор "${token}"`);
    }
    return mods;
  }

  // Характеристика для оружия: явная > фехтовальное → большая из Силы и
  // Ловкости > дальнобойное или лёгкое → Ловкость > Сила (правила, «Атака и урон»).
  function weaponAbility(weapon, stats, explicit) {
    if (explicit) return explicit;
    const has = (p) => weapon.props.includes(p);
    if (has("finesse")) return abilityMod(stats["Ловкость"] ?? 10) >= abilityMod(stats["Сила"] ?? 10) ? "Ловкость" : "Сила";
    if (has("ranged") || has("light")) return "Ловкость";
    return "Сила";
  }

  // Карточка оружия. pick — запись персонажа: { count, mods, note, stats };
  // без неё карточка справочная (реестр), с ней — считает меткость и урон.
  function weaponCardHtml(weapon, { pick = null, link = false } = {}) {
    const group = weaponGroupById.get(weapon.group);
    const tier = tierById2.get(weapon.tier);
    const type = damageTypeById.get(weapon.type);
    const name = link ? `<a href="${equipmentUrl()}#weapon-${weapon.id}">${weapon.name}</a>` : weapon.name;
    const rangeText = weapon.range
      ? (weapon.props.includes("reach") ? `досягаемость ${weapon.range} фт` : `${weapon.range} фт`)
      : null;
    const stat = (label, value) => `<span class="equip-stat"><span class="equip-stat-label">${label}</span> ${value}</span>`;
    let stats;
    let breakdown = null;
    if (pick?.stats) {
      const ability = weaponAbility(weapon, pick.stats, pick.mods.ability);
      if (!(ability in pick.stats)) throw new Error(`weaponPicks: у страницы нет характеристики "${ability}" в stats`);
      const mod = abilityMod(pick.stats[ability]);
      const prof = pick.mods.prof ?? 0;
      const hitExtra = pick.mods.hit.reduce((s, x) => s + x.value, 0);
      const dmgExtra = pick.mods.damage.reduce((s, x) => s + x.value, 0);
      const hit = mod + prof + hitExtra;
      const dmg = mod + dmgExtra;
      const damage = weapon.damageTwoHands
        ? `${dice(weapon.damage, dmg)} / ${dice(weapon.damageTwoHands, dmg)} ${type.title}`
        : `${dice(weapon.damage, dmg)} ${type.title}`;
      stats = [stat("Меткость", dice("1d20", hit)), stat("Урон", damage), rangeText ? stat("Дистанция", rangeText) : ""];
      breakdown = [
        `${ability} ${signed(mod)}`,
        prof ? `владение ${signed(prof)}` : null,
        ...pick.mods.hit.map((x) => `${x.label} ${signed(x.value)}`),
        ...pick.mods.damage.map((x) => `${x.label} ${signed(x.value)} к урону`),
      ].filter(Boolean).join(", ");
    } else {
      const damage = weapon.damageTwoHands
        ? `${weapon.damage} / ${weapon.damageTwoHands} ${type.title}`
        : `${weapon.damage} ${type.title}`;
      stats = [stat("Урон", damage), rangeText ? stat("Дистанция", rangeText) : ""];
    }
    const chips = weapon.props.map((p) => `<span class="effect-chip">${propById.get(p).title}</span>`).join("");
    const count = pick?.count && pick.count > 1 ? `<span class="feat-card-level" title="Количество">×${pick.count}</span>` : "";
    return [
      `<article class="feat-card equip-card equip-card--weapon"${link ? "" : ` id="weapon-${weapon.id}"`}`,
      ` data-group="${weapon.group}" data-tier="${weapon.tier}" data-type="${weapon.type}">`,
      `<header class="feat-card-header">${count}<h4 class="feat-card-name">${name}</h4>${featIcon(tier)}${featIcon(group)}</header>`,
      `<p class="equip-card-stats">${stats.filter(Boolean).join("")}</p>`,
      breakdown ? `<p class="feat-card-req">${breakdown}</p>` : "",
      chips ? `<p class="equip-props effect-chips">${chips}</p>` : "",
      weapon.desc ? `<div class="feat-card-desc">${expandAnchors(weapon.desc)}</div>` : "",
      pick?.note ? `<p class="feat-card-note">${pick.note}</p>` : "",
      `</article>`,
    ].join("");
  }

  function armorCardHtml(item, { note = null, link = false } = {}) {
    const slot = slotById.get(item.slot);
    const weight = item.weight ? weightById.get(item.weight) : null;
    const name = link ? `<a href="${equipmentUrl()}#armor-${item.id}">${item.name}</a>` : item.name;
    let stats = "";
    if (item.slot === "body") stats = `<span class="equip-stat"><span class="equip-stat-label">КБ</span> ${item.ac} ${weight.dexRule}</span>`;
    else if (item.slot === "shield") stats = `<span class="equip-stat"><span class="equip-stat-label">КБ</span> +${item.ac}</span>`;
    return [
      `<article class="feat-card equip-card equip-card--${weight ? weight.id : item.slot}"${link ? "" : ` id="armor-${item.id}"`}`,
      ` data-slot="${item.slot}" data-weight="${item.weight ?? ""}">`,
      `<header class="feat-card-header"><h4 class="feat-card-name">${name}</h4>${weight ? featIcon(weight) : ""}${featIcon(slot)}</header>`,
      stats ? `<p class="equip-card-stats">${stats}</p>` : "",
      item.desc ? `<div class="feat-card-desc">${expandAnchors(item.desc)}</div>` : "",
      note ? `<p class="feat-card-note">${note}</p>` : "",
      `</article>`,
    ].join("");
  }

  // Срез реестра: все оружие одной группы / все доспехи одного места.
  eleventyConfig.addShortcode("weaponCards", function (groupId, link = false) {
    if (!weaponGroupById.has(groupId)) throw new Error(`weaponCards: unknown group "${groupId}"`);
    const cards = equipment.weapons.filter((w) => w.group === groupId).map((w) => weaponCardHtml(w, { link: Boolean(link) }));
    return `<div class="feat-cards equip-cards">${cards.join("")}</div>`;
  });

  eleventyConfig.addShortcode("armorCards", function (slotId, link = false) {
    if (!slotById.has(slotId)) throw new Error(`armorCards: unknown slot "${slotId}"`);
    const cards = equipment.armor.filter((a) => a.slot === slotId).map((a) => armorCardHtml(a, { link: Boolean(link) }));
    return `<div class="feat-cards equip-cards">${cards.join("")}</div>`;
  });

  // Полные списки с фильтром — для /Equipment/. Каждый список в своей обёртке:
  // feat-filter.js ищет карточки в родителе тулбара.
  eleventyConfig.addShortcode("weaponList", function () {
    const { panel, titles } = filterToolbar({
      label: "Фильтр оружия",
      rows: [
        { axis: "group", caption: "Группа", items: equipment.groups },
        { axis: "tier", caption: "Владение", items: equipment.tiers },
        { axis: "type", caption: "Урон", items: equipment.damageTypes },
      ],
      groupBy: [
        { axis: "group", title: "По группе" },
        { axis: "tier", title: "По владению" },
        { axis: "type", title: "По урону" },
      ],
      defaultGroupBy: "group",
    });
    const cards = equipment.weapons.map((w) => weaponCardHtml(w));
    return `<div class="equip-list">${panel}<div class="feat-cards equip-cards feat-cards--filtered" data-titles='${titles}'>${cards.join("")}</div></div>`;
  });

  eleventyConfig.addShortcode("armorList", function () {
    const { panel, titles } = filterToolbar({
      label: "Фильтр доспехов",
      rows: [
        { axis: "slot", caption: "Место", items: equipment.slots },
        { axis: "weight", caption: "Вес", items: equipment.weights, empty: "Не комплект" },
      ],
      groupBy: [
        { axis: "slot", title: "По месту" },
        { axis: "weight", title: "По весу" },
      ],
      defaultGroupBy: "weight",
    });
    const cards = equipment.armor.map((a) => armorCardHtml(a));
    return `<div class="equip-list">${panel}<div class="feat-cards equip-cards feat-cards--filtered" data-titles='${titles}'>${cards.join("")}</div></div>`;
  });

  // Оружие персонажа: "id ×N: модификаторы : заметка; ...". Модификаторы через
  // запятую: «владение 2» (бонус владения), «Арсеналист +1» (к меткости, с
  // подписью), «дуэлянт +2 к урону», «Харизма» (характеристика вместо
  // правила по умолчанию). Меткость и урон считаются из stats страницы.
  eleventyConfig.addShortcode("weaponPicks", function (picks) {
    const stats = pageData(this.ctx, "stats") ?? null;
    const page = this.page?.inputPath ?? "?";
    const cards = String(picks).split(";").map((x) => x.trim()).filter(Boolean).map((entry) => {
      const [head, modsText = "", note = ""] = splitPick(entry, 3);
      const m = head.match(/^(\S+)(?:\s*[×x]\s*(\d+))?$/);
      if (!m) throw new Error(`weaponPicks (${page}): непонятная запись "${head}"`);
      const weapon = weaponById.get(m[1]);
      if (!weapon) throw new Error(`weaponPicks (${page}): unknown weapon "${m[1]}"`);
      const mods = parseWeaponMods(modsText, `weaponPicks (${page}, ${weapon.id})`);
      if (stats && mods.prof == null) console.warn(`weaponPicks (${page}): у "${weapon.id}" не указано владение — считаю 0`);
      const pick = { count: m[2] ? Number(m[2]) : 1, mods, note: note || null, stats };
      return weaponCardHtml(weapon, { pick, link: true });
    });
    return `<div class="feat-cards equip-cards">${cards.join("")}</div>`;
  });

  // Доспехи персонажа: "id: заметка; id; +1 боевой стиль Защита; ...". Не
  // больше одного комплекта и одного щита; записи с «+N подпись» — плоские
  // бонусы к КБ. Под карточками — итог: КБ = комплект + Ловкость по весу +
  // щит + бонусы. Если combat.КБ.value на странице с итогом не сходится,
  // сборка предупреждает — число в combat правится руками, его читает «В бой».
  eleventyConfig.addShortcode("armorPicks", function (picks) {
    const stats = pageData(this.ctx, "stats") ?? null;
    const combat = pageData(this.ctx, "combat") ?? null;
    const page = this.page?.inputPath ?? "?";
    const cards = [];
    const parts = [];
    let body = null;
    let shield = null;
    for (const entry of String(picks).split(";").map((x) => x.trim()).filter(Boolean)) {
      const flat = entry.match(/^([+-]\d+)\s+(.+)$/);
      if (flat) {
        parts.push({ label: flat[2], value: Number(flat[1]) });
        continue;
      }
      const [id, note = ""] = splitPick(entry, 2);
      const item = armorById.get(id);
      if (!item) throw new Error(`armorPicks (${page}): unknown armor "${id}"`);
      if (item.slot === "body") {
        if (body) throw new Error(`armorPicks (${page}): два комплекта — "${body.id}" и "${item.id}"`);
        body = item;
      }
      if (item.slot === "shield") {
        if (shield) throw new Error(`armorPicks (${page}): два щита — "${shield.id}" и "${item.id}"`);
        shield = item;
      }
      cards.push(armorCardHtml(item, { note: note || null, link: true }));
    }
    let total = "";
    if (stats) {
      const dex = abilityMod(stats["Ловкость"] ?? 10);
      const weight = body ? weightById.get(body.weight) : weightById.get("light");
      const dexUsed = weight.dexCap == null ? dex : Math.min(dex, weight.dexCap);
      const base = body ? body.ac : 10;
      const sum = base + dexUsed + (shield?.ac ?? 0) + parts.reduce((s, p) => s + p.value, 0);
      const term = (value, label) => (value < 0 ? ` − ${-value} (${label})` : ` + ${value} (${label})`);
      let formula = `${base} (${body ? body.name : "без доспеха"})`;
      if (weight.dexCap !== 0) {
        formula += dexUsed !== dex ? ` + ${dexUsed} (Ловкость ${signed(dex)}, не больше +${weight.dexCap})` : term(dexUsed, "Ловкость");
      }
      if (shield) formula += term(shield.ac, shield.name);
      for (const p of parts) formula += term(p.value, p.label);
      total = `<p class="equip-ac-total"><span class="equip-stat-label">КБ</span> <strong>${sum}</strong> = ${formula}</p>`;
      const declared = combat?.["КБ"]?.value;
      if (declared != null && Number(declared) !== sum) {
        console.warn(`armorPicks (${page}): КБ по доспехам ${sum}, а в combat указано ${declared}`);
      }
    }
    return `<div class="feat-cards equip-cards">${cards.join("")}</div>${total}`;
  });

  // Алхимия (src/_data/alchemy.js): ступени, эффекты, ингредиенты и основы.
  // Доза собирается из ингредиентов; эффект попадает в неё, если есть хотя бы
  // у двух, а сила — число таких ингредиентов минус один, отсюда три строки
  // у карточки эффекта. Ступень ограничивает только число ингредиентов. Карточка ингредиента перечисляет его четыре эффекта
  // со знаком: «−» вред, «+» польза. Каноническое место карточек — /Feats/#alchemy.
  const alchemy = require("./src/_data/alchemy.js");
  const effectById = new Map(alchemy.effects.map((e) => [e.id, e]));
  const ingredientById = new Map(alchemy.ingredients.map((i) => [i.id, i]));
  const effectKindById = new Map(alchemy.kinds.map((k) => [k.id, k]));
  const tierById = new Map(alchemy.tiers.map((t) => [t.id, t]));
  const regionById = new Map(alchemy.regions.map((r) => [r.id, r]));

  function effectCardHtml(effect) {
    const kind = effectKindById.get(effect.kind);
    if (!kind) throw new Error(`effect "${effect.id}": unknown kind "${effect.kind}"`);
    const rows = effect.stacks.map((text, i) =>
      `<p class="recipe-stack"><span class="recipe-stack-label">${i + 1} ${i === 0 ? "доля" : "доли"}</span> ${text}</p>`
    ).join("");
    const meta = [kind.title, effect.save ? `спасбросок ${effect.save}` : null].filter(Boolean).join(", ");
    return [
      `<article class="feat-card recipe-card recipe-card--${kind.id}" id="effect-${effect.id}">`,
      `<header class="feat-card-header"><h4 class="feat-card-name">${effect.name}</h4>${featIcon(kind)}</header>`,
      `<p class="feat-card-req">${meta}</p>`,
      rows,
      `</article>`,
    ].join("");
  }

  function effectChip(effectId, { link = false } = {}) {
    const effect = effectById.get(effectId);
    if (!effect) throw new Error(`unknown effect "${effectId}"`);
    const kind = effectKindById.get(effect.kind);
    const label = `<span class="effect-chip-sign">${kind.sign}</span>${effect.name}`;
    return link
      ? `<a class="effect-chip effect-chip--${kind.id}" href="${url("/Feats/")}#effect-${effect.id}">${label}</a>`
      : `<a class="effect-chip effect-chip--${kind.id}" href="#effect-${effect.id}">${label}</a>`;
  }

  function ingredientCardHtml(ingredient, { note = null, link = false } = {}) {
    const region = regionById.get(ingredient.region);
    if (!region) throw new Error(`ingredient "${ingredient.id}": unknown region "${ingredient.region}"`);
    const name = link
      ? `<a href="${url("/Feats/")}#ingredient-${ingredient.id}">${ingredient.name}</a>`
      : ingredient.name;
    return [
      `<article class="feat-card recipe-card recipe-card--ingredient"${link ? "" : ` id="ingredient-${ingredient.id}"`}>`,
      `<header class="feat-card-header"><h4 class="feat-card-name">${name}</h4></header>`,
      `<p class="feat-card-req">${region.title}</p>`,
      `<p class="effect-chips">${ingredient.effects.map((e) => effectChip(e, { link })).join("")}</p>`,
      note ? `<p class="feat-card-note">${note}</p>` : "",
      `</article>`,
    ].join("");
  }

  // Эффекты одного рода: "harm" или "boon"
  eleventyConfig.addShortcode("effectCards", function (kindId) {
    if (!effectKindById.has(kindId)) throw new Error(`effectCards: unknown kind "${kindId}"`);
    const cards = alchemy.effects.filter((e) => e.kind === kindId).map(effectCardHtml);
    return `<div class="feat-cards recipe-cards">${cards.join("")}</div>`;
  });

  // Ингредиенты одного региона — для страницы класса
  eleventyConfig.addShortcode("ingredientCards", function (regionId) {
    if (!regionById.has(regionId)) throw new Error(`ingredientCards: unknown region "${regionId}"`);
    const cards = alchemy.ingredients.filter((i) => i.region === regionId).map((i) => ingredientCardHtml(i));
    return `<div class="feat-cards recipe-cards">${cards.join("")}</div>`;
  });

  // Трофеи для страницы класса: карточки со ссылками на /Feats/, без своих якорей
  eleventyConfig.addShortcode("mutagenCards", function () {
    const cards = alchemy.ingredients.filter((i) => i.region === "trophy").map((i) => ingredientCardHtml(i, { link: true }));
    return `<div class="feat-cards recipe-cards">${cards.join("")}</div>`;
  });

  // Известные персонажу ингредиенты: "id:пометка; id; ..."
  eleventyConfig.addShortcode("ingredientPicks", function (picks) {
    const cards = String(picks).split(";").map((x) => x.trim()).filter(Boolean).map((pick) => {
      const [id, ...noteParts] = pick.split(":").map((x) => x.trim());
      const ingredient = ingredientById.get(id);
      if (!ingredient) throw new Error(`ingredientPicks: unknown ingredient "${id}"`);
      return { card: ingredientCardHtml(ingredient, { note: noteParts.join(":") || null, link: true }), id };
    });
    const ids = cards.map((c) => c.id).join(",");
    return `<div class="feat-cards recipe-cards" data-known-ingredients="${ids}">${cards.map((c) => c.card).join("")}</div>`;
  });

  // Основы — способ доставки
  eleventyConfig.addShortcode("baseCards", function () {
    const cards = alchemy.bases.map((b) => {
      const tier = b.tier ? tierById.get(b.tier) : null;
      if (b.tier && !tier) throw new Error(`baseCards: base "${b.id}" — unknown tier "${b.tier}"`);
      const slots = b.slots === 0 ? "Места не занимает" : `Занимает мест: ${b.slots}`;
      return [
        `<article class="feat-card recipe-card recipe-card--base" id="base-${b.id}">`,
        `<header class="feat-card-header"><h4 class="feat-card-name">${b.name}</h4></header>`,
        `<p class="feat-card-req">${tier ? `Основа, ${tier.title}` : "Основа — известна всем"}</p>`,
        `<p class="recipe-card-doles">${slots}</p>`,
        `<p class="feat-card-desc">${b.desc}</p>`,
        `</article>`,
      ].join("");
    });
    return `<div class="feat-cards recipe-cards">${cards.join("")}</div>`;
  });

  // Трекер шкалы Тени и Куража: кнопка и диалог для src/scripts/scale-tracker.js.
  // Аргумент — настройки "ключ:значение; ...": id (ключ хранения, по умолчанию
  // адрес страницы), name (чьё имя показать), feats (id черт плута через запятую —
  // трекер подскажет, что доступно на текущем делении).
  eleventyConfig.addShortcode("scaleTracker", function (options = "") {
    const opts = {};
    for (const pair of String(options).split(";")) {
      const [key, value] = pair.split(":").map((x) => x.trim());
      if (key) opts[key] = value ?? "true";
    }
    const picked = (opts.feats ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    for (const id of picked) {
      if (!featById.has(id)) throw new Error(`scaleTracker: unknown feat "${id}"`);
    }
    // Черты со стороной шкалы: трекер показывает их целиком на своём делении.
    // Якоря внутри desc — короткие (#feat-…), разворачиваем в канонические на /Feats/.
    const sideFeats = feats.feats
      .filter((f) => f.side && (picked.length === 0 || picked.includes(f.id)))
      .map((f) => ({
        id: f.id,
        name: f.name,
        side: f.side,
        req: f.req ?? null,
        desc: f.desc.replace(/href="#/g, `href="${url("/Feats/")}#`),
      }));
    const payload = { sides: feats.sides, feats: sideFeats, options: opts, href: url("/Feats/") };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    return [
      `<p class="alchemy-lab-launch"><button type="button" class="scale-tracker-open">Открыть шкалу</button></p>`,
      `<dialog class="alchemy-lab-dialog scale-tracker-dialog">`,
      `<div class="scale-tracker" data-scale="${encoded}"><p class="alchemy-lab-noscript">Трекер шкалы работает при включённом JavaScript.</p></div>`,
      `</dialog>`,
    ].join("");
  });

  // Конструктор дозы: кнопка и диалог с данными для src/scripts/alchemy-lab.js.
  // Аргумент — настройки "ключ:значение; ...": tier (ступень), int (модификатор
  // Интеллекта), still (перегонных кубов), retort (реторт), known:page — брать
  // список известных трав из ingredientPicks на той же странице.
  eleventyConfig.addShortcode("alchemyLab", function (options = "") {
    const opts = {};
    for (const pair of String(options).split(";")) {
      const [key, value] = pair.split(":").map((x) => x.trim());
      if (key) opts[key] = value ?? "true";
    }
    if (opts.tier && !tierById.has(opts.tier)) throw new Error(`alchemyLab: unknown tier "${opts.tier}"`);
    const payload = {
      tiers: alchemy.tiers,
      regions: alchemy.regions.map(({ id, title }) => ({ id, title })),
      effects: alchemy.effects,
      ingredients: alchemy.ingredients,
      bases: alchemy.bases.map(({ id, name, slots }) => ({ id, name, slots })),
      options: opts,
    };
    // Страница — markdown, и типограф правит кавычки даже внутри <script>,
    // поэтому данные едут в base64 и распаковываются скриптом.
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    return [
      `<p class="alchemy-lab-launch"><button type="button" class="alchemy-lab-open">Сварить дозу</button></p>`,
      `<dialog class="alchemy-lab-dialog">`,
      `<div class="alchemy-lab" data-lab="${encoded}"><p class="alchemy-lab-noscript">Конструктор дозы работает при включённом JavaScript.</p></div>`,
      `</dialog>`,
    ].join("");
  });

  // Сборка персонажа: "id:уровень; id:уровень:пометка; ..."
  eleventyConfig.addShortcode("featPicks", function (picks) {
    const cards = picks.split(";").map((entry) => {
      // Делим не больше чем на три части: двоеточие внутри заметки — часть текста.
      const [id, level, note] = entry.trim().split(/:(.*)/s).flatMap((v, i) => i === 1 ? v.split(/:(.*)/s) : [v])
        .filter((v) => v !== "").map((v) => v && v.trim());
      const feat = featById.get(id);
      if (!feat) throw new Error(`featPicks: unknown feat "${id}"`);
      return featCardHtml(feat, { level, note, link: true });
    });
    return `<div class="feat-cards">${cards.join("")}</div>`;
  });

  eleventyConfig.addCollection("characters", function (collectionApi) {
    return collectionApi
      .getFilteredByTag("character")
      .sort((a, b) => a.data.title.localeCompare(b.data.title, "ru"));
  });

  eleventyConfig.addCollection("classes", function (collectionApi) {
    return collectionApi
      .getFilteredByTag("class")
      .sort((a, b) => a.data.title.localeCompare(b.data.title, "ru"));
  });

  eleventyConfig.addCollection("creatures", function (collectionApi) {
    return collectionApi
      .getFilteredByTag("creature")
      .sort((a, b) => a.data.title.localeCompare(b.data.title, "ru"));
  });

  eleventyConfig.addCollection("personalities", function (collectionApi) {
    return collectionApi
      .getFilteredByTag("personalities")
      .sort((a, b) => a.data.title.localeCompare(b.data.title, "ru"));
  });

  eleventyConfig.addCollection("races", function (collectionApi) {
    return collectionApi
      .getFilteredByTag("race")
      .sort((a, b) => a.data.title.localeCompare(b.data.title, "ru"));
  });

  eleventyConfig.addCollection("maps", function (collectionApi) {
    return collectionApi
      .getFilteredByTag("map")
      .sort((a, b) => a.data.title.localeCompare(b.data.title, "ru"));
  });

  eleventyConfig.addCollection("stories", function (collectionApi) {
    return collectionApi
      .getFilteredByTag("story")
      .sort((a, b) => (b.data.date - a.data.date) || a.data.title.localeCompare(b.data.title, "ru"));
  });

  const ruDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  eleventyConfig.addFilter("ruDate", (d) => ruDateFormat.format(new Date(d)).replace(/\s*г\.$/, ""));
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));

  return {
    pathPrefix: "/dnd.images/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
};
