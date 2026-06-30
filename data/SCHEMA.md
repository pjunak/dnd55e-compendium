# Compendium record schemas (D&D 5.5e / 2024)

The canonical shape of every content record. `dnd55e-core-rules` consumes these via the
`provide()` data API; the migration (`tools/`, later) emits records in exactly these shapes.
Field choices are driven by the edge-case catalog in
[`dnd55e-sheets/docs/RULES_EDGE_CASES.md`](../../dnd55e-sheets/docs/RULES_EDGE_CASES.md) —
each field notes the `ID` it serves.

**Conventions.** Every record has `id` (kebab-case, **unique within its kind** — the browse
URL carries the kind, so `spell:shield` and `armor:shield` don't collide), `kind`, `name`
(English base; localized on read via the overlay seam), `edition: '2024'`, and an optional
Markdown `text`. Ability ids are `STR DEX CON INT WIS CHA`. This seed is **representative,
not complete** — it pins the shapes and exercises the hard cases; full 20-level progression
tables + all content arrive with the Living-scroll migration. Where a table is abbreviated,
it's filled to ~level 5 and marked.

---

## `class`
```jsonc
{
  "id": "wizard", "kind": "class", "name": "Wizard", "edition": "2024",
  "hitDie": "d6",                          // HP-2
  "primaryAbility": ["INT"],               // MC-5 multiclass prereq display
  "savingThrows": ["INT", "WIS"],          // PR-4 (only the FIRST class's saves apply on multiclass)
  "startingProficiencies": {               // PR-5 (used when this is the origin class)
    "armor": [], "weapons": ["simple"], "tools": [],
    "skills": { "choose": 2, "from": ["arcana","history","insight","investigation","medicine","nature","religion"] }
  },
  "multiclassProficiencies": { "armor": [], "weapons": [], "tools": [] },  // PR-5 (reduced set on multiclass-in)
  "weaponMastery": { "count": 2 },         // EQ-4 mastery slots (grows at higher levels — full table later)
  "subclassLevel": 3,                      // FE-5
  "spellcasting": {                        // null for a non-caster
    "ability": "INT", "type": "full",      // full | half | third | pact   (MC-2)
    "prepares": "spellbook",               // "spellbook" (Wizard, SP-5) | "list" (everyone else)
    "ritual": true,                        // SP-6
    "startLevel": 1                        // SP-8 (half=2, third=3)
  },
  "acFormulas": [],                        // AC-1 (e.g. Barbarian Unarmored Defense); [] = armor/Mage-Armor only
  "classResources": [],                    // FE-2/FE-3 (Rage, Ki, …)
  "progression": [                         // per character level IN THIS CLASS (abbreviated to L5)
    { "level": 1, "features": ["spellcasting","ritual-adept","arcane-recovery"],
      "cantripsKnown": 3, "preparedSpells": 4, "spellSlots": [2] },
    { "level": 2, "features": ["scholar"], "cantripsKnown": 3, "preparedSpells": 5, "spellSlots": [3] }
    // … spellSlots is an array indexed by spell level-1: [1st,2nd,3rd,…]
  ],
  "grants": { "choices": [ /* generic choice records, ARCH-9/FE-1 */ ] },
  "text": "…"
}
```

## `subclass`
```jsonc
{
  "id": "life-domain", "kind": "subclass", "name": "Life Domain", "classId": "cleric",
  "subclassLevel": 3,
  "spells": [                              // SP-2/SP-12 — domain/oath spells, ALWAYS prepared, off the prepared limit
    { "level": 3, "ids": ["bless","cure-wounds"], "alwaysPrepared": true }
  ],
  "spellcasting": null,                    // EK/AT set this → third-caster (SP-8): {ability,type:'third',startLevel:3}
  "features": [ { "level": 3, "id": "disciple-of-life", "name": "Disciple of Life" } ],
  "grants": {}, "text": "…"
}
```

## `species`  (2024: species grant **NO** ability scores — AB-1/SB-6)
```jsonc
{
  "id": "elf", "kind": "species", "name": "Elf", "edition": "2024",
  "size": "Medium",                        // SB-5 (Small → Heavy-weapon disadvantage)
  "speeds": { "walk": 30 },                // SB-3 (fly/swim/climb optional)
  "senses": { "darkvision": 60 },          // SB-4 take-highest across sources
  "resistances": [],                       // SB-4 (presence, never auto-immunity)
  "lineages": [                            // SB-3 a CHOICE; each grants senses/spells/etc.
    { "id": "high-elf", "name": "High Elf",
      "grants": { "cantrips": { "from": "wizard", "count": 1, "swappable": true }, "senses": { "darkvision": 60 } } }
  ],
  "traits": [ { "name": "Fey Ancestry", "text": "…" } ],
  "grants": {}, "text": "…"
}
```

## `background`  (2024: grants the ASI + an Origin feat — AB-1/SB-1)
```jsonc
{
  "id": "sage", "kind": "background", "name": "Sage", "edition": "2024",
  "abilityScores": ["INT","CON","WIS"],    // AB-1 choose +2/+1 or +1/+1/+1 among these
  "originFeat": "magic-initiate-wizard",   // SB-1 (a feat id, category 'origin')
  "skillProficiencies": ["arcana","history"],
  "toolProficiency": "calligraphers-tools",
  "equipment": ["Quarterstaff","Calligrapher's Tools","Book","Robe","10 gp"],
  "text": "…"
}
```

## `feat`
```jsonc
{
  "id": "fey-touched", "kind": "feat", "name": "Fey Touched", "edition": "2024",
  "category": "general",                   // origin | general | fightingStyle | epicBoon   (SB-2)
  "prerequisites": { "level": 4 },         // SB-2 ({ability:{INT:13}}, {feature}, …)
  "repeatable": false,                     // SB-2 (or { "by": "ability" } / { "by": "damageType" })
  "grants": {
    "abilityScoreIncrease": { "choose": 1, "amount": 1, "from": ["INT","WIS","CHA"] },  // AB-2 half-feat
    "spells": [ { "ids": ["misty-step"], "alwaysPrepared": true, "free": "1/long", "castingAbilityChoice": ["INT","WIS","CHA"] },
                { "choose": 1, "level": 1, "from": "anySchool:divination,enchantment", "alwaysPrepared": true } ],  // SP-10/SP-20
    "proficiencies": {}
  },
  "text": "…"
}
```

## `spell`  (v1: names + metadata only — SP-15; prose/automation later)
```jsonc
{
  "id": "fireball", "kind": "spell", "name": "Fireball", "edition": "2024",
  "level": 3,                              // 0 = cantrip (SP-7 cantrips scale by CHARACTER level)
  "school": "Evocation",
  "classes": ["wizard","sorcerer"],        // class ids that have it on their list
  "ritual": false, "concentration": false, // SP-6 / SP-16
  "castingTime": "action", "range": "150 feet",
  "components": ["V","S","M"], "duration": "Instantaneous",
  "text": ""                               // empty in v1
}
```

## `armor`  (AC-1/AC-2/AC-5)
```jsonc
{
  "id": "breastplate", "kind": "armor", "name": "Breastplate", "edition": "2024",
  "armorType": "medium",                   // light | medium | heavy | shield
  "baseAC": 14,                            // shield uses acBonus instead
  "dexCap": 2,                             // null = full DEX (light); 0 = none (heavy); N = medium cap
  "acBonus": 0,                            // shield = +2 (stacks on the chosen base; AC-3)
  "strReq": 0,                             // AC-5 (below → speed −10)
  "stealthDisadvantage": false,            // AC-5
  "text": ""
}
```

## `weapon`  (EQ-4/EQ-5)
```jsonc
{
  "id": "longsword", "kind": "weapon", "name": "Longsword", "edition": "2024",
  "category": "martial",                   // simple | martial
  "range": "melee",                        // melee | ranged
  "damage": "1d8", "damageType": "slashing",
  "properties": ["versatile"],             // finesse,light,heavy,thrown,two-handed,versatile,reach,ammunition,loading
  "versatileDamage": "1d10",               // when 'versatile'
  "thrownRange": null,                     // { "normal": 20, "long": 60 } when 'thrown'
  "mastery": "Sap",                        // EQ-4 one of Cleave,Graze,Nick,Push,Sap,Slow,Topple,Vex
  "text": ""
}
```

## `skill`
```jsonc
{ "id": "stealth", "kind": "skill", "name": "Stealth", "ability": "DEX" }
```

## `monster`  (reference stat block — browse only; the engine never reads it)
```jsonc
{
  "id": "aboleth", "kind": "monster", "name": "Aboleth", "edition": "2024",
  "size": "Large", "type": "Large Elemental", "creatureType": "Elemental",  // type = source "<Size> <CreatureType>"; creatureType is the derived tail
  "alignment": "Neutral",
  "ac": "15", "hp": "90 (12d10 + 24)", "speed": "10 ft., Fly 90 ft. (hover)",  // kept as display strings
  "stats": { "STR": 14, "DEX": 20, "CON": 14, "INT": 6, "WIS": 10, "CHA": 6 },
  "cr": "5 (XP 1,800; PB +3)", "crValue": 5,                 // crValue = parsed leading token (e.g. "1/4" → 0.25) for sorting
  "traits": [ { "name": "Resistances", "text": "Bludgeoning, Lightning, …" } ],  // from frontmatter (often NOT in the body)
  "text": "…prose stat block (attacks / saves / damage as readable text)…"
  // NB: the source's machine-readable `actions` automation is intentionally NOT
  // shipped (combat is out of scope — see GAPS); re-derivable from Living-scroll.
}
```

## `rule`  (reference prose — browse only)
```jsonc
{
  "id": "conditions-grappled", "kind": "rule", "name": "Grappled", "edition": "2024",
  "category": "conditions",            // the rules topic subdir (or frontmatter category)
  "tags": ["rule", "condition"],
  "source": "https://…",               // upstream reference url (frontmatter)
  "text": "…markdown prose…"
  // id is PATH-SCOPED (rules nest in topic subdirs) to avoid cross-topic collisions.
}
```
