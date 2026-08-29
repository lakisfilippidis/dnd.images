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


  // Карточки черт плута (src/_data/rogueFeats.js). Страницы, где они
  // используются, лежат на глубине два (/Classes/rogue/, /Personalities/X/),
  // поэтому иконки и ссылки — относительные.
  const rogueFeats = require("./src/_data/rogueFeats.js");
  const featById = new Map(rogueFeats.feats.map((f) => [f.id, f]));
  const groupById = new Map(rogueFeats.groups.map((g) => [g.id, g]));
  const sphereById = new Map(rogueFeats.spheres.map((sp) => [sp.id, sp]));
  const sideById = new Map(rogueFeats.sides.map((s) => [s.id, s]));

  function featIcon(meta, extraClass = "") {
    return `<img class="feat-card-icon${extraClass}" eleventy:ignore src="../../icons/${meta.icon}" alt="${meta.title}" title="${meta.title}" width="40" height="40">`;
  }

  function featCardHtml(feat, { level = null, note = null, link = false } = {}) {
    const group = groupById.get(feat.group);
    const sphere = sphereById.get(feat.sphere);
    const side = sideById.get(feat.side);
    if (feat.side && !side) throw new Error(`feat "${feat.id}": unknown side "${feat.side}"`);
    const name = link
      ? `<a href="../../Classes/rogue/#feat-${feat.id}">${feat.name}</a>`
      : feat.name;
    return [
      `<article class="feat-card${side ? ` feat-card--${side.id}` : ""}"${link ? "" : ` id="feat-${feat.id}"`}>`,
      `<header class="feat-card-header">`,
      level == null ? "" : `<span class="feat-card-level" title="Уровень ${level}">${level}</span>`,
      `<h4 class="feat-card-name">${name}</h4>`,
      featIcon(sphere), featIcon(group), side ? featIcon(side) : "",
      `</header>`,
      feat.req ? `<p class="feat-card-req">${feat.req}</p>` : "",
      `<p class="feat-card-desc">${feat.desc}</p>`,
      note ? `<p class="feat-card-note">${note}</p>` : "",
      `</article>`,
    ].join("");
  }

  // Все черты одной группы — для страницы класса
  eleventyConfig.addShortcode("featCards", function (groupId) {
    if (!groupById.has(groupId)) throw new Error(`featCards: unknown group "${groupId}"`);
    const cards = rogueFeats.feats
      .filter((f) => f.group === groupId)
      .map((f) => featCardHtml(f));
    return `<div class="feat-cards">${cards.join("")}</div>`;
  });

  // Легенда иконок — для страницы класса
  eleventyConfig.addShortcode("featLegend", function () {
    const row = (items, caption) =>
      `<p class="feat-legend-row"><strong>${caption}:</strong> ` +
      items.map((m) => `<span class="feat-legend-item">${featIcon(m)} ${m.title}</span>`).join(" ") +
      `</p>`;
    return `<div class="feat-legend">${row(rogueFeats.groups, "Группы")}${row(rogueFeats.spheres, "Тип влияния")}${row(rogueFeats.sides, "Сторона шкалы")}</div>`;
  });

  // Рецептура (src/_data/rogueRecipes.js): эффекты, ингредиенты и основы.
  // Доза собирается из ингредиентов; эффект попадает в неё, если есть хотя бы
  // у двух, а сила — число таких ингредиентов минус один, отсюда три строки
  // у карточки эффекта. Карточка ингредиента перечисляет его четыре эффекта
  // со знаком: «−» вред, «+» польза.
  const rogueRecipes = require("./src/_data/rogueRecipes.js");
  const effectById = new Map(rogueRecipes.effects.map((e) => [e.id, e]));
  const ingredientById = new Map(rogueRecipes.ingredients.map((i) => [i.id, i]));
  const effectKindById = new Map(rogueRecipes.kinds.map((k) => [k.id, k]));
  const recipeTierById = new Map(rogueRecipes.tiers.map((t) => [t.id, t]));
  const regionById = new Map(rogueRecipes.regions.map((r) => [r.id, r]));

  function effectCardHtml(effect) {
    const kind = effectKindById.get(effect.kind);
    const tier = recipeTierById.get(effect.tier);
    if (!kind || !tier) throw new Error(`effect "${effect.id}": unknown kind or tier`);
    const rows = effect.stacks.map((text, i) =>
      `<p class="recipe-stack"><span class="recipe-stack-label">${i + 1} ${i === 0 ? "доля" : "доли"}</span> ${text}</p>`
    ).join("");
    const meta = [kind.title, tier.title, effect.save ? `спасбросок ${effect.save}` : null].filter(Boolean).join(", ");
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
      ? `<a class="effect-chip effect-chip--${kind.id}" href="../../Classes/rogue/#effect-${effect.id}">${label}</a>`
      : `<a class="effect-chip effect-chip--${kind.id}" href="#effect-${effect.id}">${label}</a>`;
  }

  function ingredientCardHtml(ingredient, { note = null, link = false } = {}) {
    const region = regionById.get(ingredient.region);
    if (!region) throw new Error(`ingredient "${ingredient.id}": unknown region "${ingredient.region}"`);
    const name = link
      ? `<a href="../../Classes/rogue/#ingredient-${ingredient.id}">${ingredient.name}</a>`
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

  // Эффекты одного рода и одной ступени: "harm:apprentice", "boon:master"
  eleventyConfig.addShortcode("effectCards", function (selector) {
    const [kindId, tierId] = String(selector).split(":").map((x) => x.trim());
    if (!effectKindById.has(kindId)) throw new Error(`effectCards: unknown kind "${kindId}"`);
    if (!recipeTierById.has(tierId)) throw new Error(`effectCards: unknown tier "${tierId}"`);
    const cards = rogueRecipes.effects.filter((e) => e.kind === kindId && e.tier === tierId).map(effectCardHtml);
    if (cards.length === 0) throw new Error(`effectCards: nothing matches "${selector}"`);
    return `<div class="feat-cards recipe-cards">${cards.join("")}</div>`;
  });

  // Ингредиенты одного региона — для страницы класса
  eleventyConfig.addShortcode("ingredientCards", function (regionId) {
    if (!regionById.has(regionId)) throw new Error(`ingredientCards: unknown region "${regionId}"`);
    const cards = rogueRecipes.ingredients.filter((i) => i.region === regionId).map((i) => ingredientCardHtml(i));
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
    const cards = rogueRecipes.bases.map((b) => {
      const tier = b.tier ? recipeTierById.get(b.tier) : null;
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
    if (opts.tier && !recipeTierById.has(opts.tier)) throw new Error(`alchemyLab: unknown tier "${opts.tier}"`);
    const payload = {
      tiers: rogueRecipes.tiers,
      regions: rogueRecipes.regions.map(({ id, title }) => ({ id, title })),
      effects: rogueRecipes.effects,
      ingredients: rogueRecipes.ingredients,
      bases: rogueRecipes.bases.map(({ id, name, slots }) => ({ id, name, slots })),
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
