// ═══════════════════════════════════════════════════════════════
//  dnd55e-compendium — all D&D 5.5e content + a browse UI.
//
//  Two jobs:
//   1. provide() a PURE DATA API (no game logic) consumed by dnd55e-core-rules:
//      enumerate content for dropdowns + look an item up by id or name.
//   2. Browse pages (a rulebook reader) — useful on its own, no dependency.
//
//  Content is bundled static data shipped with the addon (data/<kind>.js,
//  aggregated by data/index.js — see data/SCHEMA.md for the record shapes). It
//  is NOT a host collection: read-only reference data sidesteps cross-addon
//  collection isolation entirely. This seed is REPRESENTATIVE (exercises the
//  hard rules cases); the full set drops into the same files via the
//  Living-scroll migration with no downstream change.
//
//  Localization: record display fields (name/text) are English in the base
//  data; `localize()` is the single seam where per-locale overlay catalogs
//  (data/i18n/<locale>.json) plug in, resolving each field active→English.
//
//  Style/safety contract: HTML only via host.h (esc); colours/spacing only via
//  design tokens var(--…); every chrome string flows through i18n.t().
// ═══════════════════════════════════════════════════════════════

import { t, activeLocale } from './i18n.js';
import { BY_KIND, ALL, BROWSE_KINDS } from './data/index.js';

export default function register(host) {
  const { esc, renderMarkdown } = host.h;

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
  const recordsOf = (kind) => BY_KIND[kind] || [];
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
    kinds:           () => Object.keys(BY_KIND),
  });

  // ── Browse UI ────────────────────────────────────────────────────
  host.registerSidebarPage({ route: '/compendium', label: t('nav.compendium'), icon: '📚' });
  host.registerRoute('compendium', (sub) => (sub ? renderItem(sub) : renderIndex()));

  // [[Label|<kind>]] wiki-links resolve into the compendium detail page. The
  // returned `kind:'compendium'` is the ROUTE; `id` is our "<kind>:<id>" detail
  // param. Additive fallthrough — tried only after every built-in collection
  // misses, so it never shadows a world entity of the same name.
  for (const { kind } of BROWSE_KINDS) {
    host.registerWikiKind(kind, (label) => {
      const r = getItemByName(kind, label);
      return r ? { kind: 'compendium', id: kind + ':' + r.id } : null;
    });
  }

  function renderIndex() {
    return `
      <div class="page-header"><h1>📚 ${esc(t('page.title'))}</h1></div>
      <p style="color:var(--text-muted);max-width:42rem">${esc(t('page.intro'))}</p>
      <p style="color:var(--text-muted);font-size:var(--text-sm)">${esc(t('misc.seedNote'))}</p>
      ${BROWSE_KINDS.map(section).join('')}`;
  }

  function section({ kind, labelKey }) {
    const items = listKind(kind);
    const rows = items.length
      ? items.map((r) => `<li style="margin:0"><a href="#/compendium/${esc(kind)}:${esc(r.id)}">${esc(r.name || t('misc.unnamed'))}</a>${sublabel(r)}</li>`).join('')
      : `<li style="color:var(--text-muted);list-style:none">${esc(t('misc.empty'))}</li>`;
    return `
      <div style="margin-top:var(--space-4)">
        <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(t(labelKey))}</div>
        <ul style="margin-top:var(--space-2);line-height:1.9;list-style:none;padding-left:0">${rows}</ul>
      </div>`;
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
    return s ? ` <span style="color:var(--text-muted);font-size:var(--text-xs)">· ${esc(s)}</span>` : '';
  }

  function renderItem(param) {
    // `param` is "<kind>:<id>" (legacy bare "<id>" → search across all kinds).
    let kind = '', id = String(param);
    const ci = id.indexOf(':');
    if (ci >= 0) { kind = id.slice(0, ci); id = id.slice(ci + 1); }
    const rec = localize(kind ? recordsOf(kind).find((x) => x.id === id) : ALL.find((x) => x.id === id));
    if (!rec) {
      return `<div class="page-header"><h1>${esc(t('misc.notFound'))}</h1></div>
        <p><a href="#/compendium">← ${esc(t('misc.back'))}</a></p>`;
    }
    const meta = metaFor(rec);
    const metaHtml = meta.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:var(--space-3) var(--space-4);margin:var(--space-3) 0">${meta.map((m) => `
          <div><div style="color:var(--text-muted);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.05em">${esc(m.label)}</div>
          <div style="color:var(--text-parchment)">${m.value}</div></div>`).join('')}</div>`
      : '';
    return `
      <div class="page-header">
        <a href="#/compendium" style="color:var(--text-muted)">← ${esc(t('misc.back'))}</a>
        <h1>${esc(rec.name || t('misc.unnamed'))} <span style="color:var(--text-muted);font-size:var(--text-lg);font-weight:400">${esc(t('kindName.' + rec.kind))}</span></h1>
      </div>
      ${metaHtml}
      ${rec.text ? `<div class="md-view">${renderMarkdown(rec.text)}</div>` : ''}`;
  }

  // Per-kind detail metadata: returns [{label, value}] where value is safe HTML.
  function metaFor(rec) {
    const out = [];
    const txt = (label, value) => { if (value != null && value !== '' && !(Array.isArray(value) && !value.length)) out.push({ label, value: esc(Array.isArray(value) ? value.join(', ') : String(value)) }); };
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
        out.push({ label: t('kindName.class'), value: link('class', rec.classId) });
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
        if (rec.originFeat) out.push({ label: t('label.originFeat'), value: link('feat', rec.originFeat) });
        txt(t('label.skills'), rec.skillProficiencies);
        break;
      case 'feat':
        txt(t('label.category'), rec.category ? t('feat.' + rec.category) : '');
        if (rec.prerequisites && rec.prerequisites.level) txt(t('label.prereq'), t('label.levelN', { n: rec.prerequisites.level }));
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
      default:
        break;
    }
    return out;
  }
}
