// Content aggregator. The single import surface for entry.js — adding a content
// kind = add a data/<kind>.js file + one line here (+ a BROWSE_KINDS entry if it
// should appear on the index page). The Living-scroll migration drops its
// generated arrays into these same files; nothing downstream changes.

import { CLASSES } from './classes.js';
import { SUBCLASSES } from './subclasses.js';
import { SPECIES } from './species.js';
import { BACKGROUNDS } from './backgrounds.js';
import { FEATS } from './feats.js';
import { SPELLS } from './spells.js';
import { ARMOR } from './armor.js';
import { WEAPONS } from './weapons.js';
import { SKILLS } from './skills.js';

/** kind → record array. The `kind` field on each record matches its key here. */
export const BY_KIND = {
  class: CLASSES,
  subclass: SUBCLASSES,
  species: SPECIES,
  background: BACKGROUNDS,
  feat: FEATS,
  spell: SPELLS,
  armor: ARMOR,
  weapon: WEAPONS,
  skill: SKILLS,
};

/** Flat list of every record across all kinds. */
export const ALL = Object.values(BY_KIND).flat();

/** Kinds shown on the browse index, in display order (skills are reference data,
 *  not browsed as articles). Each entry: { kind, labelKey }. */
export const BROWSE_KINDS = [
  { kind: 'class', labelKey: 'kind.classes' },
  { kind: 'subclass', labelKey: 'kind.subclasses' },
  { kind: 'species', labelKey: 'kind.species' },
  { kind: 'background', labelKey: 'kind.backgrounds' },
  { kind: 'feat', labelKey: 'kind.feats' },
  { kind: 'spell', labelKey: 'kind.spells' },
  { kind: 'armor', labelKey: 'kind.armor' },
  { kind: 'weapon', labelKey: 'kind.weapons' },
];
