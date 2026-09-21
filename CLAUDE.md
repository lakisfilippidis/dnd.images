# CLAUDE.md

Static D&D world wiki (Russian) on Eleventy, deployed to GitHub Pages on push to `main` (`.github/workflows/deploy.yml`). Game rules live on the site pages, not here: read the page before touching the mechanic it describes.

```bash
npm run serve    # dev server with hot reload
npm run build    # builds to _site/ (gitignored); data validation runs here, watch for throws and console.warn
```

## Where to look

- **`eleventy.config.js`** is the entry point: collections (one per section, sorted with `localeCompare(..., "ru")`), passthrough copies, the `/dnd.images/` pathPrefix, and every shortcode. Each shortcode has a comment above it with its argument syntax; the build throws on unknown ids and warns on inconsistencies.
- **Data registries** in `src/_data/` are self-documented in their header comments: `feats.js` (feats, one markdown file per feat in `feats/NN-id.md`), `equipment.js` (weapons and armor, same pattern under `equipment/weapons/` and `equipment/armor/`), `alchemy.js` (tiers, effects, ingredients, bases, `brew()`). Add an item by adding a file; the numeric prefix is the order, the filename is the id, the front matter fields are described in the module header.
- **Layouts** in `src/_includes/`: `base.njk` wraps everything (nav, breadcrumbs, auto-TOC from h2/h3, battle toolbar); section layouts chain to it. `stat-block.njk` and `combat-block.njk` render `stats:` and `combat:` front matter, see any `src/Characters/*/index.md` for the format.
- **Client scripts** in `src/scripts/`: each starts with a comment on what it does and where its data comes from. `battle-config.js` is the only eager loader of the dice-roller widgets; `feat-filter.js`, `alchemy-lab.js`, `scale-tracker.js`, `tg-login.js` load when a page sets the matching front matter flag (`featFilter`, `alchemyLab`, `scaleTracker`).
- **Rules pages**: `src/Rules/` (core rules), `src/Feats/` (feat list and alchemy rules), `src/Equipment/` (weapons, armor, proficiency rules), `src/Classes/<class>/` (class tables, how the class gains feats). Canonical anchors: `/Feats/#feat-<id>`, `/Equipment/#weapon-<id>`, `/Equipment/#armor-<id>`.
- **Example pages** to copy from: a rogue personality with feats, weapons, armor and the scale tracker is `src/Personalities/Spy-Vardan/index.md`; an alchemist with an `alchemy:` block is `src/Characters/Suren/index.md`.

## Content layout

`src/` → `_site/`. One folder per section (Characters, Personalities, Races, Classes, Creatures, Maps, Stories), each with `src/<Section>/<Section>.json` directory data and an index page on the `list.njk` layout. Stories carry a `date:` and are sorted newest first. Standalone pages (`Glossary`, `Rules`, `Feats`, `Equipment`) have self-contained front matter and are excluded from collections.

## Conventions that are not derivable from the code

- In `.njk` pass internal URLs through `| url`; content pages use relative links. Shortcode output already goes through `url`, so cards render at any page depth. Feat and item bodies use only in-page `#` anchors.
- `combat.КБ.value` stays hand-written even though `armorPicks` computes the same total: «В бой» reads it. Keep its `note` equal to the formula; the build warns when they diverge.
- Proficiency (`владение N` in `weaponPicks`) is per weapon and does not scale with level. Non-weapon bullets (ammo, grenades) stay as plain markdown after the shortcode.
- `brew()` in `src/_data/alchemy.js` is duplicated as `brewRows` in `src/scripts/alchemy-lab.js` because the browser cannot load CommonJS. Change both.
- `scaleTracker` and `alchemyLab` persist in localStorage under `dnd-scale-<id>` / `dnd-alchemy-<id>`: always pass a distinct `id:` on character pages.
- Every character, personality and creature gets a 320×320 head crop: `swift tools/headcrop.swift <portrait> <dir>/head.jpg`. The home page and «В бой» use the computed `previewImage`.
- Icons come from Sergey Chikin's free set (`https://sergeychikin.ru/365/<category>/<name>.svg`), black ones only, rendered at 40px or larger.
- Link previews (Open Graph tags in `base.njk`) need absolute URLs: the domain lives in `src/_data/site.json`, update it if the Pages host changes. A page can override the auto-extracted text with `description:` in front matter.
- Styling is one file, `src/styles/shared.css`; colors, fonts and shadows are `:root` variables.

## External pieces

- Battle widgets (`<battle-toolbar>`, `<add-to-battle>`, `<roll-dice>`) are loaded remotely from `https://ramil-k.github.io/dice-roller/`, source in `~/Projects/dice-roller` (push to its `main` rebuilds the Pages `dist/`, nothing to commit here). The encounter document is localStorage `battle-mat-canvas`; UI strings are `label-*` attributes on `<battle-toolbar>` in `base.njk`; dock theming via `--bt-*` / `--bm-*` variables in `shared.css`.
- Multiplayer rooms run on `https://universal.ramilkarimov.me:9443`, repo `ramil-k/dice-roller-sync`, checkout `~/Projects/dice-roller-sync`.
- `<tg-login>` is identification only, no server; profile in localStorage `dnd-tg-user`, read via `currentUser()` or the `tg-auth-change` event.
