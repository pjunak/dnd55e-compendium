// Client self-test for dnd55e-compendium against the host test harness.
// Run: node --test tests/smoke.mjs  (assumes ttrpg-codex is a sibling checkout).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dryRunRegister, smokeRegistrations } from '../../ttrpg-codex/web/js/addon-test-harness.mjs';
import register from '../entry.js';

const META = { id: 'dnd55e-compendium', permissions: ['ui:route', 'ui:sidebar'] };

test('compendium: registers route + sidebar + provides a data API', () => {
  const { ok, rec, error } = dryRunRegister(register, META);
  assert.ok(ok, error);
  assert.ok(rec.routes.some(r => r.segment === 'compendium'), 'a /compendium route');
  assert.ok(rec.sidebar.some(s => s.route === '/compendium'), 'a sidebar link');
  assert.ok(rec.provided && rec.provided.apiVersion === 1, 'provides apiVersion 1');
});

test('compendium: data API returns seeded content', () => {
  const { rec } = dryRunRegister(register, META);
  const api = rec.provided;
  const classes = api.listClasses();
  assert.ok(Array.isArray(classes) && classes.length >= 2, 'lists classes');
  assert.ok(classes.every(c => c.id && c.name), 'slim {id,name} records');
  const wiz = api.getItem('class', 'wizard');
  assert.equal(wiz?.name, 'Wizard', 'getItem by id');
  assert.equal(api.getItemByName('species', 'elf')?.id, 'elf', 'getItemByName');
  assert.equal(api.getItem('class', 'nope'), null, 'missing → null');
});

test('compendium: renderers survive the smoke pass', () => {
  const { rec } = dryRunRegister(register, META);
  assert.ok(smokeRegistrations(rec).ok, JSON.stringify(smokeRegistrations(rec).failures));
});
