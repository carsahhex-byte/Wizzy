import { SPELL_CATALOG, DECK_LISTS, DECK_SIZE, MIN_DECK_SIZE, SPELLBOOK_VERSION } from './spells.3798c5f746c7.js';
import { SPELLBOOK_1, SPELLBOOK_2, ACTIVE_SPELLBOOK_ID, getDeckSpellbook, getSpellbookSpells, isSpellbookId, isSpellInBook } from './spellbooks.ecb2ff572f97.js';

export { getDeckSpellbook } from './spellbooks.ecb2ff572f97.js';

export const MAX_DECK_FILE_BYTES = 65536;

const isDeckRecord = value => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isDeckElement = element => element === 'fire' || element === 'water';
const deckSpellExists = spellId => typeof spellId === 'string' && Object.hasOwn(SPELL_CATALOG, spellId);
const isSpellEligibleForDeck = (spell, element) => spell.category === 'Fate'
  || (spell.category === 'Elemental' && spell.element.toLowerCase() === element);
const orderDeckEntries = entries => entries.map(({ spellId, quantity }) => ({ spellId, quantity }))
  .sort((left, right) => left.spellId < right.spellId ? -1 : left.spellId > right.spellId ? 1 : 0);
const deckShape = (element, entries, bookId) => ({ element, entries,
  ...(bookId === SPELLBOOK_2 ? { spellbookId: SPELLBOOK_2 } : {}),
});

function requireDeckElement(element) {
  if (!isDeckElement(element)) throw new TypeError('Choose Fire or Water as the deck’s main element.');
}

/** Inspect a playable deck or an editor draft without changing the input. */
function inspectDeck(deck, requirePlayable) {
  const errors = [];
  let total = 0;
  if (!isDeckRecord(deck)) return { valid: false, total, errors: ['A deck must be an object.'] };
  const bookId = getDeckSpellbook(deck);
  if (!isSpellbookId(bookId)) errors.push('Choose Spellbook 1 or Spellbook 2.');
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
    else if (isSpellbookId(bookId) && !isSpellInBook(spellId, bookId)) {
      errors.push(`${SPELL_CATALOG[spellId].name} is not available in Spellbook 2.`);
    }
    if (seen.has(spellId)) errors.push('List each spell once and use its quantity for copies.');
    seen.add(spellId);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      errors.push('Spell quantities must be positive whole numbers.');
    }
    if (Number.isSafeInteger(quantity) && quantity >= 0) total += quantity;
  }
  if (!Number.isSafeInteger(total)) errors.push('The slab count is invalid.');
  if (total > DECK_SIZE) errors.push(`A deck cannot contain more than ${DECK_SIZE} slabs.`);
  else if (requirePlayable && total < MIN_DECK_SIZE) errors.push(`A deck must contain at least ${MIN_DECK_SIZE} slab.`);
  return { valid: errors.length === 0, total, errors: [...new Set(errors)] };
}

/** Main-element spells plus shared Fate spells, in catalog order. */
export function getEligibleSpells(element, bookId = SPELLBOOK_1) {
  requireDeckElement(element);
  return getSpellbookSpells(bookId).filter(spell => isSpellEligibleForDeck(spell, element));
}

/** New collections start empty; players choose up to 30 slabs in the editor. */
export function createStarterDeck(element, bookId = SPELLBOOK_1) {
  requireDeckElement(element);
  if (!isSpellbookId(bookId)) throw new TypeError('Choose Spellbook 1 or Spellbook 2.');
  return deckShape(element, (bookId === SPELLBOOK_1 ? DECK_LISTS[element] : []).map(({ spellId, quantity }) => ({ spellId, quantity })), bookId);
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
  return deckShape(deck.element, orderDeckEntries(deck.entries), getDeckSpellbook(deck));
}

/** Accounts may have an empty slot; battles require at least one slab. */
export function validateDeckSlot(deck) {
  return inspectDeck(deck, false).valid;
}

export function normalizeDeckSlot(deck) {
  if (!validateDeckSlot(deck)) throw new TypeError(`Save a legal deck with ${MIN_DECK_SIZE}–${DECK_SIZE} slabs, or leave its slot empty.`);
  return deckShape(deck.element, orderDeckEntries(deck.entries), getDeckSpellbook(deck));
}

/** Portable deck files carry the spellbook version so old cards cannot be reinterpreted. */
export function serializeDeck(deck) {
  const canonical = normalizeDeck(deck);
  return JSON.stringify({ format: 'wizzy-deck', version: 1, spellbook: SPELLBOOK_VERSION, ...canonical }, null, 2) + '\n';
}

export function parseDeckList(text) {
  return normalizeDeck(parseDeckFile(text));
}

function parseDeckFile(text) {
  if (typeof text !== 'string' || text.length > MAX_DECK_FILE_BYTES
    || new TextEncoder().encode(text).length > MAX_DECK_FILE_BYTES) {
    throw new TypeError('Choose a Wizzy deck JSON file smaller than 64 KB.');
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new TypeError('The file is not valid deck JSON.'); }
  if (!isDeckRecord(data) || data.format !== 'wizzy-deck' || data.version !== 1) {
    throw new TypeError('Choose a deck exported from the Wizzy deck builder.');
  }
  if (data.spellbook !== SPELLBOOK_VERSION) {
    throw new TypeError('This deck belongs to a different spellbook. Rebuild it with the current slabs.');
  }
  return data;
}

/** Return a reviewable current-book candidate; never silently accept retired cards. */
export function migrateToActiveDeck(deck, { replaceFireFive = true } = {}) {
  if (!isDeckRecord(deck) || !isSpellbookId(getDeckSpellbook(deck))) throw new TypeError('Choose a deck from a recognized Wizzy spellbook.');
  // The archived full catalog can validate a former test deck containing Fire-5.
  const original = normalizeDeckSlot({ element: deck.element, entries: deck.entries });
  const counts = new Map(), removed = [], replacements = [];
  for (const entry of original.entries) {
    const replacement = replaceFireFive && entry.spellId === 'Fire-5' ? 'Fire-6' : entry.spellId;
    if (!isSpellInBook(replacement, ACTIVE_SPELLBOOK_ID)) {
      removed.push({ ...entry });
      continue;
    }
    if (replacement !== entry.spellId) replacements.push({ from: entry.spellId, to: replacement, quantity: entry.quantity });
    counts.set(replacement, (counts.get(replacement) || 0) + entry.quantity);
  }
  const next = normalizeDeckSlot({ element: original.element, spellbookId: ACTIVE_SPELLBOOK_ID,
    entries: [...counts].map(([spellId, quantity]) => ({ spellId, quantity })) });
  return { deck: next, removed, replacements, reviewRequired: removed.length > 0 || replacements.length > 0,
    changed: getDeckSpellbook(deck) !== ACTIVE_SPELLBOOK_ID || removed.length > 0 || replacements.length > 0 };
}

/** Imports with retired spells expose their review report instead of discarding silently. */
export function parseDeckListForActive(text) {
  const data = parseDeckFile(text);
  if (!Array.isArray(data.entries) || data.entries.length === 0) throw new TypeError('Choose a playable deck with 1–30 slabs.');
  return migrateToActiveDeck(data);
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
  if (!isSpellInBook(spellId, getDeckSpellbook(deck))) throw new TypeError('That spell is not available in Spellbook 2.');
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('Choose a nonnegative whole-number quantity.');
  }
  const entries = deck.entries.filter(entry => entry.spellId !== spellId);
  if (quantity > 0) entries.push({ spellId, quantity });
  const next = deckShape(deck.element, orderDeckEntries(entries), getDeckSpellbook(deck));
  const result = inspectDeck(next, false);
  if (!result.valid) throw new RangeError(result.errors.join(' '));
  return next;
}
