# Content gaps & engine notes

A static record of where the source content encodes data as prose/tables/formulas
that the current core-rules engine does not yet consume in structured form. These
are baked into the per-record JSON files in this tree (see SCHEMA.md). Nothing was
dropped — prose is in `text`, formulas are preserved (spell `actions`, class
`preparedFormula`, armor `_acSource`). The constants named below (`CLASS_MECHANICS`,
`FEAT_MECHANICS`, `SPECIES_LINEAGE_GRANTS`, `SPELL_PROGRESSION_FALLBACK`) were the
one-time build's curated overlays; their results are now part of the records, so
they're referenced here for provenance only — there is no build tooling in the repo.

## Engine TODO — preserved data the engine does not yet CONSUME

These are the "fix without forgetting" items: the data is migrated, but
core-rules needs work to act on it.

### Now CONSUMED (resolved this pass)

- **per-level cantrips-known + prepared-spells**: the markdown Features table is
  now PARSED (`extractSpellTable`) into `progression[].cantripsKnown`/`preparedSpells`
  for cleric/druid/sorcerer/warlock/wizard (the authoritative 2024 counts — these
  diverge from `preparedFormula`, e.g. cleric L5 = 9 not WIS+5). bard/paladin/ranger
  ship NO table, so they use the curated `SPELL_PROGRESSION_FALLBACK` (bard = the
  standard full-caster table, == parsed cleric; paladin/ranger = the half-caster
  table). `spellcasting.preparedFormula` is kept for reference only.
- **species darkvision**: read from the body prose (`parseBodyDarkvision`), which is
  authoritative over the frontmatter (e.g. Dwarf 120, not the stale 60).
- **lineage grants (senses / speed / resistances / hpPerLevel / fixed spells)**:
  the prose lineage tables are structured via `SPECIES_LINEAGE_GRANTS` (elf/dwarf/
  gnome/halfling) and applied by the engine (darkvision take-highest, Dwarven
  Toughness HP, level-gated always-prepared lineage spells).
- **feat grants**: `attribute_increase` → `grants.abilityScoreIncrease` (half-feat
  bumps the Builder now applies), `grants.hp_per_level` → `grants.hpPerLevel` (Tough),
  and FIXED feat spell grants via `FEAT_MECHANICS` (e.g. Fey Touched → Misty Step).
- **subclass feature headings**: `### Level N: Name` parsed into `features[]` so the
  Builder lists them in the progression log.

### Still DEFERRED

- **spell `actions`**: full save / damage / scaling automation is preserved, but
  there is no combat resolver yet (damage/automation — display only).
- **subclass + feat feature MECHANICS**: effects beyond spells/ability bumps stay
  prose (no auto-apply of e.g. a subclass proficiency or a feat's situational rule).
- **feat/lineage CHOOSE-spell grants** (Magic Initiate "pick 2 cantrips", High Elf
  wizard-cantrip choice): only fixed-id grants auto-apply; the choose-picker is deferred.
- **tiefling/dragonborn/aasimar lineages**: their legacy/ancestry options aren't in
  the frontmatter, so no `lineages[]` exist to enrich (content task, not engine).
- **classResources (Rage/Ki/…), multiclassProficiencies, armor strReq/stealth,
  warlock Pact Magic slots**: not structured / not modeled.
- **mechanics overlay**: Barbarian/Monk Unarmored Defense + per-class weapon-mastery
  counts were hand-authored (a `CLASS_MECHANICS` overlay during the one-time build),
  NOT from the source. They're now baked into the class records (`acFormulas`,
  `weaponMastery`); hand-edit the JSON to extend them as the engine grows.

## Per-record source gaps (auto-detected)

## class (3)
- no Features table in source markdown — per-level cantrips/prepared come from the curated 2024 fallback (SPELL_PROGRESSION_FALLBACK) — 3 record(s): bard, paladin, ranger

## feat (3)
- spell grants are in prose — not structured (fixed grants need FEAT_MECHANICS; choose-grants deferred) — 3 record(s): ritual-caster, telekinetic, telepathic

## monster (1)
- machine-readable action automation (damage/save) intentionally NOT shipped — the compendium browses the prose stat block; re-derivable from source for a future combat addon — 1 record(s): (all)

## spell (1)
- empty `classes` list in the source — listSpells({class}) cannot class-filter these; the class spell lists are not in the spell frontmatter — 1 record(s): (6 spells)

## subclass (66)
- feature mechanics remain prose (### Level N: …) — headings structured, effects not auto-applied — 61 record(s)
- duplicate subclass file skipped: path_of_the_berserker.md — 1 record(s): path-of-the-berserker
- duplicate subclass file skipped: lore.md — 1 record(s): college-of-lore
- duplicate subclass file skipped: life_domain.md — 1 record(s): life-domain
- duplicate subclass file skipped: land.md — 1 record(s): circle-of-the-land
- duplicate subclass file skipped: oath_of_devotion.md — 1 record(s): oath-of-devotion

