const markdownIt = require("markdown-it");
const markdownItFootnote = require("markdown-it-footnote");
const Image = require("@11ty/eleventy-img");
const { parseHTML } = require("linkedom");
const eleventyNavigationPlugin = require("@11ty/eleventy-navigation");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const readingTime = require("eleventy-plugin-reading-time");
const moment = require("moment");

const isProd = process.env.ELEVENTY_ENV === "production";

module.exports = function (eleventyConfig) {
  eleventyConfig.setLibrary(
    "md",
    markdownIt({
      html: true,
    }).use(markdownItFootnote)
  );
  eleventyConfig.addPassthroughCopy("static");
  eleventyConfig.addPlugin(readingTime);
  eleventyConfig.addPassthroughCopy("_redirects");
  eleventyConfig.addPlugin(eleventyNavigationPlugin);
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addFilter("debugger", (...args) => {
    console.log(...args);
    debugger;
  });
  eleventyConfig.addCollection("posts_en", function (collection) {
    return collection.getFilteredByGlob("./pages/en/*.md");
  });
  eleventyConfig.addCollection("posts_de", function (collection) {
    return collection.getFilteredByGlob("./pages/de/*.md");
  });
  eleventyConfig.addTransform("transform", createResponisveImages);
  eleventyConfig.addNunjucksFilter("date", function (date, locale) {
    locale = locale ? locale : "en";
    return date.toLocaleDateString(locale, {
      hour: "numeric",
      minute: "numeric",
    });
    // moment.locale(locale);
    // return moment(date).format(format);
  });
  return {
    passthroughFileCopy: true,
  };
};

const createResponisveImages = (content, outputPath) => {
  if (outputPath && outputPath.endsWith(".html")) {
    let { document } = parseHTML(content);

    const options = {
      widths: [768, 1280, 1600, 1920, null],
      sizes: ["960px", "480px"], // your responsive sizes here
      formats: ["webp", "jpeg"],
      urlPath: "/static/images",
      outputDir: "./_site/static/images",
    };

    const images = [...document.querySelectorAll("p img")];

    images.forEach((i, index) => {
      const src = "." + i.getAttribute("src");

      const meta = Image.statsSync(src, options);
      const last = meta.jpeg[meta.jpeg.length - 1];
      if (last.width < 500) return;

      Image(src, options);
      i.setAttribute("width", last.width);
      i.setAttribute("height", last.height);
      if (index !== 0) {
        i.setAttribute("loading", "lazy");
        i.setAttribute("decoding", "async");
      }

      i.outerHTML = `
          <picture>
            <source type="image/webp" sizes="${
              options.sizes
            }" srcset="${meta.webp.map((p) => p.srcset).join(", ")}">
            <source type="image/jpeg" sizes="${
              options.sizes
            }" srcset="${meta.jpeg.map((p) => p.srcset).join(", ")}">
            ${i.outerHTML}
          </picture>`;
    });
    return `${document}`;
  }
  return content;
};
