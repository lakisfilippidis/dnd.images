module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/styles");
  eleventyConfig.addPassthroughCopy("src/**/*.jpg");
  eleventyConfig.addPassthroughCopy("src/**/*.png");

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
