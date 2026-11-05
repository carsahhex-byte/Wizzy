# Master Spellbook and custom decks

The current catalog comes from **Wizzy Master Spellbook Nov4.pdf**, *Wizzy / Master Spellbook V2.1*, dated November 4, 2026. It contains **31 unique spells: 14 Fire, 14 Water, and 3 Fate**. The previous Fire, Water, and Neutral catalog and its prescribed decklists are no longer playable. Earth and Air are outside this update.

Printed Fire/Water costs and effect text come from that PDF. The user's combat instructions take precedence over the PDF's older pre-roll Fate paragraph and its note about retaining the earlier approved spellbook. This update replaces that earlier spellbook and applies Fate **after** rolling.

## Build and save a deck

Each element starts with an empty deck slot. No starter composition is generated. Open **Deck**, choose Fire or Water, and select spells from the collection. The selected list and quantities occupy the upper half; the collection shows four slabs per row below it. Filters cover All, Fire, Water, Fate, and **In Deck**.

A playable saved deck must contain:

- Exactly **30 slabs**.
- At most **3 copies of any spell**.
- One main element, **Fire or Water**, plus any Fate spells.

Fire and Water spells cannot be mixed. There are no Neutral spells or mandatory category quotas in this spellbook. The PDF's three physical copies of each Fate spell describe the copy limit, not a requirement to include all nine Fate slabs in a deck.

Checking a slab adds its first copy; quantity controls add or remove copies, and unchecking removes all copies. Incomplete drafts remain editable and are retained on this device. **Save deck** stores a legal 30-slab deck for battle. Saving a deck does not alter an ongoing duel; start a new duel to use the saved composition.

Shared-screen play needs both saved element decks. For a two-screen room, each player needs the legal saved deck for their chosen role. Accounts can hold an empty slot while the other element's saved deck is ready; incomplete editor drafts remain local.

## Upload and download decklists

Use **Download deck** to export a complete legal deck and **Upload deck** to import one. Uploading loads a compatible decklist into the matching element's editor **as a draft for review**; press **Save deck** to make it playable. **Save & battle** saves the valid draft and opens battle choices.

The JSON format is:

```json
{
  "format": "wizzy-deck",
  "version": 1,
  "spellbook": "nov4-v2.1",
  "element": "fire",
  "entries": [
    { "spellId": "Fire-1", "quantity": 3 }
  ]
}
```

The example shows the file structure only; a playable file must list **30 slabs in total**. Files are limited to **64 KB**. Imports validate the format, spellbook version, element, known spell IDs, total, and three-copy limit. A malformed, oversized, outdated, or illegal file shows an error instead of replacing the current draft. Old-catalog IDs are rejected rather than being interpreted as new spells. A decklist contains spell quantities, not an account login, private room token, or shuffled draw order.

## Current catalog

| Spell ID | Mana | Spell ID | Mana |
| --- | ---: | --- | ---: |
| Fire-1 | 1 | Water-1 | 1 |
| Fire-2 | 1 | Water-2 | 1 |
| Fire-3 | 2 | Water-3 | 2 |
| Fire-4 | 2 | Water-4 | 2 |
| Fire-5 | 3 | Water-5 | 3 |
| Fire-6 | 5 | Water-6 | 5 |
| Fire-7 | 7 | Water-7 | 7 |
| Fire-8 | 2 | Water-8 | 2 |
| Fire-9 | 2 | Water-9 | 2 |
| Fire-10 | 3 | Water-10 | 3 |
| Fire-11 | 3 | Water-11 | 3 |
| Fire-12 | 4 | Water-12 | 4 |
| Fire-13 | 6 | Water-13 | 6 |
| Fire-14 | 8 | Water-14 | 8 |

| Fate ID | Name | Effect | Playable role |
| --- | --- | --- | --- |
| FAT-001 | Fortune | +4 to the Modified Roll | Caster |
| FAT-002 | Misfortune | −4 to the Modified Roll | Defender |
| FAT-003 | Twist | Choose +2 or −2 to the Modified Roll | Either |

The PDF leaves Fate Mana unspecified. This implementation retains the previous **0 Mana** cost pending a different ruling; that cost is an implementation assumption, not a printed PDF value. Each selected Twist has its own explicit sign choice. Multiple eligible Fate slabs can be selected and cast together.

## Combat rules

- Each wizard begins with **100 HP**, **3 Mana**, zero Shield, zero Embers/Flow, and zero Loaded. Maximums are **100 HP, 10 Mana, 30 Shield, and 5 Embers/Flow**.
- Shuffle each saved 30-slab deck and draw five opening slabs, leaving 25 in its Spell Tower. Each wizard rolls one opening d6; higher starts and ties reroll both. Fate and Loaded do not affect initiative. The second player draws exactly one extra slab when their first own turn begins, up to the six-slab hand limit.
- On each own turn after the opening turn, gain **2 Mana** up to the cap and draw up to six slabs. Unspent Mana carries over. One round contains one turn from each wizard, starting with the initiative winner.
- Each wizard may commit **one primary spell per own turn**. Fire and Water slabs are primary spells; Fate does not consume this allowance. Printed Mana and any optional Ember spending are paid on commitment. Fire-7 and Fire-14 automatically spend all available Embers.
- Every current Fire/Water spell includes a roll threshold, so each rolls **2d6**. The roll and eligible Loaded bonus are displayed before Fate. Higher thresholds replace lower outcomes of the same effect unless the text specifies an additional effect.
- The **defender** first casts a batch of eligible Fate or skips. The **caster** then casts a batch or skips. If the caster skips, resolve the spell. If the caster plays Fate, the defender gets one final response, then resolve. Empty or ineligible Fate hands are skipped automatically; there are no further response rounds.
- Fortune is caster-only and Misfortune defender-only. Either player may choose **+2 or −2** for each Twist. Fate updates the Modified Roll without rerolling the dice. Negative modified totals are permitted.
- Incoming opponent damage consumes Shield before HP. **Self-damage bypasses the caster's Shield.** Shield-removal effects happen before their spell's damage. Healing cannot exceed 100 HP; reaching zero HP ends the duel.
- Fire gains only printed Embers. Gains stop at five; spending happens before spell resolution. Optional spending uses a compact popup above the selected slab when Embers are available.
- Water damage and healing use **Flow before the spell resolves**. After the effects, each Water spell grants **1 Flow**. A printed **additional Flow** gain adds to that default, capped at five. For example, Water-2 at 8+ gains two Flow total; Water-9 always gains two Flow total. Fate grants no automatic Flow.
- New Loaded bonuses queue for the caster's **next own turn**, stack, and apply once to that turn's first roll. Unused bonuses expire at that turn's end. A bonus earned this turn does not modify this turn's roll.
- After resolution, Cast Spell stays disabled. End Turn reveals Hand Refresh and turns red; End Turn again passes without refreshing. Hand Refresh lets the player select any number of slabs, including zero. Confirming it discards the selections, draws up to six, and passes immediately. End Turn during selection passes without applying those discards.
- The Spell Tower and discard counts follow card movement. Read Slab shows the complete rules; the tower view shows the saved composition without revealing draw order. If the tower is empty, draws stop; no reshuffle or fatigue rule is invented.

## Save compatibility

Combat saves use **version 10** and the `nov4-v2.1` catalog. Old-catalog duels are not resumed under the new effects, and old deck IDs are not converted into unrelated new cards. Build new Fire and Water decks in the workshop. Prior browser data is kept separate, and account migration retains credentials while archiving replaced old deck data.

`src/spells.js` contains the canonical metadata, `src/effects.js` implements spell effects, `src/game.js` owns combat timing, and `src/decks.js` validates saved and uploaded compositions.
