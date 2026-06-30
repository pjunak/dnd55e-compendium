/* ═══════════════════════════════════════════════════════════════
 *  migrate.cjs — DEV-ONLY, re-runnable. Reads a local Living-scroll checkout
 *  and emits the addon's data/<kind>.js files.
 *
 *  Philosophy (per the brief): parse the STRUCTURED frontmatter faithfully,
 *  PRESERVE human prose (markdown body → `text`) AND the calculations/formulas
 *  in suitable forms — spell `actions` automation, class `preparation_formula`,
 *  armor AC strings — verbatim, rather than regex-flattening them. Targeted
 *  parsers handle the few prose-but-regular bits (weapon damage/props, armor AC
 *  string, darkvision range, subclass domain-spell tables, background skills).
 *  Anything we can't map cleanly is kept under `_unmapped`/`_notes` and tallied
 *  in GAPS — nothing is silently dropped.
 *
 *  Engine-critical mechanics that Living-scroll encodes only as prose/tables
 *  (Barbarian/Monk Unarmored Defense, per-class weapon-mastery counts, the
 *  cantrips-known/prepared columns) are supplied by CLASS_MECHANICS below — an
 *  explicit, small structured overlay merged onto the migrated classes so the
 *  rules engine keeps working. Every such case is also recorded in GAPS.
 *
 *  Run:  node tools/migrate.cjs  [path-to-players_handbook]
 * ═══════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SRC = process.argv[2] || path.resolve(__dirname, '../../Living-scroll/modules/compendium/data/dnd_2024/players_handbook');
const OUT = path.resolve(__dirname, '../data');
const GAPS = [];
const gap = (kind, id, msg) => GAPS.push({ kind, id, msg });

// ── frontmatter parse (tolerant of `---name:` glued openers + `...` markers) ──
function parseFile(file) {
  let raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/^﻿/, '');
  if (!raw.startsWith('---')) return { fm: {}, body: raw.trim() };
  let rest = raw.slice(3);
  if (rest[0] !== '\n') rest = '\n' + rest;            // split a glued `---name:`
  const lines = rest.split('\n');
  const fmLines = [];
  let i = 1;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') { i++; break; }
    fmLines.push(lines[i]);
  }
  while (i < lines.length && (lines[i].trim() === '---' || lines[i].trim() === '...')) i++;
  const body = lines.slice(i).join('\n').trim();
  let fm = {};
  try { fm = yaml.load(fmLines.join('\n')) || {}; }
  catch (e) { fm = {}; gap('_parse', path.basename(file), 'YAML error: ' + e.message); }
  return { fm, body };
}

// ── helpers ──────────────────────────────────────────────────────
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stripId = (id) => (id && id.includes(':') ? id.split(':').pop() : id) || '';
const ABBR = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };
const ability = (a) => { const k = String(a || '').trim(); return ABBR[k.toLowerCase()] || k.toUpperCase().slice(0, 3); };
const listFiles = (dir, recurse = true) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && recurse) out.push(...listFiles(p, recurse));
    else if (e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_')) out.push(p);
  }
  return out;
};
const baseId = (file, fmId) => stripId(fmId) || path.basename(file, '.md');

// ── targeted parsers (small, dedicated — NOT a universal regex blast) ─────────
function parseWeaponCategory(cat) {
  const s = String(cat || '').toLowerCase();
  return { category: s.includes('martial') ? 'martial' : 'simple', range: s.includes('ranged') ? 'ranged' : 'melee' };
}
function parseDamage(s) {
  const m = String(s || '').match(/(\d+d\d+)\s*([A-Za-z]+)?/);
  return m ? { damage: m[1], damageType: (m[2] || '').toLowerCase() } : { damage: '', damageType: '' };
}
function parseProperties(props) {
  const flat = (Array.isArray(props) ? props : [props]).filter(Boolean).join(',').split(',').map((x) => x.trim()).filter(Boolean);
  const out = { properties: [], versatileDamage: null, thrownRange: null, rangeNormalLong: null };
  for (const raw of flat) {
    const low = raw.toLowerCase();
    if (low.startsWith('versatile')) { out.properties.push('versatile'); const m = raw.match(/\((\d+d\d+)\)/); if (m) out.versatileDamage = m[1]; }
    else if (low.startsWith('thrown')) { out.properties.push('thrown'); const m = raw.match(/(\d+)\s*\/\s*(\d+)/); if (m) out.thrownRange = { normal: +m[1], long: +m[2] }; }
    else if (low.startsWith('ammunition') || low.startsWith('range')) { out.properties.push('ammunition'); const m = raw.match(/(\d+)\s*\/\s*(\d+)/); if (m) out.rangeNormalLong = { normal: +m[1], long: +m[2] }; }
    else if (low.startsWith('two')) out.properties.push('two-handed');
    else out.properties.push(low.replace(/\(.*\)/, '').trim());
  }
  out.properties = out.properties.filter(Boolean);
  return out;
}
function parseArmorCategory(cat) {
  const s = String(cat || '').toLowerCase();
  if (s.includes('shield')) return 'shield';
  if (s.includes('heavy')) return 'heavy';
  if (s.includes('medium')) return 'medium';
  return 'light';
}
function parseAcString(acStr, armorType) {
  const s = String(acStr || '').trim();
  if (armorType === 'shield') { const m = s.match(/\+?\s*(\d+)/); return { baseAC: 0, dexCap: null, acBonus: m ? +m[1] : 2 }; }
  const base = (s.match(/(\d+)/) || [])[1];
  const hasDex = /dex/i.test(s);
  const cap = (s.match(/max\s*(\d+)/i) || [])[1];
  return { baseAC: base ? +base : 10, acBonus: 0, dexCap: hasDex ? (cap ? +cap : null) : 0 };
}
function parseDarkvision(features) {
  for (const f of features || []) {
    if (/darkvision/i.test(f.name || '')) { const m = String(f.description || '').match(/(\d+)\s*f(?:ee|oo)t/i); if (m) return +m[1]; }
  }
  return 0;
}
// Subclass "Domain/Circle/Oath spells" tables → always-prepared grants.
function parseGrantedSpellTable(body) {
  const out = [];
  const re = /\|\s*(\d+)(?:st|nd|rd|th)\s*\|\s*([^|\n]+?)\s*\|/g;   // | 3rd | *Aid*, *Bless* |
  let m;
  while ((m = re.exec(body))) {
    const level = +m[1];
    const ids = m[2].split(',').map((x) => slug(x.replace(/[*_]/g, '').trim())).filter(Boolean);
    if (ids.length) out.push({ level, ids, alwaysPrepared: true });
  }
  return out;
}
function bodyField(body, label) {
  // "**Skill Proficiencies:** Arcana and History" → ['arcana','history']
  const re = new RegExp('\\*\\*' + label + ':?\\*\\*\\s*([^\\n]+)', 'i');
  const m = body.match(re);
  if (!m) return null;
  return m[1].replace(/\.$/, '').split(/,| and /i).map((x) => x.trim()).filter(Boolean);
}

// ── engine-critical mechanics Living-scroll encodes only as prose/tables ──────
// Explicit structured overlay (merged onto migrated classes). Each entry that
// supplies something missing from the source is also recorded in GAPS.
const CLASS_MECHANICS = {
  barbarian: { weaponMastery: { count: 2 }, acFormulas: [{ id: 'unarmored-defense-barbarian', base: 10, addAbilities: ['DEX', 'CON'], requires: { noArmor: true } }] },
  monk:      { weaponMastery: { count: 2 }, acFormulas: [{ id: 'unarmored-defense-monk', base: 10, addAbilities: ['DEX', 'WIS'], requires: { noArmor: true, noShield: true } }] },
  fighter:   { weaponMastery: { count: 3 } },
  ranger:    { weaponMastery: { count: 2 } },
  paladin:   { weaponMastery: { count: 2 } },
  rogue:     { weaponMastery: { count: 2 } },
  wizard:    { spellcastingExtra: { ritual: true } },
  cleric:    { spellcastingExtra: { ritual: true } },
  druid:     { spellcastingExtra: { ritual: true } },
  bard:      { spellcastingExtra: { ritual: true } },
};

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// ── vertical markdown tables ──────────────────────────────────────
// Living-scroll renders class tables "vertically": a row block starts with a
// lone `|` line, then one cell per line ending in `|`, terminated by a blank
// line. Consecutive row blocks form one table; a prose line ends the table.
function parseVerticalTables(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const tables = [];
  let curTable = [], curRow = null;
  const flushRow = () => { if (curRow && curRow.length) curTable.push(curRow); curRow = null; };
  const flushTable = () => { flushRow(); if (curTable.length) tables.push(curTable); curTable = []; };
  for (const line of lines) {
    const t = line.trim();
    if (t === '|') { flushRow(); curRow = []; }
    else if (curRow && t.endsWith('|')) curRow.push(t.slice(0, -1).trim());
    else if (t === '') flushRow();
    else flushTable();
  }
  flushTable();
  return tables;
}

// Find the class Features table that carries the per-level Cantrips / Prepared
// Spells columns (the authoritative 2024 counts). Returns { level: {cantripsKnown,
// preparedSpells} } or null when the class body has no such table (bard/paladin/
// ranger — their markdown ships no table; SPELL_PROGRESSION_FALLBACK covers them).
function extractSpellTable(body) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const intOrNull = (s) => { const m = String(s || '').match(/\d+/); return m ? +m[0] : null; };
  for (const table of parseVerticalTables(body)) {
    if (table.length < 2) continue;
    const header = table[0].map(norm);
    const li = header.findIndex((h) => h === 'level');
    const ci = header.findIndex((h) => h === 'cantrips' || h === 'cantrips known');
    const pi = header.findIndex((h) => h === 'prepared spells' || h === 'spells prepared' || h === 'spells known');
    if (li < 0 || (ci < 0 && pi < 0)) continue;
    const out = {};
    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const lvl = intOrNull(row[li]);
      if (!lvl || lvl > 20) continue;
      const rec = {};
      if (ci >= 0) { const v = intOrNull(row[ci]); if (v != null) rec.cantripsKnown = v; }
      if (pi >= 0) { const v = intOrNull(row[pi]); if (v != null) rec.preparedSpells = v; }
      if (Object.keys(rec).length) out[lvl] = rec;
    }
    if (Object.keys(out).length) return out;
  }
  return null;
}

// Authoritative 2024 darkvision range, read from the species body prose
// ("Darkvision with a range of N feet") — the frontmatter often omits it or is
// stale (Dwarf frontmatter says 60, the body's 120 is correct). Take the max.
function parseBodyDarkvision(body) {
  let best = 0;
  const re = /darkvision[^.\n]*?range of\s*(\d+)\s*f(?:ee|oo)t/gi;
  let m;
  while ((m = re.exec(String(body || '')))) best = Math.max(best, +m[1]);
  return best;
}

// Subclass feature headings ("### Level N: Name") → structured feature list so
// the Builder can surface them in the progression log (parity with class features;
// full mechanical application of each remains prose, see GAPS).
function parseSubclassFeatures(body) {
  const out = [], seen = new Set();
  const re = /^#{2,4}\s*Level\s*(\d+):\s*(.+?)\s*$/gim;
  let m;
  while ((m = re.exec(String(body || '')))) {
    const level = +m[1];
    const name = m[2].replace(/[*_`]/g, '').trim();
    const id = slug(name);
    const key = level + ':' + id;
    if (!id || seen.has(key)) continue;
    seen.add(key);
    out.push({ level, id, name });
  }
  return out;
}

// ── curated 2024 overlays (the source ships these as prose/tables we can't map
//    generically; mirror the CLASS_MECHANICS pattern — each is GAP-recorded) ──

// Per-level (index 0 = level 1) spell counts for the 3 casters whose Living-scroll
// markdown carries NO Features table. FULL_PREPARED matches the parsed cleric/druid
// table exactly (the standardized 2024 full-caster progression); HALF_PREPARED is
// the 2024 half-caster progression (cross-referenced — source lacks the table).
const FULL_PREPARED = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22];
const HALF_PREPARED = [2, 3, 4, 5, 6, 6, 7, 7, 8, 8, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15];
const BARD_CANTRIPS = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const SPELL_PROGRESSION_FALLBACK = {
  bard:    { cantripsKnown: BARD_CANTRIPS, preparedSpells: FULL_PREPARED },
  paladin: { preparedSpells: HALF_PREPARED },   // half-caster, no cantrips
  ranger:  { preparedSpells: HALF_PREPARED },   // half-caster, no cantrips
};

// Lineage grants the source encodes only in per-level prose tables. Merged onto
// the migrated lineages by id (camelCase, what the engine reads). Fixed cantrips
// ride in `spells` as level-0 always-prepared; a CHOICE of cantrip stays under
// `cantrips` (deferred picker, like feat choose-grants).
const SPECIES_LINEAGE_GRANTS = {
  elf: {
    'high-elf': { spells: [
      { id: 'he-cantrip', choose: 1, spellLevel: 0, from: { class: ['wizard'] }, alwaysPrepared: true },
      { level: 3, ids: ['detect-magic'], alwaysPrepared: true, free: '1/long' },
      { level: 5, ids: ['misty-step'], alwaysPrepared: true, free: '1/long' }] },
    'wood-elf': { speedBonus: 5,
      spells: [{ level: 0, ids: ['druidcraft'], alwaysPrepared: true }, { level: 3, ids: ['longstrider'], alwaysPrepared: true, free: '1/long' }, { level: 5, ids: ['pass-without-trace'], alwaysPrepared: true, free: '1/long' }] },
    'drow': { senses: { darkvision: 120 },
      spells: [{ level: 0, ids: ['dancing-lights'], alwaysPrepared: true }, { level: 3, ids: ['faerie-fire'], alwaysPrepared: true, free: '1/long' }, { level: 5, ids: ['darkness'], alwaysPrepared: true, free: '1/long' }] },
  },
  dwarf: {
    'hill-dwarf': { hpPerLevel: 1 },          // Dwarven Toughness (HP-3)
    'mountain-dwarf': {},                      // armor training — not an engine-applied stat
  },
  gnome: {
    'forest-gnome': { spells: [{ level: 0, ids: ['minor-illusion'], alwaysPrepared: true }, { level: 1, ids: ['speak-with-animals'], alwaysPrepared: true, free: 'pb/long' }] },
    'rock-gnome': { spells: [{ level: 0, ids: ['mending', 'prestidigitation'], alwaysPrepared: true }] },
  },
  halfling: {
    'lightfoot': {},
    'stout': { resistances: ['poison'] },
  },
};

// Feat mechanical grants the source leaves in prose. Only FIXED-id grants are
// curated (the engine grants them as always-prepared); choose-grants (Magic
// Initiate "pick 2 cantrips") stay deferred. Ability increases are mapped
// generically from frontmatter `attribute_increase` (see featGrants).
const FEAT_MECHANICS = {
  // A FIXED grant + a CHOOSE-1 (school-filtered). The picker resolves the choice;
  // the engine grants whatever the player picks (`grantChoices` keyed by the id).
  'fey-touched': { spells: [
    { level: 1, ids: ['misty-step'], alwaysPrepared: true, free: '1/long' },
    { id: 'fey-pick', choose: 1, spellLevel: 1, from: { school: ['divination', 'enchantment'] }, alwaysPrepared: true, free: '1/long' },
  ] },
  'shadow-touched': { spells: [
    { level: 1, ids: ['invisibility'], alwaysPrepared: true, free: '1/long' },
    { id: 'shadow-pick', choose: 1, spellLevel: 1, from: { school: ['illusion', 'necromancy'] }, alwaysPrepared: true, free: '1/long' },
  ] },
  // Magic Initiate (2024 generic): 2 cantrips + 1 level-1 spell from the Cleric,
  // Druid, OR Wizard list. Modeled as the union (the class-choice sub-step is
  // collapsed into one combined pool — a reasonable simplification).
  'magic-initiate': { spells: [
    { id: 'mi-cantrips', choose: 2, spellLevel: 0, from: { class: ['cleric', 'druid', 'wizard'] }, alwaysPrepared: true },
    { id: 'mi-spell', choose: 1, spellLevel: 1, from: { class: ['cleric', 'druid', 'wizard'] }, alwaysPrepared: true, free: '1/long' },
  ] },
};

// Merge frontmatter features + parsed/curated spell counts into a per-level
// progression. For casters this fills EVERY level that carries spell data (the
// engine reads the highest row ≤ level, and counts change at levels without a
// feature row), so the progression becomes complete; non-casters keep their
// sparse feature-only rows.
function buildProgression(fmProgression, spellTable, fallback) {
  const byLevel = {};
  for (const p of fmProgression || []) byLevel[num(p.level)] = { level: num(p.level), features: p.features || [] };
  const counts = Object.assign({}, spellTable || {});
  if (fallback) {
    for (let l = 1; l <= 20; l++) {
      const rec = {};
      if (fallback.cantripsKnown && fallback.cantripsKnown[l - 1] != null) rec.cantripsKnown = fallback.cantripsKnown[l - 1];
      if (fallback.preparedSpells && fallback.preparedSpells[l - 1] != null) rec.preparedSpells = fallback.preparedSpells[l - 1];
      if (Object.keys(rec).length) counts[l] = Object.assign({}, counts[l], rec);
    }
  }
  const levels = new Set([...Object.keys(byLevel).map(Number), ...Object.keys(counts).map(Number)]);
  const out = [];
  for (const l of [...levels].sort((a, b) => a - b)) {
    const row = byLevel[l] || { level: l, features: [] };
    if (counts[l]) Object.assign(row, counts[l]);
    out.push(row);
  }
  return out;
}

// Map a feat's frontmatter (+ curated overlay) into the engine-read grant shape.
function featGrants(fm, id) {
  const grants = {};
  const ai = fm.attribute_increase;
  if (Array.isArray(ai) && ai.length) grants.abilityScoreIncrease = { choose: 1, amount: 1, from: ai.map(ability) };
  if (fm.grants && fm.grants.hp_per_level) grants.hpPerLevel = num(fm.grants.hp_per_level);
  if (fm.proficiency) grants.proficiencies = fm.proficiency;
  if (fm.expertise) grants.expertise = fm.expertise;
  const mech = FEAT_MECHANICS[id];
  if (mech && mech.spells) grants.spells = mech.spells;
  return grants;
}

// ── mappers ──────────────────────────────────────────────────────
function mapSpell(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  return {
    id, kind: 'spell', name: fm.name || id, edition: '2024',
    level: Number.isFinite(fm.level) ? fm.level : 0, school: fm.school || '',
    classes: (fm.classes || []).map((c) => slug(c)),
    ritual: !!fm.ritual, concentration: !!fm.concentration,
    castingTime: fm.casting_time || '1 action', range: fm.range || 'Touch',
    components: fm.components || [], material: fm.material || '', duration: fm.duration || 'Instantaneous',
    actions: fm.actions || null,   // PRESERVED automation/calculations (engine doesn't consume yet — see GAPS)
    text: body,
  };
}
function mapWeapon(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const { category, range } = parseWeaponCategory(fm.category);
  const { damage, damageType } = parseDamage(fm.damage);
  const props = parseProperties(fm.properties);
  return {
    id, kind: 'weapon', name: fm.name || id, edition: '2024',
    category, range, damage, damageType,
    properties: props.properties, versatileDamage: props.versatileDamage,
    thrownRange: props.thrownRange, rangeNormalLong: props.rangeNormalLong,
    mastery: fm.mastery || '', weight: fm.weight || '', cost: fm.cost || '', text: body,
  };
}
function mapArmor(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const armorType = parseArmorCategory(fm.category);
  const ac = parseAcString(fm.ac, armorType);
  const rec = {
    id, kind: 'armor', name: fm.name || id, edition: '2024', armorType,
    baseAC: ac.baseAC, dexCap: ac.dexCap, acBonus: ac.acBonus,
    strReq: fm.strength_requirement || 0, stealthDisadvantage: !!fm.stealth_disadvantage,
    weight: fm.weight || '', cost: fm.cost || '', _acSource: fm.ac || '', text: body,
  };
  if (!fm.strength_requirement && /strength\s*\d|str\s*\d/i.test(body)) gap('armor', id, 'strReq may be in prose, not frontmatter');
  return rec;
}
function mapBackground(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const abil = ((fm.ability_bonus_options && fm.ability_bonus_options.abilities) || []).map(ability);
  const skills = (bodyField(body, 'Skill Proficiencies') || []).map(slug);
  const tool = (bodyField(body, 'Tool Proficiency') || [])[0] || '';
  if (!skills.length) gap('background', id, 'skill proficiencies not found in body');
  return {
    id, kind: 'background', name: fm.name || id, edition: '2024',
    abilityScores: abil, originFeat: slug(fm.starting_feat || ''),
    skillProficiencies: skills, toolProficiency: tool, text: body,
  };
}
function mapFeat(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const grants = featGrants(fm, id);
  // Ability increases + frontmatter proficiencies are now structured; flag only
  // the still-prose SPELL grants (fixed ones not in FEAT_MECHANICS, and all
  // choose-grants like Magic Initiate) so they stay on the radar.
  if (!grants.spells && /\b(cantrip|spell)\b/i.test(body) && /\b(learn|know|always have|prepared)\b/i.test(body)) {
    gap('feat', id, 'spell grants are in prose — not structured (fixed grants need FEAT_MECHANICS; choose-grants deferred)');
  }
  return {
    id, kind: 'feat', name: fm.name || id, edition: '2024',
    category: fm.category || 'general',
    prerequisites: fm.prerequisite ? { text: fm.prerequisite } : {},
    repeatable: !!fm.repeatable,
    grants,
    text: body,
  };
}
function mapSpecies(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const features = fm.features || [];
  const traits = features.filter((f) => !f.options).map((f) => ({ name: f.name, text: f.description || '' }));
  const lineageFeat = features.find((f) => Array.isArray(f.options) && f.options.length);
  const linOverlay = SPECIES_LINEAGE_GRANTS[id] || {};
  const lineages = (lineageFeat ? lineageFeat.options.map((o) => ({ id: slug(o.value || o.label), name: o.label || o.value, grants: o.grants || {} })) : [])
    .map((l) => (linOverlay[l.id] ? { ...l, grants: { ...l.grants, ...linOverlay[l.id] } } : l));
  // Body prose is authoritative for darkvision (frontmatter often omits/stales it).
  const darkvision = Math.max(parseDarkvision(features), parseBodyDarkvision(body));
  if (lineages.some((l) => !linOverlay[l.id]) && /lineage|legacy|ancestry/i.test(body) && /spell|cantrip/i.test(body)) {
    gap('species', id, 'some lineage spell grants remain prose (not in SPECIES_LINEAGE_GRANTS overlay)');
  }
  if (!darkvision && /darkvision/i.test(body)) gap('species', id, 'darkvision range may be prose-only');
  return {
    id, kind: 'species', name: fm.name || id, edition: '2024',
    size: (fm.size ? String(fm.size) : 'Medium').replace(/^./, (c) => c.toUpperCase()),
    speeds: { walk: Number.isFinite(fm.speed) ? fm.speed : 30 },
    senses: darkvision ? { darkvision } : {}, resistances: [],
    lineages, traits, text: body,
  };
}
function mapClass(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const prof = fm.proficiencies || {};
  const sc = fm.spellcasting || null;
  const mgmt = (Array.isArray(fm.management) ? fm.management : []).find((x) => x && (x.type === 'spell_preparation' || x.id === 'prepared'));
  const spellcasting = sc ? {
    ability: ability(sc.ability), type: sc.progression || 'full',
    prepares: sc.has_spellbook ? 'spellbook' : 'list',
    prepared: !!sc.prepared, ritual: false, startLevel: 1,
    preparedFormula: sc.preparation_formula || (mgmt && mgmt.max_formula) || null,   // reference only — the engine reads the parsed/curated per-level counts below
  } : null;
  const mech = CLASS_MECHANICS[id] || {};
  const isCaster = !!spellcasting;
  const spellTable = isCaster ? extractSpellTable(body) : null;       // authoritative 2024 per-level counts (cleric/druid/sorcerer/warlock/wizard)
  const fallback = isCaster ? SPELL_PROGRESSION_FALLBACK[id] : null;  // curated counts for table-less casters (bard/paladin/ranger)
  if (spellcasting) Object.assign(spellcasting, mech.spellcastingExtra || {});
  if (isCaster && !spellTable && fallback) gap('class', id, 'no Features table in source markdown — per-level cantrips/prepared come from the curated 2024 fallback (SPELL_PROGRESSION_FALLBACK)');
  if (isCaster && !spellTable && !fallback) gap('class', id, 'caster has NO per-level cantrips/prepared table or fallback — counts default to 0');
  if (!mech.weaponMastery && /weapon mastery/i.test(body)) gap('class', id, 'weapon-mastery count is in prose — supplied by overlay only if known');
  const rec = {
    id, kind: 'class', name: fm.name || id, edition: '2024',
    hitDie: fm.hit_die || 'd8',
    primaryAbility: (Array.isArray(fm.primary_ability) ? fm.primary_ability : [fm.primary_ability]).filter(Boolean).map(ability),
    savingThrows: (fm.saves || []).map(ability),
    startingProficiencies: {
      armor: prof.armor || [], weapons: prof.weapons || [], tools: prof.tools || [],
      skills: (prof.skills_choose || prof.skill_list) ? { choose: prof.skills_choose || 0, from: (prof.skill_list || []).map(slug) } : null,
    },
    multiclassProficiencies: { armor: [], weapons: [], tools: [] },   // GAP: source doesn't separate
    weaponMastery: mech.weaponMastery || { count: 0 },
    subclassLevel: 3,
    spellcasting,
    acFormulas: mech.acFormulas || [],
    classResources: [],   // GAP: Rage/Ki/etc. counts are prose
    progression: buildProgression(fm.progression, spellTable, fallback),
    multiclassRequirements: fm.multiclass_requirements || null,
    management: fm.management || null,
    grants: prof.skills_choose ? { choices: [{ id: 'skills:' + id, source: id + ':1', type: 'skills', count: prof.skills_choose }] } : { choices: [] },
    text: body,
  };
  return rec;
}
function mapSubclass(file, classId) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const spells = parseGrantedSpellTable(body);
  const features = parseSubclassFeatures(body);
  // Headings are now structured (level + name) so the Builder lists them in the
  // progression log; full MECHANICAL application of each effect remains prose.
  gap('subclass', id, 'feature mechanics remain prose (### Level N: …) — headings structured, effects not auto-applied');
  return {
    id, kind: 'subclass', name: fm.name || id, classId: slug(fm.class || classId || ''),
    subclassLevel: 3, spells, spellcasting: fm.spellcasting || null, features, grants: {}, text: body,
  };
}

// Leading CR token → number for sorting ("1/4 (XP 50)" → 0.25, "5 (XP …)" → 5).
function parseCrValue(cr) {
  const s = String(cr || '').trim();
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/);
  if (frac) return +frac[1] / +frac[2];
  const whole = s.match(/^(\d+(?:\.\d+)?)/);
  return whole ? +whole[1] : null;
}
function mapMonster(file) {
  const { fm, body } = parseFile(file);
  const id = baseId(file, fm.id);
  const stats = fm.stats || {};
  const statsOut = {};
  for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha']) statsOut[a.toUpperCase()] = num(stats[a], 10);
  const size = String(fm.size || '').trim();
  const typeRaw = String(fm.type || '').trim();   // source `type` is "<Size> <CreatureType>" (e.g. "Large Elemental")
  const creatureType = (size && typeRaw.toLowerCase().startsWith(size.toLowerCase())) ? typeRaw.slice(size.length).trim() : typeRaw;
  return {
    id, kind: 'monster', name: fm.name || id, edition: '2024',
    size, type: typeRaw, creatureType, alignment: String(fm.alignment || ''),
    ac: String(fm.ac || ''), hp: String(fm.hp || ''), speed: String(fm.speed || ''),
    stats: statsOut, cr: String(fm.cr || ''), crValue: parseCrValue(fm.cr),
    traits: (fm.traits || []).map((tr) => ({ name: tr.name || '', text: tr.description || '' })),
    // The compendium is a REFERENCE browser, not a combat engine: the prose body
    // already carries the human-readable stat block (attacks, saves, damage), so
    // the source's machine-readable `actions` automation is intentionally NOT
    // shipped (it bloats boot data for a feature that may never exist). It stays
    // in Living-scroll and is re-derivable in one line if a combat addon is built.
    text: body,
  };
}
function mapRule(file, subdir) {
  const { fm, body } = parseFile(file);
  const base = path.basename(file, '.md');
  const title = fm.title || fm.name || base.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: slug((subdir ? subdir + '-' : '') + base),   // path-scoped id (rules nest in topic subdirs) — avoids collisions
    kind: 'rule', name: title, edition: '2024',
    category: String(fm.category || subdir || ''), tags: Array.isArray(fm.tags) ? fm.tags : [],
    source: String(fm.source || ''), text: body,
  };
}

// ── run ──────────────────────────────────────────────────────────
function write(name, constName, records) {
  const header = `// GENERATED by tools/migrate.cjs from Living-scroll — do not hand-edit.\n`
    + `// Re-run: node tools/migrate.cjs. Prose (text) + formulas (spell actions,\n`
    + `// class preparedFormula, armor _acSource) are preserved; see data/GAPS.md.\n`;
  fs.writeFileSync(path.join(OUT, name), header + `export const ${constName} = ${JSON.stringify(records, null, 2)};\n`);
  return records.length;
}

function main() {
  if (!fs.existsSync(SRC)) { console.error('Source not found:', SRC); process.exit(1); }
  const phb = SRC;
  const counts = {};

  const spellRecs = listFiles(path.join(phb, 'spells')).map(mapSpell);
  const noClass = spellRecs.filter((s) => !s.classes.length).length;
  if (noClass) gap('spell', '(' + noClass + ' spells)', 'empty `classes` list in the source — listSpells({class}) cannot class-filter these; the class spell lists are not in the spell frontmatter');
  counts.spells = write('spells.js', 'SPELLS', spellRecs);
  counts.weapons = write('weapons.js', 'WEAPONS', listFiles(path.join(phb, 'equipment', 'weapons')).map(mapWeapon));
  counts.armor = write('armor.js', 'ARMOR', listFiles(path.join(phb, 'equipment', 'armor')).map(mapArmor));
  counts.backgrounds = write('backgrounds.js', 'BACKGROUNDS', listFiles(path.join(phb, 'backgrounds')).map(mapBackground));
  counts.feats = write('feats.js', 'FEATS', listFiles(path.join(phb, 'feats')).map(mapFeat));
  counts.species = write('species.js', 'SPECIES', listFiles(path.join(phb, 'species')).map(mapSpecies));

  // Classes: base.md per class dir; subclasses under subclasses/.
  const classes = [], subclasses = [];
  const classDir = path.join(phb, 'classes');
  for (const e of fs.readdirSync(classDir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const baseFile = path.join(classDir, e.name, 'base.md');
    if (fs.existsSync(baseFile)) classes.push(mapClass(baseFile));
    const subDir = path.join(classDir, e.name, 'subclasses');
    const seen = new Set();
    for (const sf of listFiles(subDir)) {
      const sub = mapSubclass(sf, e.name);
      if (seen.has(sub.id)) { gap('subclass', sub.id, 'duplicate subclass file skipped: ' + path.basename(sf)); continue; }
      seen.add(sub.id); subclasses.push(sub);
    }
  }
  counts.classes = write('classes.js', 'CLASSES', classes);
  counts.subclasses = write('subclasses.js', 'SUBCLASSES', subclasses);

  // Bestiary + rules — reference CONTENT (browse only; the engine never reads them).
  const monsterRecs = listFiles(path.join(phb, 'monsters')).map(mapMonster);
  counts.monsters = write('monsters.js', 'MONSTERS', monsterRecs);
  gap('monster', '(all)', 'machine-readable action automation (damage/save) intentionally NOT shipped — the compendium browses the prose stat block; re-derivable from source for a future combat addon');
  const rulesRoot = path.join(phb, 'rules');
  const ruleRecs = listFiles(rulesRoot).map((f) => {
    const dir = path.dirname(path.relative(rulesRoot, f));
    return mapRule(f, dir === '.' ? '' : dir.split(/[\\/]/)[0]);
  });
  counts.rules = write('rules.js', 'RULES', ruleRecs);

  // GAPS report
  const byKind = {};
  for (const g of GAPS) (byKind[g.kind] = byKind[g.kind] || []).push(g);
  let md = `# Migration gaps & engine notes\n\nGenerated by tools/migrate.cjs. These are places where Living-scroll encodes\ndata as prose/tables/formulas that the current core-rules engine does not yet\nconsume in structured form. Nothing was dropped — prose is in \`text\`, formulas\nare preserved (spell \`actions\`, class \`preparedFormula\`, armor \`_acSource\`).\n\n`
    + `## Engine TODO — preserved data the engine does not yet CONSUME\n\n`
    + `These are the "fix without forgetting" items: the data is migrated, but\n`
    + `core-rules needs work to act on it.\n\n`
    + `### Now CONSUMED (resolved this pass)\n\n`
    + `- **per-level cantrips-known + prepared-spells**: the markdown Features table is\n`
    + `  now PARSED (\`extractSpellTable\`) into \`progression[].cantripsKnown\`/\`preparedSpells\`\n`
    + `  for cleric/druid/sorcerer/warlock/wizard (the authoritative 2024 counts — these\n`
    + `  diverge from \`preparedFormula\`, e.g. cleric L5 = 9 not WIS+5). bard/paladin/ranger\n`
    + `  ship NO table, so they use the curated \`SPELL_PROGRESSION_FALLBACK\` (bard = the\n`
    + `  standard full-caster table, == parsed cleric; paladin/ranger = the half-caster\n`
    + `  table). \`spellcasting.preparedFormula\` is kept for reference only.\n`
    + `- **species darkvision**: read from the body prose (\`parseBodyDarkvision\`), which is\n`
    + `  authoritative over the frontmatter (e.g. Dwarf 120, not the stale 60).\n`
    + `- **lineage grants (senses / speed / resistances / hpPerLevel / fixed spells)**:\n`
    + `  the prose lineage tables are structured via \`SPECIES_LINEAGE_GRANTS\` (elf/dwarf/\n`
    + `  gnome/halfling) and applied by the engine (darkvision take-highest, Dwarven\n`
    + `  Toughness HP, level-gated always-prepared lineage spells).\n`
    + `- **feat grants**: \`attribute_increase\` → \`grants.abilityScoreIncrease\` (half-feat\n`
    + `  bumps the Builder now applies), \`grants.hp_per_level\` → \`grants.hpPerLevel\` (Tough),\n`
    + `  and FIXED feat spell grants via \`FEAT_MECHANICS\` (e.g. Fey Touched → Misty Step).\n`
    + `- **subclass feature headings**: \`### Level N: Name\` parsed into \`features[]\` so the\n`
    + `  Builder lists them in the progression log.\n\n`
    + `### Still DEFERRED\n\n`
    + `- **spell \`actions\`**: full save / damage / scaling automation is preserved, but\n`
    + `  there is no combat resolver yet (damage/automation — display only).\n`
    + `- **subclass + feat feature MECHANICS**: effects beyond spells/ability bumps stay\n`
    + `  prose (no auto-apply of e.g. a subclass proficiency or a feat's situational rule).\n`
    + `- **feat/lineage CHOOSE-spell grants** (Magic Initiate "pick 2 cantrips", High Elf\n`
    + `  wizard-cantrip choice): only fixed-id grants auto-apply; the choose-picker is deferred.\n`
    + `- **tiefling/dragonborn/aasimar lineages**: their legacy/ancestry options aren't in\n`
    + `  the frontmatter, so no \`lineages[]\` exist to enrich (content task, not engine).\n`
    + `- **classResources (Rage/Ki/…), multiclassProficiencies, armor strReq/stealth,\n`
    + `  warlock Pact Magic slots**: not structured / not modeled.\n`
    + `- **mechanics overlay**: Barbarian/Monk Unarmored Defense + per-class weapon-mastery\n`
    + `  counts come from \`tools/migrate.cjs → CLASS_MECHANICS\` (hand-authored), NOT the\n`
    + `  source. Extend it as the engine grows.\n\n`
    + `## Per-record source gaps (auto-detected)\n\n`;
  for (const k of Object.keys(byKind).sort()) {
    const items = byKind[k];
    md += `## ${k} (${items.length})\n`;
    const uniq = [...new Set(items.map((x) => x.msg))];
    for (const msg of uniq) {
      const ids = items.filter((x) => x.msg === msg).map((x) => x.id);
      md += `- ${msg} — ${ids.length} record(s)${ids.length <= 8 ? ': ' + ids.join(', ') : ''}\n`;
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(OUT, 'GAPS.md'), md);

  console.log('Migrated:', JSON.stringify(counts));
  console.log('GAPS:', GAPS.length, '→ data/GAPS.md');
}
main();
