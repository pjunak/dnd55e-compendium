// Client self-test for dnd55e-compendium against the host test harness.
// Run: node --test tests/smoke.mjs  (assumes ttrpg-codex is a sibling checkout).
//
// The addon now loads its content by FETCHing the server module's aggregate
// endpoint (/api/addon/dnd55e-compendium/content) lazily on first access — so
// these tests install a MOCKED globalThis.fetch returning a small sample tree
// (no real server, no real migrated data). They exercise the loader + the
// provide() data API + wiki-kind resolution + the browse renderers + the
// pre-load degradation path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dryRunRegister, smokeRegistrations } from '../../ttrpg-codex/web/js/addon-test-harness.mjs';
import register from '../entry.js';

const META = { id: 'dnd55e-compendium', permissions: ['ui:route', 'ui:sidebar', 'wiki:kind'] };
const CONTENT_URL = '/api/addon/dnd55e-compendium/content';

// ── A small, hand-authored sample tree: the SAME wire shape the server emits
//    ({ <kind>: [full records] }), one or two records per kind, enough to drive
//    every code path the client owns. Not the real 1000+ record library. ──────
const SAMPLE = {
  class: [
    { id: 'wizard', kind: 'class', name: 'Wizard', hitDie: 'd6', savingThrows: ['INT', 'WIS'],
      subclassLevel: 3, spellcasting: { ability: 'INT', type: 'full', prepares: 'spellbook', ritual: true },
      text: '# Wizard\n\nA scholarly magic-user.' },
    { id: 'fighter', kind: 'class', name: 'Fighter', hitDie: 'd10', savingThrows: ['STR', 'CON'],
      subclassLevel: 3, spellcasting: null, weaponMastery: { count: 3 }, text: '# Fighter' },
  ],
  subclass: [
    { id: 'life-domain', kind: 'subclass', name: 'Life Domain', classId: 'cleric', subclassLevel: 3,
      spells: [{ level: 3, ids: ['bless', 'cure-wounds'], alwaysPrepared: true }], text: '# Life Domain' },
  ],
  species: [
    { id: 'elf', kind: 'species', name: 'Elf', size: 'Medium', speeds: { walk: 30 },
      senses: { darkvision: 60 }, lineages: [{ id: 'high-elf', name: 'High Elf' }], text: '# Elf' },
  ],
  background: [
    { id: 'sage', kind: 'background', name: 'Sage', abilityScores: ['INT', 'CON', 'WIS'],
      originFeat: 'magic-initiate-wizard', skillProficiencies: ['arcana', 'history'], text: '# Sage' },
  ],
  feat: [
    { id: 'fey-touched', kind: 'feat', name: 'Fey Touched', category: 'general',
      prerequisites: { text: 'Level 4+' }, text: '# Fey Touched' },
  ],
  spell: [
    { id: 'fireball', kind: 'spell', name: 'Fireball', level: 3, school: 'Evocation',
      classes: ['wizard', 'sorcerer'], ritual: false, concentration: false,
      castingTime: 'action', range: '150 feet', components: ['V', 'S', 'M'],
      duration: 'Instantaneous', text: 'A bright streak flashes... a fiery explosion.' },
    { id: 'shield', kind: 'spell', name: 'Shield', level: 1, school: 'Abjuration',
      classes: ['wizard'], castingTime: 'reaction', range: 'Self', text: '# Shield' },
  ],
  armor: [
    { id: 'breastplate', kind: 'armor', name: 'Breastplate', armorType: 'medium',
      baseAC: 14, dexCap: 2, text: '' },
  ],
  weapon: [
    { id: 'longsword', kind: 'weapon', name: 'Longsword', category: 'martial', range: 'melee',
      damage: '1d8', damageType: 'slashing', properties: ['versatile'], versatileDamage: '1d10',
      mastery: 'Sap', text: '' },
    { id: 'dagger', kind: 'weapon', name: 'Dagger', category: 'simple', range: 'melee',
      damage: '1d4', damageType: 'piercing', properties: ['finesse', 'light', 'thrown'],
      mastery: 'Nick', text: '' },
  ],
  skill: Array.from({ length: 18 }, (_, i) => ({ id: 'skill-' + i, kind: 'skill', name: 'Skill ' + i, ability: 'DEX' })),
  monster: [
    { id: 'aboleth', kind: 'monster', name: 'Aboleth', size: 'Large', type: 'Large Elemental',
      creatureType: 'Elemental', alignment: 'Neutral', ac: '15', hp: '90 (12d10 + 24)',
      speed: '10 ft.', stats: { STR: 14, DEX: 20, CON: 14, INT: 6, WIS: 10, CHA: 6 },
      cr: '5 (XP 1,800; PB +3)', crValue: 5,
      traits: [{ name: 'Resistances', text: 'Bludgeoning, Lightning' }],
      text: '## Thunderous Slam\n\nThe aboleth slams a foe.' },
  ],
  rule: [
    { id: 'glossary', kind: 'rule', name: 'Glossary', category: 'reference', tags: ['rule'],
      text: 'The Glossary collects the game terms. '.repeat(8) },
  ],
};

// Install a mock fetch for the content URL. Each test starts from a fresh `_data`
// (a new register()), so the fetch fires once per dryRunRegister.
let _fetchCalls = 0;
function installFetch(payload = SAMPLE, { ok = true, status = 200 } = {}) {
  _fetchCalls = 0;
  globalThis.fetch = (url) => {
    _fetchCalls++;
    assert.equal(url, CONTENT_URL, 'fetches the namespaced content endpoint');
    return Promise.resolve({ ok, status, json: () => Promise.resolve(payload) });
  };
}

// Register + force the lazy content load to resolve, returning the live API.
async function loaded(meta = META, fetchOpts) {
  installFetch(...(fetchOpts || []));
  const { ok, rec, error } = dryRunRegister(register, meta);
  assert.ok(ok, error);
  await rec.provided.loadDetail();   // awaits the single content fetch
  return { rec, api: rec.provided };
}

test('compendium: registers route + sidebar + wiki kinds + provides a data API', () => {
  installFetch();
  const { ok, rec, error } = dryRunRegister(register, META);
  assert.ok(ok, error);
  assert.ok(rec.routes.some(r => r.segment === 'compendium'), 'a /compendium route');
  assert.ok(rec.sidebar.some(s => s.route === '/compendium'), 'a sidebar link');
  assert.ok(rec.wikiKinds.some(w => w.scope === 'spell'), 'a [[…|spell]] wiki kind');
  assert.ok(rec.provided && rec.provided.apiVersion === 1, 'provides apiVersion 1');
  // register() must be side-effect-free: no fetch fired just by registering.
  assert.equal(_fetchCalls, 0, 'register() does not fetch (lazy load only)');
});

test('compendium: data API enumerates every kind (after lazy load)', async () => {
  const { api } = await loaded();
  for (const fn of ['listClasses', 'listSubclasses', 'listSpecies', 'listBackgrounds',
                    'listFeats', 'listSpells', 'listArmor', 'listWeapons', 'listSkills',
                    'listEquipment', 'getItem', 'getItemByName', 'getRecords', 'kinds', 'loadDetail']) {
    assert.equal(typeof api[fn], 'function', `provides ${fn}()`);
  }
  const classes = api.listClasses();
  assert.ok(Array.isArray(classes) && classes.length >= 2, 'lists classes');
  assert.ok(classes.every(c => c.id && c.name), 'slim {id,name} records');
  assert.equal(api.getItem('class', 'wizard')?.name, 'Wizard', 'getItem by id');
  assert.equal(api.getItemByName('species', 'elf')?.id, 'elf', 'getItemByName');
  assert.equal(api.getItem('class', 'nope'), null, 'missing → null');
  assert.equal(api.listSkills().length, 18, 'all 18 skills (from the tree)');
});

test('compendium: getItem returns the FULL record (structured fields + prose together)', async () => {
  const { api } = await loaded();
  // No meta/detail split anymore — one fetch delivers the whole record.
  const wiz = api.getItem('class', 'wizard');
  assert.equal(wiz.spellcasting.prepares, 'spellbook');
  assert.equal(wiz.spellcasting.ritual, true);
  assert.ok((wiz.text || '').length > 0, 'prose present on the same record');
  assert.equal(api.getItem('class', 'fighter').weaponMastery.count, 3, 'structured fields preserved');
  const life = api.getItem('subclass', 'life-domain');
  assert.ok(life.spells.some(s => s.alwaysPrepared && s.ids.includes('bless')), 'nested subclass record intact');
  assert.equal(api.getItem('armor', 'breastplate').dexCap, 2, 'armor structured fields');
  assert.equal(api.getItem('weapon', 'longsword').mastery, 'Sap', 'weapon mastery');
  assert.ok(api.getItem('monster', 'aboleth').stats.STR === 14, 'monster stat block on the record');
});

test('compendium: slim projection carries the fields consumers filter/label on', async () => {
  const { api } = await loaded();
  // The fields entry.js slim() emits per kind — the picker + browse sublabels read these.
  const wiz = api.listClasses().find(c => c.id === 'wizard');
  assert.equal(wiz.caster, true, 'class slim → caster flag');
  assert.equal(wiz.hitDie, 'd6', 'class slim → hitDie');
  const fb = api.listSpells().find(s => s.id === 'fireball');
  assert.equal(fb.level, 3); assert.deepEqual(fb.classes, ['wizard', 'sorcerer']);
  assert.equal(api.listWeapons().find(w => w.id === 'dagger').mastery, 'Nick');
  assert.equal(api.listSubclasses().find(s => s.id === 'life-domain').classId, 'cleric');
});

test('compendium: spell queries filter by level and class', async () => {
  const { api } = await loaded();
  assert.equal(api.getItem('spell', 'fireball')?.level, 3);
  assert.ok(api.listSpells({ level: 3 }).some(s => s.id === 'fireball'), 'filter by level');
  assert.ok(api.listSpells({ class: 'wizard' }).some(s => s.id === 'fireball'), 'filter by class');
  assert.ok(!api.listSpells({ level: 1 }).some(s => s.id === 'fireball'), 'level filter excludes');
  assert.ok(api.listSubclasses('cleric').some(s => s.id === 'life-domain'), 'subclasses by class');
});

test('compendium: a [[Name|spell]] wiki kind resolves by NAME → id, to a detail link', async () => {
  const { rec } = await loaded();
  const spellKind = rec.wikiKinds.find(w => w.scope === 'spell');
  assert.deepEqual(spellKind.resolve('Fireball'), { kind: 'compendium', id: 'spell:fireball' });
  assert.equal(spellKind.resolve('Not A Spell'), null, 'unknown name → null');
  const monsterKind = rec.wikiKinds.find(w => w.scope === 'monster');
  assert.deepEqual(monsterKind.resolve('Aboleth'), { kind: 'compendium', id: 'monster:aboleth' });
});

test('compendium: a detail page renders meta + prose once loaded', async () => {
  const { rec } = await loaded();
  const route = rec.routes.find(r => r.segment === 'compendium');
  const wizHtml = route.render('class:wizard');
  assert.match(wizHtml, /Wizard/, 'class name');
  assert.match(wizHtml, /Hit Die/, 'a meta label');
  assert.doesNotMatch(wizHtml, /Loading…/, 'full article (not the loading state)');
  // Monster stat block.
  const mon = route.render('monster:aboleth');
  assert.match(mon, /Aboleth/);
  assert.match(mon, /Armor Class|Hit Points|Challenge Rating/, 'stat-block labels');
  assert.match(mon, /STR 14/, 'ability scores with values');
  // Feat prerequisite { text } renders.
  const feat = route.render('feat:fey-touched');
  assert.match(feat, /Prerequisite/, 'prerequisite label');
  assert.match(feat, /Level 4\+/, 'prerequisite text value');
});

test('compendium: degrades gracefully BEFORE the content fetch resolves', () => {
  // A fetch that never resolves: getters return empty, pages show a loading state,
  // and nothing throws.
  globalThis.fetch = () => new Promise(() => {});   // pending forever
  const { ok, rec, error } = dryRunRegister(register, META);
  assert.ok(ok, error);
  const api = rec.provided;
  assert.deepEqual(api.listClasses(), [], 'getters return [] pre-load');
  assert.equal(api.getItem('class', 'wizard'), null, 'getItem → null pre-load');
  const route = rec.routes.find(r => r.segment === 'compendium');
  assert.match(route.render(), /Loading…/, 'index shows a loading state pre-load');
  assert.match(route.render('class:wizard'), /Loading…/, 'detail shows a loading state pre-load');
  // The wiki-kind resolver degrades to null (not a throw) pre-load.
  assert.equal(rec.wikiKinds.find(w => w.scope === 'spell').resolve('Fireball'), null);
});

test('compendium: survives a failed content fetch (server down / 500)', async () => {
  const { api, rec } = await loaded(META, [SAMPLE, { ok: false, status: 500 }]);
  // Load rejected → cache stays empty, getters degrade, no throw.
  assert.deepEqual(api.listClasses(), [], 'empty after a failed fetch');
  const route = rec.routes.find(r => r.segment === 'compendium');
  assert.doesNotThrow(() => route.render(), 'index still renders');
});

test('compendium: re-render is triggered when content lands', async () => {
  installFetch();
  const { rec } = dryRunRegister(register, META);
  // Touch a getter to kick the lazy load, then await it.
  rec.provided.listClasses();
  await rec.provided.loadDetail();
  assert.ok(rec.rerenders >= 1, 'host.ui.rerender() called after load');
});

test('compendium: renderers survive the smoke pass', () => {
  installFetch();
  const { rec } = dryRunRegister(register, META);
  const smoke = smokeRegistrations(rec);
  assert.ok(smoke.ok, JSON.stringify(smoke.failures));
});
