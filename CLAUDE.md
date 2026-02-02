# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static D&D world wiki site (Russian language) built with Eleventy (11ty) and deployed to GitHub Pages.

## Development

```bash
npm install
npm run serve    # starts dev server with hot reload
npm run build    # builds to _site/
```

## Architecture

- **Build tool:** Eleventy v3 with Liquid templates (HTML files) and Nunjucks layouts
- **Source directory:** `src/` — all content lives here
- **Output directory:** `_site/` — generated on build, gitignored
- **Layouts:** `src/_includes/base.njk` (base HTML wrapper), `src/_includes/list.njk` (section index pages)
- **Content sections:** Characters, Classes, Creatures, Maps — each in `src/<Section>/`
- **Directory data files:** `src/<Section>/<Section>.json` sets default layout, tags, and bodyClass for all pages in that section
- **Collections:** Eleventy collections (`characters`, `classes`, `creatures`) replace the old `list.json` + JS fetch pattern. Sorting is done in `eleventy.config.js`
- **Section index pages:** Use `list.njk` layout with `collectionTag` front matter to render sorted links at build time
- **Content pages:** HTML files with YAML front matter (title). Body content is the original HTML, wrapped by `base.njk` layout
- **Styling:** `src/styles/shared.css` — fantasy theme using "Uncial Antiqua" font, parchment color palette, responsive layout with CSS Grid/Flexbox
- **Deployment:** GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on push to main
