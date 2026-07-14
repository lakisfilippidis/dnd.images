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

Start from `eleventy.config.js`: it defines all collections (one per content section, sorted with `localeCompare(..., "ru")`), passthrough copies, and the `/dnd.images/` pathPrefix (in `.njk` always pass internal URLs through `| url`; content pages use relative links).

- **Source/output:** `src/` → `_site/` (gitignored)
- **Content sections:** one folder per section under `src/` (Characters, Personalities, Races, Classes, Creatures, Maps). Each has a directory data file `src/<Section>/<Section>.json` (layout, tags, etc.) and an index page using the `list.njk` layout with `collectionTag` front matter
- **Standalone pages:** `src/Glossary/`, `src/Rules/` — self-contained front matter, excluded from collections
- **Layouts:** see `src/_includes/` — `base.njk` is the HTML wrapper (top nav, breadcrumbs, auto-TOC built from h2/h3, initiative tracker shell); section layouts (`character.njk`, `personalities.njk`, `creature.njk`, `race.njk`) chain to it
- **Stat components:** character/personality/creature pages keep ability scores and combat values in front matter (`stats:`, `combat:` — see any `src/Characters/*/index.md` for the format), rendered by `src/_includes/stat-block.njk` and `src/_includes/combat-block.njk` (modifiers are computed in the template; combat notes render as popovers)
- **Battle widgets:** `<battle-mat>`, `<initiative-tracker>` and `<add-to-battle>` come from the neighboring dice-roller repo (loaded remotely in `base.njk` from `https://ramil-k.github.io/dice-roller/`). They share one encounter document (localStorage `battle-mat-canvas`, cross-tab sync); «В бой» buttons fill a persistent token pool (`battle-mat-roster`) — every click adds an *instance*, later instances of a type get a random Russian adjective from `src/scripts/battle-config.js` (which also imports `add-to-battle.js`). Tracker UI strings are localized via `label-*` attributes in `base.njk`; theming in `shared.css` via `--bm-trk-*` / `--bm-atb-*` / `--bm-fab-bg`. The old local `init-tracker.js` (`dnd-init-tracker` key) is gone
- **Telegram login:** `src/scripts/tg-login.js` — `<tg-login>` web component (identification only, no server, popup answer trusted as is); mounted in the top nav in `base.njk`, hides itself until its `bot-id` attribute is filled in. Profile in localStorage (`dnd-tg-user`); other scripts read it via `currentUser()` or the `tg-auth-change` window event
- **Icons:** `src/icons/` — SVGs from Sergey Chikin's free set (https://sergeychikin.ru/365/, download as `https://sergeychikin.ru/365/<category>/<name>.svg`)
- **Dice widgets:** `<roll-dice>`/`<roll-any-dice>` custom elements loaded remotely in `base.njk`
- **Styling:** `src/styles/shared.css` — single stylesheet; theme colors/fonts/shadows are CSS variables in `:root`, use them instead of hardcoded values
- **Deployment:** `.github/workflows/deploy.yml` — builds and deploys to GitHub Pages on push to main
