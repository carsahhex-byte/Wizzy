# Fire and Water spell slab decklists

These tables reproduce the supplied initial-test deck compositions. Each physical copy receives its own game instance ID while retaining the canonical master spell ID below.

## Source documents

- **Spell definitions:** `Wizzy_Complete_Master_Spellbook_WAT001_to_FAT003.pdf`, *Wizzy / Master Spellbook*, sourced from `MASTER_SPELLBOOK.xlsx`. Its mana costs and full effect text are canonical for the imported metadata.
- **Fire composition:** `Wizzy Fire Decklist Nov3.pdf`, version **2.2**, revised **November 3, 2026**.
- **Water composition:** `Wizzy_Water_Deck_v1_0_Final.pdf`, version **1.0**, finalized composition.

Only Fire, Water, Neutral, and Fate definitions are imported. The active-scope catalog contains **29** spells: Fire 12, Water 10, Neutral 4, and Fate 3. The playable decks use **25 distinct spells** in total. Earth and Air are outside this update.

## Card categories and artwork

| Category | Slab type | Artwork |
| --- | --- | --- |
| Elemental | Fire | Pixel-Art Fiery Comet Spell Card 2 |
| Elemental | Water | Pixel Art Cresting Wave Card |
| Neutral | Neutral | White Neutral card |
| Fate | Fate | Purple Galaxy Vortex Card Frame |

Every slab uses its own name, printed mana cost, and rules text from the master spellbook. The same artwork is reused for all slabs of the corresponding type.

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

## Current preview behavior

- Each wizard shuffles its own 30-slab deck, draws four opening slabs, and begins with **26** in the Spell Tower. Later turn-start drawing and optional hand refresh retain the existing five-slab hand limit.
- Printed mana costs and effects are visible metadata only. The executable engine `cost` stays **0** for this preview; casting does not spend the printed cost or execute the printed effect.
- Fate behavior has not been added. During the existing fate window, all slabs, including purple Fate slabs, remain greyed out and unavailable; **Skip Fate** continues the existing placeholder resolution flow.
- **Read Slab** exposes the full text of a selected slab. The Spell Tower composition view lists the entire deck and quantities without revealing draw order.
- Valid older 24-card sample saves upgrade to save version 3. Stats, turn progress, phase, and card-zone counts are retained, and six new slabs are added to each tower. Their old placeholder slab identities are replaced with actual decklist entries, and the log records the upgrade.

## Verification

`src/spells.js` was compared programmatically against the text extracted from the supplied PDFs. All 29 imported spell names, elements, categories, mana costs, and complete effect texts matched the master spellbook. Both playable ID-to-copy maps matched their decklists exactly. Zero-copy Water reference rows are intentionally excluded from playable copies.
