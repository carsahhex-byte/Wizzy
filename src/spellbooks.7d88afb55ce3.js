import { SPELL_CATALOG } from './spells.f8fbae4371e1.js';

export const SPELLBOOK_1 = 'spellbook-1';
export const SPELLBOOK_2 = 'spellbook-2';
export const ACTIVE_SPELLBOOK_ID = SPELLBOOK_2;

/** Paired jobs are editorial labels; they do not change spell effects or timing. */
export const SPELLBOOK_ROLE_PAIRS = Object.freeze([
  Object.freeze({ role: 'Elemental development', fire: 'Fire-2', water: 'Water-2' }),
  Object.freeze({ role: 'Mana and elemental setup', fire: 'Fire-15', water: 'Water-0' }),
  Object.freeze({ role: 'Heavy attack', fire: 'Fire-6', water: 'Water-12' }),
  Object.freeze({ role: 'Attack while building', fire: 'Fire-11', water: 'Water-9' }),
  Object.freeze({ role: 'Finisher', fire: 'Fire-14', water: 'Water-14' }),
]);

const fateIds = Object.values(SPELL_CATALOG).filter(spell => spell.category === 'Fate').map(spell => spell.spellId);
const selectedIds = [
  ...SPELLBOOK_ROLE_PAIRS.map(pair => pair.fire),
  ...SPELLBOOK_ROLE_PAIRS.map(pair => pair.water),
  ...fateIds,
];

export const SPELLBOOKS = Object.freeze({
  [SPELLBOOK_1]: Object.freeze({
    id: SPELLBOOK_1, label: 'Spellbook 1',
    description: 'Archived original collection, retained only for saved-deck compatibility.',
    spellIds: Object.freeze(Object.keys(SPELL_CATALOG)),
  }),
  [SPELLBOOK_2]: Object.freeze({
    id: SPELLBOOK_2, label: 'Spellbook',
    description: 'Five Fire spells, five Water spells, and Fate.',
    spellIds: Object.freeze(selectedIds),
  }),
});

export const ACTIVE_SPELL_IDS = SPELLBOOKS[ACTIVE_SPELLBOOK_ID].spellIds;
export const getActiveSpells = () => getSpellbookSpells(ACTIVE_SPELLBOOK_ID);

export const isSpellbookId = id => typeof id === 'string' && Object.hasOwn(SPELLBOOKS, id);

/** Legacy decks have no book marker and always belong to Spellbook 1. */
export function getDeckSpellbook(deck) {
  return deck?.spellbookId === undefined ? SPELLBOOK_1 : deck.spellbookId;
}

export function getSpellbook(id = SPELLBOOK_1) {
  if (!isSpellbookId(id)) throw new TypeError('Choose Spellbook 1 or Spellbook 2.');
  return SPELLBOOKS[id];
}

export function isSpellInBook(spellId, id = SPELLBOOK_1) {
  return isSpellbookId(id) && SPELLBOOKS[id].spellIds.includes(spellId);
}

/** Return original immutable definitions: no copied card can drift in cost or art. */
export function getSpellbookSpells(id = SPELLBOOK_1) {
  return getSpellbook(id).spellIds.map(spellId => SPELL_CATALOG[spellId]);
}
