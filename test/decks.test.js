import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG, SPELLBOOK_VERSION, DECK_SIZE, MIN_DECK_SIZE, SPELL_DISPLAY_NAMES, LEGACY_SPELL_NAMES } from '../src/spells.js';
import {
  SPELLBOOK_1, SPELLBOOK_2, SPELLBOOKS, SPELLBOOK_ROLE_PAIRS,
  getDeckSpellbook, getSpellbookSpells, isSpellbookId, ACTIVE_SPELLBOOK_ID, ACTIVE_SPELL_IDS, getActiveSpells,
} from '../src/spellbooks.js';
import {
  MAX_DECK_FILE_BYTES, createStarterDeck, getEligibleSpells, getDeckValidation,
  validateDeck, normalizeDeck, getDeckCount, setDeckQuantity, validateDeckSlot,
  normalizeDeckSlot, serializeDeck, parseDeckList, migrateToActiveDeck, parseDeckListForActive,
} from '../src/decks.js';

const legal = element => ({ element, entries: getEligibleSpells(element).slice(0, 10).map(card => ({ spellId: card.spellId, quantity: 3 })) });

test('the sole active book has the requested names, stable IDs and original costs, effects and art', () => {
  const expected = {
    'Fire-2': ['Heatbox', 1, 'Gain 1 Ember. On a 7+, gain 2 Embers instead. On a 10+, gain 3 instead.'],
    'Fire-15': ['Blaze', 0, 'Gain 1 Ember. On a 7+, gain 1 Mana.'],
    'Fire-6': ['Charred Blade', 5, 'Deal 22 damage. On a 7+, deal 28 instead. On a 10+, deal 36 instead.'],
    'Fire-11': ['Xineoph', 2, 'Deal 10 damage and gain 2 Embers. On a 7+, gain 1 Mana.'],
    'Fire-14': ['Sunsetter', 8, 'Spend all Embers. Deal 20 damage plus 7 per Ember spent. On an 8+, deal 9 per Ember instead.'],
    'Water-2': ['Sea bolt', 1, 'Deal 4 + 2 × Flow damage. On an 8+, gain 1 additional Flow after resolution.'],
    'Water-0': ['Swell', 0, 'Gain 1 Mana on cast. On a 7+, gain 1 additional Flow after resolution.'],
    'Water-12': ['Coral Crash', 3, 'Deal 12 + 2 × Flow damage. On a 7+, heal 2 HP per Flow.'],
    'Water-9': ['Pacific', 2, 'Deal 6 + 2 × Flow damage. Gain 1 additional Flow after resolution. On a 10+, deal 5 additional damage.'],
    'Water-14': ["Poseidon's Rift", 8, 'Deal 15 + 5 × Flow damage. On an 8+, deal 12 additional damage.'],
  };
  assert.equal(ACTIVE_SPELLBOOK_ID, SPELLBOOK_2);
  assert.equal(getActiveSpells().length, 13);
  assert.deepEqual(ACTIVE_SPELL_IDS.filter(id => !id.startsWith('FAT-')), Object.keys(expected));
  assert.equal(ACTIVE_SPELL_IDS.includes('Fire-5'), false);
  assert.equal(getActiveSpells().filter(card => card.category === 'Fate').length, 3);
  for (const [id, values] of Object.entries(expected)) {
    const card = SPELL_CATALOG[id];
    assert.deepEqual([card.name, card.manaCost, card.effectText], values);
    assert.equal(SPELL_DISPLAY_NAMES[id], values[0]); assert.equal(LEGACY_SPELL_NAMES[id], id);
    assert.equal(card.id, id); assert.equal(card.spellId, id);
    assert.equal(card.art, id.startsWith('Fire-') ? 'fireCard' : 'waterCard');
  }
  assert.deepEqual(getActiveSpells().filter(card => card.category === 'Fate').map(card => card.name), ['Fortune', 'Misfortune', 'Twist']);
});

test('active-book migration merges Charred Blade replacement quantities and exposes retired cards for review', () => {
  const old = { element: 'fire', spellbookId: SPELLBOOK_2, entries: [
    { spellId: 'Fire-5', quantity: 2 }, { spellId: 'Fire-6', quantity: 3 }, { spellId: 'FAT-001', quantity: 1 },
  ] }, before = structuredClone(old);
  const moved = migrateToActiveDeck(old);
  assert.equal(moved.deck.spellbookId, SPELLBOOK_2);
  assert.equal(getDeckCount(moved.deck, 'Fire-6'), 5); assert.equal(getDeckValidation(moved.deck).total, 6);
  assert.deepEqual(moved.replacements, [{ from: 'Fire-5', to: 'Fire-6', quantity: 2 }]);
  assert.deepEqual(moved.removed, []); assert.equal(moved.reviewRequired, true); assert.deepEqual(old, before);
  const current = migrateToActiveDeck(moved.deck);
  assert.deepEqual(current.deck, moved.deck); assert.equal(current.changed, false); assert.equal(current.reviewRequired, false);
  const original = { element: 'fire', entries: [{ spellId: 'Fire-1', quantity: 4 }, { spellId: 'Fire-2', quantity: 2 }] };
  const review = migrateToActiveDeck(original);
  assert.deepEqual(review.removed, [{ spellId: 'Fire-1', quantity: 4 }]);
  assert.deepEqual(review.deck.entries, [{ spellId: 'Fire-2', quantity: 2 }]); assert.equal(review.reviewRequired, true);
  assert.equal(original.entries.length, 2, 'original archive data is never modified');
  const allRetired = migrateToActiveDeck({ element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 2 }] });
  assert.equal(validateDeck(allRetired.deck), false); assert.equal(validateDeckSlot(allRetired.deck), true); assert.equal(allRetired.removed.length, 1);
  assert.throws(() => migrateToActiveDeck({ ...old, spellbookId: 'unknown' }));
  assert.throws(() => migrateToActiveDeck({ element: 'fire', entries: [{ spellId: 'Water-0', quantity: 1 }] }));
});

test('active imports review old test files and keep names outside portable deck identities', () => {
  const old = { format: 'wizzy-deck', version: 1, spellbook: SPELLBOOK_VERSION, spellbookId: SPELLBOOK_2,
    element: 'fire', entries: [{ spellId: 'Fire-5', quantity: 3 }] };
  assert.throws(() => parseDeckList(JSON.stringify(old)), /not available/);
  const report = parseDeckListForActive(JSON.stringify(old));
  assert.equal(report.reviewRequired, true); assert.deepEqual(report.deck.entries, [{ spellId: 'Fire-6', quantity: 3 }]);
  const encoded = serializeDeck(report.deck);
  assert.doesNotMatch(encoded, /Charred Blade/); assert.deepEqual(parseDeckListForActive(encoded).deck, report.deck);
  assert.equal(parseDeckListForActive(encoded).reviewRequired, false);
  const oldOne = { ...old, spellbookId: SPELLBOOK_1, element: 'water', entries: [{ spellId: 'Water-0', quantity: 4 }] };
  const promoted = parseDeckListForActive(JSON.stringify(oldOne));
  assert.equal(promoted.changed, true); assert.equal(promoted.reviewRequired, false); assert.equal(getDeckCount(promoted.deck, 'Water-0'), 4);
  assert.throws(() => parseDeckListForActive(JSON.stringify({ ...old, entries: [] })), /playable/);
  assert.throws(() => parseDeckListForActive(JSON.stringify({ ...old, entries: [{ spellId: 'Fire-5', quantity: 31 }] })), /1–30/);
});

test('Spellbook 2 contains exactly the paired test spells and Fate with unchanged definitions', () => {
  const expected = ['Fire-2', 'Fire-15', 'Fire-6', 'Fire-11', 'Fire-14',
    'Water-2', 'Water-0', 'Water-12', 'Water-9', 'Water-14', 'FAT-001', 'FAT-002', 'FAT-003'];
  assert.deepEqual(SPELLBOOKS[SPELLBOOK_2].spellIds, expected);
  assert.equal(SPELLBOOK_ROLE_PAIRS.length, 5);
  assert.equal(getSpellbookSpells(SPELLBOOK_1).length, 34);
  assert.equal(getSpellbookSpells(SPELLBOOK_2).length, 13);
  for (const spell of getSpellbookSpells(SPELLBOOK_2)) assert.equal(spell, SPELL_CATALOG[spell.spellId], 'book copies retain identical cost, effect, name and artwork');
  for (const element of ['fire', 'water']) {
    const eligible = getEligibleSpells(element, SPELLBOOK_2);
    assert.equal(eligible.length, 8); assert.equal(eligible.filter(card => card.category === 'Fate').length, 3);
    assert.ok(eligible.every(card => card.category === 'Fate' || card.element.toLowerCase() === element));
  }
  for (const value of [null, '', 'unknown', '__proto__', 'constructor', 2]) {
    assert.equal(isSpellbookId(value), false);
    assert.throws(() => getSpellbookSpells(value));
    assert.throws(() => getEligibleSpells('fire', value));
    assert.throws(() => createStarterDeck('fire', value));
  }
});

test('separate Spellbook 2 drafts retain their identity through editing, save slots and file transfer', () => {
  for (const element of ['fire', 'water']) {
    const oldEmpty = createStarterDeck(element), empty = createStarterDeck(element, SPELLBOOK_2);
    assert.deepEqual(oldEmpty, { element, entries: [] });
    assert.deepEqual(empty, { element, entries: [], spellbookId: SPELLBOOK_2 });
    assert.equal(getDeckSpellbook(oldEmpty), SPELLBOOK_1); assert.equal(getDeckSpellbook(empty), SPELLBOOK_2);
    assert.equal(validateDeck(empty), false); assert.equal(validateDeckSlot(empty), true);
    assert.deepEqual(normalizeDeckSlot(empty), empty);
    const spellId = element === 'fire' ? 'Fire-11' : 'Water-12';
    const filled = setDeckQuantity(setDeckQuantity(empty, spellId, 25), 'FAT-003', 5);
    assert.equal(validateDeck(filled), true); assert.equal(getDeckValidation(filled).total, 30);
    assert.equal(getDeckCount(filled, spellId), 25, 'copies remain unrestricted');
    assert.equal(normalizeDeck(filled).spellbookId, SPELLBOOK_2);
    const file = JSON.parse(serializeDeck(filled));
    assert.equal(file.spellbook, SPELLBOOK_VERSION); assert.equal(file.spellbookId, SPELLBOOK_2);
    assert.deepEqual(parseDeckList(JSON.stringify(file)), filled);
    const cleared = setDeckQuantity(setDeckQuantity(filled, spellId, 0), 'FAT-003', 0);
    assert.deepEqual(cleared, empty); assert.deepEqual(oldEmpty.entries, []);
    assert.equal(Object.hasOwn(JSON.parse(serializeDeck({ element, entries: [{ spellId, quantity: 1 }] })), 'spellbookId'), false, 'legacy book files stay unchanged');
    assert.throws(() => setDeckQuantity(filled, spellId, 26), /more than 30/);
  }
});

test('book restrictions reject excluded spells, cross-element cards and unknown metadata without silently changing books', () => {
  for (const [element, excluded, opposite] of [['fire', 'Fire-1', 'Water-2'], ['water', 'Water-1', 'Fire-2']]) {
    const empty = createStarterDeck(element, SPELLBOOK_2);
    assert.throws(() => setDeckQuantity(empty, excluded, 1), /not available in Spellbook 2/);
    assert.throws(() => setDeckQuantity(empty, opposite, 1), /other main element/);
    for (const spellId of [excluded, opposite]) {
      const invalid = { ...empty, entries: [{ spellId, quantity: 1 }] };
      assert.equal(validateDeck(invalid), false); assert.equal(validateDeckSlot(invalid), false);
      assert.throws(() => normalizeDeck(invalid)); assert.throws(() => serializeDeck(invalid));
      assert.throws(() => parseDeckList(JSON.stringify({ format: 'wizzy-deck', version: 1, spellbook: SPELLBOOK_VERSION, ...invalid })));
    }
    assert.equal(validateDeck({ element, entries: [{ spellId: excluded, quantity: 1 }] }), true, 'excluded test spells remain available in Spellbook 1');
    for (const spellbookId of [null, '', 'other', '__proto__', {}, []]) {
      const invalid = { element, entries: [], spellbookId };
      assert.equal(validateDeckSlot(invalid), false); assert.equal(validateDeck(invalid), false);
      assert.throws(() => normalizeDeckSlot(invalid));
      assert.throws(() => setDeckQuantity(invalid, element === 'fire' ? 'Fire-2' : 'Water-2', 1));
    }
  }
});

test('new spellbook starts with empty independent deck slots and no old cards', () => {
  assert.equal(Object.keys(SPELL_CATALOG).length, 34);
  assert.equal(Object.values(SPELL_CATALOG).filter(card => card.element === 'Fire').length, 16);
  assert.equal(Object.values(SPELL_CATALOG).filter(card => card.element === 'Water').length, 15);
  for (const element of ['fire', 'water']) {
    const empty = createStarterDeck(element);
    assert.deepEqual(empty, { element, entries: [] });
    assert.equal(validateDeck(empty), false);
    assert.equal(validateDeckSlot(empty), true);
    assert.deepEqual(normalizeDeckSlot(empty), empty);
    empty.entries.push({ spellId: 'old-card', quantity: 1 });
    assert.equal(createStarterDeck(element).entries.length, 0);
    const eligible = getEligibleSpells(element);
    assert.equal(eligible.length, element === 'fire' ? 19 : 18);
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
  assert.equal(validateDeckSlot(three), true, 'a short deck is a playable account slot');
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
  assert.throws(() => serializeDeck(createStarterDeck('fire')), /at least 1 slab/);
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
    data => { data.entries = []; },
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
  for (const [element, spellIds] of [['fire', ['Fire-0', 'Fire-1', 'Fire-15', 'FAT-001', 'FAT-002', 'FAT-003']], ['water', ['Water-0', 'Water-1', 'FAT-001', 'FAT-002', 'FAT-003']]]) {
    for (const spellId of spellIds) {
      const empty = createStarterDeck(element), deck = setDeckQuantity(empty, spellId, 30);
      assert.equal(validateDeck(deck), true, `${element} ${spellId}`); assert.equal(validateDeckSlot(deck), true);
      assert.deepEqual(normalizeDeckSlot(deck), { element, entries: [{ spellId, quantity: 30 }] });
      assert.deepEqual(parseDeckList(serializeDeck(deck)), deck);
      assert.equal(getDeckCount(deck, spellId), 30); assert.deepEqual(empty.entries, []);
      assert.throws(() => setDeckQuantity(deck, spellId, 31), /more than 30/);
      const tooLarge = { element, entries: [{ spellId, quantity: 31 }] };
      assert.equal(validateDeck(tooLarge), false); assert.equal(validateDeckSlot(tooLarge), false);
      assert.throws(() => serializeDeck(tooLarge), /more than 30/);
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
  assert.equal(getDeckCount(four, 'Fire-1'), 4); assert.equal(validateDeck(four), true, 'four copies form a playable short deck');
  const draft = setDeckQuantity(four, 'FAT-003', 25);
  assert.equal(getDeckValidation(draft).total, 29);
  assert.equal(validateDeck(draft), true);
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

test('playable deck boundaries preserve actual quantities through normalization, export and import', () => {
  assert.equal(MIN_DECK_SIZE, 1);
  assert.equal(DECK_SIZE, 30, 'DECK_SIZE remains the compatible maximum');
  for (const element of ['fire', 'water']) {
    const spellId = element === 'fire' ? 'Fire-0' : 'Water-1';
    for (const total of [0, 1, 5, 29, 30, 31]) {
      const deck = { element, entries: total ? [{ spellId, quantity: total }] : [] };
      const playable = total >= MIN_DECK_SIZE && total <= DECK_SIZE;
      const result = getDeckValidation(deck);
      assert.equal(result.total, total);
      assert.equal(result.valid, playable, `${element}: ${total} slabs`);
      assert.equal(validateDeck(deck), playable);
      assert.equal(validateDeckSlot(deck), total <= DECK_SIZE, 'empty slots can be saved but cannot battle');
      const file = JSON.stringify({ format: 'wizzy-deck', version: 1, spellbook: SPELLBOOK_VERSION, ...deck });
      if (playable) {
        assert.deepEqual(normalizeDeck(deck), deck, 'normalizing never fills a short deck to 30');
        assert.deepEqual(normalizeDeckSlot(deck), deck);
        assert.deepEqual(parseDeckList(file), deck);
        assert.deepEqual(parseDeckList(serializeDeck(deck)), deck);
        assert.deepEqual(setDeckQuantity(createStarterDeck(element), spellId, total), deck);
      } else {
        assert.throws(() => normalizeDeck(deck));
        assert.throws(() => serializeDeck(deck));
        assert.throws(() => parseDeckList(file));
        if (total === 0) {
          assert.deepEqual(normalizeDeckSlot(deck), deck);
          assert.deepEqual(setDeckQuantity(createStarterDeck(element), spellId, 0), deck);
        } else {
          assert.throws(() => normalizeDeckSlot(deck));
          assert.throws(() => setDeckQuantity(createStarterDeck(element), spellId, total), /more than 30/);
        }
      }
    }
  }
});

test('removing the last slab makes an editable empty slot without changing the saved short deck', () => {
  const saved = { element: 'fire', entries: [{ spellId: 'Fire-15', quantity: 1 }] };
  const draft = setDeckQuantity(saved, 'Fire-15', 0);
  assert.deepEqual(draft, createStarterDeck('fire'));
  assert.equal(validateDeck(draft), false);
  assert.equal(validateDeckSlot(draft), true);
  assert.equal(validateDeck(saved), true);
  assert.equal(getDeckCount(saved, 'Fire-15'), 1);
});

test('Water-0 is Water-only and round-trips unrestricted copies without changing existing deck files', () => {
  assert.equal(SPELLBOOK_VERSION, 'nov4-v2.1');
  assert.equal(SPELL_CATALOG['Water-0'].manaCost, 0);
  assert.equal(SPELL_CATALOG['Water-0'].effectText, 'Gain 1 Mana on cast. On a 7+, gain 1 additional Flow after resolution.');
  assert.equal(getEligibleSpells('water').some(card => card.spellId === 'Water-0'), true);
  assert.equal(getEligibleSpells('fire').some(card => card.spellId === 'Water-0'), false);
  assert.throws(() => setDeckQuantity(createStarterDeck('fire'), 'Water-0', 1), /other main element/);
  const wrongElement = { element: 'fire', entries: [{ spellId: 'Water-0', quantity: 1 }] };
  assert.equal(validateDeck(wrongElement), false);
  assert.throws(() => normalizeDeckSlot(wrongElement));
  for (const quantity of [1, 4, 5, 29, 30]) {
    const deck = setDeckQuantity(createStarterDeck('water'), 'Water-0', quantity);
    assert.equal(getDeckValidation(deck).total, quantity);
    assert.equal(validateDeck(deck), true);
    assert.equal(validateDeckSlot(deck), true);
    assert.deepEqual(normalizeDeckSlot(deck), deck);
    const exported = JSON.parse(serializeDeck(deck));
    assert.deepEqual([exported.format, exported.version, exported.spellbook], ['wizzy-deck', 1, 'nov4-v2.1']);
    assert.deepEqual(parseDeckList(JSON.stringify(exported)), deck);
    exported.element = 'fire';
    assert.throws(() => parseDeckList(JSON.stringify(exported)), /main element/);
  }
  const mixed = { element: 'water', entries: [{ spellId: 'Water-0', quantity: 15 }, { spellId: 'Water-1', quantity: 10 }, { spellId: 'FAT-003', quantity: 5 }] };
  assert.deepEqual(parseDeckList(serializeDeck(mixed)), normalizeDeck(mixed));
  const old = { element: 'water', entries: [{ spellId: 'Water-1', quantity: 27 }, { spellId: 'FAT-003', quantity: 3 }] };
  const original = JSON.stringify({ format: 'wizzy-deck', version: 1, spellbook: 'nov4-v2.1', ...old });
  const restored = parseDeckList(original);
  assert.deepEqual(restored, normalizeDeck(old));
  assert.equal(getDeckCount(restored, 'Water-0'), 0, 'adding Water-0 never inserts it into an older deck');
  assert.deepEqual(old.entries, [{ spellId: 'Water-1', quantity: 27 }, { spellId: 'FAT-003', quantity: 3 }]);
});

test('existing Fire-15 and Water-0 deck files retain their composition after the roll-rule revision', () => {
  // Existing files contain stable spell IDs and quantities, not the old effect text.
  const existing = [
    { element: 'fire', entries: [{ spellId: 'Fire-15', quantity: 1 }] },
    { element: 'fire', entries: [{ spellId: 'FAT-003', quantity: 4 }, { spellId: 'Fire-15', quantity: 26 }] },
    { element: 'water', entries: [{ spellId: 'Water-0', quantity: 1 }] },
    { element: 'water', entries: [{ spellId: 'Water-0', quantity: 30 }] },
  ];
  for (const deck of existing) {
    const file = JSON.stringify({ format: 'wizzy-deck', version: 1, spellbook: 'nov4-v2.1', ...deck });
    const restored = parseDeckList(file);
    assert.deepEqual(restored, deck, 'imports neither replace IDs nor fill a short deck');
    assert.deepEqual(parseDeckList(serializeDeck(restored)), deck);
    const wrongElement = { ...JSON.parse(file), element: deck.element === 'fire' ? 'water' : 'fire' };
    assert.throws(() => parseDeckList(JSON.stringify(wrongElement)), /main element/);
  }
});
