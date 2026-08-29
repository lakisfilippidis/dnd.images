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

  // Карточки рецептов Рецептуры (src/_data/rogueRecipes.js): компоненты ядов,
  // основы и зелья. Доза собирается из долей, поэтому у рецепта три ступени
  // усиления; у основы вместо них — цена в долях.
  const rogueRecipes = require("./src/_data/rogueRecipes.js");
  const recipeById = new Map(rogueRecipes.recipes.map((r) => [r.id, r]));
  const kindById = new Map(rogueRecipes.kinds.map((k) => [k.id, k]));
  const recipeTierById = new Map(rogueRecipes.tiers.map((t) => [t.id, t]));

  function recipeCardHtml(recipe, { note = null, link = false } = {}) {
    const kind = kindById.get(recipe.kind);
    if (!kind) throw new Error(`recipe "${recipe.id}": unknown kind "${recipe.kind}"`);
    const tier = recipeTierById.get(recipe.tier);
    if (!tier) throw new Error(`recipe "${recipe.id}": unknown tier "${recipe.tier}"`);
    const name = link
      ? `<a href="../../Classes/rogue/#recipe-${recipe.id}">${recipe.name}</a>`
      : recipe.name;
    const doles = recipe.kind === "base"
      ? `<p class="recipe-card-doles">${recipe.doles === 0 ? "Долей не занимает" : `Занимает долей: ${recipe.doles}`}</p>`
      : "";
    const body = recipe.kind === "base"
      ? `<p class="feat-card-desc">${recipe.desc}</p>`
      : (recipe.stacks ?? []).map((text, i) =>
          `<p class="recipe-stack"><span class="recipe-stack-label">${i + 1} ${i === 0 ? "доля" : "доли"}</span> ${text}</p>`
        ).join("");
    return [
      `<article class="feat-card recipe-card recipe-card--${kind.id}"${link ? "" : ` id="recipe-${recipe.id}"`}>`,
      `<header class="feat-card-header">`,
      `<h4 class="feat-card-name">${name}</h4>`,
      featIcon(kind),
      `</header>`,
      `<p class="feat-card-req">${tier.id === "free" ? kind.title : `${kind.title}, ${tier.title}`}${recipe.tag ? ` &mdash; ${recipe.tag}` : ""}</p>`,
      doles,
      body,
      note ? `<p class="feat-card-note">${note}</p>` : "",
      `</article>`,
    ].join("");
  }

  // Все рецепты одного рода и одной ступени — для страницы класса.
  // Аргумент: "kind:tier", например "poison:apprentice"; "base:all" — все основы.
  eleventyConfig.addShortcode("recipeCards", function (selector) {
    const [kindId, tierId = "all"] = String(selector).split(":").map((x) => x.trim());
    if (!kindById.has(kindId)) throw new Error(`recipeCards: unknown kind "${kindId}"`);
    if (tierId !== "all" && !recipeTierById.has(tierId)) throw new Error(`recipeCards: unknown tier "${tierId}"`);
    const cards = rogueRecipes.recipes
      .filter((r) => r.kind === kindId && (tierId === "all" || r.tier === tierId))
      .map((r) => recipeCardHtml(r));
    if (cards.length === 0) throw new Error(`recipeCards: nothing matches "${selector}"`);
    return `<div class="feat-cards recipe-cards">${cards.join("")}</div>`;
  });

  // Известные персонажу рецепты — для страниц личностей и персонажей.
  // Аргумент: "id:пометка; id; ..." — пометка необязательна.
  eleventyConfig.addShortcode("recipePicks", function (picks) {
    const cards = String(picks).split(";").map((x) => x.trim()).filter(Boolean).map((pick) => {
      const [id, ...noteParts] = pick.split(":").map((x) => x.trim());
      const recipe = recipeById.get(id);
      if (!recipe) throw new Error(`recipePicks: unknown recipe "${id}"`);
      return recipeCardHtml(recipe, { note: noteParts.join(":") || null, link: true });
    });
    return `<div class="feat-cards recipe-cards">${cards.join("")}</div>`;
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
