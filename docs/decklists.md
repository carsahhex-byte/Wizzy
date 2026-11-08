# Master Spellbook and custom decks

The current catalog contains **33 unique spells: 16 Fire, 14 Water, and 3 Fate**. The 31 original spells come from **Wizzy Master Spellbook Nov4.pdf**, *Wizzy / Master Spellbook V2.1*, dated November 4, 2026. **Fire-0** is an additional user-defined spell: **0 Mana, "Gain 1 Ember."** **Fire-15** is another user-defined spell: **0 Mana, "Gain 1 Ember and 1 Mana."** The previous Fire, Water, and Neutral catalog and its prescribed decklists are no longer playable. Earth and Air are outside this update.

Printed Fire/Water costs and effect text come from that PDF. The user's combat instructions take precedence over the PDF's older pre-roll Fate paragraph and its note about retaining the earlier approved spellbook. This update replaces that earlier spellbook and applies Fate **after** rolling.

## Build and save a deck

Each element starts with an empty deck slot. No starter composition is generated. Open **Deck**, choose Fire or Water, and select spells from the collection. The selected list and quantities occupy the upper half; the collection shows four slabs per row below it. Filters cover All, Fire, Water, Fate, and **In Deck**.

A playable saved deck must contain:

- Exactly **30 slabs**.
- **No per-spell copy limit** within the 30-slab deck.
- One main element, **Fire or Water**, plus any Fate spells.

Fire and Water spells cannot be mixed. There are no Neutral spells or mandatory category quotas in this spellbook. Printed copy counts do not constrain custom decks; players may choose any number of eligible elemental or Fate slabs within the 30-slab total.

Checking a slab adds its first copy; quantity controls add or remove copies, and unchecking removes all copies. Incomplete drafts remain editable and are retained on this device. **Save deck** stores a legal 30-slab deck for battle. Saving a deck does not alter an ongoing duel; start a new duel to use the saved composition.

An account is optional for device saves. Saved decks and drafts survive closing regular tabs and loading a new hosted game version in the same browser on the same origin. The game maintains backup copies and restores compatible prior device saves; signed-in account decks remain separate from guest decks. The additions of Fire-0 and Fire-15 retain the current deck compatibility version, so existing November 4 decks and exported files stay valid. Use **Download deck** to move a deck to another browser or device.

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
    { "spellId": "Fire-1", "quantity": 30 }
  ]
}
```

The example is a playable deck of 30 Fire-1 slabs; any playable file must list **30 slabs in total**. Files are limited to **64 KB**. Imports validate the format, spellbook version, element, known spell IDs, and 30-slab total. A malformed, oversized, outdated, or illegal file shows an error instead of replacing the current draft. Old-catalog IDs are rejected rather than being interpreted as new spells. A decklist contains spell quantities, not an account login, private room token, or shuffled draw order.

## Current catalog

| Spell ID | Mana | Spell ID | Mana |
| --- | ---: | --- | ---: |
| Fire-0 | 0 | — | — |
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
| Fire-15 | 0 | — | — |

| Fate ID | Name | Effect | Playable role |
| --- | --- | --- | --- |
| FAT-001 | Fortune | +4 to the Modified Roll | Caster |
| FAT-002 | Misfortune | −4 to the Modified Roll | Defender |
| FAT-003 | Twist | Choose +2 or −2 to the Modified Roll | Either |

The PDF leaves Fate Mana unspecified. This implementation retains the previous **0 Mana** cost pending a different ruling; that cost is an implementation assumption, not a printed PDF value. Play one eligible Fate slab per response; each Twist has its own explicit sign choice. Any number of responses may be played as the chain alternates, while cards remain available.

All 33 slabs display larger live rules on their parchment panels, with compact wording and **bold roll thresholds**. The compact copy preserves the canonical effects. **Read Slab** shows the complete spellbook wording, and the supplied artwork remains unchanged.

## Combat rules

- Each wizard begins with **100 HP**, **3 Mana**, zero Shield, zero Embers/Flow, zero Loaded, **0% Enhancement**, and no active Aura. Maximums are **100 HP, 10 Mana, 30 Shield, 5 Embers/Flow, and 30% Enhancement**. Active Aura adds a separate fixed **10%**.
- Shuffle each saved 30-slab deck and draw five opening slabs, leaving 25 in its Spell Tower. Each wizard rolls one opening d6; higher starts and ties reroll both. Fate and Loaded do not affect initiative. The second player draws exactly one extra slab when their first own turn begins, up to the six-slab hand limit.
- On each own turn after the opening turn, gain **2 Mana** up to the cap and draw up to six slabs. Unspent Mana carries over. One round contains one turn from each wizard, starting with the initiative winner.
- Each wizard may use **one main action per own turn**: commit a primary spell, attempt Enhancement, or activate Aura. Fire and Water slabs are primary spells; Fate does not consume this allowance. Printed Mana and any optional Ember spending are paid on spell commitment. Fire-7 and Fire-14 automatically spend all available Embers.
- **Fire-0** gains 1 Ember immediately, capped at 5. It costs 0 Mana and uses the primary action without rolling, opening Fate or consuming Loaded. Fire-15 also costs 0 Mana and gains 1 Ember and 1 Mana immediately, independently capped at 5 and 10, without dice, Fate or Loaded consumption. Both use the primary action. The other 28 Fire/Water spells roll **2d6**. The roll and eligible Loaded bonus are displayed before Fate. Higher thresholds replace lower outcomes of the same effect unless the text specifies an additional effect.
- The **defender** gets the first Fate response. Players then alternate, casting **one eligible Fate slab** or passing each time. A cast resets the consecutive-pass count; **two consecutive passes** end the chain. A player with no eligible Fate passes automatically, and a player who passed may respond again after another Fate is cast. There is no fixed response-window limit.
- Fortune is primary-caster-only and Misfortune defender-only; these roles do not swap when a player responds. Either player may choose **+2 or −2** for each Twist. Fate updates the Modified Roll without rerolling the original dice. Negative modified totals are permitted.
- Each player starts at **0% Enhancement**. The active player may attempt it **once instead of a primary spell or Aura**, for **0 Mana**. Roll raw **2d6**: **6+** adds **10 percentage points**, capped at **30%**. Failure still uses the action. Enhancement remains banked until an outgoing damaging primary spell resolves, then returns to **0%**, even when Shield absorbs the entire hit. Non-damaging spells, Fate and self-damage preserve it; a new duel resets it. The attempt changes no cards or Ember/Flow resources. Fate and Loaded do not modify its roll, and Loaded is not consumed by the attempt; normal end-of-turn Loaded expiry still applies.
- **Aura** costs **1 Mana** and uses the main action instead of a primary spell or Enhancement. It immediately grants a fixed **10% damage bonus** for **three subsequent owner turns, excluding its activation turn**. It cannot stack or be recast while active, but may be activated again after expiry. The counter stays at three when activation ends, then decreases only when the owner actually passes each of their next three turns, including a confirmed hand refresh. Opening End Turn or selecting refresh cards does not decrement it; opponent turns do not count. Aura rolls no dice, opens no Fate window, grants no Embers/Flow and leaves Loaded unused.
- Enhancement and Aura add together, for a maximum of **40%**, and increase **total outgoing spell damage** after threshold/Flow/Ember calculation and before Shield absorption. Round once to the nearest integer, halves up. Example: 15 damage at 10% becomes 17; 20 damage with 30% Enhancement plus 10% Aura becomes 28. Healing, resource gains, Shield gains/removal and self-damage are unaffected. Damaging resolution consumes Enhancement while Aura lasts until its countdown expires. The combat log shows both bonuses and the full damage calculation.
- Incoming opponent damage consumes Shield before HP. **Self-damage bypasses the caster's Shield.** Shield-removal effects happen before their spell's damage. Healing cannot exceed 100 HP; reaching zero HP ends the duel.
- Fire gains only printed Embers. Gains stop at five; spending happens before spell resolution. Optional spending uses a compact popup above the selected slab when Embers are available.
- Water damage and healing use **Flow before the spell resolves**. After the effects, each Water spell grants **1 Flow**. A printed **additional Flow** gain adds to that default, capped at five. For example, Water-2 at 8+ gains two Flow total; Water-9 always gains two Flow total. Fate grants no automatic Flow.
- New Loaded bonuses queue for the caster's **next own turn**, stack, and apply once to that turn's first spell roll. Unused bonuses expire at that turn's end. A bonus earned this turn does not modify this turn's roll.
- After a spell, Enhancement attempt or Aura activation, all three main-action controls stay disabled until the next own turn. Active Aura prevents recasting it; 30% Enhancement prevents further attempts until consumed. End Turn reveals Hand Refresh and turns red; End Turn again passes without refreshing. Hand Refresh lets the player select any number of slabs, including zero. Confirming it discards the selections, draws up to six, and passes immediately. End Turn during selection passes without applying those discards.
- The Spell Tower and discard counts follow card movement. Read Slab shows the complete rules; the tower view shows the saved composition without revealing draw order. If the tower is empty, draws stop; no reshuffle or fatigue rule is invented.

## Save compatibility

Combat saves use **version 13** and the `nov4-v2.1` catalog. Current-catalog version 12 saves migrate with no active Aura while retaining Enhancement, hands, resources and pending progress; version 10/11 saves additionally start at 0% Enhancement. Guest deck storage and deck compatibility are unchanged. Old-catalog duels remain retired, and old deck IDs are not converted into unrelated new cards. Build new Fire and Water decks in the workshop. Prior browser data is kept separate, and account migration retains credentials while archiving replaced old deck data.

`src/spells.js` contains the canonical metadata, `src/effects.js` implements spell effects, `src/game.js` owns combat timing, and `src/decks.js` validates saved and uploaded compositions.
