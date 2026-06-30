# dnd55e-compendium

All **D&D 5.5e (2024) content** for [ttrpg-codex](https://github.com/pjunak/ttrpg-codex),
plus a browse UI. Addon id: `dnd55e-compendium`.

Two jobs:

1. **Data provider** — `provide()`s a pure data API (no game logic): enumerate
   classes/species/backgrounds/… for dropdowns, and look an item up by id or name. The
   `dnd55e-core-rules` engine consumes this via `host.use`.
2. **Rulebook browser** — `/compendium` pages. Useful on its own; **zero client
   dependencies** (it only needs its own server module).

## How content is stored & served

Content is a **per-record JSON tree** under [`data/`](data) — one file per record:

```
data/classes/<classId>.json
data/subclasses/<classId>/<subclassId>.json   ← nested under the owning class
data/species/<speciesId>.json
data/backgrounds/<backgroundId>.json
data/feats/<featId>.json
data/spells/<spellId>.json
data/monsters/<monsterId>.json
data/rules/<ruleId>.json
data/armor/<armorId>.json
data/weapons/<weaponId>.json
data/skills/<skillId>.json
```

Each file is the **full record** (declarative mechanics + a Markdown `text` body) as
pretty JSON — see [`data/SCHEMA.md`](data/SCHEMA.md) for the shapes. They're plain,
hand-editable, individually-reviewable source files.

The addon's **server module** ([`server/index.cjs`](server/index.cjs)) reads the tree
off disk at init and serves it over a namespaced API:

| Endpoint | Returns |
|---|---|
| `GET /api/addon/dnd55e-compendium/content` | `{ <kind>: [full records] }` (everything) |
| `GET /api/addon/dnd55e-compendium/content/:kind` | `[records]` for one kind |
| `GET /api/addon/dnd55e-compendium/item/:kind/:id` | one record, or 404 |
| `GET /api/addon/dnd55e-compendium/kinds` | `{ kinds: [...] }` (diagnostic) |

Kinds are keyed by each record's singular `kind` field (`class`, `spell`, …).

The **client** ([`entry.js`](entry.js)) fetches the `/content` aggregate **once, lazily**
on first access, caches it, then `host.ui.rerender()`s so anything drawn before the data
arrived refreshes. Before it lands, the data API returns empty lists and the browse pages
show a "Loading…" state — the engine never throws on empty input (the sheet falls back to
hand-fill), and the rerender fills everything in.

### True dynamic discovery (and the restart caveat)

Drop a new `data/<kind>/<id>.json` file and it is **live on the next server load** — no
build step, no codegen, no migration. The trade-offs of using a server module:

- **Requires the `server:code` permission** (granted by the DM at install).
- **Server code activates on a server RESTART.** After install/enable the Addon Manager
  shows `🖥 restart serveru` until the host is restarted; only then does the content
  endpoint come online. (This is the host's restart-to-load model for all server addons.)

## Localization

Record display fields (`name`, `text`) are English in the base data. Per-locale **overlay
catalogs** layer on at read time via the `localize()` seam in `entry.js`, falling back per
field to English. v1 ships no overlays. UI chrome is localized via the vendored `i18n.js`
+ `strings/en.js`, mirroring the host's localization design. (The host exposes no
addon-translation API; addons are otherwise English-only.)

## Develop

```sh
# from the ttrpg-codex repo — installs this addon locally (bypasses GitHub):
node scripts/dev-install-addon.cjs ../dnd55e-compendium
# then (re)start the host so the server module loads.

# tests (assume ttrpg-codex is a sibling checkout):
node --test tests/smoke.mjs    # client: loader + provide() API + wiki-kinds (mocked fetch)
node --test tests/server.cjs   # server: loadTree + the endpoints (temp fixture + bundled tree)
```

See [`AGENTS.md`](AGENTS.md) for the addon authoring contract.
