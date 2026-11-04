/**
 * Spell slab metadata transcribed from the supplied master spellbook.
 * Rules text and mana costs are display data; effect execution is a later step.
 * Earth and Air are intentionally outside this initial Fire/Water test.
 */
export const DECK_SIZE = 30;

const artwork = Object.freeze({
  Fire: 'fireCard',
  Water: 'waterCard',
  Neutral: 'neutralCard',
  Fate: 'fateCard',
});

const spell = (id, name, element, category, manaCost, effectText) => {
  const type = category === 'Elemental' ? element : category;
  return Object.freeze({
    id,
    spellId: id,
    name,
    element,
    category,
    type,
    slabType: type,
    manaCost,
    effectText,
    art: artwork[type],
  });
};

export const SPELL_CATALOG = Object.freeze(Object.fromEntries([
  spell('WAT-001', 'Ripple', 'Water', 'Elemental', 1,
    'Deal 1 + Flow damage.'),
  spell('WAT-002', 'Pacific', 'Water', 'Elemental', 2,
    'Gain 2 Flow, or 3 Flow on 11+.'),
  spell('WAT-003', 'Stillwater', 'Water', 'Elemental', 1,
    'Gain 3 Shield. Gain +2 to your next roll.'),
  spell('WAT-004', 'Undertow', 'Water', 'Elemental', 2,
    'Deal 3 + Flow damage. On a 7+, set your Flow to at least 2 without reducing it if already higher.'),
  spell('WAT-005', 'Restoration', 'Water', 'Elemental', 2,
    'Heal 9 HP.'),
  spell('WAT-006', 'Water Jet', 'Water', 'Elemental', 1,
    'Deal 2 + Flow damage. Gain +2 to your next roll.'),
  spell('WAT-007', 'Sea Surge', 'Water', 'Elemental', 2,
    'Deal 2 + Flow damage. On a 7+, heal 5 HP and gain +1 to your next roll.'),
  spell('WAT-008', 'Riptide', 'Water', 'Elemental', 3,
    'Deal 2 + Flow damage. On a 9+, deal exactly 8 total damage instead and gain +1 to your next roll.'),
  spell('WAT-009', 'Tsunami', 'Water', 'Elemental', 3,
    'Deal 2 + Flow damage. On a 10+, deal 9 additional damage.'),
  spell('WAT-010', "Poseidon's Rift", 'Water', 'Elemental', 4,
    'Deal damage equal to 2 × your Flow. On an 8+, deal damage equal to 3 × your Flow instead.'),

  spell('FIR-001', 'Spark Shot', 'Fire', 'Elemental', 1,
    'Deal 1 damage. Gain 1 Ember.'),
  spell('FIR-002', 'Kindle', 'Fire', 'Elemental', 1,
    'Gain 2 Embers.'),
  spell('FIR-003', 'Cinder Wall', 'Fire', 'Elemental', 1,
    'Gain 2 Shield and 1 Ember. Gain +1 to your next roll.'),
  spell('FIR-004', 'Fireblast', 'Fire', 'Elemental', 2,
    'Deal 3 damage. Gain 1 Ember. On an 8+, gain 2 Embers instead.'),
  spell('FIR-005', 'Flameguard', 'Fire', 'Elemental', 1,
    'Gain 3 Shield and 1 Ember. On a 7+, gain 4 additional Shield.'),
  spell('FIR-006', 'Burn', 'Fire', 'Elemental', 1,
    'Take 5 self-damage. Gain 2 Embers. On a 10+, take 7 self-damage and gain 4 Embers instead.'),
  spell('FIR-007', 'Blast Burn', 'Fire', 'Elemental', 3,
    'Gain 2 Embers and +3 to your next roll.'),
  spell('FIR-008', 'Blazing Rush', 'Fire', 'Elemental', 2,
    'Deal 2 damage. Spend 1 Ember to deal 3 additional damage. On a 9+, deal 4 additional damage.'),
  spell('FIR-009', 'Wildfire', 'Fire', 'Elemental', 3,
    'Deal 2 damage. Spend X Embers to deal 2 additional damage per Ember spent.'),
  spell('FIR-010', 'Heatbox', 'Fire', 'Elemental', 0,
    'Deal 1 damage. Gain 1 Ember. On a 7+, gain 2 Embers instead. On a 10+, gain 3 Embers instead.'),
  spell('FIR-011', 'Inferno', 'Fire', 'Elemental', 3,
    'Deal 4 damage. Spend up to 2 Embers to deal 2 additional damage per Ember. On a 6+, if no Embers were spent, gain +3 to your next roll and 1 Ember.'),
  spell('FIR-012', 'Sunsetter', 'Fire', 'Elemental', 4,
    'Spend all Embers. Deal 3 damage, plus 4 damage per Ember spent. On a 9+, deal 5 damage per Ember spent instead of 4.'),

  spell('NEU-001', 'Ward', 'Neutral', 'Neutral', 2,
    'Gain 3 Shield. Gain +2 to your next roll.'),
  spell('NEU-002', 'Meditate', 'Neutral', 'Neutral', 1,
    'Gain +3 to your next roll.'),
  spell('NEU-003', 'Legacy Shield', 'Neutral', 'Neutral', 1,
    'Gain 7 Shield.'),
  spell('NEU-004', 'Mana Shield', 'Neutral', 'Neutral', 0,
    'Gain 5 Shield and 1 Mana.'),

  spell('FAT-001', 'Fortune', 'Shared', 'Fate', 0,
    'Attacking Fate: +4 to your roll.'),
  spell('FAT-002', 'Misfortune', 'Shared', 'Fate', 0,
    'Defending Fate: −4 to your opponent’s roll.'),
  spell('FAT-003', 'Twist', 'Shared', 'Fate', 0,
    'Attacking Fate: +2; defending Fate: −2.'),
].map(definition => [definition.spellId, definition])));

const deck = entries => Object.freeze(entries.map(([spellId, quantity]) => Object.freeze({ spellId, quantity })));

/** Exact playable composition; zero-copy reference rows do not create slabs. */
export const DECK_LISTS = Object.freeze({
  fire: deck([
    ['FIR-001', 1], // Spark Shot
    ['FIR-002', 2], // Kindle
    ['FIR-004', 2], // Fireblast
    ['FIR-005', 3], // Flameguard
    ['FIR-006', 3], // Burn
    ['FIR-007', 2], // Blast Burn
    ['FIR-010', 2], // Heatbox
    ['FIR-011', 3], // Inferno
    ['FIR-012', 3], // Sunsetter
    ['FAT-001', 3], // Fortune
    ['FAT-002', 2], // Misfortune
    ['FAT-003', 2], // Twist
    ['NEU-004', 1], // Mana Shield
    ['NEU-003', 1], // Legacy Shield
  ]),
  water: deck([
    ['WAT-001', 2], // Ripple
    ['WAT-002', 2], // Pacific
    ['WAT-003', 1], // Stillwater
    ['WAT-004', 3], // Undertow
    ['WAT-005', 2], // Restoration
    ['WAT-006', 2], // Water Jet
    ['WAT-007', 2], // Sea Surge
    ['WAT-008', 1], // Riptide
    ['WAT-009', 3], // Tsunami
    ['WAT-010', 3], // Poseidon's Rift
    ['NEU-002', 1], // Meditate
    ['NEU-004', 1], // Mana Shield
    ['FAT-001', 3], // Fortune
    ['FAT-002', 2], // Misfortune
    ['FAT-003', 2], // Twist
  ]),
});

export const SOURCE_INFO = Object.freeze({
  spellbook: Object.freeze({
    file: 'Wizzy_Complete_Master_Spellbook_WAT001_to_FAT003.pdf',
    title: 'Wizzy / Master Spellbook',
    source: 'MASTER_SPELLBOOK.xlsx',
    librarySpellCount: 47,
    importedSpellCount: 29,
    scope: Object.freeze(['Fire', 'Water', 'Neutral', 'Fate']),
  }),
  fire: Object.freeze({
    file: 'Wizzy Fire Decklist Nov3.pdf',
    version: '2.2',
    revised: '2026-11-03',
    slabCount: 30,
    elemental: 21,
    neutral: 2,
    fate: 7,
  }),
  water: Object.freeze({
    file: 'Wizzy_Water_Deck_v1_0_Final.pdf',
    version: '1.0',
    slabCount: 30,
    elemental: 21,
    neutral: 2,
    fate: 7,
  }),
});
