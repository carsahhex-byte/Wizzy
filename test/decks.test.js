import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG, SPELLBOOK_VERSION } from '../src/spells.js';
import {
  MAX_COPIES, MAX_DECK_FILE_BYTES, createStarterDeck, getEligibleSpells, getDeckValidation,
  validateDeck, normalizeDeck, getDeckCount, setDeckQuantity, validateDeckSlot,
  normalizeDeckSlot, serializeDeck, parseDeckList,
} from '../src/decks.js';

const legal = element => ({ element, entries: getEligibleSpells(element).slice(0, 10).map(card => ({ spellId: card.spellId, quantity: 3 })) });

test('new spellbook starts with empty independent deck slots and no old cards', () => {
  assert.equal(MAX_COPIES, 3);
  assert.equal(Object.keys(SPELL_CATALOG).length, 32);
  for (const element of ['fire', 'water']) {
    const empty = createStarterDeck(element);
    assert.deepEqual(empty, { element, entries: [] });
    assert.equal(validateDeck(empty), false);
    assert.equal(validateDeckSlot(empty), true);
    assert.deepEqual(normalizeDeckSlot(empty), empty);
    empty.entries.push({ spellId: 'old-card', quantity: 1 });
    assert.equal(createStarterDeck(element).entries.length, 0);
    const eligible = getEligibleSpells(element);
    assert.equal(eligible.length, element === 'fire' ? 18 : 17);
    assert.equal(eligible.filter(card => card.category === 'Fate').length, 3);
    assert.equal(eligible.filter(card => card.category === 'Neutral').length, 0);
    assert.ok(eligible.every(card => card.category === 'Fate' || card.element.toLowerCase() === element));
    assert.ok(eligible.every(card => !/^(FIR|WAT|NEU)-/.test(card.spellId)));
  }
  for (const value of ['earth', 'Fire', null, undefined, '__proto__']) assert.throws(() => createStarterDeck(value));
});

test('draft editing supports new elemental and Fate slabs without a fixed composition', () => {
  const empty = createStarterDeck('fire');
  const one = setDeckQuantity(empty, 'Fire-3', 1);
  const three = setDeckQuantity(one, 'Fire-3', 3);
  const removed = setDeckQuantity(three, 'Fire-3', 0);
  assert.deepEqual(empty, { element: 'fire', entries: [] });
  assert.equal(getDeckCount(one, 'Fire-3'), 1);
  assert.equal(getDeckCount(three, 'Fire-3'), 3);
  assert.deepEqual(removed, empty);
  assert.equal(validateDeckSlot(three), false, 'partial drafts are not account battle slots');
  assert.equal(getDeckValidation(three).total, 3);
  for (const element of ['fire', 'water']) {
    const deck = legal(element);
    assert.equal(validateDeck(deck), true);
    assert.equal(validateDeckSlot(deck), true);
    const canonical = normalizeDeck(deck);
    canonical.entries[0].quantity = 0;
    assert.equal(validateDeck(deck), true, 'normalizing does not alias input');
  }
});

test('draft edits enforce copy, element and size limits and reject removed spell IDs', () => {
  const deck = legal('fire');
  for (const quantity of [-1, 4, 1.5, '2', NaN, Infinity, null]) assert.throws(() => setDeckQuantity(deck, 'Fire-1', quantity));
  for (const id of ['Water-1', 'FIR-001', 'NEU-001', '__proto__', 'constructor']) assert.throws(() => setDeckQuantity(deck, id, 1));
  assert.throws(() => setDeckQuantity(deck, 'FAT-001', 1), /more than 30/);
  const room = setDeckQuantity(deck, 'Fire-1', 2);
  const mixed = setDeckQuantity(room, 'FAT-003', 1);
  assert.equal(validateDeck(mixed), true);
  assert.equal(getDeckCount(mixed, 'FAT-003'), 1);
});

test('deck exports and imports round-trip both elements with an explicit spellbook version', () => {
  for (const element of ['fire', 'water']) {
    const deck = legal(element);
    const encoded = serializeDeck(deck);
    assert.equal(JSON.parse(encoded).spellbook, SPELLBOOK_VERSION);
    assert.deepEqual(parseDeckList(encoded), normalizeDeck(deck));
    const imported = parseDeckList(encoded);
    imported.entries[0].quantity = 0;
    assert.equal(validateDeck(deck), true);
  }
  assert.throws(() => serializeDeck(createStarterDeck('fire')), /exactly 30/);
});

test('imports reject malformed, oversized, legacy, wrong-element and illegal deck files', () => {
  const valid = JSON.parse(serializeDeck(legal('fire')));
  for (const mutate of [
    data => { data.format = 'other'; },
    data => { data.version = 2; },
    data => { data.spellbook = 'old'; },
    data => { data.entries[0].spellId = 'FIR-001'; },
    data => { data.entries[0].spellId = 'Water-1'; },
    data => { data.entries[0].quantity = 4; },
    data => { data.entries[0].quantity = '3'; },
    data => { data.entries.push({ ...data.entries[0] }); },
    data => { data.entries.pop(); },
    data => { data.element = '__proto__'; },
  ]) {
    const copy = structuredClone(valid); mutate(copy);
    assert.throws(() => parseDeckList(JSON.stringify(copy)));
  }
  for (const input of ['{', '[]', 'null', '{}', 0, null, ' '.repeat(MAX_DECK_FILE_BYTES + 1)]) assert.throws(() => parseDeckList(input));
});

test('validation safely rejects malformed decks and duplicate rows', () => {
  for (const mutate of [
    data => { data.entries = null; },
    data => { data.entries[0] = null; },
    data => { data.entries[0] = ['Fire-1', 3]; },
    data => { data.entries.push({ ...data.entries[0] }); },
    data => { data.entries[0].quantity = -1; },
  ]) {
    const deck = legal('fire'); mutate(deck);
    assert.equal(validateDeck(deck), false);
    assert.equal(validateDeckSlot(deck), false);
    assert.throws(() => normalizeDeck(deck));
  }
  for (const value of [null, undefined, [], 'deck', {}, new Date()]) {
    assert.equal(validateDeckSlot(value), false);
    assert.doesNotThrow(() => getDeckValidation(value));
    assert.throws(() => setDeckQuantity(value, 'Fire-1', 1));
  }
});

test('Fire-0 joins Fire decks with the usual three-copy limit while existing exported decks remain valid', () => {
  const old = { element: 'fire', entries: Array.from({ length: 10 }, (_, index) => ({ spellId: `Fire-${index + 1}`, quantity: 3 })) };
  const oldFile = { format: 'wizzy-deck', version: 1, spellbook: 'nov4-v2.1', ...old };
  assert.deepEqual(parseDeckList(JSON.stringify(oldFile)), normalizeDeck(old));
  const removed = setDeckQuantity(old, 'Fire-1', 0), updated = setDeckQuantity(removed, 'Fire-0', 3);
  assert.equal(validateDeck(updated), true); assert.equal(getDeckCount(updated, 'Fire-0'), 3);
  assert.deepEqual(parseDeckList(serializeDeck(updated)), normalizeDeck(updated));
  assert.throws(() => setDeckQuantity(updated, 'Fire-0', 4));
  assert.throws(() => setDeckQuantity(createStarterDeck('water'), 'Fire-0', 1), /other main element/);
  assert.equal(getEligibleSpells('water').some(card => card.spellId === 'Fire-0'), false);
});
