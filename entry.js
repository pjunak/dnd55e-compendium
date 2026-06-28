// ═══════════════════════════════════════════════════════════════
//  dnd55e-compendium — all D&D 5.5e content + a browse UI.
//
//  Two jobs:
//   1. provide() a PURE DATA API (no game logic) consumed by dnd55e-core-rules:
//      enumerate content for dropdowns, look an item up by id or name.
//   2. Browse pages (a rulebook reader) — useful on its own, no dependency.
//
//  Content is bundled static data shipped with the addon (M0: a small seed; M2:
//  the migrated full set). It is NOT a host collection — it's read-only
//  reference data, so it sidesteps cross-addon collection isolation entirely.
//
//  Localization: record display fields (name/text) are English in the base
//  data; `localize()` is the single seam where per-locale overlay catalogs
//  (data/i18n/<locale>.json) plug in, resolving each field active→English.
// ═══════════════════════════════════════════════════════════════

import { t, activeLocale } from './i18n.js';
import { CLASSES, SPECIES, BACKGROUNDS } from './data/seed.js';

export default function register(host) {
  const { esc, renderMarkdown } = host.h;

  // In-memory index by kind. The seed import is replaced by the migrated
  // content in M2 (same shape).
  const BY_KIND = { class: CLASSES, species: SPECIES, background: BACKGROUNDS };
  const ALL = [].concat(CLASSES, SPECIES, BACKGROUNDS);

  // Per-locale content overlays (recordId.field → translated string), loaded
  // per active locale. v1 ships none → English base is used. This is the ONLY
  // place localization plugs in; consumers always receive localized records.
  const OVERLAYS = {}; // e.g. { cs: { 'wizard.name': '…', 'wizard.text': '…' } }
  const localize = (rec) => {
    if (!rec) return rec;
    const ov = OVERLAYS[activeLocale()];
    if (!ov) return rec;
    const pick = (field) => ov[rec.id + '.' + field] ?? rec[field];
    return { ...rec, name: pick('name'), text: pick('text') };
  };

  const slim = (rec) => ({ id: rec.id, name: rec.name, kind: rec.kind });
  const listKind = (kind) => (BY_KIND[kind] || []).map(localize).map(slim);
  const getItem = (kind, id) => {
    const r = (BY_KIND[kind] || []).find((x) => x.id === id);
    return r ? localize(r) : null;
  };
  const getItemByName = (kind, name) => {
    const n = String(name || '').trim().toLowerCase();
    const r = (BY_KIND[kind] || []).find((x) => (x.name || '').toLowerCase() === n);
    return r ? localize(r) : null;
  };

  // ── Data API (consumed by dnd55e-core-rules via host.use) ────────
  host.provide({
    apiVersion: 1,
    listClasses:     () => listKind('class'),
    listSubclasses:  (_classId) => [],          // M2
    listSpecies:     () => listKind('species'),
    listBackgrounds: () => listKind('background'),
    listFeats:       () => [],                   // M2
    listSpells:      (_q) => [],                 // M2 (names-only first)
    listEquipment:   (_q) => [],                 // M2
    listSkills:      () => [],                   // M2
    getItem,
    getItemByName,
  });

  // ── Browse UI ────────────────────────────────────────────────────
  host.registerSidebarPage({ route: '/compendium', label: t('nav.compendium'), icon: '📚' });
  host.registerRoute('compendium', (sub) => (sub ? renderItem(sub) : renderIndex()));

  function section(titleKey, kind) {
    const items = listKind(kind);
    const rows = items.length
      ? items.map((r) => `<li><a href="#/compendium/${esc(r.id)}">${esc(r.name || t('misc.unnamed'))}</a></li>`).join('')
      : `<li style="color:var(--text-muted)">${esc(t('misc.empty'))}</li>`;
    return `
      <div style="margin-top:var(--space-4)">
        <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(t(titleKey))}</div>
        <ul style="margin-top:var(--space-2);line-height:1.9">${rows}</ul>
      </div>`;
  }

  function renderIndex() {
    return `
      <div class="page-header"><h1>📚 ${esc(t('page.title'))}</h1></div>
      <p style="color:var(--text-muted);max-width:42rem">${esc(t('page.intro'))}</p>
      <p style="color:var(--text-muted);font-size:var(--text-sm)">${esc(t('misc.seedNote'))}</p>
      ${section('kind.classes', 'class')}
      ${section('kind.species', 'species')}
      ${section('kind.backgrounds', 'background')}`;
  }

  function renderItem(id) {
    const rec = localize(ALL.find((x) => x.id === id));
    if (!rec) {
      return `<div class="page-header"><h1>${esc(t('misc.notFound'))}</h1></div>
        <p><a href="#/compendium">← ${esc(t('misc.back'))}</a></p>`;
    }
    const meta = [];
    if (rec.hitDie) meta.push(`${esc(t('label.hitDie'))}: <strong>${esc(rec.hitDie)}</strong>`);
    if (Array.isArray(rec.saves) && rec.saves.length) meta.push(`${esc(t('label.saves'))}: <strong>${esc(rec.saves.join(', '))}</strong>`);
    return `
      <div class="page-header">
        <a href="#/compendium" style="color:var(--text-muted)">← ${esc(t('misc.back'))}</a>
        <h1>${esc(rec.name || t('misc.unnamed'))}</h1>
      </div>
      ${meta.length ? `<p style="color:var(--text-light)">${meta.join('  ·  ')}</p>` : ''}
      <div class="md-view">${renderMarkdown(rec.text || '')}</div>`;
  }
}
