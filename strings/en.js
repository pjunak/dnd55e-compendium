// English UI strings for dnd55e-compendium — the source of truth.
// Flat key → string catalog mirroring the host's /i18n/en.json shape. English
// is always present and is the universal fallback; other locales layer on top.
// NOTE: this catalog is for the addon's CHROME (page titles, labels). Game
// CONTENT names/prose live in the data records and are localized separately via
// per-locale overlay catalogs (see entry.js `localize`).

export default {
  'nav.compendium':   'Compendium',
  'page.title':       'Compendium',
  'page.intro':       'Browse D&D 5.5e content. This data also powers the character sheet when the rules engine addon is installed.',

  'kind.classes':     'Classes',
  'kind.species':     'Species',
  'kind.backgrounds': 'Backgrounds',
  'kind.spells':      'Spells',
  'kind.feats':       'Feats',
  'kind.equipment':   'Equipment',

  'label.hitDie':     'Hit Die',
  'label.saves':      'Saving Throws',
  'misc.empty':       'No content yet.',
  'misc.unnamed':     '(unnamed)',
  'misc.back':        'Compendium',
  'misc.notFound':    'Not found',
  'misc.seedNote':    'Placeholder sample content — the full compendium is migrated in a later milestone.',
};
