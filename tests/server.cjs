'use strict';
// Server self-test for dnd55e-compendium — the install GREEN-GATE.
//
// SELF-CONTAINED by contract: the staged tree the host runs this against has NO
// node_modules and no host harness, so this uses ONLY Node built-ins + the
// addon's own server module. It builds a tiny temp JSON tree, points the pure
// `loadTree` helper at it, and asserts the aggregation + (via a fake serverHost)
// the route wiring. Run: node --test tests/server.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadTree, init } = require('../server/index.cjs');

// ── Build a throwaway fixture tree mirroring the real layout (incl. the nested
//    subclasses/<classId>/<id>.json). ─────────────────────────────────────────
function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compendium-srv-'));
  const write = (rel, obj) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(obj, null, 2));
  };
  write('classes/wizard.json', { id: 'wizard', kind: 'class', name: 'Wizard', hitDie: 'd6' });
  write('classes/fighter.json', { id: 'fighter', kind: 'class', name: 'Fighter', hitDie: 'd10' });
  // nested per owning class
  write('subclasses/cleric/life-domain.json', { id: 'life-domain', kind: 'subclass', name: 'Life Domain', classId: 'cleric' });
  write('subclasses/wizard/evoker.json', { id: 'evoker', kind: 'subclass', name: 'Evoker', classId: 'wizard' });
  write('spells/fireball.json', { id: 'fireball', kind: 'spell', name: 'Fireball', level: 3 });
  write('skills/stealth.json', { id: 'stealth', kind: 'skill', name: 'Stealth', ability: 'DEX' });
  // a deliberately corrupt file — must be skipped, not fatal
  fs.mkdirSync(path.join(root, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rules', 'broken.json'), '{ not valid json');
  return root;
}

test('loadTree: reads the whole tree, groups by record `kind`, counts correctly', () => {
  const root = makeTree();
  const { content, count, kinds } = loadTree(root);
  // 2 classes + 2 subclasses (nested) + 1 spell + 1 skill = 6 valid; broken.json skipped.
  assert.equal(count, 6, 'six valid records (corrupt file skipped)');
  assert.deepEqual(kinds, ['class', 'skill', 'spell', 'subclass'], 'kinds keyed by the singular `kind` field, sorted');
  assert.equal(content.class.length, 2);
  assert.equal(content.subclass.length, 2, 'nested subclasses both found');
  assert.ok(content.subclass.some(s => s.id === 'life-domain' && s.classId === 'cleric'));
  assert.ok(content.subclass.some(s => s.id === 'evoker' && s.classId === 'wizard'));
  assert.equal(content.spell[0].id, 'fireball');
});

test('loadTree: records within a kind are sorted by id (deterministic output)', () => {
  const root = makeTree();
  const { content } = loadTree(root);
  assert.deepEqual(content.class.map(c => c.id), ['fighter', 'wizard'], 'sorted by id');
});

test('loadTree: a missing root returns empty content, never throws', () => {
  const { content, count, kinds } = loadTree(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
  assert.deepEqual(content, {});
  assert.equal(count, 0);
  assert.deepEqual(kinds, []);
});

// ── A tiny fake serverHost that records the routes init() mounts, so we can
//    invoke the handlers without Express. ──────────────────────────────────────
function fakeHost() {
  const routes = {};
  const logs = [];
  const host = {
    get: (p, h) => { routes['GET ' + p] = h; },
    post: () => {}, put: () => {}, delete: () => {},
    log: (...a) => { logs.push(a.join(' ')); },
  };
  return { host, routes, logs };
}

function callRoute(handler, { params = {}, query = {} } = {}) {
  let _status = 200, _body;
  const res = {
    status: (c) => { _status = c; return res; },
    json: (b) => { _body = b; return res; },
  };
  handler({ params, query }, res);
  return { status: _status, body: _body };
}

test('init: serves /content, /content/:kind, /item/:kind/:id, /kinds against the bundled tree', () => {
  const { host, routes, logs } = fakeHost();
  // init reads the addon's OWN data/ tree (the real bundled records).
  init(host);
  assert.ok(routes['GET /content'], 'mounts /content');
  assert.ok(routes['GET /content/:kind'], 'mounts /content/:kind');
  assert.ok(routes['GET /item/:kind/:id'], 'mounts /item/:kind/:id');
  assert.ok(routes['GET /kinds'], 'mounts /kinds');
  assert.ok(logs.some(l => /compendium: \d+ records across \d+ kinds/.test(l)), 'logs a one-line summary');

  // Whole library.
  const all = callRoute(routes['GET /content']).body;
  assert.ok(all && typeof all === 'object', '/content → object keyed by kind');
  assert.ok(Array.isArray(all.class) && all.class.length >= 1, 'has classes');
  assert.ok(Array.isArray(all.spell) && all.spell.length >= 1, 'has spells');
  assert.ok(Array.isArray(all.subclass) && all.subclass.length >= 1, 'has (nested) subclasses');

  // One kind.
  const spells = callRoute(routes['GET /content/:kind'], { params: { kind: 'spell' } }).body;
  assert.ok(Array.isArray(spells) && spells.length >= 1, '/content/spell → array');
  // Unknown kind → empty array, not 404.
  const none = callRoute(routes['GET /content/:kind'], { params: { kind: 'nope' } });
  assert.deepEqual(none.body, [], 'unknown kind → []');

  // One item.
  const wiz = callRoute(routes['GET /item/:kind/:id'], { params: { kind: 'class', id: 'wizard' } });
  assert.equal(wiz.status, 200);
  assert.equal(wiz.body.id, 'wizard');
  assert.equal(wiz.body.name, 'Wizard');
  // 404 for an unknown id.
  const miss = callRoute(routes['GET /item/:kind/:id'], { params: { kind: 'class', id: 'nope' } });
  assert.equal(miss.status, 404);
  assert.ok(miss.body && miss.body.error, '404 carries an error field');

  // /kinds diagnostic.
  const k = callRoute(routes['GET /kinds']).body;
  assert.ok(Array.isArray(k.kinds) && k.kinds.includes('class') && k.kinds.includes('spell'));
});

test('init: a record carries its FULL shape (structured fields + prose) over the wire', () => {
  const { host, routes } = fakeHost();
  init(host);
  const wiz = callRoute(routes['GET /item/:kind/:id'], { params: { kind: 'class', id: 'wizard' } }).body;
  // The real wizard record is the merged meta+detail — assert both halves landed.
  assert.ok(wiz.hitDie, 'structured field present');
  assert.ok(typeof wiz.text === 'string' && wiz.text.length > 0, 'prose present on the same record');
});
