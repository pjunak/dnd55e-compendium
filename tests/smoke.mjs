// Client self-test for dnd55e-compendium against the host test harness.
// Run: node --test tests/smoke.mjs  (assumes ttrpg-codex is a sibling checkout).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dryRunRegister, smokeRegistrations } from '../../ttrpg-codex/web/js/addon-test-harness.mjs';
import register from '../entry.js';

const META = { id: 'dnd55e-compendium', permissions: ['ui:route', 'ui:sidebar', 'wiki:kind'] };

test('compendium: registers route + sidebar + wiki kinds + provides a data API', () => {
  const { ok, rec, error } = dryRunRegister(register, META);
  assert.ok(ok, error);
  assert.ok(rec.routes.some(r => r.segment === 'compendium'), 'a /compendium route');
  assert.ok(rec.sidebar.some(s => s.route === '/compendium'), 'a sidebar link');
  assert.ok(rec.wikiKinds.some(w => w.scope === 'spell'), 'a [[…|spell]] wiki kind');
  assert.ok(rec.provided && rec.provided.apiVersion === 1, 'provides apiVersion 1');
});

test('compendium: data API enumerates every kind', () => {
  const { rec } = dryRunRegister(register, META);
  const api = rec.provided;
  for (const fn of ['listClasses', 'listSubclasses', 'listSpecies', 'listBackgrounds',
                    'listFeats', 'listSpells', 'listArmor', 'listWeapons', 'listSkills',
                    'listEquipment', 'getItem', 'getItemByName', 'getRecords', 'kinds']) {
    assert.equal(typeof api[fn], 'function', `provides ${fn}()`);
  }
  const classes = api.listClasses();
  assert.ok(Array.isArray(classes) && classes.length >= 2, 'lists classes');
  assert.ok(classes.every(c => c.id && c.name), 'slim {id,name} records');
  assert.equal(api.getItem('class', 'wizard')?.name, 'Wizard', 'getItem by id');
  assert.equal(api.getItemByName('species', 'elf')?.id, 'elf', 'getItemByName');
  assert.equal(api.getItem('class', 'nope'), null, 'missing → null');
  assert.equal(api.listSkills().length, 18, 'all 18 skills');
});

test('compendium: migrated records carry structured fields + preserved formulas', () => {
  const { rec } = dryRunRegister(register, META);
  const api = rec.provided;
  // Caster shape (SP-5/SP-6) + the prepared FORMULA preserved verbatim.
  const wiz = api.getItem('class', 'wizard');
  assert.equal(wiz.spellcasting.prepares, 'spellbook');
  assert.equal(wiz.spellcasting.ritual, true);                       // mechanics overlay
  assert.ok(wiz.spellcasting.preparedFormula, 'preparation_formula preserved');
  // Weapon-mastery count from the mechanics overlay (EQ-4); wizard has none.
  assert.equal(api.getItem('class', 'fighter').weaponMastery.count, 3);
  // Unarmored Defense formula (AC-1) from the overlay.
  const barb = api.getItem('class', 'barbarian');
  assert.ok(barb.acFormulas.some(f => f.addAbilities.includes('CON') && f.requires?.noArmor));
  // Always-prepared subclass spells parsed from the domain-spell table (SP-2).
  const life = api.getItem('subclass', 'life-domain');
  assert.ok(life.spells.some(s => s.alwaysPrepared && s.ids.includes('bless')));
  // 2024 background ASI + skills parsed from prose (AB-1/SB-1).
  const sage = api.getItem('background', 'sage');
  assert.deepEqual([...sage.abilityScores].sort(), ['CON', 'INT', 'WIS']);
  assert.ok(sage.skillProficiencies.length >= 1, 'skills parsed from the body');
  // Armor dex cap parsed from the AC string (AC-2) + weapon mastery (EQ-4).
  assert.equal(api.getItem('armor', 'breastplate').dexCap, 2);
  assert.equal(api.getItem('weapon', 'longsword').mastery, 'Sap');
});

test('compendium: per-level spellcasting + species/lineage/feat grants are structured', () => {
  const { rec } = dryRunRegister(register, META);
  const api = rec.provided;
  const progAt = (id, lvl) => { const c = api.getItem('class', id); let best = null; for (const r of c.progression) if (r.level <= lvl && (!best || r.level > best.level)) best = r; return best; };
  // Per-level cantrips/prepared parsed from the Features table (cleric/druid/…)…
  assert.equal(progAt('cleric', 5).preparedSpells, 9, 'cleric L5 prepared (parsed 2024 table, ≠ formula)');
  assert.equal(progAt('cleric', 5).cantripsKnown, 4, 'cleric L5 cantrips (parsed table)');
  assert.equal(progAt('wizard', 14).preparedSpells, 18, 'wizard diverges from the standard table');
  // …and the curated fallback for the 3 table-less casters (bard/paladin/ranger).
  assert.equal(progAt('bard', 5).preparedSpells, 9, 'bard L5 prepared (fallback)');
  assert.equal(progAt('bard', 10).cantripsKnown, 4, 'bard L10 cantrips (fallback)');
  assert.equal(progAt('paladin', 5).preparedSpells, 6, 'paladin L5 prepared (half-caster fallback)');
  assert.equal(progAt('paladin', 5).cantripsKnown, undefined, 'paladin has no cantrips');
  // Species darkvision read from the body prose (frontmatter omitted/stale).
  assert.equal(api.getItem('species', 'aasimar').senses.darkvision, 60, 'aasimar darkvision from body');
  assert.equal(api.getItem('species', 'dwarf').senses.darkvision, 120, 'dwarf 120 (body), not the stale 60');
  // Lineage grants structured (spells + senses override).
  const lineages = api.getItem('species', 'elf').lineages || [];
  const he = lineages.find((l) => l.id === 'high-elf');
  assert.ok(he && he.grants.spells && he.grants.spells.some((s) => s.ids && s.ids.includes('misty-step')), 'high-elf lineage grants spells');
  assert.ok(he.grants.spells.some((s) => s.id === 'he-cantrip' && s.choose === 1), 'high-elf wizard-cantrip choose-grant');
  assert.equal((lineages.find((l) => l.id === 'drow').grants.senses || {}).darkvision, 120, 'drow lineage darkvision');
  assert.equal(api.getItem('species', 'dwarf').lineages.find((l) => l.id === 'hill-dwarf').grants.hpPerLevel, 1, 'Dwarven Toughness hpPerLevel');
  // Feat grants structured (ability + fixed spell + hpPerLevel).
  const fey = api.getItem('feat', 'fey-touched');
  assert.deepEqual(fey.grants.abilityScoreIncrease.from, ['INT', 'WIS', 'CHA'], 'fey-touched half-feat abilities');
  assert.ok(fey.grants.spells.some((s) => s.ids && s.ids.includes('misty-step')), 'fey-touched grants Misty Step (fixed)');
  assert.ok(fey.grants.spells.some((s) => s.choose === 1 && s.from && s.from.school), 'fey-touched also has a choose-1 school grant');
  assert.ok(api.getItem('feat', 'magic-initiate').grants.spells.some((s) => s.id === 'mi-cantrips' && s.choose === 2), 'magic-initiate choose-grants structured');
  assert.equal(api.getItem('feat', 'tough').grants.hpPerLevel, 2, 'Tough hpPerLevel');
  // Subclass feature headings parsed into a structured list.
  assert.ok((api.getItem('subclass', 'life-domain').features || []).length >= 1, 'subclass features parsed');
});

test('compendium: full content migrated with prose + automation preserved', () => {
  const { rec } = dryRunRegister(register, META);
  const api = rec.provided;
  assert.ok(api.listSpells().length >= 400, '428 spells migrated');
  assert.ok(api.listClasses().length >= 12, 'all classes migrated');
  assert.ok((api.getRecords('weapon') || []).length >= 30, 'weapons migrated');
  // Human prose preserved (markdown body → text).
  assert.ok(/explosion|fiery/i.test(api.getItem('spell', 'fireball').text || ''), 'spell prose preserved');
  // Calculations/automation preserved (Fireball's save + scaling damage block).
  const fb = api.getItem('spell', 'fireball');
  assert.ok(Array.isArray(fb.actions) && fb.actions[0] && fb.actions[0].damage, 'spell actions preserved');
  // Weapon properties parsed out of the comma-joined source string.
  assert.ok(api.getItem('weapon', 'dagger').properties.includes('finesse'), 'weapon properties parsed');
});

test('compendium: spell queries filter by level and class', () => {
  const { rec } = dryRunRegister(register, META);
  const api = rec.provided;
  assert.equal(api.getItem('spell', 'fireball')?.level, 3);
  assert.ok(api.listSpells({ level: 3 }).some(s => s.id === 'fireball'), 'filter by level');
  // NB: many source spells have empty `classes` (see GAPS.md), so filter only
  // works for spells the source tagged — fireball is [sorcerer, wizard].
  assert.ok(api.listSpells({ class: 'wizard' }).some(s => s.id === 'fireball'), 'filter by class (where tagged)');
  assert.ok(api.listSubclasses('cleric').some(s => s.id === 'life-domain'), 'subclasses by class');
});

test('compendium: bestiary + rules migrated as browsable reference content', () => {
  const { rec } = dryRunRegister(register, META);
  const api = rec.provided;
  assert.ok((api.getRecords('monster') || []).length >= 300, 'bestiary migrated (333 creatures)');
  assert.ok((api.getRecords('rule') || []).length >= 20, 'rules migrated');
  // A monster: structured stat-block header + ability scores + preserved prose.
  const ab = api.getItem('monster', 'aboleth');
  assert.ok(ab, 'aboleth resolves');
  assert.equal(ab.stats.STR, 14, 'ability scores structured');
  assert.ok(ab.ac && ab.hp && ab.cr, 'AC / HP / CR present');
  assert.equal(ab.crValue, 5, 'CR parsed to a sortable number');
  assert.ok(/Thunderous Slam/i.test(ab.text || ''), 'prose stat block (attacks) preserved');
  assert.equal(ab.actions, undefined, 'machine-readable combat automation intentionally NOT shipped');
  assert.ok((ab.traits || []).some((tr) => /Resistance|Immunit/i.test(tr.name)), 'frontmatter traits structured');
  // A rule (path-scoped id; prose preserved).
  const gl = api.getItem('rule', 'glossary');
  assert.ok(gl && /Glossary/i.test(gl.name), 'rules glossary resolves by id');
  assert.ok(gl.text && gl.text.length > 100, 'rule prose preserved');
  // Browse + wiki-kinds for both new kinds.
  assert.ok(rec.wikiKinds.some((w) => w.scope === 'monster'), '[[…|monster]] wiki kind');
  assert.ok(rec.wikiKinds.some((w) => w.scope === 'rule'), '[[…|rule]] wiki kind');
  assert.deepEqual(rec.wikiKinds.find((w) => w.scope === 'monster').resolve('Aboleth'), { kind: 'compendium', id: 'monster:aboleth' });
});

test('compendium: a monster detail page renders a stat block', () => {
  const { rec } = dryRunRegister(register, META);
  const html = rec.routes.find((r) => r.segment === 'compendium').render('monster:aboleth');
  assert.match(html, /Aboleth/, 'name');
  assert.match(html, /Armor Class|Hit Points|Challenge Rating/, 'stat-block labels');
  assert.match(html, /STR 14/, 'ability scores with values');
});

test('compendium: a [[Name|spell]] wiki kind resolves to a compendium detail link', () => {
  const { rec } = dryRunRegister(register, META);
  const spellKind = rec.wikiKinds.find(w => w.scope === 'spell');
  assert.deepEqual(spellKind.resolve('Fireball'), { kind: 'compendium', id: 'spell:fireball' });
  assert.equal(spellKind.resolve('Not A Spell'), null);
});

test('compendium: renderers survive the smoke pass', () => {
  const { rec } = dryRunRegister(register, META);
  const smoke = smokeRegistrations(rec);
  assert.ok(smoke.ok, JSON.stringify(smoke.failures));
});
