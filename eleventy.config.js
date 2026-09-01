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
      const candidates = [data.preview, data.portrait, data.gallery?.[0]];
      return candidates.find((f) => typeof f === "string" && f !== "" && fs.existsSync(path.join(dir, f))) ?? "";
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
    return [
      `<article class="feat-card${side ? ` feat-card--${side.id}` : ""}"${link ? "" : ` id="feat-${feat.id}"`}`,
      ` data-group="${feat.group}" data-sphere="${feat.sphere ?? ""}" data-classes="${(feat.classes ?? ["all"]).join(" ")}">`,
      `<header class="feat-card-header">`,
      level == null ? "" : `<span class="feat-card-level" title="Уровень ${level}">${level}</span>`,
      `<h4 class="feat-card-name">${name}</h4>`,
      sphere ? featIcon(sphere) : "", featIcon(group), side ? featIcon(side) : "",
      `</header>`,
      feat.req ? `<p class="feat-card-req">${feat.req}</p>` : "",
      `<p class="feat-card-desc">${feat.desc}</p>`,
      note ? `<p class="feat-card-note">${note}</p>` : "",
      `</article>`,
    ].join("");
  }

  // Все черты одной группы — точечный вывод
  eleventyConfig.addShortcode("featCards", function (groupId) {
    if (!groupById.has(groupId)) throw new Error(`featCards: unknown group "${groupId}"`);
    const cards = feats.feats
      .filter((f) => f.group === groupId)
      .map((f) => featCardHtml(f));
    return `<div class="feat-cards">${cards.join("")}</div>`;
  });

  // Полный список черт с фильтрами по группе, сфере и доступности.
  // Аргумент — id класса: его чип включается сразу, страница класса открывается
  // уже отфильтрованной, но фильтр можно снять и увидеть все черты. Карточки на
  // странице класса идут без id: каноническое место черты — /Feats/.
  eleventyConfig.addShortcode("featList", function (classId = "") {
    const active = String(classId).trim();
    if (active && !classById.has(active)) throw new Error(`featList: unknown class "${active}"`);
    const chip = (meta, axis, on = false) =>
      `<button type="button" class="feat-filter-chip" data-axis="${axis}" data-value="${meta.id}"` +
      ` aria-pressed="${on}" title="${meta.title}">${featIcon(meta, " feat-filter-icon")}` +
      `<span class="feat-filter-label">${meta.title}</span></button>`;
    const row = (items, axis, caption, activeId = null) =>
      `<div class="feat-filter-row"><span class="feat-filter-caption">${caption}</span>` +
      items.map((m) => chip(m, axis, m.id === activeId)).join("") + `</div>`;
    const panel = [
      `<div class="feat-filter" role="toolbar" aria-label="Фильтр черт">`,
      row(feats.groups, "group", "Группа"),
      row(feats.spheres, "sphere", "Влияние"),
      row(feats.classes, "classes", "Доступность", active),
      `</div>`,
    ].join("");
    const cards = feats.feats.map((f) => featCardHtml(f, { link: active !== "" }));
    return `${panel}<div class="feat-cards feat-cards--filtered">${cards.join("")}</div>`;
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
      const [id, level, note] = entry.trim().split(":").map((v) => v && v.trim());
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
