# Master Spellbook and custom decks

The current catalog contains **33 unique spells: 16 Fire, 14 Water, and 3 Fate**. The 31 original spells come from **Wizzy Master Spellbook Nov4.pdf**, *Wizzy / Master Spellbook V2.1*, dated November 4, 2026. **Fire-0** is an additional user-defined spell: **0 Mana, "Gain 1 Ember."** **Fire-15** is another user-defined spell: **0 Mana, "Gain 1 Ember and 1 Mana."** The previous Fire, Water, and Neutral catalog and its prescribed decklists are no longer playable. Earth and Air are outside this update.

Printed Fire/Water costs and effect text come from that PDF. The user's combat instructions take precedence over the PDF's older pre-roll Fate paragraph and its note about retaining the earlier approved spellbook. This update replaces that earlier spellbook and applies Fate **after** rolling.

## Build and save a deck

Each element starts with an empty deck slot. No starter composition is generated. Open **Deck**, choose Fire or Water, and select spells from the collection. The selected list and quantities occupy the upper half; the collection shows four slabs per row below it. Filters cover All, Fire, Water, Fate, and **In Deck**.

A playable saved deck must contain:

- **1–30 slabs**; an empty draft is not playable.
- **No per-spell copy limit** within the 30-slab maximum.
- One main element, **Fire or Water**, plus any Fate spells.

Fire and Water spells cannot be mixed. There are no Neutral spells or mandatory category quotas in this spellbook. Printed copy counts do not constrain custom decks; players may choose any number of eligible elemental or Fate slabs within the 1–30-slab range.

Checking a slab adds its first copy; quantity controls add or remove copies, and unchecking removes all copies. Empty drafts remain editable and are retained on this device, but are not playable. **Save deck** stores a legal deck of 1–30 slabs for battle. Existing 30-slab decks remain valid. Saving a deck does not alter an ongoing duel; start a new duel to use the saved composition.

An account is optional for device saves. Saved decks and drafts survive closing regular tabs and loading a new hosted game version in the same browser on the same origin. The game maintains backup copies and restores compatible prior device saves; signed-in account decks remain separate from guest decks. The additions of Fire-0 and Fire-15 retain the current deck compatibility version, so existing November 4 decks and exported files stay valid. Use **Download deck** to move a deck to another browser or device.

Shared-screen play needs both saved element decks. For a two-screen room, each player needs the legal saved deck for their chosen role. Accounts can hold an empty slot while the other element's saved deck is ready; incomplete editor drafts remain local.

## Upload and download decklists

Use **Download deck** to export a legal nonempty deck and **Upload deck** to import one. Uploading loads a compatible decklist into the matching element's editor **as a draft for review**; press **Save deck** to make it playable. **Save & battle** saves the valid draft and opens battle choices.

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

The example is a playable deck of 30 Fire-1 slabs; a playable file may list **1–30 slabs in total**. Files are limited to **64 KB**. Imports validate the format, spellbook version, element, known spell IDs, and 1–30-slab total. Empty or over-30 files are rejected. A malformed, oversized, outdated, or illegal file shows an error instead of replacing the current draft. Old-catalog IDs are rejected rather than being interpreted as new spells. A decklist contains spell quantities, not an account login, private room token, or shuffled draw order.

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

All 33 slabs use the same proportional rules font, **17 px at a 170 px card width**, without reducing it for longer descriptions. Titles stay at the parchment's top and the rules are centered in the remaining space, with **bold roll thresholds**. The upper-left yellow number is the Mana cost; its accessible label still says “N Mana.” **Read Slab** shows the complete spellbook wording, and supplied artwork remains unchanged.

Compact rules use swords for outgoing damage, hearts for healing, and matching
Shield, Mana and die icons. Flames mean Ember/Embers; drops mean Flow. A drop in
a formula uses the current Flow counter, while `+1` drop adds Flow. Short
formulas retain base damage and per-Ember scaling; optional spending,
“extra”/“instead,” and after-spell Flow timing remain explicit. Fate modifiers
beside the die still affect the Modified Roll. Accessible text and Read Slab
retain full words, and these display changes alter no spell effects.

## Combat rules

- Each wizard begins with **100 HP**, **3 Mana**, zero Shield, zero Embers/Flow, zero Loaded, **0% Enhancement**, and no active Aura. Maximums are **100 HP, 10 Mana, 30 Shield, 5 Embers/Flow, and 30% Enhancement**. Active Aura adds a separate fixed **10%**.
- Shuffle each saved 1–30-slab deck and draw **up to five opening slabs**, limited by available cards. Each wizard rolls one opening d6; higher starts and ties reroll both. Fate and Loaded do not affect initiative. The second player draws one extra slab when their first own turn begins **if a tower card is available**, up to the six-slab hand limit. Small decks can begin with fewer cards and an empty tower.
- On each own turn after the opening turn, gain **2 Mana** up to the cap and draw up to six slabs. Unspent Mana carries over. One round contains one turn from each wizard, starting with the initiative winner.
- Each wizard may use **one main action per own turn**: commit a primary spell, attempt Enhancement, or activate Aura. Fire and Water slabs are primary spells; Fate does not consume this allowance. Printed Mana and any optional Ember spending are paid on spell commitment. Fire-7 and Fire-14 automatically spend all available Embers.
- **Fire-0** gains 1 Ember immediately, capped at 5. It costs 0 Mana and uses the primary action without rolling, opening Fate or consuming Loaded. Fire-15 also costs 0 Mana and gains 1 Ember and 1 Mana immediately, independently capped at 5 and 10, without dice, Fate or Loaded consumption. Both use the primary action. The other 28 Fire/Water spells roll **2d6**. The roll and eligible Loaded bonus are displayed before Fate. Higher thresholds replace lower outcomes of the same effect unless the text specifies an additional effect.
- For both spell and Enhancement rolls, the **defender** gets the first Fate response. Players then alternate, casting **one eligible Fate slab** or passing each time. A cast resets the consecutive-pass count; **two consecutive passes** end the chain and resolve the pending action. A player with no eligible Fate passes automatically, and a player who passed may respond again after another Fate is cast. There is no fixed response-window limit.
- Fortune is available only to the caster of the pending spell or Enhancement, and Misfortune only to their opponent; these roles do not swap when a player responds. Either player may choose **+2 or −2** for each Twist. Fate updates the Modified Roll without rerolling the original dice. Negative modified totals are permitted.
- Each player starts at **0% Enhancement**. The active player may attempt it **once instead of a primary spell or Aura**, for **0 Mana**. Roll **2d6 once**, then complete the ordinary defender-first Fate chain. The **final Modified Roll** sets the highest qualifying award: **6–8 adds 10 percentage points**, **9–11 adds 20**, and **12+ adds 30**. Award it **once after the chain closes**, adding to stored Enhancement up to **30% total**; below 6 gains nothing. Failure still uses the action. Enhancement remains banked until an outgoing damaging primary spell resolves, then returns to **0%**, even when Shield absorbs the entire hit. Non-damaging spells, Fate and self-damage preserve it; a new duel resets it. Enhancement uses no primary slab; Fate played for it is discarded normally. It grants no Embers/Flow, and **Loaded neither modifies its roll nor is consumed**; normal end-of-turn Loaded expiry still applies.
- **Aura** costs **1 Mana** and uses the main action instead of a primary spell or Enhancement. It immediately grants a fixed **10% damage bonus** for **three subsequent owner turns, excluding its activation turn**. It cannot stack or be recast while active, but may be activated again after expiry. The counter stays at three when activation ends, then decreases only when the owner actually passes each of their next three turns, including a confirmed hand refresh. Opening End Turn or selecting refresh cards does not decrement it; opponent turns do not count. Aura rolls no dice, opens no Fate window, grants no Embers/Flow and leaves Loaded unused.
- Enhancement and Aura add together, for a maximum of **40%**, and increase **total outgoing spell damage** after threshold/Flow/Ember calculation and before Shield absorption. Round once to the nearest integer, halves up. Example: 15 damage at 10% becomes 17; 20 damage with 30% Enhancement plus 10% Aura becomes 28. Healing, resource gains, Shield gains/removal and self-damage are unaffected. Damaging resolution consumes Enhancement while Aura lasts until its countdown expires. The combat log shows both bonuses and the full damage calculation.
- Incoming opponent damage consumes Shield before HP. **Self-damage bypasses the caster's Shield.** Shield-removal effects happen before their spell's damage. Healing cannot exceed 100 HP; reaching zero HP ends the duel.
- Fire gains only printed Embers. Gains stop at five; spending happens before spell resolution. Optional spending uses a compact popup above the selected slab when Embers are available.
- Water damage and healing use **Flow before the spell resolves**. After the effects, each Water spell grants **1 Flow**. A printed **additional Flow** gain adds to that default, capped at five. For example, Water-2 at 8+ gains two Flow total; Water-9 always gains two Flow total. Fate grants no automatic Flow.
- New Loaded bonuses queue for the caster's **next own turn**, stack, and apply once to that turn's first spell roll. Unused bonuses expire at that turn's end. A bonus earned this turn does not modify this turn's roll.
- After a spell, Enhancement attempt or Aura activation, all three main-action controls stay disabled until the next own turn. Active Aura prevents recasting it; 30% Enhancement prevents further attempts until consumed. End Turn reveals Hand Refresh and turns red; End Turn again passes without refreshing. Hand Refresh lets the player select any number of slabs, including zero. Confirming it discards the selections, draws up to six, and passes immediately. End Turn during selection passes without applying those discards.
- The Spell Tower and discard counts follow card movement. Read Slab shows the complete rules; the tower view shows the saved composition without revealing draw order. If the tower is empty, draws stop; no reshuffle or fatigue rule is invented.

## Battle presentation

The approved v2 caster and projectile sheets are live in battles. Primary animations start only after any Fate chain ends; Fate itself has no animation. Damaging spells retain their Mana-based basic/simple/large tiers. Their caster charges for one second, releases at 1.5 seconds, and sends a one-second projectile flight to impact at 2.5 seconds. The defender stays in its standing pose with the original quick 210 ms red flash and four 85 ms legacy impact frames. This 340 ms hit window ends the damaging animation at 2.84 seconds. Shield and power-up spells last two seconds and show their results at 500 ms.

After its Fate chain ends, successful Enhancement plays a two-second jump with the award shown at 500 ms; a final Modified Roll below 6 displays **MISS** without animation. Aura forms for 500 ms and holds its particle loop for one second before controls unlock, then keeps a green ring underfoot until its third subsequent owner turn ends. Activation does not count, and expiry plays a 500 ms fizzle. An active ring is restored on resume without replaying formation. Reduced motion settles actions immediately and keeps Aura static.

These visuals never apply combat effects twice or change spell metadata, damage tiers, deck rules or save compatibility. Costs are paid normally; results are held on screen until impact, HP bars ease over 800 ms, and battle actions and victory wait for the presentation to finish. Victory also waits until the losing HP bar reaches zero, even when the quick hit has finished. Reloading does not replay completed actions. The unchanged source PNGs, timing reference and ZIP remain in the separate animation gallery, including the longer v2 hit sheet retained as a reference.

## Save compatibility

Combat saves use **version 14** and the `nov4-v2.1` catalog. New pending actions distinguish spells from Enhancement, and new Enhancement rolls use the `fate-tiered-v1` rule: the award stays pending until the chain resolves. Current-catalog versions **10–13** migrate without rebuilding decks. Version 13 retains hands, resources, banks, Aura and counters; already-resolved Enhancement rolls keep their recorded flat or tiered awards without rerolling or awarding again. A version 13 Enhancement saved before its dice roll now follows the new post-roll Fate chain. Version 12 retains Enhancement with no active Aura, while versions 10/11 start at 0% Enhancement and no Aura and have their older Fate history upgraded.

Guest deck storage, the JSON decklist format and spellbook compatibility stay unchanged; existing 30-slab decks remain legal alongside the new 1–30 range. Empty slots and drafts remain non-playable. Old-catalog duels remain retired, and old deck IDs are not converted into unrelated new cards. Prior browser data is kept separate, and account migration retains credentials while archiving replaced old deck data.

`src/spells.js` contains the canonical metadata, `src/effects.js` implements spell effects, `src/game.js` owns combat timing, and `src/decks.js` validates saved and uploaded compositions.
