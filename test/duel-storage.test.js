import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuelStorage, duelSaveKey } from '../src/duel-storage.js';
import { SPELLBOOK_1, SPELLBOOK_2 } from '../src/spellbooks.js';
import { createStarterDeck } from '../src/decks.js';
import { createGame, getGameSpellbook, assertGame, validateSavedGame, rollInitiative, selectCard, castSelected, rollDice, skipFate, resolveSpell } from '../src/game.js';

function memory() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}
function decks(bookId = SPELLBOOK_1) {
  return Object.fromEntries(['fire', 'water'].map(element => [element, {
    ...createStarterDeck(element, bookId),
    entries: [{ spellId: element === 'fire' ? 'Fire-11' : 'Water-9', quantity: 6 }],
  }]));
}

test('both spellbooks keep independent duel progress without changing legacy keys or snapshots', () => {
  const browser = memory(), saves = createDuelStorage(browser);
  const one = rollInitiative(rollInitiative(createGame(5, decks()), 0, () => .9), 1, () => 0);
  const two = createGame(6, decks(SPELLBOOK_2));
  const original = structuredClone(one);
  assert.equal(duelSaveKey(), 'wizzy.duel.v14');
  browser.setItem('wizzy.duel.v13', 'an older archived save');
  assert.equal(saves.save(one), true);
  const savedOne = browser.getItem(duelSaveKey());
  assert.equal(saves.save(two), true);
  assert.equal(browser.getItem(duelSaveKey()), savedOne);
  assert.equal(browser.getItem('wizzy.duel.v13'), 'an older archived save');
  assert.deepEqual(saves.load(), one);
  assert.deepEqual(saves.load(SPELLBOOK_2), two);
  assert.deepEqual(one, original);
  const reloaded = createDuelStorage(browser);
  assert.deepEqual(reloaded.load(SPELLBOOK_1), one);
  assert.deepEqual(reloaded.load(SPELLBOOK_2), two);
});

test('book-specific saves reject cross-book placement, mixed decks and unsupported pool metadata', () => {
  const browser = memory(), saves = createDuelStorage(browser);
  browser.setItem(duelSaveKey(SPELLBOOK_2), JSON.stringify(createGame(8, decks())));
  const empty = saves.load(SPELLBOOK_2);
  assert.equal(empty.phase, 'setup');
  assert.equal(getGameSpellbook(empty), SPELLBOOK_2);
  assertGame(empty);
  assert.throws(() => createGame(8, { fire: decks().fire, water: decks(SPELLBOOK_2).water }), /same spellbook/);
  assert.throws(() => duelSaveKey('other-book'), /Choose Spellbook/);
  const corrupt = createGame(8, decks(SPELLBOOK_2));
  delete corrupt.players[1].deckDefinition.spellbookId;
  assert.equal(validateSavedGame(corrupt), false);
  assert.equal(saves.save(corrupt), false);
  const partial = createGame(8, { fire: decks(SPELLBOOK_2).fire });
  assert.equal(partial.phase, 'setup'); assert.equal(getGameSpellbook(partial), SPELLBOOK_2); assertGame(partial);
});

test('a copied Spellbook 2 Fire-11 keeps its live cost and effect through a saved pending cast', () => {
  const browser = memory(), saves = createDuelStorage(browser);
  let state = rollInitiative(rollInitiative(createGame(11, decks(SPELLBOOK_2)), 0, () => .9), 1, () => 0);
  const card = state.players[0].hand[0];
  assert.deepEqual([card.name, card.manaCost, card.effectText], ['Xineoph', 2, 'Deal 10 damage and gain 2 Embers. On a 7+, gain 1 Mana.']);
  state = castSelected(selectCard(state, card.id));
  assert.equal(state.players[0].mana, 1);
  assert.equal(saves.save(state), true);
  state = saves.load(SPELLBOOK_2);
  let die = 0;
  state = rollDice(state, () => ([3, 4][die++] - 1) / 6);
  while (state.phase === 'fate') state = skipFate(state);
  state = resolveSpell(state);
  assert.deepEqual([state.players[0].mana, state.players[0].element, state.players[1].hp], [2, 2, 90]);
  assert.equal(getGameSpellbook(state), SPELLBOOK_2); assertGame(state);
  assert.equal(saves.save(state), true);
  assert.deepEqual(saves.load(SPELLBOOK_2), state);
});

test('unavailable device storage still opens separate empty spellbook slots', () => {
  const saves = createDuelStorage({ getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); } });
  for (const bookId of [SPELLBOOK_1, SPELLBOOK_2]) {
    const state = saves.load(bookId);
    assert.equal(getGameSpellbook(state), bookId); assert.equal(state.phase, 'setup');
    assert.equal(saves.save(state), false);
  }
});
