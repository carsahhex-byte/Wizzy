import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG, SPELLBOOK_VERSION } from '../src/spells.js';
import {
  MAX_DECK_FILE_BYTES, createStarterDeck, getEligibleSpells, getDeckValidation,
  validateDeck, normalizeDeck, getDeckCount, setDeckQuantity, validateDeckSlot,
  normalizeDeckSlot, serializeDeck, parseDeckList,
} from '../src/decks.js';

const legal = element => ({ element, entries: getEligibleSpells(element).slice(0, 10).map(card => ({ spellId: card.spellId, quantity: 3 })) });

test('new spellbook starts with empty independent deck slots and no old cards', () => {
  assert.equal(Object.keys(SPELL_CATALOG).length, 33);
  for (const element of ['fire', 'water']) {
    const empty = createStarterDeck(element);
    assert.deepEqual(empty, { element, entries: [] });
    assert.equal(validateDeck(empty), false);
    assert.equal(validateDeckSlot(empty), true);
    assert.deepEqual(normalizeDeckSlot(empty), empty);
    empty.entries.push({ spellId: 'old-card', quantity: 1 });
    assert.equal(createStarterDeck(element).entries.length, 0);
    const eligible = getEligibleSpells(element);
    assert.equal(eligible.length, element === 'fire' ? 19 : 17);
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

test('draft edits enforce whole quantities, element and total size limits and reject removed spell IDs', () => {
  const deck = legal('fire');
  for (const quantity of [-1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => setDeckQuantity(deck, 'Fire-1', quantity));
  for (const id of ['Water-1', 'FIR-001', 'NEU-001', '__proto__', 'constructor']) assert.throws(() => setDeckQuantity(deck, id, 1));
  assert.throws(() => setDeckQuantity(deck, 'FAT-001', 1), /more than 30/);
  assert.throws(() => setDeckQuantity(deck, 'Fire-1', 4), /more than 30/, 'four copies are rejected here only because the full deck would total 31');
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

test('Fire-0 joins Fire decks while the total limit and existing exported decks remain valid', () => {
  const old = { element: 'fire', entries: Array.from({ length: 10 }, (_, index) => ({ spellId: `Fire-${index + 1}`, quantity: 3 })) };
  const oldFile = { format: 'wizzy-deck', version: 1, spellbook: 'nov4-v2.1', ...old };
  assert.deepEqual(parseDeckList(JSON.stringify(oldFile)), normalizeDeck(old));
  const removed = setDeckQuantity(old, 'Fire-1', 0), updated = setDeckQuantity(removed, 'Fire-0', 3);
  assert.equal(validateDeck(updated), true); assert.equal(getDeckCount(updated, 'Fire-0'), 3);
  assert.deepEqual(parseDeckList(serializeDeck(updated)), normalizeDeck(updated));
  assert.throws(() => setDeckQuantity(updated, 'Fire-0', 4), /more than 30/);
  assert.throws(() => setDeckQuantity(createStarterDeck('water'), 'Fire-0', 1), /other main element/);
  assert.equal(getEligibleSpells('water').some(card => card.spellId === 'Fire-0'), false);
});

test('a 30-slab deck may contain 30 copies of one elemental or Fate spell', () => {
  for (const [element, spellIds] of [['fire', ['Fire-0', 'Fire-1', 'Fire-15', 'FAT-001', 'FAT-002', 'FAT-003']], ['water', ['Water-1', 'FAT-001', 'FAT-002', 'FAT-003']]]) {
    for (const spellId of spellIds) {
      const empty = createStarterDeck(element), deck = setDeckQuantity(empty, spellId, 30);
      assert.equal(validateDeck(deck), true, `${element} ${spellId}`); assert.equal(validateDeckSlot(deck), true);
      assert.deepEqual(normalizeDeckSlot(deck), { element, entries: [{ spellId, quantity: 30 }] });
      assert.deepEqual(parseDeckList(serializeDeck(deck)), deck);
      assert.equal(getDeckCount(deck, spellId), 30); assert.deepEqual(empty.entries, []);
      assert.throws(() => setDeckQuantity(deck, spellId, 31), /more than 30/);
      const tooLarge = { element, entries: [{ spellId, quantity: 31 }] };
      assert.equal(validateDeck(tooLarge), false); assert.equal(validateDeckSlot(tooLarge), false);
      assert.throws(() => serializeDeck(tooLarge), /exactly 30/);
      assert.deepEqual(setDeckQuantity(deck, spellId, 0), empty);
    }
  }
});

test('mixed decks support quantities above three without changing exported format or the total limit', () => {
  for (const element of ['fire', 'water']) {
    const id = element === 'fire' ? 'Fire-1' : 'Water-1';
    const deck = { element, entries: [{ spellId: id, quantity: 18 }, { spellId: 'FAT-001', quantity: 8 }, { spellId: 'FAT-003', quantity: 4 }] };
    assert.equal(getDeckValidation(deck).total, 30); assert.equal(validateDeck(deck), true);
    const file = JSON.parse(serializeDeck(deck));
    assert.deepEqual([file.format, file.version, file.spellbook], ['wizzy-deck', 1, SPELLBOOK_VERSION]);
    assert.deepEqual(parseDeckList(JSON.stringify(file)), normalizeDeck(deck));
    const room = setDeckQuantity(deck, id, 17), swapped = setDeckQuantity(room, 'FAT-003', 5);
    assert.equal(validateDeck(swapped), true); assert.equal(getDeckCount(swapped, 'FAT-003'), 5);
    assert.throws(() => setDeckQuantity(swapped, id, 18), /more than 30/);
    assert.throws(() => setDeckQuantity(deck, element === 'fire' ? 'Water-1' : 'Fire-1', 1), /other main element/);
    const duplicated = { element, entries: [{ spellId: id, quantity: 15 }, { spellId: id, quantity: 15 }] };
    assert.equal(validateDeck(duplicated), false, 'duplicate rows remain invalid even when their sum is 30');
  }
});

test('unlimited spell copies still require safe whole quantities and a maximum total of 30', () => {
  const empty = createStarterDeck('fire');
  for (const value of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '30', null, undefined, true]) {
    assert.throws(() => setDeckQuantity(empty, 'Fire-1', value));
  }
  assert.throws(() => setDeckQuantity(empty, 'Fire-1', Number.MAX_SAFE_INTEGER), /more than 30/);
  for (const value of [0, -1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '30', null]) {
    assert.equal(validateDeck({ element: 'fire', entries: [{ spellId: 'Fire-1', quantity: value }] }), false);
  }
  const four = setDeckQuantity(empty, 'Fire-1', 4);
  assert.equal(getDeckCount(four, 'Fire-1'), 4); assert.equal(validateDeck(four), false, 'four is a valid draft quantity but an incomplete deck');
  const draft = setDeckQuantity(four, 'FAT-003', 25);
  assert.equal(getDeckValidation(draft).total, 29);
  assert.equal(validateDeck(setDeckQuantity(draft, 'Fire-1', 5)), true);
});

test('Fire-15 is an additive Fire-only slab with unlimited copies and unchanged deck-file compatibility', () => {
  assert.equal(SPELLBOOK_VERSION, 'nov4-v2.1');
  assert.equal(getEligibleSpells('fire').some(card => card.spellId === 'Fire-15'), true);
  assert.equal(getEligibleSpells('water').some(card => card.spellId === 'Fire-15'), false);
  assert.throws(() => setDeckQuantity(createStarterDeck('water'), 'Fire-15', 1), /other main element/);
  const deck = setDeckQuantity(createStarterDeck('fire'), 'Fire-15', 30);
  const exported = JSON.parse(serializeDeck(deck));
  assert.deepEqual([exported.format, exported.version, exported.spellbook], ['wizzy-deck', 1, 'nov4-v2.1']);
  assert.deepEqual(parseDeckList(JSON.stringify(exported)), deck);
  const mixed = setDeckQuantity(setDeckQuantity(deck, 'Fire-15', 15), 'Fire-0', 15);
  assert.equal(validateDeck(mixed), true); assert.deepEqual(parseDeckList(serializeDeck(mixed)), mixed);
  const original = { format: 'wizzy-deck', version: 1, spellbook: 'nov4-v2.1', element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 30 }] };
  assert.deepEqual(parseDeckList(JSON.stringify(original)), { element: 'fire', entries: original.entries });
});
