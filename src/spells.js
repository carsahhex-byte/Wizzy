/** Master Spellbook V2.1, supplied 04 Nov 2026. Combat timing follows the user's rules. */
export const DECK_SIZE = 30;
export const MIN_DECK_SIZE = 1;
// Additive cards retain this compatibility family so existing decks stay playable.
export const SPELLBOOK_VERSION = 'nov4-v2.1';

/** Stable IDs retain deck and artwork identity while the active book gets names. */
export const SPELL_DISPLAY_NAMES = Object.freeze({
  'Fire-2': 'Heatbox',
  'Fire-15': 'Blaze',
  'Fire-6': 'Charred Blade',
  'Fire-11': 'Xineoph',
  'Fire-14': 'Sunsetter',
  'Water-2': 'Sea bolt',
  'Water-0': 'Swell',
  'Water-12': 'Coral Crash',
  'Water-9': 'Pacific',
  'Water-14': "Poseidon's Rift",
});
export const LEGACY_SPELL_NAMES = Object.freeze(Object.fromEntries(Object.keys(SPELL_DISPLAY_NAMES).map(id => [id, id])));

const artwork = Object.freeze({ Fire: 'fireCard', Water: 'waterCard', Fate: 'fateCard' });
const spell = (id, element, manaCost, effectText, purpose) => Object.freeze({
  id, spellId: id, name: SPELL_DISPLAY_NAMES[id] || id, element, category: 'Elemental', type: element,
  slabType: element, manaCost, effectText, art: artwork[element], purpose,
});
const fire = [
  [0, 0, 'Gain 1 Ember.'],
  [1, 1, 'Deal 6 damage. On a 7+, gain 1 Ember. On a 10+, gain 2 Embers instead.'],
  [2, 1, 'Gain 1 Ember. On a 7+, gain 2 Embers instead. On a 10+, gain 3 instead.'],
  [3, 2, 'Gain 12 Shield. On a 7+, gain 1 Ember. On a 10+, gain 2 instead.'],
  [4, 2, 'Deal 5 damage and gain 1 Ember. On an 8+, gain +2 to your next roll. On an 11+, gain +4 instead.'],
  [5, 3, 'Deal 10 damage. You may spend 1 Ember to deal 8 additional damage. On a 9+, remove up to 8 Shield before dealing damage.'],
  [6, 5, 'Deal 22 damage. On a 7+, deal 28 instead. On a 10+, deal 36 instead.'],
  [7, 7, 'Spend all Embers. Deal 15 damage plus 7 per Ember spent. On a 9+, deal 10 per Ember instead.'],
  [8, 2, 'Deal 10 damage and gain 1 Ember. On an 8+, deal 4 additional damage.'],
  [9, 2, 'Gain 2 Embers. On a 7+, gain 3 instead. If you have 4 or more Embers after resolution, gain 1 Mana.'],
  [10, 3, 'Gain 16 Shield and 1 Ember. On an 8+, gain 8 additional Shield.'],
  [11, 2, 'Deal 10 damage and gain 2 Embers. On a 7+, gain 1 Mana.'],
  [12, 4, 'Deal 14 damage. You may spend up to 2 Embers to deal 8 additional damage per Ember. On a 7+, remove up to 10 Shield before dealing damage.'],
  [13, 6, 'Deal 30 damage. On a 7+, deal 38 instead. On a 10+, deal 45 instead.'],
  [14, 8, 'Spend all Embers. Deal 20 damage plus 7 per Ember spent. On an 8+, deal 9 per Ember instead.'],
  [15, 0, 'Gain 1 Ember. On a 7+, gain 1 Mana.'],
];
const water = [
  [0, 0, 'Gain 1 Mana on cast. On a 7+, gain 1 additional Flow after resolution.'],
  [1, 1, 'Deal 6 damage. On a 7+, deal 3 additional damage.'],
  [2, 1, 'Deal 4 + 2 × Flow damage. On an 8+, gain 1 additional Flow after resolution.'],
  [3, 2, 'Gain 10 Shield. On a 7+, heal 5 HP. On a 10+, heal 10 instead.'],
  [4, 2, 'Deal 5 + Flow damage. On a 7+, gain +2 to your next roll. On a 10+, gain 1 additional Flow after resolution.'],
  [5, 3, 'Deal 8 + 2 × Flow damage. On a 9+, heal HP equal to your Flow.'],
  [6, 5, 'Deal 15 + 3 × Flow damage. On a 9+, deal 8 additional damage.'],
  [7, 7, 'Deal 12 + 5 × Flow damage. On a 9+, deal 10 additional damage.'],
  [8, 2, 'Deal 9 + Flow damage. On a 7+, deal 4 additional damage.'],
  [9, 2, 'Deal 6 + 2 × Flow damage. Gain 1 additional Flow after resolution. On a 10+, deal 5 additional damage.'],
  [10, 3, 'Gain 14 Shield and heal 5 HP. On a 7+, heal an additional 2 HP per Flow.'],
  [11, 3, 'Deal 8 + Flow damage and gain +2 to your next roll. On a 7+, gain 1 additional Flow after resolution.'],
  [12, 3, 'Deal 12 + 2 × Flow damage. On a 7+, heal 2 HP per Flow.'],
  [13, 6, 'Deal 20 + 3 × Flow damage. On a 7+, deal 10 additional damage.'],
  [14, 8, 'Deal 15 + 5 × Flow damage. On an 8+, deal 12 additional damage.'],
];
const purposes = ['Basic attack', 'Early identity', 'Defensive utility', 'Strategic preparation', 'Specialized damage', 'Heavy attack', 'Signature spell'];
const fate = (id, name, role, effectText) => Object.freeze({
  id, spellId: id, name, element: 'Shared', category: 'Fate', type: 'Fate',
  slabType: 'Fate', manaCost: 0, printedManaCost: null,
  manaCostSource: 'Existing game rule retained; the PDF does not specify a cost.',
  effectText, art: artwork.Fate, role,
});
export const SPELL_CATALOG = Object.freeze(Object.fromEntries([
  ...fire.map(([number, mana, text]) => spell(`Fire-${number}`, 'Fire', mana, text, [0, 15].includes(number) ? 'Resource preparation' : purposes[(number - 1) % 7])),
  ...water.map(([number, mana, text]) => spell(`Water-${number}`, 'Water', mana, text, number === 0 ? 'Resource preparation' : purposes[(number - 1) % 7])),
  fate('FAT-001', 'Fortune', 'Attacking', '+4 to the Modified Roll when attacking.'),
  fate('FAT-002', 'Misfortune', 'Defending', '−4 to the Modified Roll when defending.'),
  fate('FAT-003', 'Twist', 'Flexible', 'Choose +2 or −2 to the Modified Roll.'),
].map(definition => [definition.spellId, definition])));

/** No supplied starter compositions: players build their own current-spellbook decks. */
export const DECK_LISTS = Object.freeze({ fire: Object.freeze([]), water: Object.freeze([]) });
export const SOURCE_INFO = Object.freeze({
  additionalSpells: Object.freeze(['Fire-0', 'Fire-15', 'Water-0']),
  playableSpellCount: 13,
  legacyCatalogSpellCount: 34,
  spellbook: Object.freeze({
    file: 'Wizzy Master Spellbook Nov4.pdf', title: 'Wizzy / Master Spellbook V2.1',
    version: SPELLBOOK_VERSION, revised: '2026-11-04', librarySpellCount: 31,
    importedSpellCount: 31, scope: Object.freeze(['Fire', 'Water', 'Fate']),
    timing: 'User instruction: rolled spells begin with defender Fate and alternate until two consecutive passes; immediate spells skip dice and Fate.',
  }),
});
