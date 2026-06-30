'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  Server half of dnd55e-compendium.
//
//  The reference content lives as a per-record JSON tree bundled WITH this
//  addon's code (data/<dir>/<id>.json, see data/SCHEMA.md). At init we read the
//  whole tree off disk into an in-memory CONTENT map + an id index, then serve
//  it under the namespaced prefix /api/addon/dnd55e-compendium/*.
//
//  TRUE DYNAMIC DISCOVERY: drop a JSON file into data/<dir>/ and it's live on
//  the next server load — no build, no migration, no codegen. Human-navigable,
//  individually reviewable records.
//
//  WHY read our own files directly (require('fs') + __dirname) and NOT the
//  serverHost.data facade: full-trust server code may read the files it ships
//  with. `serverHost.data.{read,write}` is for an addon's RUNTIME data
//  (data/addon-data/<id>/…) — mutable per-instance state — which this is not.
//  This content is immutable, ships in the code dir, and is content-addressed
//  with the addon version.
//
//  Endpoints (all GET — reference data, read-only):
//    /content            → { <kind>: [full records] }   (everything)
//    /content/:kind      → [full records]                (one kind)
//    /item/:kind/:id     → one record | 404
//
//  Kinds are keyed by each record's own singular `kind` field (`class`,
//  `spell`, …) so the wire shape matches the client data API exactly; the
//  plural directory names are only a storage detail.
//
//  Isolation: a throw in init() never crashes the host (the loader try/catches),
//  but we keep it clean anyway — a failed tree read logs + serves empty rather
//  than throwing.
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

/**
 * PURE helper (exported for tests): recursively read every `*.json` under
 * `rootDir`/<dir> and group records by their `kind` field. Records lacking a
 * `kind` are grouped under the immediate sub-directory name as a fallback.
 * Returns `{ content: { <kind>: [records] }, count, kinds }`.
 */
function loadTree(rootDir) {
  const content = {};
  let count = 0;

  function walk(dir, topName) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { return; }                // missing dir → nothing to add
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, topName || e.name);
      } else if (e.isFile() && e.name.endsWith('.json')) {
        let rec;
        try { rec = JSON.parse(fs.readFileSync(full, 'utf8')); }
        catch (_) { continue; }           // skip an unparseable file, keep going
        if (!rec || typeof rec !== 'object') continue;
        const kind = rec.kind || topName || 'unknown';
        (content[kind] || (content[kind] = [])).push(rec);
        count++;
      }
    }
  }

  // Each immediate child dir of rootDir is a kind bucket (classes/, spells/, …).
  let dirs = [];
  try {
    dirs = fs.readdirSync(rootDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (_) { /* no data dir → empty content */ }
  for (const d of dirs) walk(path.join(rootDir, d), d);

  // Stable order within each kind so the API output is deterministic.
  for (const k of Object.keys(content)) {
    content[k].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  }
  return { content, count, kinds: Object.keys(content).sort() };
}

module.exports.loadTree = loadTree;

module.exports.init = (host) => {
  // The bundled tree sits next to this module, one level up under data/.
  const ROOT = path.join(__dirname, '..', 'data');

  let CONTENT = {};
  let INDEX = {};          // kind → { id → record }
  let KINDS = [];
  try {
    const { content, count, kinds } = loadTree(ROOT);
    CONTENT = content;
    KINDS = kinds;
    for (const k of kinds) {
      const m = (INDEX[k] = Object.create(null));
      for (const r of content[k]) if (r && r.id != null) m[r.id] = r;
    }
    host.log(`compendium: ${count} records across ${kinds.length} kinds`);
  } catch (e) {
    // Defensive — loadTree already swallows per-file errors, but never let a
    // surprise crash the host. Serve empty + log.
    host.log('compendium: failed to load content tree:', e && e.message);
  }

  // GET /content → the whole library, grouped by kind.
  host.get('/content', (_req, res) => {
    res.json(CONTENT);
  });

  // GET /content/:kind → one kind's records (empty array for an unknown kind).
  host.get('/content/:kind', (req, res) => {
    res.json(CONTENT[req.params.kind] || []);
  });

  // GET /item/:kind/:id → a single record, or 404.
  host.get('/item/:kind/:id', (req, res) => {
    const byId = INDEX[req.params.kind];
    const rec = byId && byId[req.params.id];
    if (!rec) { res.status(404).json({ error: 'not found' }); return; }
    res.json(rec);
  });

  // GET /kinds → the list of available kinds (handy for diagnostics).
  host.get('/kinds', (_req, res) => {
    res.json({ kinds: KINDS });
  });
};
