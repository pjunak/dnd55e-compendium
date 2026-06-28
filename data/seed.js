// PLACEHOLDER seed content (M0).
//
// A tiny hand-written sample so the data API and browse pages have something to
// show, and so the dnd55e-core-rules ↔ dnd55e-compendium provide/use wiring can
// be validated end-to-end. The real content is generated in M2 by an offline
// transform of the Living-scroll markdown compendium and replaces this file
// (likely split into data/classes.json, data/species.json, … and lazily
// fetched). Each record carries declarative mechanics + a Markdown `text` body;
// English is the base, with per-locale overlays layered on at read time.

export const CLASSES = [
  {
    id: 'fighter', kind: 'class', name: 'Fighter',
    hitDie: 'd10', saves: ['STR', 'CON'], spellcasting: null,
    text: 'A master of martial combat, skilled with a wide range of weapons and armor.',
  },
  {
    id: 'wizard', kind: 'class', name: 'Wizard',
    hitDie: 'd6', saves: ['INT', 'WIS'], spellcasting: { ability: 'INT' },
    text: 'A scholarly magic-user capable of manipulating the structures of reality.',
  },
];

export const SPECIES = [
  {
    id: 'dwarf', kind: 'species', name: 'Dwarf',
    grants: { senses: { darkvision: 120 }, resistances: ['poison'] },
    text: 'Bold and hardy, dwarves are known as skilled warriors, miners, and workers of stone and metal.',
  },
  {
    id: 'elf', kind: 'species', name: 'Elf',
    grants: { senses: { darkvision: 60 } },
    text: 'Elves are a magical people of otherworldly grace, living in places of ethereal beauty.',
  },
];

export const BACKGROUNDS = [
  {
    id: 'sage', kind: 'background', name: 'Sage',
    text: 'You spent years learning the lore of the multiverse, studying manuscripts and tomes.',
  },
  {
    id: 'soldier', kind: 'background', name: 'Soldier',
    text: 'You trained as a youth, studied the use of weapons and armor, and learned survival techniques.',
  },
];
