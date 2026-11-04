import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG, DECK_LISTS } from '../src/spells.js';
import {
  MAX_COPIES, createStarterDeck, getEligibleSpells, getDeckValidation,
  validateDeck, normalizeDeck, getDeckCount, setDeckQuantity,
} from '../src/decks.js';

test('both PDF starter decks are legal independent 30-slab presets', () => {
  assert.equal(MAX_COPIES, 3);
  for (const element of ['fire', 'water']) {
    const deck = createStarterDeck(element);
    assert.deepEqual(deck, { element, entries: DECK_LISTS[element] });
    assert.deepEqual(getDeckValidation(deck), { valid: true, total: 30, errors: [] });
    deck.entries[0].quantity = 0;
    assert.notEqual(createStarterDeck(element).entries[0].quantity, 0);
    assert.notEqual(DECK_LISTS[element][0].quantity, 0);
  }
  for (const element of ['earth', 'Fire', null, undefined, '__proto__']) {
    assert.throws(() => createStarterDeck(element), /Fire or Water/);
    assert.throws(() => getEligibleSpells(element), /Fire or Water/);
  }
});

test('the collection includes every permitted spell and excludes the opposite element', () => {
  for (const element of ['fire', 'water']) {
    const spells = getEligibleSpells(element);
    const expected = Object.values(SPELL_CATALOG).filter(spell => spell.category !== 'Elemental' || spell.element.toLowerCase() === element);
    assert.deepEqual(spells, expected);
    assert.equal(spells.filter(spell => spell.category === 'Neutral').length, 4);
    assert.equal(spells.filter(spell => spell.category === 'Fate').length, 3);
    assert.ok(spells.every(spell => spell.category !== 'Elemental' || spell.element.toLowerCase() === element));
  }
  assert.equal(getEligibleSpells('fire').length, 19);
  assert.equal(getEligibleSpells('water').length, 17);
});

test('draft editing adds, changes, and removes copies without mutating earlier drafts', () => {
  const empty = { element: 'fire', entries: [] };
  const one = setDeckQuantity(empty, 'FIR-003', 1);
  const three = setDeckQuantity(one, 'FIR-003', 3);
  const removed = setDeckQuantity(three, 'FIR-003', 0);
  assert.deepEqual(empty, { element: 'fire', entries: [] });
  assert.equal(getDeckCount(one, 'FIR-003'), 1);
  assert.equal(getDeckCount(three, 'FIR-003'), 3);
  assert.deepEqual(removed, empty);
  assert.deepEqual(getDeckValidation(three), { valid: false, total: 3, errors: ['A deck must contain exactly 30 slabs.'] });
  const shared = setDeckQuantity(setDeckQuantity(three, 'NEU-001', 2), 'FAT-003', 3);
  assert.equal(getDeckValidation(shared).total, 8);
  assert.equal(getDeckCount(shared, 'FIR-003'), 3);
  assert.equal(getDeckCount(shared, 'WAT-001'), 0);
  assert.equal(getDeckCount(null, 'FIR-001'), 0);
});

test('custom decks have no mandatory Elemental/Neutral/Fate composition split', () => {
  for (const element of ['fire', 'water']) {
    let deck = { element, entries: [] };
    for (const spell of getEligibleSpells(element).filter(spell => spell.category !== 'Elemental')) {
      deck = setDeckQuantity(deck, spell.spellId, 3);
    }
    for (const spell of getEligibleSpells(element).filter(spell => spell.category === 'Elemental').slice(0, 3)) {
      deck = setDeckQuantity(deck, spell.spellId, 3);
    }
    assert.equal(validateDeck(deck), true);
    assert.equal(deck.entries.filter(entry => SPELL_CATALOG[entry.spellId].category === 'Elemental').reduce((sum, entry) => sum + entry.quantity, 0), 9);
    assert.equal(getDeckValidation(deck).total, 30);
    const canonical = normalizeDeck(deck);
    assert.deepEqual(canonical.entries.map(entry => entry.spellId), canonical.entries.map(entry => entry.spellId).sort());
    canonical.entries[0].quantity = 0;
    assert.equal(validateDeck(deck), true, 'canonical output does not alias the draft');
  }
});

test('draft edits enforce the three-copy maximum and prevent cross-element or overfull additions', () => {
  const starter = createStarterDeck('fire');
  const original = structuredClone(starter);
  for (const quantity of [-1, 4, 1.5, '2', NaN, Infinity, null]) {
    assert.throws(() => setDeckQuantity(starter, 'FIR-001', quantity));
  }
  for (const id of ['WAT-001', 'not-a-spell', '__proto__', 'constructor']) {
    assert.throws(() => setDeckQuantity(starter, id, 1));
  }
  assert.throws(() => setDeckQuantity(starter, 'FIR-001', 2), /more than 30/);
  assert.deepEqual(starter, original);
  const room = setDeckQuantity(starter, 'FIR-001', 0);
  const changed = setDeckQuantity(room, 'FIR-003', 1);
  assert.equal(validateDeck(changed), true);
  assert.equal(getDeckCount(changed, 'FIR-003'), 1);
  assert.equal(getDeckCount(changed, 'FIR-001'), 0);
});

test('validation safely rejects malformed data, duplicate spell rows and illegal quantities', () => {
  const mutations = [
    deck => { deck.element = 'earth'; },
    deck => { deck.entries = null; },
    deck => { deck.entries[0] = null; },
    deck => { deck.entries[0] = ['FIR-001', 1]; },
    deck => { deck.entries.push({ ...deck.entries[0] }); },
    deck => { deck.entries[0].spellId = 'WAT-001'; },
    deck => { deck.entries[0].spellId = '__proto__'; },
    deck => { deck.entries[0].quantity = 0; },
    deck => { deck.entries[0].quantity = -1; },
    deck => { deck.entries[0].quantity = 4; },
    deck => { deck.entries[0].quantity = '1'; },
    deck => { deck.entries[0].quantity = 1.5; },
    deck => { deck.entries.pop(); },
  ];
  for (const mutate of mutations) {
    const deck = createStarterDeck('fire'); mutate(deck);
    assert.equal(validateDeck(deck), false);
    assert.ok(getDeckValidation(deck).errors.length > 0);
    assert.throws(() => normalizeDeck(deck));
  }
  for (const deck of [null, undefined, [], 'deck', {}, new Date()]) {
    assert.equal(validateDeck(deck), false);
    assert.doesNotThrow(() => getDeckValidation(deck));
    assert.throws(() => setDeckQuantity(deck, 'FIR-001', 1));
  }
});
