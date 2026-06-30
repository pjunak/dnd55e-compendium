// Skills — the 18 D&D skills with their governing ability. Stable reference data
// (the engine + sheet both key on these ids; they match dnd55e-sheets' SKILLS).

export const SKILLS = [
  { id: 'acrobatics', kind: 'skill', name: 'Acrobatics', ability: 'DEX' },
  { id: 'animalHandling', kind: 'skill', name: 'Animal Handling', ability: 'WIS' },
  { id: 'arcana', kind: 'skill', name: 'Arcana', ability: 'INT' },
  { id: 'athletics', kind: 'skill', name: 'Athletics', ability: 'STR' },
  { id: 'deception', kind: 'skill', name: 'Deception', ability: 'CHA' },
  { id: 'history', kind: 'skill', name: 'History', ability: 'INT' },
  { id: 'insight', kind: 'skill', name: 'Insight', ability: 'WIS' },
  { id: 'intimidation', kind: 'skill', name: 'Intimidation', ability: 'CHA' },
  { id: 'investigation', kind: 'skill', name: 'Investigation', ability: 'INT' },
  { id: 'medicine', kind: 'skill', name: 'Medicine', ability: 'WIS' },
  { id: 'nature', kind: 'skill', name: 'Nature', ability: 'INT' },
  { id: 'perception', kind: 'skill', name: 'Perception', ability: 'WIS' },
  { id: 'performance', kind: 'skill', name: 'Performance', ability: 'CHA' },
  { id: 'persuasion', kind: 'skill', name: 'Persuasion', ability: 'CHA' },
  { id: 'religion', kind: 'skill', name: 'Religion', ability: 'INT' },
  { id: 'sleightOfHand', kind: 'skill', name: 'Sleight of Hand', ability: 'DEX' },
  { id: 'stealth', kind: 'skill', name: 'Stealth', ability: 'DEX' },
  { id: 'survival', kind: 'skill', name: 'Survival', ability: 'WIS' },
];
