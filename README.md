# dnd55e-compendium

All **D&D 5.5e (2024) content** for [ttrpg-codex](https://github.com/pjunak/ttrpg-codex),
plus a browse UI. Addon id: `dnd55e-compendium`.

Two jobs:

1. **Data provider** — `provide()`s a pure data API (no game logic): enumerate
   classes/species/backgrounds/… for dropdowns, and look an item up by id or name. The
   `dnd55e-core-rules` engine consumes this via `host.use`.
2. **Rulebook browser** — `/compendium` pages. Useful on its own; **zero dependencies**.

Content is **bundled static data** that ships with the addon (read-only reference data, not
a host collection — so it sidesteps cross-addon data isolation). M0 ships a tiny placeholder
seed (`data/seed.js`); the full set is migrated from the
[Living-scroll](https://github.com/pjunak/Living-scroll) markdown compendium in a later
milestone, each record carrying declarative mechanics + a Markdown `text` body.

## Localization

Record display fields (`name`, `text`) are English in the base data. Per-locale **overlay
catalogs** (`data/i18n/<locale>.json`, flat `recordId.field → translation`) layer on at read
time via the `localize()` seam in `entry.js`, falling back per field to English. v1 ships no
overlays. UI chrome is localized via the vendored `i18n.js` + `strings/en.js`, mirroring the
host's localization design.

## Develop

```sh
node scripts/dev-install-addon.cjs ../dnd55e-compendium   # from the ttrpg-codex repo
node --test tests/smoke.mjs                               # assumes ttrpg-codex is a sibling
```

See [`AGENTS.md`](AGENTS.md) for the addon authoring contract.
