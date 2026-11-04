# Fire and Water spell slab decklists

These tables reproduce the supplied initial-test deck compositions. Each physical copy receives its own game instance ID while retaining the canonical master spell ID below.

## Source documents

- **Spell definitions:** the uploaded `Wizzy_Complete_Master_Spellbook_WAT001_to_FAT003.pdf`, *Wizzy / Master Spellbook*, which identifies `MASTER_SPELLBOOK.xlsx` as its source. The spreadsheet itself was not uploaded. The PDF's mana costs and full effect text are canonical for the imported metadata.
- **Fire composition:** `Wizzy Fire Decklist Nov3.pdf`, version **2.2**, revised **November 3, 2026**.
- **Water composition:** `Wizzy_Water_Deck_v1_0_Final.pdf`, version **1.0**, finalized composition.

Only Fire, Water, Neutral, and Fate definitions are imported. The active-scope catalog contains **29** spells: Fire 12, Water 10, Neutral 4, and Fate 3. All **26 Fire/Water/Neutral effects** and **3 Fate effects** are implemented, including catalog spells with no copies in these decks. The playable decks use **25 distinct spells** in total. Earth and Air are outside this update and have no new effect logic.

## Card categories and artwork

| Category | Slab type | Artwork |
| --- | --- | --- |
| Elemental | Fire | Pixel-Art Fiery Comet Spell Card 2 |
| Elemental | Water | Pixel Art Cresting Wave Card |
| Neutral | Neutral | White Neutral card |
| Fate | Fate | Purple Galaxy Vortex Card Frame |

Every slab uses its own name, printed mana cost, and verbatim `effectText` from the master spellbook. The same artwork is reused for all slabs of the corresponding type. Slab colors identify the types without extra element labels; the hand places three slabs in the top row and up to two in the bottom row.

## Fire v2.2

| Master ID | Spell slab | Category | Mana | Copies |
| --- | --- | --- | ---: | ---: |
| FIR-001 | Spark Shot | Elemental (Fire) | 1 | 1 |
| FIR-002 | Kindle | Elemental (Fire) | 1 | 2 |
| FIR-004 | Fireblast | Elemental (Fire) | 2 | 2 |
| FIR-005 | Flameguard | Elemental (Fire) | 1 | 3 |
| FIR-006 | Burn | Elemental (Fire) | 1 | 3 |
| FIR-007 | Blast Burn | Elemental (Fire) | 3 | 2 |
| FIR-010 | Heatbox | Elemental (Fire) | 0 | 2 |
| FIR-011 | Inferno | Elemental (Fire) | 3 | 3 |
| FIR-012 | Sunsetter | Elemental (Fire) | 4 | 3 |
| FAT-001 | Fortune | Fate | 0 | 3 |
| FAT-002 | Misfortune | Fate | 0 | 2 |
| FAT-003 | Twist | Fate | 0 | 2 |
| NEU-004 | Mana Shield | Neutral | 0 | 1 |
| NEU-003 | Legacy Shield | Neutral | 1 | 1 |

**Playable total: 30 slabs, 14 distinct spells.**

| Category | Copies |
| --- | ---: |
| Elemental | 21 |
| Neutral | 2 |
| Fate | 7 |
| **Total** | **30** |

## Water v1.0

| Master ID | Spell slab | Category | Mana | Copies |
| --- | --- | --- | ---: | ---: |
| WAT-001 | Ripple | Elemental (Water) | 1 | 2 |
| WAT-002 | Pacific | Elemental (Water) | 2 | 2 |
| WAT-003 | Stillwater | Elemental (Water) | 1 | 1 |
| WAT-004 | Undertow | Elemental (Water) | 2 | 3 |
| WAT-005 | Restoration | Elemental (Water) | 2 | 2 |
| WAT-006 | Water Jet | Elemental (Water) | 1 | 2 |
| WAT-007 | Sea Surge | Elemental (Water) | 2 | 2 |
| WAT-008 | Riptide | Elemental (Water) | 3 | 1 |
| WAT-009 | Tsunami | Elemental (Water) | 3 | 3 |
| WAT-010 | Poseidon's Rift | Elemental (Water) | 4 | 3 |
| NEU-001 | Ward | Neutral | 2 | 0 |
| NEU-002 | Meditate | Neutral | 1 | 1 |
| NEU-003 | Legacy Shield | Neutral | 1 | 0 |
| NEU-004 | Mana Shield | Neutral | 0 | 1 |
| FAT-001 | Fortune | Fate | 0 | 3 |
| FAT-002 | Misfortune | Fate | 0 | 2 |
| FAT-003 | Twist | Fate | 0 | 2 |

**Playable total: 30 slabs, 15 distinct spells.**

| Category | Copies |
| --- | ---: |
| Elemental | 21 |
| Neutral | 2 |
| Fate | 7 |
| **Total** | **30** |

Ward (`NEU-001`) and Legacy Shield (`NEU-003`) have **zero copies** in the Water PDF. They remain catalog definitions but are not instantiated in the Water deck.

## Playable rules

- Each wizard shuffles its own 30-slab deck, draws four opening slabs, and begins with **26** in the Spell Tower. Later turn-start drawing and optional hand refresh retain the existing five-slab hand limit.
- Each wizard starts with **3 mana** and gains **2 mana at the beginning of each own turn after their opening turn**. Printed mana costs are enforced when casting, with unspent mana carried forward.
- Each wizard may commit **one primary spell per own turn**. Elemental and Neutral slabs are primary spells; Fate slabs do not consume this allowance. The allowance is spent when the primary spell is committed, before Fate decisions, and **Cast Spell** stays greyed out after resolution until that wizard's next own turn. Slabs can still be inspected.
- All imported Fire, Water, and Neutral effects execute their printed damage, Shield, healing, resource gains, Ember spending, and threshold effects. Both enemy damage and self-damage consume Shield first; healing cannot exceed 30 HP. Spending choices are made before committing the spell, and Sunsetter spends all available Embers.
- Only spells with roll thresholds open Fate decisions and use **2d6**. Other spells resolve immediately, without Fate decisions, dice, or consuming Loaded.
- The attacker first selects any number of eligible **Fortune** (+4) or **Twist** (+2) slabs, then clicks **Cast Fate** to play the whole batch and advance immediately. A local handoff then gives the defender a window to select any number of **Misfortune** (−4) or **Twist** (−2) slabs; **Cast Fate** plays that batch and advances to the roll. Selecting eligible Fate slabs changes the action to the supplied **Cast Fate** graphic; clicking a selected slab again deselects it. Non-Fate and ineligible Fate slabs are greyed out. **Skip Fate** clears staged selections and advances without playing them. There is no extra Skip Fate click after casting a batch and no per-turn limit on Fate slabs. Cast Fate slabs move to their owner's discard.
- After both windows close, the dice roll is displayed and the modified total resolves the spell. The total is **raw 2d6 + eligible Loaded + attacking Fate + defending Fate**; it can be negative. The players do not alternate Fate responses within these two successive windows.
- New Loaded bonuses queue for the caster's **next own turn**, stack, and are consumed by the first roll on that turn. If no roll uses them, they expire at that turn's end. New bonuses cannot affect rolls on the turn when they are gained.
- After spell resolution, clicking **End Turn** reveals **Hand Refresh** and turns **End Turn** red. Clicking **End Turn** again passes without refreshing. Clicking **Hand Refresh** enters selection and also turns it red; select any number of slabs, including zero, then click **Hand Refresh** again to discard them, draw up to five, and immediately pass. **End Turn** during refresh selection instead passes without refreshing or discarding staged selections. A turn cannot end while a spell or Fate decisions are pending.
- **Read Slab** exposes the full text of a selected slab. The Spell Tower composition view lists the entire deck and quantities without revealing draw order.
- Version **5** saves resume current duels, including the primary-spell allowance and selected Fate batches. Version 4 upgrades retain stats, resources, queued Loaded, card zones, pending paid spells, and Fate/dice progress. A selected Fate slab becomes a batch selection; pending spells or the current turn's cast log determine whether its primary allowance has already been spent. Valid version 3 preview saves retain stats, turn progress, and their card zones. Any unfinished unpaid preview spell is safely cancelled without retroactive charges, card movement, or effects. Valid older 24-card sample saves first receive six additional slabs in each tower and actual decklist identities; the log records upgrades.

## Verification

`src/spells.js` was compared programmatically against the text extracted from the supplied PDFs. All 29 imported spell names, elements, categories, mana costs, and complete effect texts matched the master spellbook. Both playable ID-to-copy maps matched their decklists exactly. Zero-copy Water reference rows are intentionally excluded from playable copies.

Automated coverage includes printed costs, threshold branches, Shield and self-damage, healing limits, Ember-spending choices, Flow, Fate roles and batch order, the one-primary-per-turn limit, next-turn Loaded use and expiry, refresh confirmation and passing, card conservation, and save migration. The effect implementation does not change the deck quantities above.
