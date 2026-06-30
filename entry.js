// ═══════════════════════════════════════════════════════════════
//  dnd55e-compendium — all D&D 5.5e content + a browse UI.
//
//  Two jobs:
//   1. provide() a PURE DATA API (no game logic) consumed by dnd55e-core-rules:
//      enumerate content for dropdowns + look an item up by id or name.
//   2. Browse pages (a rulebook reader) — useful on its own, no dependency.
//
//  DATA LOADING. Content is a per-record JSON tree (data/<kind>/<id>.json, see
//  data/SCHEMA.md) that the addon's SERVER half (server/index.cjs) reads off
//  disk and serves at /api/addon/dnd55e-compendium/content. This client lazily
//  fetches that aggregate ONCE on first access (never at register time —
//  register() must stay side-effect-free), caches it in `_data`, then calls
//  host.ui.rerender() so anything drawn before the data landed refreshes.
//  Until it lands, every getter returns an empty list and the browse pages show
//  a "loading…" state — the engine already never throws on empty input (the
//  sheet falls back to hand-fill), and the rerender fills it all in.
//
//  WHY a server module (not bundled JS data): a JSON tree gives true dynamic
//  discovery (drop a file → it's live next server load), human-navigable
//  reviewable records, and lets us delete all migration/codegen tooling. The
//  trade-off is that the server code activates on a server RESTART (and needs
//  the `server:code` grant) — see README.md.
//
//  Localization: record display fields (name/text) are English in the base
//  data; `localize()` is the single seam where per-locale overlay catalogs
//  (data/i18n/<locale>.json) plug in, resolving each field active→English.
//
//  Style/safety contract: HTML only via host.h (esc); colours/spacing only via
//  design tokens var(--…); every chrome string flows through i18n.t().
// ═══════════════════════════════════════════════════════════════

import { t, activeLocale } from './i18n.js';

// The addon's own server endpoint (mounted by server/index.cjs under the
// namespaced prefix). Same-origin — no permission needed to fetch it.
const CONTENT_URL = '/api/addon/dnd55e-compendium/content';

// Kinds shown on the browse index, in display order (skills are reference data,
// not browsed as articles). Each entry: { kind, labelKey }. Was previously in
// the deleted data/index.js; inlined here now that there's no aggregator module.
const BROWSE_KINDS = [
  { kind: 'class', labelKey: 'kind.classes' },
  { kind: 'subclass', labelKey: 'kind.subclasses' },
  { kind: 'species', labelKey: 'kind.species' },
  { kind: 'background', labelKey: 'kind.backgrounds' },
  { kind: 'feat', labelKey: 'kind.feats' },
  { kind: 'spell', labelKey: 'kind.spells' },
  { kind: 'armor', labelKey: 'kind.armor' },
  { kind: 'weapon', labelKey: 'kind.weapons' },
  { kind: 'monster', labelKey: 'kind.monsters' },
  { kind: 'rule', labelKey: 'kind.rules' },
];

export default function register(host) {
  const { esc, renderMarkdown } = host.h;

  // ── Content cache + lazy load ────────────────────────────────────
  // `_data` is `{ <kind>: [full records] }`, populated once from the server.
  // The full record (structured fields + prose) arrives together — there's no
  // meta/detail split anymore, so `recordsOf` is a plain cache read.
  let _data = {};            // kind → record[]  (empty until loaded)
  let _loaded = false;       // resolved successfully at least once
  let _loading = null;       // in-flight promise guard (also the loadDetail await)

  // Kick off the one-time fetch. Returns a promise that resolves when `_data`
  // is populated (or on failure, so awaiters never hang). On success, re-render
  // the current route so pre-load renders refresh.
  const _ensureLoaded = () => {
    if (_loaded) return Promise.resolve();
    if (_loading) return _loading;
    _loading = fetch(CONTENT_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data) => {
        _data = (data && typeof data === 'object') ? data : {};
        _loaded = true;
        // Refresh whatever rendered before the data was here.
        try { host.ui.rerender(); } catch (_) {}
      })
      .catch(() => { /* leave _data empty — getters degrade to []; pages show loading */ })
      .then(() => { _loading = null; });
    return _loading;
  };

  // ── Localization seam (the ONLY place content is localized) ──────
  const OVERLAYS = {}; // e.g. { cs: { 'wizard.name': '…', 'wizard.text': '…' } }
  const localize = (rec) => {
    if (!rec) return rec;
    const ov = OVERLAYS[activeLocale()];
    if (!ov) return rec;
    const pick = (field) => ov[rec.id + '.' + field] ?? rec[field];
    return { ...rec, name: pick('name'), text: pick('text') };
  };

  // ── Lookups ──────────────────────────────────────────────────────
  // Every accessor kicks the lazy load (idempotent) and reads the cache. Before
  // the fetch resolves they return empty / null; the rerender-on-load refreshes.
  const recordsOf = (kind) => { _ensureLoaded(); return _data[kind] || []; };
  /** A lightweight projection for dropdowns — id + name + the few fields a
   *  consumer needs to filter/label without pulling the whole record. */
  const slim = (rec) => {
    const b = { id: rec.id, name: rec.name, kind: rec.kind };
    switch (rec.kind) {
      case 'class':    return { ...b, hitDie: rec.hitDie, caster: !!rec.spellcasting };
      case 'subclass': return { ...b, classId: rec.classId };
      case 'spell':    return { ...b, level: rec.level, school: rec.school, classes: rec.classes || [] };
      case 'feat':     return { ...b, category: rec.category };
      case 'armor':    return { ...b, armorType: rec.armorType };
      case 'weapon':   return { ...b, category: rec.category, mastery: rec.mastery };
      case 'species':  return { ...b, size: rec.size };
      case 'skill':    return { ...b, ability: rec.ability };
      case 'monster':  return { ...b, cr: rec.cr, crValue: rec.crValue, creatureType: rec.creatureType };
      case 'rule':     return { ...b, category: rec.category };
      default:         return b;
    }
  };
  const listKind = (kind) => recordsOf(kind).map(localize).map(slim);
  const getItem = (kind, id) => {
    const r = recordsOf(kind).find((x) => x.id === id);
    return r ? localize(r) : null;
  };
  const getItemByName = (kind, name) => {
    const n = String(name || '').trim().toLowerCase();
    const r = recordsOf(kind).find((x) => (x.name || '').toLowerCase() === n);
    return r ? localize(r) : null;
  };

  // ── Data API (consumed by dnd55e-core-rules via host.use) ────────
  // SHAPE IS STABLE — dnd55e-core-rules + the sheet consume this unchanged.
  // `loadDetail` is preserved for back-compat: prose used to load lazily per
  // kind, now the full records arrive together, so it just awaits the one fetch.
  host.provide({
    apiVersion: 1,
    listClasses:     () => listKind('class'),
    listSubclasses:  (classId) => listKind('subclass').filter((s) => !classId || s.classId === classId),
    listSpecies:     () => listKind('species'),
    listBackgrounds: () => listKind('background'),
    listFeats:       (opts) => { let l = listKind('feat'); if (opts && opts.category) l = l.filter((f) => f.category === opts.category); return l; },
    listSpells:      (q) => {
      let l = listKind('spell');
      if (q && q.level != null) l = l.filter((s) => s.level === q.level);
      if (q && q.class) l = l.filter((s) => Array.isArray(s.classes) && s.classes.includes(q.class));
      return l;
    },
    listArmor:       () => listKind('armor'),
    listWeapons:     () => listKind('weapon'),
    listEquipment:   (q) => {
      const k = q && q.kind;
      if (k === 'armor') return listKind('armor');
      if (k === 'weapon') return listKind('weapon');
      return listKind('armor').concat(listKind('weapon'));
    },
    listSkills:      () => listKind('skill'),
    getItem,
    getItemByName,
    getRecords:      (kind) => recordsOf(kind).map(localize),  // full localized records for a kind
    kinds:           () => Object.keys(_data),
    loadDetail:      () => _ensureLoaded(),  // back-compat: await the one content fetch
  });

  // ── Browse UI ────────────────────────────────────────────────────
  host.registerSidebarPage({ route: '/compendium', label: t('nav.compendium'), icon: '📚' });
  host.registerRoute('compendium', (sub) => (sub ? renderItem(sub) : renderIndex()));

  // [[Label|<kind>]] wiki-links resolve into the compendium detail page. The
  // returned `kind:'compendium'` is the ROUTE; `id` is our "<kind>:<id>" detail
  // param. Additive fallthrough — tried only after every built-in collection
  // misses, so it never shadows a world entity of the same name. Resolves by
  // NAME → real id (per the wiki-kind contract). Returns null until content
  // loads (the resolver fires the lazy load via getItemByName → recordsOf).
  for (const { kind } of BROWSE_KINDS) {
    host.registerWikiKind(kind, (label) => {
      const r = getItemByName(kind, label);
      return r ? { kind: 'compendium', id: kind + ':' + r.id } : null;
    });
  }

  function renderIndex() {
    _ensureLoaded();
    return `
      <div class="page-header"><h1>📚 ${esc(t('page.title'))}</h1></div>
      <p style="color:var(--text-muted);max-width:42rem">${esc(t('page.intro'))}</p>
      <p style="color:var(--text-muted);font-size:var(--text-sm)">${esc(t('misc.seedNote'))}</p>
      ${!_loaded ? `<p style="color:var(--text-muted)">${esc(t('misc.loading'))}</p>` : ''}
      ${BROWSE_KINDS.map(section).join('')}`;
  }

  function section({ kind, labelKey }) {
    const items = listKind(kind);
    const count = items.length
      ? `<span style="color:var(--text-muted);font-size:var(--text-xs);background:var(--bg-raised);border-radius:var(--radius-pill);padding:0 var(--space-2)">${esc(String(items.length))}</span>`
      : '';
    const body = items.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:var(--space-1)">${items.map(itemLink).join('')}</div>`
      : `<div style="color:var(--text-muted);font-size:var(--text-sm)">${esc(_loaded ? t('misc.empty') : t('misc.loading'))}</div>`;
    return cardSection(t(labelKey), body, count);
  }

  // A compendium browse link — name + muted sublabel, as a bordered chip.
  function itemLink(r) {
    return `<a href="#/compendium/${esc(r.kind)}:${esc(r.id)}" style="display:flex;align-items:baseline;gap:var(--space-1);padding:var(--space-1) var(--space-2);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-light);text-decoration:none">
      <span style="color:var(--text-parchment)">${esc(r.name || t('misc.unnamed'))}</span>${sublabel(r)}</a>`;
  }

  // A titled card (gold tick + label + optional right) — the shared browse shell.
  function cardSection(title, body, right) {
    return `<section style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin-top:var(--space-4)">
      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-3);padding-bottom:var(--space-1);border-bottom:1px solid var(--border-subtle)">
        <span style="width:3px;height:.9rem;border-radius:var(--radius-pill);background:var(--accent-gold);flex:none"></span>
        <span style="font-size:var(--text-sm);font-weight:600;color:var(--text-light);letter-spacing:.04em;text-transform:uppercase">${esc(title)}</span>
        ${right ? `<span style="margin-left:auto">${right}</span>` : ''}
      </div>${body}</section>`;
  }

  // A muted hint after each browse link.
  function sublabel(r) {
    let s = '';
    if (r.kind === 'spell') s = r.level === 0 ? t('spell.cantrip') : t('spell.lvl', { n: r.level });
    else if (r.kind === 'class') s = r.caster ? t('misc.caster') : t('misc.martial');
    else if (r.kind === 'weapon') s = [t('weapon.' + r.category), r.mastery].filter(Boolean).join(' · ');
    else if (r.kind === 'armor') s = t('armor.' + r.armorType);
    else if (r.kind === 'subclass') { const c = getItem('class', r.classId); s = c ? c.name : r.classId; }
    else if (r.kind === 'feat') s = t('feat.' + r.category);
    else if (r.kind === 'species') s = r.size;
    else if (r.kind === 'monster') s = r.cr ? t('monster.cr', { cr: String(r.cr).split(' ')[0] }) : (r.creatureType || '');
    else if (r.kind === 'rule') s = r.category;
    return s ? ` <span style="color:var(--text-muted);font-size:var(--text-xs)">· ${esc(s)}</span>` : '';
  }

  // Shown for the frame(s) between a detail click and the content arriving.
  function loadingItem(meta) {
    return `
      <div class="page-header">
        <a href="#/compendium" style="color:var(--text-muted)">← ${esc(t('misc.back'))}</a>
        <h1>${esc((meta && meta.name) || t('misc.loading'))}</h1>
      </div>
      <p style="color:var(--text-muted)">${esc(t('misc.loading'))}</p>`;
  }

  function renderItem(param) {
    // `param` is always "<kind>:<id>" — both browse links and wiki-resolve emit
    // the kind prefix, and ids are unique only WITHIN a kind (see data/SCHEMA.md),
    // so a bare-id lookup across the flat ALL would resolve cross-kind collisions
    // (e.g. spell:shield vs armor:shield) arbitrarily by insertion order. We
    // require the prefix instead of guessing.
    let kind = '', id = String(param);
    const ci = id.indexOf(':');
    if (ci >= 0) { kind = id.slice(0, ci); id = id.slice(ci + 1); }
    // Until the content fetch lands, show a brief loading state; the
    // host.ui.rerender() on load re-renders this page with the full record.
    if (!_loaded) { _ensureLoaded(); return loadingItem(null); }
    const rec = kind ? localize(recordsOf(kind).find((x) => x.id === id)) : null;
    if (!rec) {
      return `<div class="page-header"><h1>${esc(t('misc.notFound'))}</h1></div>
        <p><a href="#/compendium">← ${esc(t('misc.back'))}</a></p>`;
    }
    const meta = metaFor(rec);
    // SAFE BY DEFAULT: esc() every meta value here unless the producer flagged it
    // `raw: true` (the two genuine-HTML cases — cross-links). New metaFor entries
    // need no escaping discipline; only an explicit `raw` opts out.
    const metaHtml = meta.length
      ? `<div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin:var(--space-3) 0;display:flex;flex-wrap:wrap;gap:var(--space-3) var(--space-5)">${meta.map((m) => `
          <div style="min-width:8rem"><div style="color:var(--text-muted);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${esc(m.label)}</div>
          <div style="color:var(--text-parchment)">${m.raw ? m.value : esc(m.value)}</div></div>`).join('')}</div>`
      : '';
    return `
      <div class="page-header">
        <a href="#/compendium" style="color:var(--text-muted)">← ${esc(t('misc.back'))}</a>
        <h1>${esc(rec.name || t('misc.unnamed'))} <span style="color:var(--text-muted);font-size:var(--text-lg);font-weight:400">${esc(t('kindName.' + rec.kind))}</span></h1>
      </div>
      ${metaHtml}
      ${rec.text ? `<div class="md-view">${renderMarkdown(rec.text)}</div>` : ''}`;
  }

  // Per-kind detail metadata: returns [{label, value, raw?}]. `renderItem` esc()s
  // every value BY DEFAULT; only entries that are genuinely HTML carry `raw: true`
  // (the cross-link cases). `txt(...)` pushes a plain string (escaped downstream);
  // `link(...)` returns HTML and its producers must set `raw: true`.
  function metaFor(rec) {
    const out = [];
    const txt = (label, value) => { if (value != null && value !== '' && !(Array.isArray(value) && !value.length)) out.push({ label, value: Array.isArray(value) ? value.join(', ') : String(value) }); };
    const link = (kind, id) => { const r = getItem(kind, id); return r ? `<a href="#/compendium/${esc(kind)}:${esc(id)}">${esc(r.name)}</a>` : esc(id); };
    switch (rec.kind) {
      case 'class':
        txt(t('label.hitDie'), rec.hitDie);
        txt(t('label.saves'), rec.savingThrows);
        if (rec.spellcasting) txt(t('label.spellcasting'), `${rec.spellcasting.ability} · ${t('cast.' + rec.spellcasting.type)}${rec.spellcasting.ritual ? ' · ' + t('label.ritual') : ''}`);
        if (rec.weaponMastery && rec.weaponMastery.count) txt(t('label.mastery'), rec.weaponMastery.count);
        txt(t('label.subclassLevel'), rec.subclassLevel);
        break;
      case 'subclass':
        out.push({ label: t('kindName.class'), value: link('class', rec.classId), raw: true });
        txt(t('label.subclassLevel'), rec.subclassLevel);
        if (rec.spellcasting) txt(t('label.spellcasting'), `${rec.spellcasting.ability} · ${t('cast.' + rec.spellcasting.type)}`);
        break;
      case 'species':
        txt(t('label.size'), rec.size);
        if (rec.speeds && rec.speeds.walk) txt(t('label.speed'), rec.speeds.walk + ' ft.');
        if (rec.senses && rec.senses.darkvision) txt(t('label.darkvision'), rec.senses.darkvision + ' ft.');
        txt(t('label.resistances'), rec.resistances);
        txt(t('label.lineages'), (rec.lineages || []).map((l) => l.name));
        break;
      case 'background':
        txt(t('label.abilityScores'), rec.abilityScores);
        if (rec.originFeat) out.push({ label: t('label.originFeat'), value: link('feat', rec.originFeat), raw: true });
        txt(t('label.skills'), rec.skillProficiencies);
        break;
      case 'feat':
        txt(t('label.category'), rec.category ? t('feat.' + rec.category) : '');
        // Prerequisites are stored as { text } (migrate's frontmatter prose)
        // or { level } (structured). Render whichever is present — the migration
        // emits `text`, so without this branch feat prerequisites never showed.
        if (rec.prerequisites && rec.prerequisites.text) txt(t('label.prereq'), rec.prerequisites.text);
        else if (rec.prerequisites && rec.prerequisites.level) txt(t('label.prereq'), t('label.levelN', { n: rec.prerequisites.level }));
        if (rec.repeatable) txt(t('label.repeatable'), t('misc.yes'));
        break;
      case 'spell': {
        txt(t('label.levelSchool'), `${rec.level === 0 ? t('spell.cantrip') : t('spell.lvl', { n: rec.level })} · ${rec.school}`);
        txt(t('label.classes'), rec.classes);
        txt(t('label.castingTime'), rec.castingTime);
        txt(t('label.range'), rec.range);
        txt(t('label.components'), rec.components);
        txt(t('label.duration'), rec.duration);
        const tags = [];
        if (rec.ritual) tags.push(t('label.ritual'));
        if (rec.concentration) tags.push(t('label.concentration'));
        if (tags.length) txt(t('label.tags'), tags.join(', '));
        break;
      }
      case 'armor':
        txt(t('label.armorType'), t('armor.' + rec.armorType));
        txt(t('label.baseAC'), rec.armorType === 'shield'
          ? '+' + rec.acBonus
          : `${rec.baseAC}${rec.dexCap === 0 ? '' : rec.dexCap == null ? ' + Dex' : ' + Dex (max ' + rec.dexCap + ')'}`);
        if (rec.strReq) txt(t('label.strReq'), 'Str ' + rec.strReq);
        if (rec.stealthDisadvantage) txt(t('label.stealth'), t('misc.disadvantage'));
        break;
      case 'weapon':
        txt(t('label.category'), `${t('weapon.' + rec.category)} · ${t('weapon.' + rec.range)}`);
        txt(t('label.damage'), `${rec.damage} ${rec.damageType}${rec.versatileDamage ? ' (' + rec.versatileDamage + ')' : ''}`);
        txt(t('label.properties'), rec.properties);
        txt(t('label.mastery'), rec.mastery);
        break;
      case 'monster': {
        txt(t('label.creatureType'), [rec.type, rec.alignment].filter(Boolean).join(', '));
        txt(t('label.ac'), rec.ac);
        txt(t('label.hp'), rec.hp);
        txt(t('label.speed'), rec.speed);
        txt(t('label.cr'), rec.cr);
        const mod = (s) => { const m = Math.floor((Number(s) - 10) / 2); return (m >= 0 ? '+' : '') + m; };
        const ab = rec.stats || {};
        const abStr = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((a) => `${a} ${ab[a] != null ? ab[a] : 10} (${mod(ab[a])})`).join('   ');
        // Plain text — escaped by default in renderItem (no `raw`).
        out.push({ label: t('label.abilities'), value: abStr });
        for (const tr of rec.traits || []) if (tr.name) out.push({ label: tr.name, value: tr.text });
        break;
      }
      case 'rule':
        txt(t('label.category'), rec.category);
        txt(t('label.tags'), rec.tags);
        break;
      default:
        break;
    }
    return out;
  }
}
