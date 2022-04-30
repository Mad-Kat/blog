let markdownIt = require("markdown-it");
let markdownItFootnote = require("markdown-it-footnote");
const Image = require("@11ty/eleventy-img");
const { parseHTML } = require('linkedom');
const eleventyNavigationPlugin = require("@11ty/eleventy-navigation");
const pluginRss = require("@11ty/eleventy-plugin-rss");

// function imageShortcode(src, alt, sizes="(min-width: 1024px) 100vw, 50vw") {
//   console.log(`Generating image(s) from:  ${src}`)
//   let options = {
//     widths: [768, 1280, 1600, 1920, null],
//     sizes: '960px', // your responsive sizes here
//     formats: ['webp', 'jpeg'],
//     urlPath: '/static/images',
//     outputDir: './_site/static/images',
//     // filenameFormat: function (id, src, width, format, options) {
//     //   const extension = path.extname(src)
//     //   const name = path.basename(src, extension)
//     //   return `${name}-${width}w.${format}`
//     // }
//   }

//   // generate images
//   Image(src, options)

//   let imageAttributes = {
//     alt,
//     sizes,
//     loading: "lazy",
//     decoding: "async",
//   }
//   // get metadata
//   metadata = Image.statsSync(src, options)
//   return Image.generateHTML(metadata, imageAttributes)
// }


module.exports = function(eleventyConfig) {
  let options = {
    html: true
  };
  let markdownLib = markdownIt(options).use(markdownItFootnote);
  
  eleventyConfig.setLibrary("md", markdownLib);

	eleventyConfig.addPassthroughCopy('static');
	eleventyConfig.addPassthroughCopy('_redirects');
  eleventyConfig.addPlugin(eleventyNavigationPlugin);
  eleventyConfig.addPlugin(pluginRss);

  eleventyConfig.addCollection("posts_en", function (collection) {
    return collection.getFilteredByGlob("./pages/en/*.md");
  });
  eleventyConfig.addCollection("posts_de", function (collection) {
    return collection.getFilteredByGlob("./pages/de/*.md");
  });

  // eleventyConfig.addShortcode("image", imageShortcode)

  // if (process.env.ELEVENTY_ENV)
    eleventyConfig.addTransform('transform', (content, outputPath) => {
      if (outputPath && outputPath.endsWith('.html')) {
        let { document } = parseHTML(content)

        const options = {
          widths: [768, 1280, 1600, 1920, null],
          sizes: ['960px','480px'], // your responsive sizes here
          formats: ['webp', 'jpeg'],
          urlPath: '/static/images',
          outputDir: './_site/static/images'
        }
          
        const images = [...document.querySelectorAll('p img')]

        images.forEach((i, index) => {
          const src = '.' + i.getAttribute('src')

          const meta = Image.statsSync(src, options)
          const last = meta.jpeg[meta.jpeg.length - 1]
          if (last.width < 500) return
          
          Image(src, options)
          i.setAttribute('width', last.width)
          i.setAttribute('height', last.height)
          if (index !== 0) {
            i.setAttribute('loading', 'lazy')
            i.setAttribute('decoding', 'async')
          }

          i.outerHTML = `
          <picture>
            <source type="image/webp" sizes="${options.sizes}" srcset="${meta.webp.map(p => p.srcset).join(', ')}">
            <source type="image/jpeg" sizes="${options.sizes}" srcset="${meta.jpeg.map(p => p.srcset).join(', ')}">
            ${i.outerHTML}
          </picture>`
        })
        return `${document}`
      }
      return content
    })
  return {
    passthroughFileCopy: true
  }
};