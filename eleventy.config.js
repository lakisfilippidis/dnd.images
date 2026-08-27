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
    const side = feat.side ? sideById.get(feat.side) : null;
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
