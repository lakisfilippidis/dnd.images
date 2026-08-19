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
- **Battle widgets:** `<battle-toolbar>` and `<add-to-battle>` come from the neighboring dice-roller repo (loaded remotely in `base.njk` from `https://ramil-k.github.io/dice-roller/`). The toolbar is a dock flush in the bottom-right corner (initiative / battle map / dice buttons); the first two open the shared **battle screen** — a full-viewport grid with the map, the token pool row and the embedded initiative tracker stacked on the left and a toolbar column on the right (map tools on top, dock-style area toggles + d20 at the bottom; Escape closes, no close button). The initiative button opens the tracker as a HUD without the map — the page stays visible and clickable through the empty map cell; area toggles persist in localStorage `battle-mat-ui`. Everything shares one encounter document (localStorage `battle-mat-canvas`, cross-tab sync) — combatants, combat stats, grid and viewport all live in that single JSON Canvas doc. Every «В бой» click adds one combatant *instance* to the encounter (later instances of a type get a random Russian adjective from `src/scripts/battle-config.js`, which also imports `add-to-battle.js`); the combatant shows in the tracker at once but starts **unplaced** (`x-battleMat.placed:false`) — it appears in the screen's **Reserve** pool tab and is drawn on the map only when the DM drags/click-places it from Reserve. Tracker rows have an editable name; UI strings are localized via `label-*` attributes on `<battle-toolbar>` in `base.njk`; dock theming in `shared.css` via `--bt-*` (`--bm-atb-*` for add-to-battle; the battle screen itself uses its own dark `--bm-*` palette). The standalone `<battle-mat>`/`<initiative-tracker>`/`<roll-any-dice>` launchers still exist in the package but the site no longer mounts them
- **Telegram login:** `src/scripts/tg-login.js` — `<tg-login>` web component (identification only, no server, popup answer trusted as is); mounted in the top nav in `base.njk`, hides itself until its `bot-id` attribute is filled in. Profile in localStorage (`dnd-tg-user`); other scripts read it via `currentUser()` or the `tg-auth-change` window event
- **Icons:** `src/icons/` — SVGs from Sergey Chikin's free set (https://sergeychikin.ru/365/, download as `https://sergeychikin.ru/365/<category>/<name>.svg`)
- **Dice widgets:** `<roll-dice>`/`<roll-any-dice>` custom elements loaded remotely in `base.njk`
- **Styling:** `src/styles/shared.css` — single stylesheet; theme colors/fonts/shadows are CSS variables in `:root`, use them instead of hardcoded values
- **Deployment:** `.github/workflows/deploy.yml` — builds and deploys to GitHub Pages on push to main
