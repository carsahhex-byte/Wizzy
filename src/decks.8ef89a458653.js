import { SPELL_CATALOG, DECK_LISTS, DECK_SIZE } from './spells.60141befac6b.js';

export const MAX_COPIES = 3;

const isDeckRecord = value => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isDeckElement = element => element === 'fire' || element === 'water';
const deckSpellExists = spellId => typeof spellId === 'string' && Object.hasOwn(SPELL_CATALOG, spellId);
const isSpellEligibleForDeck = (spell, element) => spell.category === 'Neutral' || spell.category === 'Fate'
  || (spell.category === 'Elemental' && spell.element.toLowerCase() === element);
const orderDeckEntries = entries => entries.map(({ spellId, quantity }) => ({ spellId, quantity }))
  .sort((left, right) => left.spellId < right.spellId ? -1 : left.spellId > right.spellId ? 1 : 0);

function requireDeckElement(element) {
  if (!isDeckElement(element)) throw new TypeError('Choose Fire or Water as the deck’s main element.');
}

/** Inspect a full deck or a partial editor draft without changing the input. */
function inspectDeck(deck, requireFull) {
  const errors = [];
  let total = 0;
  if (!isDeckRecord(deck)) return { valid: false, total, errors: ['A deck must be an object.'] };
  if (!isDeckElement(deck.element)) errors.push('Choose Fire or Water as the deck’s main element.');
  if (!Array.isArray(deck.entries)) {
    return { valid: false, total, errors: [...errors, 'A deck must have a list of spell quantities.'] };
  }
  const seen = new Set();
  for (const entry of deck.entries) {
    if (!isDeckRecord(entry)) {
      errors.push('Each deck entry must contain a spell ID and quantity.');
      continue;
    }
    const { spellId, quantity } = entry;
    if (!deckSpellExists(spellId)) errors.push('The deck contains an unknown spell.');
    else if (isDeckElement(deck.element) && !isSpellEligibleForDeck(SPELL_CATALOG[spellId], deck.element)) {
      errors.push(`${SPELL_CATALOG[spellId].name} does not match the deck’s main element.`);
    }
    if (seen.has(spellId)) errors.push('List each spell once and use its quantity for copies.');
    seen.add(spellId);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_COPIES) {
      errors.push(`Spell quantities must be whole numbers from 1 to ${MAX_COPIES}.`);
    }
    if (Number.isSafeInteger(quantity) && quantity >= 0) total += quantity;
  }
  if (!Number.isSafeInteger(total)) errors.push('The slab count is invalid.');
  if (requireFull && total !== DECK_SIZE) errors.push(`A deck must contain exactly ${DECK_SIZE} slabs.`);
  else if (!requireFull && total > DECK_SIZE) errors.push(`A deck cannot contain more than ${DECK_SIZE} slabs.`);
  return { valid: errors.length === 0, total, errors: [...new Set(errors)] };
}

/** Main-element spells plus all shared Neutral and Fate spells, in catalog order. */
export function getEligibleSpells(element) {
  requireDeckElement(element);
  return Object.values(SPELL_CATALOG).filter(spell => isSpellEligibleForDeck(spell, element));
}

/** Clone the supplied PDF starter composition so editing never changes the preset. */
export function createStarterDeck(element) {
  requireDeckElement(element);
  return { element, entries: DECK_LISTS[element].map(({ spellId, quantity }) => ({ spellId, quantity })) };
}

export function getDeckValidation(deck) {
  return inspectDeck(deck, true);
}

export function validateDeck(deck) {
  return getDeckValidation(deck).valid;
}

/** Validate a playable deck and return only its canonical, independent data. */
export function normalizeDeck(deck) {
  const result = getDeckValidation(deck);
  if (!result.valid) throw new TypeError(result.errors.join(' '));
  return { element: deck.element, entries: orderDeckEntries(deck.entries) };
}

export function getDeckCount(deck, spellId) {
  if (!isDeckRecord(deck) || !Array.isArray(deck.entries)) return 0;
  const entry = deck.entries.find(value => isDeckRecord(value) && value.spellId === spellId);
  return entry && Number.isSafeInteger(entry.quantity) && entry.quantity > 0 ? entry.quantity : 0;
}

/** Set an absolute quantity in a safe partial draft; zero removes the spell. */
export function setDeckQuantity(deck, spellId, quantity) {
  const current = inspectDeck(deck, false);
  if (!current.valid) throw new TypeError(current.errors.join(' '));
  if (!deckSpellExists(spellId)) throw new TypeError('Choose a spell from the slab collection.');
  if (!isSpellEligibleForDeck(SPELL_CATALOG[spellId], deck.element)) throw new TypeError('That spell belongs to the other main element.');
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_COPIES) {
    throw new RangeError(`Choose a whole-number quantity from 0 to ${MAX_COPIES}.`);
  }
  const entries = deck.entries.filter(entry => entry.spellId !== spellId);
  if (quantity > 0) entries.push({ spellId, quantity });
  const next = { element: deck.element, entries: orderDeckEntries(entries) };
  const result = inspectDeck(next, false);
  if (!result.valid) throw new RangeError(result.errors.join(' '));
  return next;
}
