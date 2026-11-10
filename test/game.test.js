import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, canSelectCard, canCastSelected, canPlayFate, getActingPlayerIndex,
  castSelected, castFateSelected, skipFate, rollDice, resolveSpell, endTurn,
  canEnhance, activateEnhancement, rollEnhancement as rollEnhancementAction, getEnhancementBonus, MAX_ENHANCEMENT, ENHANCEMENT_STEP, ENHANCEMENT_THRESHOLD, ENHANCEMENT_ROLL_RULE,
  canActivateAura, activateAura, AURA_COST, AURA_DURATION, AURA_BONUS,
  beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh, canCancelStagedAction, cancelStagedAction, applyDamage,
  assertGame, validateSavedGame, migrateSavedGame, SPELL_CATALOG, SPELL_RULES, SAVE_VERSION, DECK_SIZE, HAND_LIMIT, OPENING_HAND_SIZE,
} from '../src/game.js';

const allCards = player => [...player.hand, ...player.deck, ...player.discard];
// Test fixtures are intentionally separate from the application: no decks are prebuilt for players.
function fixtureDeck(element, required = []) {
  const counts = new Map();
  for (const id of required) counts.set(id, (counts.get(id) || 0) + 1);
  let total = required.length;
  for (let index = 1; index <= 14 && total < DECK_SIZE; index += 1) {
    const id = `${element === 'fire' ? 'Fire' : 'Water'}-${index}`;
    const add = Math.min(3 - (counts.get(id) || 0), DECK_SIZE - total);
    if (add) counts.set(id, (counts.get(id) || 0) + add);
    total += add;
  }
  return { element, entries: [...counts].map(([spellId, quantity]) => ({ spellId, quantity })) };
}
function fresh({ fire = [], water = [], first = 0, seed = 42 } = {}) {
  let state = createGame(seed, { fire: fixtureDeck('fire', fire), water: fixtureDeck('water', water) });
  state = rollInitiative(state, 0, () => first === 0 ? 5 / 6 : 0);
  return rollInitiative(state, 1, () => first === 1 ? 5 / 6 : 0);
}
function handOf(state, index, spellIds) {
  const player = state.players[index], pool = allCards(player);
  player.hand = spellIds.map(id => {
    const index = pool.findIndex(card => card.spellId === id);
    assert.notEqual(index, -1, `${id} must belong to fixture deck`);
    return pool.splice(index, 1)[0];
  });
  player.deck = pool; player.discard = [];
  return state;
}
function cast(state, id, options) {
  const card = state.players[state.activePlayer].hand.find(card => card.spellId === id);
  assert.ok(card, `${id} is in hand`);
  return castSelected(selectCard(state, card.id), options);
}
function roll(state, dice = [3, 4]) {
  let index = 0;
  return rollDice(state, () => (dice[index++] - 1) / 6);
}
function fate(state, spellIds, direction) {
  const directions = {};
  for (const id of spellIds) {
    const card = state.players[getActingPlayerIndex(state)].hand.find(card => card.spellId === id && !state.selectedFateCardIds.includes(card.id));
    assert.ok(card, `${id} is in responder hand`);
    state = selectCard(state, card.id);
    if (id === 'FAT-003' && direction !== undefined) directions[card.id] = direction;
  }
  return castFateSelected(state, { twistDirections: directions });
}
const pass = state => endTurn(endTurn(state));
function complete(state, dice = [3, 4]) {
  if (state.phase === 'rolling') state = roll(state, dice);
  while (state.phase === 'fate') state = skipFate(state);
  return resolveSpell(state);
}
// Existing reward tests explicitly pass every available Fate window. Chain
// protocol tests below use rollEnhancementAction to inspect each pending stage.
const rollEnhancement = (state, random) => complete(rollEnhancementAction(state, random));
function fateFixture() {
  const state = fresh({ fire: ['FAT-001', 'FAT-003', 'FAT-003'], water: ['FAT-002', 'FAT-002', 'FAT-003'] });
  handOf(state, 0, ['Fire-1', 'FAT-001', 'FAT-003', 'FAT-003']);
  handOf(state, 1, ['Water-1', 'FAT-002', 'FAT-002', 'FAT-003']);
  return state;
}

test('catalog has 34 spells, 30 rolling primaries, one immediate primary and no old IDs', () => {
  assert.equal(SAVE_VERSION, 14); assert.equal(DECK_SIZE, 30);
  assert.equal(HAND_LIMIT, 6); assert.equal(OPENING_HAND_SIZE, 5);
  assert.equal(Object.keys(SPELL_CATALOG).length, 34);
  assert.equal(Object.keys(SPELL_RULES).length, 31);
  for (const element of ['Fire', 'Water']) for (let index = 1; index <= 14; index += 1) {
    assert.ok(SPELL_CATALOG[`${element}-${index}`]);
    assert.equal(SPELL_RULES[`${element}-${index}`].requiresRoll, true);
  }
  assert.deepEqual(SPELL_RULES['Fire-0'], { requiresRoll: false, emberSpend: 'none' });
  for (const id of ['Fire-15', 'Water-0']) assert.deepEqual(SPELL_RULES[id], { requiresRoll: true, emberSpend: 'none' });
  assert.equal(Object.values(SPELL_CATALOG).filter(card => card.category === 'Neutral').length, 0);
  for (const id of ['FIR-001', 'WAT-001', 'NEU-001']) assert.equal(SPELL_CATALOG[id], undefined);
});

test('missing, partial or retired deck slots enter setup without inventing a deck', () => {
  for (const decks of [{}, { fire: fixtureDeck('fire') }, { fire: { element: 'fire', entries: [{ spellId: 'FIR-001', quantity: 3 }] } }]) {
    const state = createGame(1, decks);
    assert.equal(state.phase, 'setup');
    for (const player of state.players) assert.deepEqual([player.hp, player.mana, player.hand.length, player.deck.length, player.discard.length], [100, 3, 0, 0, 0]);
    for (const action of [selectCard, castSelected, skipFate, rollDice, resolveSpell, endTurn, beginRefresh, confirmRefresh]) assert.equal(action(state), state);
    assert.equal(rollInitiative(state, 0, () => 0), state); assertGame(state);
  }
  assert.throws(() => createGame(1, { fire: fixtureDeck('water') }), /requires a fire deck/);
  for (const input of [null, [], 'decks', { earth: fixtureDeck('fire') }]) assert.throws(() => createGame(1, input));
});

test('custom decks open at 100 HP, 3 mana and exactly five slabs, with deterministic shuffling', () => {
  const decks = { fire: fixtureDeck('fire'), water: fixtureDeck('water') };
  const state = createGame(17, decks);
  assert.equal(state.phase, 'initiative');
  for (const player of state.players) {
    assert.deepEqual([player.hp, player.maxHp, player.mana, player.shield, player.element, player.loaded, player.loadedPending], [100, 100, 3, 0, 0, 0, 0]);
    assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [5, 25, 0]);
    assert.equal(new Set(allCards(player).map(card => card.id)).size, 30);
  }
  assert.deepEqual(createGame(17, decks), state);
  assert.notDeepEqual(createGame(18, decks).players[0].hand, state.players[0].hand);
  decks.fire.entries[0].quantity = 0;
  assert.equal(state.players[0].deckDefinition.entries.find(entry => entry.spellId === 'Fire-1').quantity, 3);
  assertGame(state);
});

test('opening rolls reroll ties, choose either starter, and reject repeated or invalid samples', () => {
  let state = createGame(2, { fire: fixtureDeck('fire'), water: fixtureDeck('water') });
  assert.equal(castSelected(state), state); assert.equal(endTurn(state), state);
  for (const value of [-1, 1, NaN, Infinity]) assert.equal(rollInitiative(state, 0, () => value), state);
  state = rollInitiative(state, 0, () => .5);
  assert.equal(rollInitiative(state, 0, () => .9), state);
  state = rollInitiative(state, 1, () => .5);
  assert.deepEqual(state.initiative.history, [{ round: 1, rolls: [4, 4] }]);
  assert.deepEqual(state.initiative.rolls, [null, null]); assertGame(state);
  state = rollInitiative(rollInitiative(state, 0, () => 0), 1, () => .9);
  assert.deepEqual([state.activePlayer, state.startingPlayer, state.initiative.winner], [1, 1, 1]);
  assert.equal(rollInitiative(state, 0, () => 0), state); assertGame(state);
});

test('second starter receives exactly one slab on their first turn, with no opening mana gain', () => {
  for (const first of [0, 1]) {
    let state = fresh({ first });
    state = pass(state);
    assert.deepEqual([state.activePlayer, state.round, state.players[1 - first].hand.length, state.players[1 - first].mana], [1 - first, 1, 6, 3]);
    assert.equal(state.secondPlayerOpeningDrawPending, false);
    state = pass(state);
    assert.deepEqual([state.activePlayer, state.round, state.players[first].mana, state.players[first].hand.length], [first, 2, 5, 6]);
    state.players[first].mana = 9;
    state = pass(pass(state));
    assert.equal(state.players[first].mana, 10); assertGame(state);
  }
});

test('cast pays resources and consumes available Loaded once before any post-roll Fate', () => {
  const initial = handOf(fresh({ fire: ['Fire-12'] }), 0, ['Fire-12']);
  initial.players[0].mana = 6; initial.players[0].element = 4; initial.players[0].loaded = 2;
  const state = cast(initial, 'Fire-12', { emberSpend: 2 });
  assert.deepEqual([state.phase, state.players[0].mana, state.players[0].element, state.players[0].loaded], ['rolling', 2, 2, 0]);
  assert.deepEqual([state.pendingSpell.loadedBonus, state.pendingSpell.emberSpent, state.lastRoll, state.fatePlayer], [2, 2, null, null]);
  assert.equal(state.players[0].hand.length, 1); assert.equal(state.players[0].discard.length, 0);
  assert.equal(skipFate(state), state); assert.equal(castFateSelected(state), state);
  assert.equal(initial.players[0].mana, 6); assert.equal(initial.players[0].element, 4); assertGame(state);
});

test('optional Ember bounds reject bad spending before payment and all-spend is automatic', () => {
  let state = handOf(fresh({ fire: ['Fire-12', 'Fire-14'] }), 0, ['Fire-5', 'Fire-12', 'Fire-14']);
  state.players[0].element = 5; state.players[0].mana = 10;
  const card = state.players[0].hand.find(card => card.spellId === 'Fire-5');
  const selected = selectCard(state, card.id);
  for (const emberSpend of [-1, 2, .5, NaN, '1']) assert.equal(castSelected(selected, { emberSpend }), selected);
  state = cast(state, 'Fire-14');
  assert.deepEqual([state.pendingSpell.emberSpent, state.players[0].element, state.players[0].mana], [5, 0, 2]); assertGame(state);
});

test('dice are captured before Fate, only once, and invalid random values are rejected', () => {
  let state = cast(handOf(fresh(), 0, ['Fire-1']), 'Fire-1');
  for (const value of [-.1, 1, NaN]) assert.equal(rollDice(state, () => value), state);
  state = roll(state, [2, 5]);
  assert.deepEqual(state.lastRoll.dice, [2, 5]); assert.equal(state.lastRoll.rawTotal, 7);
  assert.equal(rollDice(state, () => .9), state); assertGame(state);
});

test('no playable Fate auto-skips both decisions and resolves without a prompt', () => {
  let state = cast(handOf(fresh(), 0, ['Fire-1']), 'Fire-1');
  state = roll(state, [3, 4]);
  assert.equal(state.phase, 'resolving'); assert.equal(state.fatePlayer, null);
  assert.deepEqual(state.pendingSpell.fateHistory.map(entry => [entry.step, entry.action]), [[1, 'auto-skip'], [2, 'auto-skip']]);
  assert.equal(state.players[1].hp, 100); assertGame(state);
  state = resolveSpell(state);
  assert.deepEqual([state.phase, state.players[1].hp, state.players[0].element, state.players[0].discard.length], ['main', 94, 1, 1]);
  assert.equal(resolveSpell(state), state); assertGame(state);
});

test('defender responds first to visible dice and only role-eligible Fate can be selected', () => {
  let state = fateFixture();
  const attackerCard = state.players[0].hand.find(card => card.spellId === 'FAT-001');
  state = roll(cast(state, 'Fire-1'), [4, 4]);
  assert.deepEqual([state.phase, state.fatePlayer, getActingPlayerIndex(state), state.pendingSpell.fateStep], ['fate', 1, 1, 'response-1']);
  assert.equal(state.lastRoll.total, 8); assert.equal(canSelectCard(state, attackerCard.id), false);
  assert.equal(resolveSpell(state), state); assert.equal(endTurn(state), state); assertGame(state);
});

test('a pass is only provisional and does not prevent a later response', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'), [4, 4]);
  state = fate(state, ['FAT-002']);
  assert.deepEqual([state.fatePlayer, state.pendingSpell.fateStep, state.lastRoll.total], [0, 'response-2', 4]);
  state = skipFate(state);
  assert.deepEqual([state.phase, state.fatePlayer, state.pendingSpell.fatePasses], ['fate', 1, 1]);
  state = fate(state, ['FAT-002']);
  assert.deepEqual([state.fatePlayer, state.pendingSpell.fatePasses, state.lastRoll.total], [0, 0, 0]);
  state = fate(state, ['FAT-001']);
  assert.equal(state.lastRoll.total, 4);
  state = skipFate(skipFate(state));
  assert.equal(state.phase, 'resolving');
  assert.deepEqual(state.pendingSpell.fateHistory.map(entry => entry.action), ['cast', 'skip', 'cast', 'cast', 'skip', 'skip']);
  state = resolveSpell(state);
  assert.deepEqual([state.players[0].element, state.players[1].hp], [0, 94]); assertGame(state);
});

test('Fate alternates beyond three links, preserves roles and closes only after both pass', () => {
  let state = fateFixture(); state.players[0].loaded = 3;
  state = roll(cast(state, 'Fire-1'), [5, 5]);
  const links = [['FAT-002'], ['FAT-001'], ['FAT-002'], ['FAT-003'], ['FAT-003'], ['FAT-003']];
  const totals = [9, 13, 9, 11, 9, 11];
  for (let index = 0; index < links.length; index += 1) {
    assert.equal(state.fatePlayer, index % 2 === 0 ? 1 : 0);
    state = fate(state, links[index]);
    assert.equal(state.lastRoll.total, totals[index]); assertGame(state);
  }
  assert.equal(state.phase, 'resolving', 'exhausted hands automatically pass on both sides');
  assert.equal(state.pendingSpell.fatePlays.length, 6);
  assert.deepEqual(state.pendingSpell.fateHistory.map(entry => entry.step), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(state.lastRoll.dice, [5, 5]);
  assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.loadedBonus, state.lastRoll.attackingFate, state.lastRoll.defendingFate], [10, 3, 8, -10]);
  state = resolveSpell(state); assert.equal(state.players[0].element, 2); assertGame(state);
});

test('no eligible Fate auto-passes while the other player can still cast another link', () => {
  let state = fresh({ fire: ['FAT-001'], water: ['FAT-002', 'FAT-002', 'FAT-001'] });
  handOf(state, 0, ['Fire-1']); handOf(state, 1, ['Water-1', 'FAT-002', 'FAT-002', 'FAT-001']);
  state = fate(roll(cast(state, 'Fire-1')), ['FAT-002']);
  assert.deepEqual([state.phase, state.fatePlayer, state.pendingSpell.fatePasses], ['fate', 1, 1]);
  state = fate(state, ['FAT-002']);
  assert.equal(state.phase, 'resolving');
  assert.deepEqual(state.pendingSpell.fateHistory.map(entry => entry.action), ['cast', 'auto-skip', 'cast', 'auto-skip', 'auto-skip']);
  assert.equal(state.players[1].hand.some(card => card.spellId === 'FAT-001'), true, 'wrong-role Fortune cannot respond');
  assertGame(state);
});

test('two voluntary passes finish Fate even when both still hold legal responses', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'));
  assert.equal(canPlayFate(state, 0), true); assert.equal(canPlayFate(state, 1), true);
  state = skipFate(state);
  assert.deepEqual([state.phase, state.fatePlayer, state.pendingSpell.fatePasses], ['fate', 0, 1]);
  state = skipFate(state);
  assert.deepEqual([state.phase, state.fatePlayer, state.pendingSpell.fatePasses], ['resolving', null, 2]);
  assert.equal(state.pendingSpell.fatePlays.length, 0); assertGame(state);
});

test('Twist supports either sign for either role, with directions tracked in save data', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'), [3, 4]);
  state = fate(state, ['FAT-003'], 2);
  assert.equal(state.lastRoll.defendingFate, 2); assert.equal(state.lastRoll.total, 9); assertGame(state);
  state = fate(state, ['FAT-003'], -2);
  assert.equal(state.lastRoll.attackingFate, -2); assert.equal(state.lastRoll.total, 7); assertGame(state);
  state = skipFate(skipFate(state)); assert.equal(state.phase, 'resolving'); assertGame(state);
});

test('selecting another Fate replaces the pending link and forged batches are rejected', () => {
  let state = skipFate(roll(cast(fateFixture(), 'Fire-1')));
  const cards = state.players[0].hand.filter(card => card.spellId === 'FAT-003');
  state = selectCard(selectCard(state, cards[0].id), cards[1].id);
  assert.deepEqual(state.selectedFateCardIds, [cards[1].id]); assertGame(state);
  const forged = { ...state, selectedFateCardIds: cards.map(card => card.id) };
  assert.equal(canCastSelected(forged), false); assert.equal(castFateSelected(forged), forged);
  assert.equal(validateSavedGame(forged), false);
  state = castFateSelected(state, { twistDirections: { [cards[1].id]: -2 } });
  assert.equal(state.lastRoll.attackingFate, -2);
  assert.equal(state.pendingSpell.attackingFateCardIds.length, 1); assertGame(state);
});

test('invalid Twist directions and forged card keys never pay or discard', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'));
  const card = state.players[1].hand.find(card => card.spellId === 'FAT-003');
  state = selectCard(state, card.id);
  for (const twistDirections of [null, [], '2', { [card.id]: 3 }, { [card.id]: '2' }, { forged: 2 }]) {
    assert.equal(castFateSelected(state, { twistDirections }), state);
  }
  assert.equal(state.players[1].discard.length, 0); assertGame(state);
});

test('Fate selection toggles the current link and cannot spend the primary slot a second time', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'));
  const card = state.players[1].hand.find(card => card.spellId === 'FAT-002');
  state = selectCard(state, card.id); assert.equal(canCastSelected(state), true);
  state = selectCard(state, card.id); assert.equal(canCastSelected(state), false);
  assert.equal(state.selectedCardId, null);
  state = complete(state);
  const second = state.players[0].hand.find(card => card.category !== 'Fate');
  assert.equal(canCastSelected(second ? selectCard(state, second.id) : state), false);
  assert.equal(state.primaryUsed, true); assertGame(state);
});

test('a second player who used Fate draws one extra slab rather than refilling to six', () => {
  let state = fresh({ fire: ['FAT-001'], water: ['FAT-002', 'FAT-002'] });
  handOf(state, 0, ['Fire-1']); handOf(state, 1, ['Water-1', 'FAT-002', 'FAT-002', 'Water-2', 'Water-3']);
  state = fate(fate(roll(cast(state, 'Fire-1')), ['FAT-002']), ['FAT-002']);
  state = resolveSpell(state);
  assert.equal(state.players[1].hand.length, 3);
  state = pass(state); assert.equal(state.players[1].hand.length, 4); assert.equal(state.players[1].mana, 3); assertGame(state);
});

test('Loaded bonuses apply to the next own turn and expire unused at its end', () => {
  let state = handOf(fresh(), 0, ['Fire-4', 'Fire-1']); state.players[0].mana = 10;
  state = complete(cast(state, 'Fire-4'), [4, 4]);
  assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [0, 2]);
  state = pass(state); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [0, 2]);
  state = pass(state); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [2, 0]);
  const ending = endTurn(state); assert.equal(ending.players[0].loaded, 2); assertGame(ending);
  assert.equal(endTurn(ending).players[0].loaded, 0);
  state = roll(cast(state, 'Fire-1'), [2, 3]);
  assert.equal(state.lastRoll.total, 7); assert.equal(state.players[0].loaded, 0); assertGame(state);
});

test('Flow uses the final modified threshold and increases only after full spell resolution', () => {
  let state = fresh({ first: 1, water: ['FAT-001'] });
  handOf(state, 1, ['Water-2', 'FAT-001']); state.players[1].element = 2;
  state = roll(cast(state, 'Water-2'), [2, 3]);
  assert.deepEqual([state.fatePlayer, state.players[1].element, state.players[0].hp], [1, 2, 100]);
  state = fate(state, ['FAT-001']); state = resolveSpell(state);
  assert.deepEqual([state.players[0].hp, state.players[1].element], [92, 4]); assertGame(state);
});

test('normal opposing damage consumes Shield while self-damage bypasses it', () => {
  const initial = fresh(); initial.players[0].shield = 20; initial.players[1].shield = 20;
  let state = applyDamage(initial, 1, 25);
  assert.deepEqual([state.players[1].hp, state.players[1].shield], [95, 0]);
  state = applyDamage(state, 0, 25, { selfDamage: true });
  assert.deepEqual([state.players[0].hp, state.players[0].shield], [75, 20]);
  for (const amount of [-1, 0, NaN, Infinity, 1.5, '5']) assert.equal(applyDamage(state, 0, amount), state);
  assert.equal(applyDamage(state, 2, 5), state); assert.equal(initial.players[0].hp, 100); assertGame(state);
});

test('lethal damage ends a pending spell and discards it once without charging again', () => {
  let state = cast(handOf(fresh(), 0, ['Fire-1']), 'Fire-1');
  state.players[0].shield = 30;
  state = applyDamage(state, 0, 100, { selfDamage: true });
  assert.deepEqual([state.status, state.winner, state.players[0].shield, state.pendingSpell, state.players[0].discard.length], ['finished', 1, 30, null, 1]);
  assert.equal(resolveSpell(state), state); assert.equal(endTurn(state), state); assertGame(state);
});

test('the 30 Shield cap and 100 HP cap are enforced by save validation', () => {
  const state = fresh();
  for (const [key, value] of [['shield', 31], ['mana', 11], ['hp', 101], ['maxHp', 30], ['element', 6]]) {
    const tampered = structuredClone(state); tampered.players[0][key] = value;
    assert.equal(validateSavedGame(tampered), false, `${key} rejects ${value}`);
  }
  state.players[0].shield = 30; state.players[0].mana = 10; assertGame(state);
});

test('a six-slab hand is valid and a seventh slab is rejected without losing cards', () => {
  const state = fresh();
  state.players[0].hand.push(...state.players[0].deck.splice(0, 1));
  assert.equal(state.players[0].hand.length, 6); assertGame(state);
  state.players[0].hand.push(...state.players[0].deck.splice(0, 1));
  assert.equal(allCards(state.players[0]).length, 30);
  assert.equal(validateSavedGame(state), false);
});

test('End Turn reveals refresh, refresh confirms and passes with any number of discards', () => {
  let state = complete(cast(handOf(fresh(), 0, ['Fire-1', 'Fire-2', 'Fire-3', 'Fire-4']), 'Fire-1'));
  const afterCast = state;
  state = endTurn(state); assert.equal(state.phase, 'end');
  state = beginRefresh(state); assert.equal(state.phase, 'refresh');
  const card = state.players[0].hand[0];
  state = toggleRefreshCard(state, card.id); assert.equal(state.refreshCardIds.length, 1);
  state = toggleRefreshCard(state, card.id); assert.equal(state.refreshCardIds.length, 0);
  state = toggleRefreshCard(state, card.id); assertGame(state);
  const cancelled = cancelRefresh(state); assert.equal(cancelled.phase, 'end'); assert.equal(cancelled.players[0].discard.length, 1);
  state = confirmRefresh(state);
  assert.deepEqual([state.activePlayer, state.phase, state.players[0].hand.length, state.players[0].discard.length, state.primaryUsed], [1, 'main', 6, 2, false]); assertGame(state);
  const zero = confirmRefresh(beginRefresh(endTurn(afterCast)));
  assert.deepEqual([zero.players[0].hand.length, zero.players[0].discard.length, zero.activePlayer], [6, 1, 1]); assertGame(zero);
});

test('refresh can replace all six slabs and passing preserves a full six-card hand', () => {
  let state = pass(pass(fresh()));
  assert.equal(state.players[0].hand.length, 6);
  state = beginRefresh(endTurn(state));
  const oldHand = state.players[0].hand.map(card => card.id);
  for (const id of oldHand) state = toggleRefreshCard(state, id);
  state = confirmRefresh(state);
  assert.equal(state.players[0].hand.length, 6);
  assert.equal(state.players[0].discard.length, 6);
  assert.ok(state.players[0].hand.every(card => !oldHand.includes(card.id)));
  state = pass(state);
  assert.equal(state.players[0].hand.length, 6);
  assertGame(state);
});

test('empty towers never fabricate cards or reshuffle the discard pile', () => {
  let state = fresh();
  for (const player of state.players) { player.discard.push(...player.deck, ...player.hand.splice(1)); player.deck = []; }
  state = pass(pass(state));
  for (const player of state.players) assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [1, 0, 29]);
  state = confirmRefresh(toggleRefreshCard(beginRefresh(endTurn(state)), state.players[0].hand[0].id));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], [0, 0, 30]); assertGame(state);
});

test('every post-roll response step and selected link round-trips through saved-state validation', () => {
  const main = fateFixture(), casted = cast(main, 'Fire-1'), defender = roll(casted);
  const selected = selectCard(defender, defender.players[1].hand.find(card => card.spellId === 'FAT-003').id);
  const attacker = castFateSelected(selected, { twistDirections: { [selected.selectedCardId]: 2 } });
  const final = fate(attacker, ['FAT-001']), resolving = skipFate(skipFate(final)), resolved = resolveSpell(resolving);
  for (const state of [createGame(), main, casted, defender, selected, attacker, final, resolving, resolved, endTurn(resolved), beginRefresh(endTurn(resolved)), applyDamage(resolved, 1, 100)]) {
    assertGame(state); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
  }
});

test('tampered Fate ownership, directions, totals, order and dice are rejected', () => {
  const defender = roll(cast(fateFixture(), 'Fire-1'));
  const attacker = fate(defender, ['FAT-003'], 2);
  const mutations = [
    state => { state.lastRoll.rawTotal = 99; },
    state => { state.lastRoll.dice = [0, 6]; },
    state => { state.lastRoll.total += 2; },
    state => { state.pendingSpell.fatePlays[0].playerIndex = 0; },
    state => { state.pendingSpell.fatePlays[0].modifier = 4; },
    state => { state.pendingSpell.fateHistory[0].step = 'attacker'; },
    state => { state.pendingSpell.fateStep = 'defender-final'; },
    state => { state.pendingSpell.defendingFate = -2; },
    state => { state.selectedFateCardIds = [state.players[1].hand[0].id]; state.selectedCardId = state.selectedFateCardIds[0]; },
    state => { state.players[0].hand[0].manaCost = 0; },
    state => { state.players[0].deck[0].id = state.players[0].hand[0].id; },
  ];
  for (const mutate of mutations) {
    const state = structuredClone(attacker); mutate(state); assert.equal(validateSavedGame(state), false, mutate.toString());
  }
  assertGame(attacker);
});

test('old duels are rejected without silently remapping retired slabs or changing the old save', () => {
  const state = fresh();
  for (let version = 1; version <= 9; version += 1) {
    const old = { ...structuredClone(state), version };
    const copy = structuredClone(old);
    assert.equal(migrateSavedGame(old), null); assert.deepEqual(old, copy);
  }
  assert.equal(migrateSavedGame(state), state);
  for (const value of [null, [], {}, 42]) assert.equal(migrateSavedGame(value), null);
});

function legacySave(state, version = 11) {
  const legacy = structuredClone(state); legacy.version = version;
  delete legacy.primaryAction;
  for (const player of legacy.players) { delete player.enhancement; delete player.auraTurns; }
  if (legacy.lastRoll) delete legacy.lastRoll.kind;
  if (legacy.pendingSpell) {
    const steps = ['defender-first', 'attacker', 'defender-final'];
    const pending = legacy.pendingSpell;
    for (const entry of pending.fateHistory) entry.step = steps[entry.step - 1];
    for (const play of pending.fatePlays) play.step = steps[play.step - 1];
    if (legacy.phase === 'fate') pending.fateStep = steps[pending.fateHistory.length];
    delete pending.fatePasses; delete pending.legacyFateHistoryLength;
  }
  return legacy;
}

test('version 10 and 11 duels preserve exact zones, resources and a pending roll or response', () => {
  const main = fateFixture(); main.players[0].shield = 17; main.players[1].hp = 82;
  const rolling = cast(main, 'Fire-1');
  const defender = roll(rolling);
  const attacker = fate(defender, ['FAT-002']);
  for (const version of [10, 11]) for (const current of [main, rolling, defender, attacker]) {
    const original = legacySave(current, version), snapshot = structuredClone(original);
    const upgraded = migrateSavedGame(original);
    assert.ok(upgraded, `${version} ${current.phase} migrates`); assert.equal(upgraded.version, SAVE_VERSION);
    assert.deepEqual(upgraded.players.map(({ enhancement, auraTurns, ...player }) => player), original.players);
    assert.deepEqual(upgraded.players.map(player => player.enhancement), [0, 0]);
    assert.deepEqual(upgraded.initiative, original.initiative);
    assert.deepEqual(original, snapshot, 'previous save remains unchanged');
    if (original.lastRoll) assert.deepEqual(upgraded.lastRoll, { ...original.lastRoll, kind: 'spell' });
    if (original.pendingSpell) {
      assert.equal(upgraded.pendingSpell.loadedBonus, original.pendingSpell.loadedBonus);
      assert.equal(upgraded.pendingSpell.emberSpent, original.pendingSpell.emberSpent);
      assert.equal(upgraded.pendingSpell.fatePlays.length, original.pendingSpell.fatePlays.length);
    }
    assertGame(upgraded);
    let resumed = complete(upgraded);
    resumed = pass(pass(resumed));
    assert.equal(resumed.players[0].hand.length, 6); assertGame(resumed);
  }
  const bad = legacySave(main); bad.players[0].deck[0].spellId = 'FIR-001';
  assert.equal(migrateSavedGame(bad), null);
  const oversized = legacySave(main, 10); oversized.players[0].hand.push(...oversized.players[0].deck.splice(0, 2));
  assert.equal(migrateSavedGame(oversized), null, 'version 10 never allowed six-card hands');
});

test('old finite Fate resolution resumes the chain without replaying paid effects', () => {
  let state = fate(roll(cast(fateFixture(), 'Fire-1')), ['FAT-002']);
  state = skipFate(state);
  const legacy = legacySave(state);
  // In v11, defender cast + attacker pass ended the fixed response sequence.
  legacy.phase = 'resolving'; legacy.fatePlayer = null; legacy.pendingSpell.fateStep = 'complete';
  const original = structuredClone(legacy), upgraded = migrateSavedGame(legacy);
  assert.ok(upgraded); assert.equal(upgraded.phase, 'fate'); assert.equal(upgraded.fatePlayer, 1);
  assert.equal(upgraded.pendingSpell.fatePasses, 1);
  assert.deepEqual(upgraded.players.map(({ enhancement, auraTurns, ...player }) => player), original.players);
  assert.deepEqual(upgraded.lastRoll, { ...original.lastRoll, kind: 'spell' }); assertGame(upgraded);
  const resolved = complete(upgraded);
  assert.equal(resolved.players[0].discard.filter(card => card.spellId === 'Fire-1').length, 1);
  assert.equal(resolved.players[1].discard.filter(card => card.spellId === 'FAT-002').length, 1);
  assert.equal(resolved.players[1].hp, 94); assertGame(resolved);
});

test('legal simulated duels preserve exact cards and valid states through repeated combat and refresh', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    let state = fresh({ seed, fire: ['FAT-001', 'FAT-002', 'FAT-003'], water: ['FAT-001', 'FAT-002', 'FAT-003'] });
    for (let turn = 0; turn < 35 && state.status === 'playing'; turn += 1) {
      const player = state.players[state.activePlayer];
      const card = player.hand.find(card => card.category !== 'Fate' && card.manaCost <= player.mana);
      if (card) {
        state = castSelected(selectCard(state, card.id)); assertGame(state);
        state = roll(state, [seed % 6 + 1, turn % 6 + 1]); assertGame(state);
        while (state.phase === 'fate') {
          const responder = state.players[getActingPlayerIndex(state)];
          const fateCard = responder.hand.find(card => canSelectCard(state, card.id));
          state = fateCard && turn % 2 === 0 ? castFateSelected(selectCard(state, fateCard.id)) : skipFate(state);
          assertGame(state);
        }
        state = resolveSpell(state); assertGame(state);
      }
      if (state.status === 'playing') {
        state = beginRefresh(endTurn(state));
        if (state.players[state.activePlayer].hand[0] && turn % 3 === 0) state = toggleRefreshCard(state, state.players[state.activePlayer].hand[0].id);
        assertGame(state); state = confirmRefresh(state); assertGame(state);
      }
    }
  }
});

test('Enhancement succeeds on raw 6, fails on raw 5, and uses the primary action either way', () => {
  assert.deepEqual([MAX_ENHANCEMENT, ENHANCEMENT_STEP, ENHANCEMENT_THRESHOLD], [30, 10, 6]);
  for (const [dice, expected] of [[[2, 3], 0], [[3, 3], 10], [[6, 6], 30]]) {
    const initial = fateFixture(); initial.players[0].mana = 0; initial.players[0].loaded = 4;
    initial.players[0].loadedPending = 2; initial.players[0].element = 3;
    const snapshot = structuredClone(initial);
    let state = activateEnhancement(initial);
    assert.deepEqual([state.phase, state.primaryUsed, state.lastRoll, state.pendingSpell.kind], ['enhancing', true, null, 'enhancement']);
    assert.equal(canEnhance(state), false); assertGame(state);
    for (const action of [activateEnhancement, endTurn, castSelected, skipFate, resolveSpell, rollDice]) assert.equal(action(state), state);
    let index = 0;
    state = rollEnhancement(state, () => (dice[index++] - 1) / 6);
    assert.deepEqual([state.phase, state.primaryUsed, state.players[0].enhancement], ['main', true, expected]);
    assert.deepEqual([state.lastRoll.kind, state.lastRoll.dice, state.lastRoll.rawTotal, state.lastRoll.total, state.lastRoll.success], ['enhancement', dice, dice[0] + dice[1], dice[0] + dice[1], expected > 0]);
    assert.deepEqual([state.lastRoll.loadedBonus, state.lastRoll.attackingFate, state.lastRoll.defendingFate], [0, 0, 0]);
    assert.deepEqual([state.players[0].mana, state.players[0].element, state.players[0].loaded, state.players[0].loadedPending], [0, 3, 4, 2]);
    assert.deepEqual(state.players[0].hand, initial.players[0].hand); assert.deepEqual(state.players[1], initial.players[1]);
    assert.deepEqual(initial, snapshot, 'activation and roll leave input untouched');
    assert.equal(canEnhance(state), false); assert.equal(activateEnhancement(state), state);
    const selected = selectCard(state, state.players[0].hand.find(card => card.category !== 'Fate').id);
    assert.equal(canCastSelected(selected), false); assert.equal(castSelected(selected), selected);
    const ending = endTurn(state);
    assert.equal(ending.players[0].loaded, 4, 'first End Turn click only stages the pass');
    assert.equal(endTurn(ending).players[0].loaded, 0, 'unused Loaded expires on the actual pass');
    assert.equal(ending.players[0].loadedPending, 2); assertGame(ending);
  }
});

test('Enhancement is once per own turn, persists through turns, caps at 30 and resets for a new duel', () => {
  let state = fresh();
  assert.equal(canEnhance(state, 1), false); assert.equal(canEnhance(state, 0), true);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    state = rollEnhancement(activateEnhancement(state), () => .5);
    assert.equal(state.players[0].enhancement, attempt * 10); assert.equal(state.players[1].enhancement, 0);
    assert.equal(canEnhance(state), false); assertGame(state);
    state = pass(state);
    assert.equal(canEnhance(state, 0), false);
    state = pass(state); assert.equal(state.players[0].enhancement, attempt * 10);
  }
  assert.equal(state.primaryUsed, false); assert.equal(canEnhance(state), false);
  assert.equal(activateEnhancement(state), state, 'at the cap the action remains available for a primary spell');
  const primary = state.players[0].hand.find(card => card.category !== 'Fate' && card.manaCost <= state.players[0].mana);
  assert.equal(canCastSelected(selectCard(state, primary.id)), true);
  assert.deepEqual(fresh().players.map(player => player.enhancement), [0, 0]); assertGame(state);
});

test('Enhancement is unavailable outside the owner main action and cannot interrupt a primary spell', () => {
  const setup = createGame();
  const initiative = createGame(2, { fire: fixtureDeck('fire'), water: fixtureDeck('water') });
  const initial = fateFixture(), rolling = cast(initial, 'Fire-1'), responding = roll(rolling);
  const resolved = complete(responding), ending = endTurn(initial), refresh = beginRefresh(ending);
  for (const state of [setup, initiative, rolling, responding, resolved, ending, refresh, applyDamage(initial, 1, 100)]) {
    assert.equal(canEnhance(state), false); assert.equal(activateEnhancement(state), state); assertGame(state);
  }
  const playerTwo = pass(initial);
  assert.equal(canEnhance(playerTwo, 0), false); assert.equal(canEnhance(playerTwo, 1), true);
  const enhanced = rollEnhancement(activateEnhancement(playerTwo), () => .5);
  assert.deepEqual(enhanced.players.map(player => player.enhancement), [0, 10]); assertGame(enhanced);
});

test('invalid Enhancement random samples are rejected without paying, resolving or changing dice', () => {
  const initial = activateEnhancement(fresh());
  for (const value of [-.1, 1, NaN, Infinity, '0']) assert.equal(rollEnhancement(initial, () => value), initial);
  assert.equal(rollEnhancement(fresh(), () => .5).lastRoll, null);
  assert.equal(initial.phase, 'enhancing'); assert.equal(initial.players[0].enhancement, 0); assertGame(initial);
});

test('pending and completed Enhancement save safely and malformed bonuses or outcomes are rejected', () => {
  const pending = activateEnhancement(fresh());
  const success = rollEnhancement(pending, () => .5);
  const failure = rollEnhancement(pending, () => 0);
  for (const state of [pending, success, failure, pass(success), pass(pass(success))]) {
    assertGame(state); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
  }
  for (const value of [-10, 5, 40, .1, '10', null]) {
    const state = structuredClone(success); state.players[0].enhancement = value;
    assert.equal(validateSavedGame(state), false);
  }
  const mutations = [
    state => { state.lastRoll.success = false; },
    state => { state.lastRoll.enhancementBefore = 30; },
    state => { state.lastRoll.enhancementAfter = 20; },
    state => { state.lastRoll.loadedBonus = 2; state.lastRoll.total += 2; },
    state => { state.lastRoll.kind = 'spell'; },
  ];
  for (const mutate of mutations) {
    const state = structuredClone(success); mutate(state); assert.equal(validateSavedGame(state), false, mutate.toString());
  }
  const invalid = structuredClone(pending); invalid.primaryUsed = false;
  assert.equal(validateSavedGame(invalid), false);
});

test('legacy Fate batches remain paid once while all newly added chain links are individual cards', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'));
  // Build the equivalent legal v11 batch: two Misfortunes were committed in the first response.
  const legacy = legacySave(state), player = legacy.players[1], pending = legacy.pendingSpell;
  const cards = player.hand.filter(card => card.spellId === 'FAT-002');
  player.hand = player.hand.filter(card => !cards.includes(card)); player.discard.push(...cards);
  pending.defendingFate = -8; pending.defendingFateCardIds = cards.map(card => card.id);
  pending.fatePlays = cards.map(card => ({ cardId: card.id, spellId: card.spellId, playerIndex: 1, modifier: -4, step: 'defender-first' }));
  pending.fateHistory = [{ step: 'defender-first', playerIndex: 1, action: 'cast', cardIds: cards.map(card => card.id) }];
  pending.fateStep = 'attacker'; legacy.fatePlayer = 0;
  legacy.lastRoll.defendingFate = -8; legacy.lastRoll.total -= 8;
  const snapshot = structuredClone(legacy);
  state = migrateSavedGame(legacy);
  assert.ok(state); assert.equal(state.pendingSpell.legacyFateHistoryLength, 1);
  assert.deepEqual(state.players[1].discard, cards); assertGame(state);
  state = fate(state, ['FAT-001']);
  assert.equal(state.pendingSpell.fateHistory[1].cardIds.length, 1);
  assert.equal(state.lastRoll.defendingFate, -8);
  assert.deepEqual(legacy, snapshot); assertGame(state);
  const resolved = complete(state);
  assert.equal(resolved.players[1].discard.length, 2);
  assert.equal(resolved.players[0].discard.length, 2); assertGame(resolved);
});

test('legacy final-defender windows reopen attacker priority and preserve every paid Fate', () => {
  const first = fate(roll(cast(fateFixture(), 'Fire-1')), ['FAT-002']);
  const finalWindow = fate(first, ['FAT-001']);
  for (const respond of [state => state, skipFate, state => fate(state, ['FAT-002'])]) {
    const current = respond(finalWindow), original = legacySave(current);
    if (current !== finalWindow) {
      original.phase = 'resolving'; original.fatePlayer = null; original.pendingSpell.fateStep = 'complete';
    }
    const snapshot = structuredClone(original), upgraded = migrateSavedGame(original);
    assert.ok(upgraded); assertGame(upgraded);
    assert.deepEqual(upgraded.players.map(({ enhancement, auraTurns, ...player }) => player), original.players);
    assert.deepEqual(upgraded.lastRoll, { ...original.lastRoll, kind: 'spell' });
    assert.equal(upgraded.pendingSpell.fatePlays.length, original.pendingSpell.fatePlays.length);
    assert.equal(upgraded.fatePlayer, current === finalWindow ? 1 : 0);
    assert.equal(upgraded.pendingSpell.fateHistory.length, original.pendingSpell.fateHistory.length);
    assert.deepEqual(original, snapshot);
    const resolved = complete(upgraded);
    assert.equal(resolved.players[0].discard.filter(card => card.spellId === 'Fire-1').length, 1);
    assertGame(resolved);
  }
});

test('migration rejects corrupt legacy phase, sequence and unsupported Enhancement phases', () => {
  const old = legacySave(roll(cast(fateFixture(), 'Fire-1')));
  const mutations = [
    state => { state.pendingSpell.fateStep = 'attacker'; },
    state => { state.fatePlayer = 0; },
    state => { state.phase = 'resolving'; state.fatePlayer = null; state.pendingSpell.fateStep = 'complete'; },
    state => { state.pendingSpell.fateHistory = [{ step: 'attacker', playerIndex: 1, action: 'skip', cardIds: [] }]; },
  ];
  for (const mutate of mutations) {
    const state = structuredClone(old); mutate(state); assert.equal(migrateSavedGame(state), null, mutate.toString());
  }
  const impossible = legacySave(activateEnhancement(fresh()));
  assert.equal(migrateSavedGame(impossible), null);
});

test('Fire-0 resolves for zero Mana immediately, gains one Ember and consumes the primary action', () => {
  const initial = fresh({ fire: ['Fire-0', 'FAT-001'], water: ['FAT-002'] });
  handOf(initial, 0, ['Fire-0', 'Fire-1', 'FAT-001']); handOf(initial, 1, ['Water-1', 'FAT-002']);
  Object.assign(initial.players[0], { mana: 0, element: 3, loaded: 4, loadedPending: 2, enhancement: 30 });
  initial.lastRoll = rollEnhancement(activateEnhancement(fresh()), () => .5).lastRoll;
  const snapshot = structuredClone(initial), originalCard = initial.players[0].hand[0];
  const state = cast(initial, 'Fire-0');
  assert.deepEqual([state.phase, state.primaryUsed, state.pendingSpell, state.pendingCardId, state.fatePlayer, state.lastRoll], ['main', true, null, null, null, null]);
  assert.deepEqual([state.players[0].mana, state.players[0].element, state.players[0].loaded, state.players[0].loadedPending, state.players[0].enhancement], [0, 4, 4, 2, 30]);
  assert.deepEqual([state.players[0].hp, state.players[0].shield, state.players[1].hp, state.players[1].shield], [100, 0, 100, 0]);
  assert.deepEqual(state.players[1], initial.players[1], 'opponent never receives a Fate window or other changes');
  assert.deepEqual(state.players[0].discard, [originalCard]);
  assert.ok(state.players[0].hand.every(card => card.id !== originalCard.id));
  assert.deepEqual(initial, snapshot, 'casting leaves input untouched');
  assert.equal(canEnhance(state), false);
  const selected = selectCard(state, state.players[0].hand.find(card => card.spellId === 'Fire-1').id);
  assert.equal(canCastSelected(selected), false); assert.equal(castSelected(selected), selected);
  for (const action of [rollDice, skipFate, castFateSelected, resolveSpell, activateEnhancement]) assert.equal(action(state), state);
  assert.equal(state.log.filter(entry => entry.type === 'resource').at(-1).message, 'Fire gains 1 Ember.');
  assert.ok(!state.log.slice(initial.log.length).some(entry => ['dice', 'fate', 'damage'].includes(entry.type)));
  assert.equal(endTurn(state).players[0].loaded, 4, 'staging End Turn does not expire Loaded');
  assert.equal(pass(state).players[0].loaded, 0, 'Loaded expires on the actual pass rather than on this immediate spell');
  assertGame(state); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
});

test('Fire-0 respects the five-Ember cap and rejects spending before any card is paid or discarded', () => {
  for (const element of [0, 4, 5]) {
    const initial = handOf(fresh({ fire: ['Fire-0'] }), 0, ['Fire-0']); initial.players[0].element = element;
    const selected = selectCard(initial, initial.players[0].hand[0].id);
    for (const emberSpend of [-1, 1, .5, '0', NaN]) assert.equal(castSelected(selected, { emberSpend }), selected);
    const state = castSelected(selected);
    assert.equal(state.players[0].element, Math.min(5, element + 1));
    assert.equal(state.players[0].mana, 3); assert.equal(state.players[0].discard.length, 1);
    assertGame(state);
  }
});

test('additive Fire-0 preserves current-format duels and cannot be forged into a pending dice spell', () => {
  const previous = fresh(), snapshot = JSON.parse(JSON.stringify(previous));
  assert.equal(SAVE_VERSION, 14); assert.equal(migrateSavedGame(previous), previous);
  assert.equal(validateSavedGame(snapshot), true);
  let state = handOf(fresh({ fire: ['Fire-0'] }), 0, ['Fire-0', 'Fire-1']);
  assertGame(state); assert.equal(migrateSavedGame(state), state);
  state = cast(state, 'Fire-1');
  const immediate = state.players[0].hand.find(card => card.spellId === 'Fire-0');
  state.pendingCardId = immediate.id; state.pendingSpell.cardId = immediate.id; state.pendingSpell.spellId = immediate.spellId;
  assert.equal(validateSavedGame(state), false, 'non-roll spells never persist in a dice or Fate phase');
});

test('Aura costs one Mana and immediately uses the primary action without rolling or consuming other resources', () => {
  assert.deepEqual([AURA_COST, AURA_DURATION, AURA_BONUS], [1, 3, 10]);
  const initial = fateFixture();
  Object.assign(initial.players[0], { mana: 1, loaded: 4, loadedPending: 2, element: 3, enhancement: 20 });
  initial.selectedCardId = initial.players[0].hand.find(card => card.spellId === 'Fire-1').id;
  initial.lastRoll = rollEnhancement(activateEnhancement(fresh()), () => .5).lastRoll;
  const snapshot = structuredClone(initial);
  assert.equal(canActivateAura(initial, 0), true); assert.equal(canActivateAura(initial, 1), false);
  const state = activateAura(initial);
  assert.deepEqual([state.phase, state.primaryUsed, state.primaryAction, state.selectedCardId, state.lastRoll, state.pendingSpell, state.fatePlayer], ['main', true, 'aura', null, null, null, null]);
  assert.deepEqual([state.players[0].mana, state.players[0].auraTurns, state.players[0].loaded, state.players[0].loadedPending, state.players[0].element, state.players[0].enhancement], [0, 3, 4, 2, 3, 20]);
  assert.deepEqual(state.players[0].hand, initial.players[0].hand);
  assert.deepEqual(state.players[0].deck, initial.players[0].deck); assert.deepEqual(state.players[0].discard, initial.players[0].discard);
  assert.deepEqual(state.players[1], initial.players[1]); assert.deepEqual(initial, snapshot);
  assert.equal(canEnhance(state), false); assert.equal(canActivateAura(state), false);
  const selected = selectCard(state, state.players[0].hand[0].id);
  assert.equal(canCastSelected(selected), false); assert.equal(castSelected(selected), selected);
  for (const action of [rollDice, rollEnhancement, skipFate, castFateSelected, activateEnhancement, activateAura]) assert.equal(action(state), state);
  assert.ok(!state.log.slice(initial.log.length).some(entry => ['dice', 'fate', 'damage', 'resource'].includes(entry.type)));
  assert.match(state.log.at(-1).message, /\+10% damage.*3.*turns/); assertGame(state);
});

test('Aura excludes activation and lasts three subsequent owner turns, ticking only on actual passes', () => {
  let state = activateAura(fresh());
  const activationEnd = endTurn(state), activationRefresh = beginRefresh(activationEnd);
  assert.equal(cancelRefresh(activationRefresh).players[0].auraTurns, 3);
  state = confirmRefresh(activationRefresh);
  assert.deepEqual([state.activePlayer, state.players[0].auraTurns, state.primaryAction], [1, 3, null], 'activation pass preserves all three subsequent turns');
  state = pass(state);
  assert.equal(state.players[0].auraTurns, 3, 'the first opponent turn does not reduce Aura');
  for (const remaining of [3, 2, 1]) {
    assert.equal(state.activePlayer, 0); assert.equal(state.players[0].auraTurns, remaining);
    const ending = endTurn(state), refresh = beginRefresh(ending), cancelled = cancelRefresh(refresh);
    assert.equal(ending.players[0].auraTurns, remaining);
    assert.equal(refresh.players[0].auraTurns, remaining);
    assert.equal(cancelled.players[0].auraTurns, remaining);
    state = confirmRefresh(refresh);
    assert.deepEqual([state.activePlayer, state.players[0].auraTurns, state.primaryUsed, state.primaryAction], [1, remaining - 1, false, null]);
    assertGame(state);
    const enemyEnding = endTurn(state);
    assert.equal(enemyEnding.players[0].auraTurns, remaining - 1);
    state = endTurn(enemyEnding);
    assert.equal(state.players[0].auraTurns, remaining - 1, 'opponent turns never tick this Aura');
    assertGame(state);
  }
  assert.equal(state.players[0].auraTurns, 0); assert.equal(canActivateAura(state), true);
  assert.equal(activateAura(state).players[0].auraTurns, 3, 'Aura can be activated again after expiry');
  assert.match(state.log.find(entry => /Aura expires/.test(entry.message)).message, /Fire/);
});

test('both players have independent Aura durations and an active Aura cannot stack or refresh early', () => {
  let state = pass(activateAura(fresh()));
  state = activateAura(state);
  assert.deepEqual(state.players.map(player => player.auraTurns), [3, 3]);
  state = pass(state);
  assert.deepEqual(state.players.map(player => player.auraTurns), [3, 3]);
  assert.equal(state.primaryUsed, false); assert.equal(canActivateAura(state), false);
  assert.equal(activateAura(state), state, 'spending another primary cannot extend an active Aura');
  state = pass(state); assert.deepEqual(state.players.map(player => player.auraTurns), [2, 3]);
  state = pass(state); assert.deepEqual(state.players.map(player => player.auraTurns), [2, 2]);
  assertGame(state);
});

test('Aura requires one Mana and a free primary action during the owner main phase', () => {
  const initial = fateFixture(), noMana = structuredClone(initial); noMana.players[0].mana = 0;
  const casted = cast(initial, 'Fire-1'), responding = roll(casted), resolved = complete(responding);
  const enhancing = activateEnhancement(initial), enhanced = rollEnhancement(enhancing, () => .5);
  const setup = createGame(), initiative = createGame(2, { fire: fixtureDeck('fire'), water: fixtureDeck('water') });
  for (const state of [setup, initiative, noMana, casted, responding, resolved, enhancing, enhanced, endTurn(initial), beginRefresh(endTurn(initial)), applyDamage(initial, 1, 100)]) {
    assert.equal(canActivateAura(state), false); assert.equal(activateAura(state), state); assertGame(state);
  }
  const second = pass(initial);
  assert.equal(canActivateAura(second, 0), false); assert.equal(canActivateAura(second, 1), true);
  assert.equal(activateAura(second).players[1].auraTurns, 3);
});

test('primaryAction distinguishes spell, Enhancement and Aura and resets after passing', () => {
  const initial = fateFixture(); assert.equal(initial.primaryAction, null);
  for (const [state, action] of [[cast(initial, 'Fire-1'), 'spell'], [activateEnhancement(initial), 'enhancement'], [activateAura(initial), 'aura']]) {
    assert.equal(state.primaryAction, action); assert.equal(state.primaryUsed, true); assertGame(state);
    const done = state.phase === 'enhancing' ? rollEnhancement(state, () => 0) : complete(state);
    assert.equal(done.primaryAction, action); assert.equal(done.primaryUsed, true);
    assert.equal(endTurn(done).primaryAction, action);
    assert.equal(pass(done).primaryAction, null); assertGame(pass(done));
  }
});

function version13Save(state) {
  const previous = structuredClone(state); previous.version = 13;
  if (previous.pendingSpell?.kind === 'enhancement') {
    assert.equal(previous.phase, 'enhancing', 'v13 never had post-roll Enhancement Fate');
    previous.pendingSpell = null;
  } else if (previous.pendingSpell) delete previous.pendingSpell.kind;
  if (previous.lastRoll?.kind === 'enhancement') {
    assert.notEqual(previous.lastRoll.resolved, false, 'v13 Enhancement dice were already awarded');
    const roll = previous.lastRoll;
    delete roll.resolved;
    for (const key of ['fatePlays', 'fateHistory', 'fatePasses', 'attackingFateCardIds', 'defendingFateCardIds', 'legacyFateHistoryLength']) delete roll[key];
    if (roll.enhancementRule === ENHANCEMENT_ROLL_RULE) roll.enhancementRule = 'tiered-v1';
    else if (roll.enhancementRule === 'legacy-flat-v1') delete roll.enhancementRule;
  }
  return previous;
}
function version12Save(state) {
  const previous = version13Save(state); previous.version = 12;
  delete previous.primaryAction;
  for (const player of previous.players) delete player.auraTurns;
  return previous;
}

test('version 12 migration preserves Enhancement and all cards, resources, dice and open-chain state', () => {
  const main = fateFixture(); main.players[0].enhancement = 20; main.players[1].enhancement = 10;
  main.players[0].loaded = 3; main.players[0].shield = 13; main.players[1].hp = 82;
  const rolling = cast(main, 'Fire-1'), defender = roll(rolling), attacker = fate(defender, ['FAT-002']);
  const selected = selectCard(attacker, attacker.players[0].hand.find(card => card.spellId === 'FAT-001').id);
  let extended = attacker;
  for (const id of ['FAT-001', 'FAT-002', 'FAT-003']) extended = fate(extended, [id]);
  const resolving = complete(extended);
  const enhancing = activateEnhancement(main), enhanced = rollEnhancement(enhancing, () => .5);
  for (const current of [createGame(), main, rolling, defender, attacker, selected, extended, resolving, enhancing, enhanced, endTurn(enhanced), beginRefresh(endTurn(enhanced)), pass(enhanced)]) {
    const previous = version12Save(current), snapshot = structuredClone(previous), upgraded = migrateSavedGame(previous);
    assert.ok(upgraded, `${current.phase} migrates`); assert.equal(upgraded.version, SAVE_VERSION);
    assert.deepEqual(upgraded.players.map(({ auraTurns, ...player }) => player), previous.players);
    assert.deepEqual(upgraded.players.map(player => player.auraTurns), [0, 0]);
    assert.deepEqual(upgraded.pendingSpell, current.pendingSpell);
    assert.deepEqual(upgraded.lastRoll, previous.lastRoll?.kind === 'enhancement'
      ? { ...previous.lastRoll, resolved: true } : previous.lastRoll);
    for (const key of ['pendingCardId', 'phase', 'selectedCardId', 'selectedFateCardIds', 'fatePlayer', 'refreshCardIds', 'initiative']) assert.deepEqual(upgraded[key], previous[key], key);
    assert.equal(upgraded.primaryAction, current.primaryAction); assert.deepEqual(previous, snapshot);
    assertGame(upgraded); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(upgraded))), true);
  }
});

test('Aura state round-trips, malformed duration/action states fail, and historical Enhancement may be consumed', () => {
  const aura = activateAura(fresh()), activated = JSON.parse(JSON.stringify(aura));
  assert.equal(validateSavedGame(activated), true); assert.equal(migrateSavedGame(activated), activated);
  for (const value of [-1, 4, 1.5, '3', null, undefined]) {
    const state = structuredClone(aura); state.players[0].auraTurns = value;
    assert.equal(validateSavedGame(state), false);
  }
  for (const primaryAction of [null, 'fate', 'bad', 1]) {
    const state = structuredClone(aura); state.primaryAction = primaryAction;
    assert.equal(validateSavedGame(state), false);
  }
  const noAction = fresh(); noAction.primaryAction = 'aura'; assert.equal(validateSavedGame(noAction), false);
  const historical = rollEnhancement(activateEnhancement(fresh()), () => .5);
  historical.players[0].enhancement = 0;
  assert.equal(validateSavedGame(historical), true, 'old roll records the past result rather than requiring a monotonic current bonus');
  assertGame(historical);
  const oldHistorical = version12Save(historical), upgraded = migrateSavedGame(oldHistorical);
  assert.ok(upgraded); assert.equal(upgraded.players[0].enhancement, 0);
  assert.deepEqual(upgraded.lastRoll, { ...oldHistorical.lastRoll, resolved: true });
});

test('temporary Enhancement remains through Fate and is consumed after the whole damaging spell even when Shield blocks it', () => {
  const initial = fresh({ fire: ['FAT-001'], water: ['FAT-002'] });
  handOf(initial, 0, ['Fire-4', 'FAT-001']); handOf(initial, 1, ['Water-1', 'FAT-002']);
  Object.assign(initial.players[0], { enhancement: 20, auraTurns: 2 });
  Object.assign(initial.players[1], { shield: 30, enhancement: 30 });
  let state = roll(cast(initial, 'Fire-4'), [4, 4]);
  assert.equal(state.players[0].enhancement, 20);
  state = fate(state, ['FAT-002']); assert.equal(state.players[1].enhancement, 30, 'Fate never consumes the responder bonus');
  state = fate(state, ['FAT-001']);
  assert.equal(state.phase, 'resolving'); assert.equal(state.players[0].enhancement, 20);
  state = resolveSpell(state);
  assert.deepEqual([state.players[0].enhancement, state.players[0].auraTurns, state.players[1].enhancement], [0, 2, 30]);
  assert.deepEqual([state.players[1].hp, state.players[1].shield], [100, 23], '5 × 1.30 rounds once to 7 before Shield');
  assert.deepEqual([state.players[0].element, state.players[0].loadedPending], [1, 2], 'remaining spell effects resolve normally');
  const newEntries = state.log.slice(initial.log.length);
  assert.ok(newEntries.findIndex(entry => entry.type === 'enhancement') > newEntries.findIndex(entry => entry.type === 'damage'));
  assertGame(state); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
});

test('non-damaging spells and self damage preserve temporary Enhancement and Aura', () => {
  for (const spellId of ['Fire-0', 'Fire-15', 'Fire-2', 'Fire-3', 'Water-3', 'Water-10']) {
    const index = spellId.startsWith('Water') ? 1 : 0;
    const initial = fresh({ first: index, fire: ['Fire-0', 'Fire-15'].includes(spellId) ? [spellId] : [] });
    handOf(initial, index, [spellId]); Object.assign(initial.players[index], { mana: 10, hp: 60, enhancement: 20, auraTurns: 2 });
    const state = complete(cast(initial, spellId));
    assert.deepEqual([state.players[index].enhancement, state.players[index].auraTurns], [20, 2], spellId);
    assertGame(state);
  }
  const initial = fresh(); Object.assign(initial.players[0], { shield: 12, enhancement: 20, auraTurns: 2 });
  const state = applyDamage(initial, 0, 4, { selfDamage: true });
  assert.deepEqual([state.players[0].hp, state.players[0].shield, state.players[0].enhancement, state.players[0].auraTurns], [96, 12, 20, 2]);
  assertGame(state);
});

test('Aura activation saves resume without consuming a subsequent turn through either End Turn or refresh', () => {
  for (const first of [0, 1]) {
    const activated = activateAura(fresh({ first }));
    assert.match(activated.log.at(-1).message, /next 3 turns.*activation turn does not count/);
    const ending = endTurn(activated), refreshing = beginRefresh(ending);
    const cases = [[activated, pass], [ending, endTurn], [refreshing, confirmRefresh], [refreshing, endTurn], [cancelRefresh(refreshing), endTurn]];
    for (const [current, finishTurn] of cases) {
      const saved = JSON.parse(JSON.stringify(current)), snapshot = structuredClone(saved);
      assert.equal(saved.version, SAVE_VERSION); assert.equal(validateSavedGame(saved), true);
      assert.equal(migrateSavedGame(saved), saved, 'the existing v13 save remains directly compatible');
      const next = finishTurn(saved);
      assert.deepEqual([next.activePlayer, next.players[first].auraTurns, next.primaryAction], [1 - first, 3, null]);
      assert.equal(pass(next).players[first].auraTurns, 3, 'the intervening opponent turn is excluded too');
      assert.deepEqual(saved, snapshot, 'resuming never rewrites the stored cards, resources or action marker');
      assertGame(next);
    }
  }
});

test('Aura boosts damaging spells on all three subsequent owner turns and expires only after the third passes', () => {
  for (const owner of [0, 1]) {
    const spellId = owner === 0 ? 'Fire-1' : 'Water-1';
    let state = fresh({ first: owner, ...(owner === 0 ? { fire: [spellId, spellId, spellId] } : { water: [spellId, spellId, spellId] }) });
    handOf(state, owner, [spellId, spellId, spellId]);
    state = pass(pass(activateAura(state)));
    assert.equal(state.players[owner].auraTurns, 3);
    for (let turn = 1; turn <= 3; turn += 1) {
      const remaining = 4 - turn, target = 1 - owner, previousHP = state.players[target].hp;
      assert.equal(state.activePlayer, owner); assert.equal(state.players[owner].auraTurns, remaining);
      state = complete(cast(state, spellId), [2, 3]);
      assert.equal(state.players[target].hp, previousHP - 7, 'base6 receives the fixed10% before one rounding');
      assert.equal(state.players[owner].auraTurns, remaining, 'casting never consumes a duration turn');
      const ending = endTurn(state);
      assert.equal(ending.players[owner].auraTurns, remaining, 'the last spell stays boosted through the End Turn reveal');
      state = endTurn(ending);
      assert.equal(state.players[owner].auraTurns, remaining - 1);
      state = pass(state); assertGame(state);
    }
    assert.equal(state.players[1 - owner].hp, 79);
    assert.equal(state.players[owner].auraTurns, 0); assert.equal(canActivateAura(state), true);
  }
});

test('previous v13 saves with an already-progressed Aura retain their remaining count and deck data', () => {
  for (const remaining of [1, 2]) {
    const previous = pass(pass(activateAura(fresh())));
    previous.players[0].auraTurns = remaining;
    previous.log.find(entry => entry.message.includes('activates Aura')).message = 'Fire activates Aura for 1 Mana: +10% damage for 3 of their turns, including this turn.';
    const saved = JSON.parse(JSON.stringify(version13Save(previous))), snapshot = structuredClone(saved);
    assert.equal(validateSavedGame(saved), false);
    const migrated = migrateSavedGame(saved); assert.ok(migrated); assert.equal(migrated.version, SAVE_VERSION);
    assert.equal(saved.players[0].auraTurns, remaining, 'elapsed turns are not refunded or inferred from old log text');
    assert.deepEqual(saved, snapshot);
    const next = pass(migrated);
    assert.equal(next.players[0].auraTurns, remaining - 1);
    assert.deepEqual(next.players[0].deckDefinition, saved.players[0].deckDefinition);
    assertGame(next);
  }
});

test('decks with 30 identical elemental or Fate slabs conserve distinct physical cards and remain save-compatible', () => {
  for (const [fireSpell, waterSpell] of [['Fire-0', 'Water-1'], ['FAT-003', 'FAT-002']]) {
    const definitions = { fire: { element: 'fire', entries: [{ spellId: fireSpell, quantity: 30 }] }, water: { element: 'water', entries: [{ spellId: waterSpell, quantity: 30 }] } };
    let state = createGame(915, definitions);
    assert.equal(state.phase, 'initiative');
    for (const [index, spellId] of [[0, fireSpell], [1, waterSpell]]) {
      const player = state.players[index], cards = allCards(player);
      assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [5, 25, 0]);
      assert.equal(cards.length, 30); assert.equal(new Set(cards.map(card => card.id)).size, 30);
      assert.ok(cards.every(card => card.spellId === spellId));
      assert.deepEqual(player.deckDefinition, definitions[player.id]);
    }
    state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
    if (fireSpell === 'Fire-0') state = cast(state, fireSpell);
    else state = rollEnhancement(activateEnhancement(state), () => .5);
    state = confirmRefresh(beginRefresh(endTurn(state)));
    state = pass(state);
    for (const player of state.players) {
      assert.equal(allCards(player).length, 30); assert.equal(new Set(allCards(player).map(card => card.id)).size, 30);
      assert.equal(player.hand.length, 6);
    }
    assertGame(state);
    const saved = JSON.parse(JSON.stringify(state));
    assert.equal(validateSavedGame(saved), true); assert.equal(migrateSavedGame(saved), saved);
    assert.equal(saved.version, SAVE_VERSION);
  }
});

test('Fire-15 reserves a zero-cost primary, consumes Loaded, and grants resources only after final roll resolution', () => {
  const initial = fresh({ fire: ['Fire-15', 'FAT-001'], water: ['FAT-002'] });
  handOf(initial, 0, ['Fire-15', 'Fire-1', 'FAT-001']); handOf(initial, 1, ['Water-1', 'FAT-002']);
  Object.assign(initial.players[0], { mana: 0, element: 4, loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
  const snapshot = structuredClone(initial), card = initial.players[0].hand[0];
  let state = cast(initial, 'Fire-15');
  assert.deepEqual([state.phase, state.primaryUsed, state.primaryAction, state.pendingCardId, state.lastRoll], ['rolling', true, 'spell', card.id, null]);
  assert.deepEqual([state.players[0].mana, state.players[0].element, state.players[0].loaded, state.pendingSpell.loadedBonus], [0, 4, 0, 4]);
  assert.deepEqual(state.players[0].hand, initial.players[0].hand); assert.equal(state.players[0].discard.length, 0);
  assert.equal(cancelStagedAction(state), state, 'a committed rolled primary is not reversible');
  state = roll(state, [1, 2]);
  assert.deepEqual([state.phase, state.fatePlayer, state.lastRoll.rawTotal, state.lastRoll.total], ['fate', 1, 3, 7]);
  assert.deepEqual([state.players[0].mana, state.players[0].element], [0, 4]);
  while (state.phase === 'fate') state = skipFate(state);
  assert.equal(state.phase, 'resolving'); assert.deepEqual([state.players[0].mana, state.players[0].element], [0, 4]);
  state = resolveSpell(state);
  assert.deepEqual([state.phase, state.pendingSpell, state.pendingCardId, state.fatePlayer], ['main', null, null, null]);
  assert.deepEqual([state.players[0].mana, state.players[0].element, state.players[0].loaded, state.players[0].loadedPending,
    state.players[0].enhancement, state.players[0].auraTurns], [1, 5, 0, 2, 20, 2]);
  assert.deepEqual(state.players[0].discard, [card]); assert.equal(state.players[0].hand.length, 2);
  assert.deepEqual(state.players[1], initial.players[1]); assert.deepEqual(initial, snapshot);
  const selected = selectCard(state, state.players[0].hand.find(card => card.spellId === 'Fire-1').id);
  assert.equal(canCastSelected(selected), false, 'new Mana cannot buy a second primary'); assert.equal(castSelected(selected), selected);
  assert.equal(canEnhance(state), false); assert.equal(canActivateAura(state), false); assert.equal(resolveSpell(state), state);
  const saved = JSON.parse(JSON.stringify(state)); assert.equal(validateSavedGame(saved), true); assert.equal(migrateSavedGame(saved), saved);
  assert.deepEqual([saved.players[0].mana, saved.players[0].element, saved.players[0].discard.length], [1, 5, 1]); assertGame(state);
});

test('Enhancement tier helper defines exact raw boundaries without coercing invalid totals', () => {
  for (const [total, bonus] of [[2, 0], [5, 0], [6, 10], [8, 10], [9, 20], [11, 20], [12, 30], [13, 30]]) {
    assert.equal(getEnhancementBonus(total), bonus);
  }
  for (const value of [NaN, Infinity, '12', null, undefined, 6.5]) assert.equal(getEnhancementBonus(value), 0);
});

test('all 36 raw Enhancement dice pairs stack tiers over banks 0,10,20 and cap 30 without Mana, Loaded or Fate', () => {
  const base = fateFixture();
  for (const bank of [0, 10, 20, 30]) for (let first = 1; first <= 6; first += 1) for (let second = 1; second <= 6; second += 1) {
    const initial = structuredClone(base);
    Object.assign(initial.players[0], { enhancement: bank, mana: 0, loaded: 4, loadedPending: 2, element: 3, auraTurns: 2 });
    const total = first + second, bonus = total < 6 ? 0 : total < 9 ? 10 : total < 12 ? 20 : 30;
    const snapshot = structuredClone(initial), pending = activateEnhancement(initial);
    let calls = 0;
    const random = () => ([first, second][calls++] - 1) / 6;
    if (bank === 30) {
      assert.equal(pending, initial); assert.equal(rollEnhancement(pending, random), initial);
      assert.equal(calls, 0); assert.equal(initial.primaryUsed, false); assertGame(initial); continue;
    }
    const state = rollEnhancement(pending, random), after = Math.min(30, bank + bonus);
    assert.equal(calls, 2);
    assert.deepEqual([state.players[0].enhancement, state.lastRoll.enhancementBefore, state.lastRoll.enhancementAfter], [after, bank, after]);
    assert.deepEqual([state.lastRoll.enhancementRule, state.lastRoll.enhancementBonus, state.lastRoll.enhancementGain], [ENHANCEMENT_ROLL_RULE, bonus, after - bank]);
    assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.total, state.lastRoll.success], [total, total, bonus > 0]);
    assert.deepEqual(state.lastRoll.dice, [first, second]);
    assert.deepEqual([state.lastRoll.loadedBonus, state.lastRoll.attackingFate, state.lastRoll.defendingFate], [0, 0, 0]);
    assert.deepEqual([state.players[0].mana, state.players[0].loaded, state.players[0].loadedPending, state.players[0].element, state.players[0].auraTurns], [0, 4, 2, 3, 2]);
    assert.deepEqual([state.phase, state.primaryUsed, state.primaryAction, state.pendingSpell, state.fatePlayer], ['main', true, 'enhancement', null, null]);
    assert.deepEqual(state.players[0].hand, initial.players[0].hand); assert.deepEqual(state.players[1], initial.players[1]);
    assert.deepEqual(initial, snapshot);
    assert.equal(rollEnhancement(state, random), state); assert.equal(calls, 2, 'a completed attempt cannot sample again');
    assertGame(state); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
  }
});

function tierRoll(state, dice) {
  let index = 0;
  return rollEnhancement(activateEnhancement(state), () => (dice[index++] - 1) / 6);
}
function legacyFlatEnhancement(bank, dice) {
  const initial = fresh(); initial.players[0].enhancement = bank;
  const state = version13Save(tierRoll(initial, dice)), oldAward = dice[0] + dice[1] >= 6 ? 10 : 0;
  delete state.lastRoll.enhancementRule; delete state.lastRoll.enhancementBonus; delete state.lastRoll.enhancementGain;
  state.lastRoll.enhancementAfter = bank + oldAward; state.players[0].enhancement = bank + oldAward;
  state.log.at(-1).message = `Fire rolls ${dice.join(' + ')} for Enhancement: gains +${oldAward}%; ${bank + oldAward}% Enh.`;
  return state;
}

test('old flat 10 v13 rolls at 9 and 12 remain loadable without recalculating their bank or result', () => {
  for (const bank of [0, 10, 20]) for (const dice of [[1, 1], [2, 3], [3, 3], [4, 4], [3, 6], [5, 6], [6, 6]]) {
    const old = legacyFlatEnhancement(bank, dice), saved = JSON.parse(JSON.stringify(old)), snapshot = structuredClone(saved);
    assert.equal(saved.version, 13); assert.equal(validateSavedGame(saved), false);
    const migrated = migrateSavedGame(saved); assert.ok(migrated); assert.equal(migrated.version, SAVE_VERSION);
    assert.deepEqual(migrated.players, saved.players);
    assert.deepEqual(migrated.lastRoll, { ...saved.lastRoll, resolved: true, enhancementRule: 'legacy-flat-v1' });
    assert.deepEqual(saved, snapshot, 'legacy dice, rewards, stats, hands and decks remain untouched');
    assert.equal(Object.hasOwn(saved.lastRoll, 'enhancementRule'), false);
    assert.equal(saved.players[0].enhancement, bank + (dice[0] + dice[1] >= 6 ? 10 : 0));
  }
  const saved = JSON.parse(JSON.stringify(legacyFlatEnhancement(0, [6, 6])));
  const next = tierRoll(pass(pass(migrateSavedGame(saved))), [6, 6]);
  assert.deepEqual([next.lastRoll.enhancementBefore, next.lastRoll.enhancementBonus, next.lastRoll.enhancementGain, next.players[0].enhancement], [10, 30, 20, 30]);
  assert.equal(next.lastRoll.enhancementRule, ENHANCEMENT_ROLL_RULE); assertGame(next);
  const previous12 = version12Save(legacyFlatEnhancement(0, [3, 6]));
  const migrated = migrateSavedGame(previous12);
  assert.ok(migrated); assert.equal(migrated.players[0].enhancement, 10);
  assert.deepEqual(migrated.lastRoll, { ...previous12.lastRoll, resolved: true, enhancementRule: 'legacy-flat-v1' });
});

test('new tier-marked saves reject wrong nominal awards, cap gains, rules or legacy masquerading', () => {
  const initial = fresh(); initial.players[0].enhancement = 20;
  const state = tierRoll(initial, [3, 6]);
  assert.deepEqual([state.lastRoll.enhancementBonus, state.lastRoll.enhancementGain, state.players[0].enhancement], [20, 10, 30]);
  assert.match(state.log.at(-1).message, /tier \+20%; gains \+10%; 30% Enh.*maximum 30%/);
  const mutations = [
    value => { value.lastRoll.enhancementBonus = 10; },
    value => { value.lastRoll.enhancementGain = 20; },
    value => { value.lastRoll.enhancementAfter = 40; },
    value => { value.lastRoll.enhancementRule = 'unknown'; },
    value => { value.lastRoll.enhancementRule = undefined; },
    value => { delete value.lastRoll.enhancementRule; },
    value => { delete value.lastRoll.enhancementBonus; },
    value => { delete value.lastRoll.enhancementGain; },
    value => { value.lastRoll.success = false; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(state); mutate(copy); assert.equal(validateSavedGame(copy), false, mutate.toString());
  }
  const unmarkedWrongAward = legacyFlatEnhancement(0, [6, 6]); unmarkedWrongAward.lastRoll.enhancementAfter = 30;
  assert.equal(validateSavedGame(unmarkedWrongAward), false, 'unmarked records still require their historical flat 10 outcome');
});

test('new 20 and 30 tier rewards survive nondamaging turns and are spent by the next damaging spell', () => {
  for (const [dice, bank, damage] of [[[3, 6], 20, 8], [[6, 6], 30, 8]]) {
    let state = handOf(fresh(), 0, ['Fire-1', 'Fire-2']);
    state = tierRoll(state, dice); assert.equal(state.players[0].enhancement, bank);
    state = pass(pass(state)); state = complete(cast(state, 'Fire-2'), [2, 3]);
    assert.equal(state.players[0].enhancement, bank, 'a resource spell retains the entire awarded tier');
    state = pass(pass(state)); state = complete(cast(state, 'Fire-1'), [2, 3]);
    assert.equal(state.players[1].hp, 100 - damage); assert.equal(state.players[0].enhancement, 0);
    assertGame(state); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
  }
});

test('Enhancement rolls once into defender-first Fate without reserving a slab, Mana or Loaded', () => {
  const initial = fateFixture();
  Object.assign(initial.players[0], { mana: 0, loaded: 4, loadedPending: 2, enhancement: 10 });
  const snapshot = structuredClone(initial);
  const pending = activateEnhancement(initial);
  assert.deepEqual([pending.phase, pending.pendingCardId, pending.pendingSpell.kind,
    pending.pendingSpell.cardId, pending.pendingSpell.spellId], ['enhancing', null, 'enhancement', null, null]);
  let calls = 0;
  const state = rollEnhancementAction(pending, () => ([2, 3][calls++] - 1) / 6);
  assert.deepEqual([calls, state.phase, state.fatePlayer, getActingPlayerIndex(state)], [2, 'fate', 1, 1]);
  assert.deepEqual([state.lastRoll.kind, state.lastRoll.resolved, state.lastRoll.total, state.lastRoll.enhancementBefore,
    state.lastRoll.enhancementBonus, state.lastRoll.enhancementGain, state.lastRoll.enhancementAfter, state.lastRoll.success],
  ['enhancement', false, 5, 10, null, null, null, null]);
  assert.deepEqual([state.players[0].mana, state.players[0].loaded, state.players[0].loadedPending, state.players[0].enhancement], [0, 4, 2, 10]);
  assert.deepEqual(state.players[0].hand, initial.players[0].hand);
  assert.equal(rollEnhancementAction(state, () => { calls++; return .9; }), state);
  assert.equal(rollDice(state), state); assert.equal(calls, 2);
  assert.ok(state.log.at(-2).type === 'dice');
  assert.deepEqual(initial, snapshot); assertGame(state);
});

test('six Enhancement Fate responses change raw seven into tier twenty and award only after both pass', () => {
  const initial = fateFixture();
  Object.assign(initial.players[0], { loaded: 4, loadedPending: 2 });
  let index = 0;
  let state = rollEnhancementAction(activateEnhancement(initial), () => ([3, 4][index++] - 1) / 6);
  for (const [spellId, direction, total] of [['FAT-002', null, 3], ['FAT-001', null, 7], ['FAT-002', null, 3],
    ['FAT-003', 2, 5], ['FAT-003', 2, 7], ['FAT-003', 2, 9]]) {
    state = fate(state, [spellId], direction ?? undefined);
    assert.equal(state.lastRoll.total, total); assert.equal(state.players[0].enhancement, 0);
    assert.equal(state.lastRoll.resolved, false); assertGame(state);
  }
  assert.equal(state.phase, 'resolving');
  assert.equal(state.pendingSpell.fatePlays.length, 6);
  assert.deepEqual(state.pendingSpell.fateHistory.slice(-2).map(entry => entry.action), ['auto-skip', 'auto-skip']);
  assert.equal(resolveSpell({ ...state, phase: 'fate' }).players[0].enhancement, 0);
  state = resolveSpell(state);
  assert.deepEqual([state.phase, state.pendingSpell, state.pendingCardId, state.primaryUsed, state.primaryAction], ['main', null, null, true, 'enhancement']);
  assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.total, state.lastRoll.enhancementBonus,
    state.lastRoll.enhancementGain, state.lastRoll.enhancementAfter, state.players[0].enhancement], [7, 9, 20, 20, 20, 20]);
  assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [4, 2]);
  assert.deepEqual(state.players.map(player => [player.hand.length, player.discard.length]), [[1, 3], [1, 3]]);
  assert.equal(state.lastRoll.fatePlays.length, 6);
  assert.match(state.log.at(-1).message, /resolves Enhancement at Modified Roll 9.*raw 7; attacking Fate \+8; defending Fate -6.*tier \+20%; gains \+20%; 20% Enh/);
  assert.equal(resolveSpell(state), state); assert.equal(activateEnhancement(state), state); assertGame(state);
  assertGame(pass(state)); assertGame(pass(pass(state)));
});

test('defending Fate can downgrade an Enhancement tier or turn a raw success into a miss', () => {
  for (const [dice, total, expected] of [[[6, 6], 8, 10], [[3, 3], 2, 0]]) {
    let index = 0;
    let state = rollEnhancementAction(activateEnhancement(fateFixture()), () => (dice[index++] - 1) / 6);
    state = fate(state, ['FAT-002']); assert.equal(state.lastRoll.total, total);
    assert.equal(state.players[0].enhancement, 0);
    state = skipFate(state); assert.equal(state.fatePlayer, 1);
    state = skipFate(state); assert.equal(state.phase, 'resolving');
    state = resolveSpell(state);
    assert.deepEqual([state.players[0].enhancement, state.lastRoll.enhancementBonus, state.lastRoll.success], [expected, expected, expected > 0]);
    assertGame(state);
  }
});

test('Enhancement retains Fortune/Misfortune roles and allows either Twist direction on either side', () => {
  const initial = fresh({ fire: ['FAT-001', 'FAT-002', 'FAT-003'], water: ['FAT-001', 'FAT-002', 'FAT-003'] });
  handOf(initial, 0, ['FAT-001', 'FAT-002', 'FAT-003']); handOf(initial, 1, ['FAT-001', 'FAT-002', 'FAT-003']);
  let state = rollEnhancementAction(activateEnhancement(initial), () => .5);
  assert.equal(canSelectCard(state, state.players[1].hand.find(card => card.spellId === 'FAT-001').id), false);
  assert.equal(canSelectCard(state, state.players[1].hand.find(card => card.spellId === 'FAT-002').id), true);
  state = skipFate(state);
  assert.equal(canSelectCard(state, state.players[0].hand.find(card => card.spellId === 'FAT-002').id), false);
  assert.equal(canSelectCard(state, state.players[0].hand.find(card => card.spellId === 'FAT-001').id), true);
  for (const [defending, attacking] of [[2, -2], [-2, 2]]) {
    const source = fateFixture(); handOf(source, 0, ['FAT-003']); handOf(source, 1, ['FAT-003']);
    let next = rollEnhancementAction(activateEnhancement(source), () => .5);
    next = fate(next, ['FAT-003'], defending); next = fate(next, ['FAT-003'], attacking);
    next = resolveSpell(next);
    assert.deepEqual([next.lastRoll.defendingFate, next.lastRoll.attackingFate, next.lastRoll.total, next.players[0].enhancement], [defending, attacking, 8, 10]);
    assertGame(next);
  }
});

test('every Enhancement Fate stage reloads with identical pending reservations, selected link and final award', () => {
  const states = [activateEnhancement(fateFixture())];
  states.push(rollEnhancementAction(states.at(-1), () => .5));
  states.push(selectCard(states.at(-1), states.at(-1).players[1].hand.find(card => card.spellId === 'FAT-002').id));
  states.push(castFateSelected(states.at(-1)));
  states.push(fate(states.at(-1), ['FAT-001']));
  states.push(skipFate(states.at(-1))); states.push(skipFate(states.at(-1)));
  states.push(resolveSpell(states.at(-1)));
  for (const state of states) {
    const saved = JSON.parse(JSON.stringify(state)), snapshot = structuredClone(saved);
    assert.equal(validateSavedGame(saved), true); assert.equal(migrateSavedGame(saved), saved);
    assert.deepEqual(saved, snapshot); assertGame(saved);
  }
  assert.equal(states.at(-2).phase, 'resolving');
  assert.equal(states.at(-1).players[0].enhancement, 10);
});

test('forged Enhancement pending awards, unpaid Fate, modifier totals and resolved histories are rejected', () => {
  const waiting = rollEnhancementAction(activateEnhancement(fateFixture()), () => .5);
  for (const mutate of [
    state => { state.pendingSpell.kind = 'spell'; },
    state => { state.pendingSpell.enhancementBefore = 10; },
    state => { state.pendingSpell.loadedBonus = 2; state.lastRoll.loadedBonus = 2; state.lastRoll.total += 2; },
    state => { state.pendingSpell.legacyFateHistoryLength = 1; },
    state => { state.lastRoll.success = true; },
    state => { state.lastRoll.resolved = true; },
    state => { state.lastRoll.enhancementAfter = 20; state.players[0].enhancement = 20; },
    state => { state.lastRoll.enhancementRule = 'tiered-v1'; },
  ]) { const copy = structuredClone(waiting); mutate(copy); assert.equal(validateSavedGame(copy), false, mutate.toString()); }
  const resolved = complete(fate(fate(waiting, ['FAT-002']), ['FAT-001']));
  for (const mutate of [
    state => { state.lastRoll.enhancementBonus = 30; state.lastRoll.enhancementAfter = 30; state.lastRoll.enhancementGain = 30; },
    state => { state.lastRoll.fateHistory[0].playerIndex = 0; },
    state => { state.lastRoll.fateHistory.pop(); state.lastRoll.fatePasses = 1; },
    state => { state.lastRoll.fatePlays[0].modifier = 4; },
    state => { state.lastRoll.fatePlays[0].cardId = 'invented-fate'; },
    state => { const card = state.players[1].discard.pop(); state.players[1].hand.push(card); },
    state => { state.lastRoll.resolved = false; },
    state => { delete state.lastRoll.enhancementRule; },
    state => { delete state.lastRoll.fateHistory; },
  ]) { const copy = structuredClone(resolved); mutate(copy); assert.equal(validateSavedGame(copy), false, mutate.toString()); }
  assertGame(resolved);
});

test('v13 pre-roll Enhancement upgrades into Fate while finalized tiered results retain their paid bank', () => {
  const pending = version13Save(activateEnhancement(fateFixture()));
  const upgraded = migrateSavedGame(pending);
  assert.ok(upgraded); assert.equal(upgraded.pendingSpell.kind, 'enhancement');
  let rolled = rollEnhancementAction(upgraded, () => .5);
  assert.equal(rolled.phase, 'fate'); assert.equal(rolled.fatePlayer, 1); assert.equal(rolled.players[0].enhancement, 0);
  const initial = fresh(); initial.players[0].enhancement = 20;
  const completed = version13Save(tierRoll(initial, [3, 6]));
  const snapshot = structuredClone(completed), migrated = migrateSavedGame(completed);
  assert.deepEqual(migrated.players, completed.players); assert.deepEqual(completed, snapshot);
  assert.equal(migrated.lastRoll.enhancementRule, 'tiered-v1'); assert.equal(migrated.lastRoll.resolved, true);
  assert.deepEqual([migrated.lastRoll.enhancementBonus, migrated.lastRoll.enhancementGain, migrated.players[0].enhancement], [20, 10, 30]);
  assert.equal(resolveSpell(migrated), migrated);
  const corrupt = structuredClone(completed); corrupt.lastRoll.enhancementBonus = 30;
  assert.equal(migrateSavedGame(corrupt), null);
  const downgraded = structuredClone(waitingEnhancement()); downgraded.version = 13;
  assert.equal(migrateSavedGame(downgraded), null, 'new Fate records cannot masquerade as old already-awarded results');
  function waitingEnhancement() { return rollEnhancementAction(activateEnhancement(fateFixture()), () => .5); }
});

test('short towers conserve their actual one-through-thirty totals and only draw available opening cards', () => {
  for (const total of [1, 2, 4, 5, 6, 7, 29, 30]) for (const first of [0, 1]) {
    const definitions = { fire: { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: total }] },
      water: { element: 'water', entries: [{ spellId: 'Water-1', quantity: Math.max(1, total - 1) }] } };
    let state = createGame(total, definitions); assertGame(state);
    const counts = [total, Math.max(1, total - 1)];
    for (const [index, player] of state.players.entries()) assert.deepEqual([player.hand.length, player.deck.length], [Math.min(5, counts[index]), Math.max(0, counts[index] - 5)]);
    state = rollInitiative(rollInitiative(state, 0, () => first === 0 ? .9 : 0), 1, () => first === 1 ? .9 : 0);
    state = pass(state); assert.equal(state.players[1 - first].hand.length, Math.min(6, counts[1 - first]));
    state = pass(state); assert.equal(state.players[first].hand.length, Math.min(6, counts[first]));
    state = confirmRefresh(beginRefresh(endTurn(state)));
    for (const [index, player] of state.players.entries()) assert.equal(allCards(player).length, counts[index]);
    assertGame(state); assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
    const corrupt = structuredClone(state); corrupt.players[0].hand.pop(); assert.equal(validateSavedGame(corrupt), false);
  }
});

test('one-card decks exhaust without refills, invented reshuffles or fatigue damage', () => {
  let state = createGame(7, { fire: { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 1 }] },
    water: { element: 'water', entries: [{ spellId: 'Water-1', quantity: 1 }] } });
  state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
  state = cast(state, 'Fire-0'); state = pass(state); state = complete(cast(state, 'Water-1'), [1, 1]);
  assert.deepEqual(state.players.map(player => player.hp), [94, 100]);
  for (let turn = 0; turn < 12; turn++) {
    state = confirmRefresh(beginRefresh(endTurn(state)));
    assert.deepEqual(state.players.map(player => [player.hand.length, player.deck.length, player.discard.length]), [[0, 0, 1], [0, 0, 1]]);
    assert.deepEqual(state.players.map(player => player.hp), [94, 100]); assertGame(state);
  }
});

test('ending a duel during Enhancement Fate never awards a bonus or discards a nonexistent primary slab', () => {
  const state = rollEnhancementAction(activateEnhancement(fateFixture()), () => .5);
  const ended = applyDamage(state, 0, 100);
  assert.equal(ended.status, 'finished'); assert.equal(ended.winner, 1);
  assert.equal(ended.pendingSpell, null); assert.equal(ended.lastRoll, null);
  assert.deepEqual(ended.players.map(player => player.discard), [[], []]);
  assert.equal(ended.players[0].enhancement, 0); assertGame(ended);
});

test('background cancellation clears a main selection without spending or changing anything else', () => {
  const initial = fateFixture();
  Object.assign(initial.players[0], { loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
  assert.equal(canCancelStagedAction(initial), false); assert.equal(cancelStagedAction(initial), initial);
  const selected = selectCard(initial, initial.players[0].hand[0].id), snapshot = structuredClone(selected);
  assert.equal(canCancelStagedAction(selected), true);
  const cancelled = cancelStagedAction(selected);
  assert.deepEqual(cancelled, initial); assert.deepEqual(selected, snapshot);
  assert.equal(canCancelStagedAction(cancelled), false); assert.equal(cancelStagedAction(cancelled), cancelled);
  assert.equal(canCastSelected(selectCard(cancelled, cancelled.players[0].hand[0].id)), true);
  assertGame(cancelled);
});

test('End Turn and refresh staging can be cancelled repeatedly without Loaded expiry, Aura ticks or draws', () => {
  const initial = fateFixture();
  Object.assign(initial.players[0], { loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
  let state = initial;
  for (let attempt = 0; attempt < 4; attempt++) {
    let staged = endTurn(state);
    assert.equal(staged.phase, 'end'); assert.equal(canCancelStagedAction(staged), true);
    assert.deepEqual(staged.players, initial.players); assert.deepEqual(staged.log, initial.log);
    if (attempt % 2) {
      staged = beginRefresh(staged);
      for (const card of staged.players[0].hand) staged = toggleRefreshCard(staged, card.id);
      assert.ok(staged.refreshCardIds.length > 0);
    }
    const snapshot = structuredClone(staged);
    state = cancelStagedAction(staged);
    assert.deepEqual(state, initial); assert.deepEqual(staged, snapshot);
    assert.equal(cancelStagedAction(state), state); assertGame(state);
  }
  const passed = endTurn(endTurn(state));
  assert.deepEqual([passed.activePlayer, passed.players[0].loaded, passed.players[0].loadedPending, passed.players[0].auraTurns], [1, 0, 2, 1]);
  assert.equal(passed.log.filter(entry => entry.type === 'loaded' && /unused Loaded.*expires/.test(entry.message)).length, 1);
  assert.equal(passed.log.filter(entry => entry.type === 'aura').length, 1);
  assert.equal(cancelStagedAction(passed), passed); assertGame(passed);
});

test('cancelling staged End Turn lets the same unspent Loaded bonus be used, but never restores consumed Loaded', () => {
  const initial = fateFixture(); initial.players[0].loaded = 4;
  const restored = cancelStagedAction(endTurn(initial));
  let committed = cast(restored, 'Fire-1');
  assert.deepEqual([committed.players[0].loaded, committed.pendingSpell.loadedBonus], [0, 4]);
  assert.equal(cancelStagedAction(committed), committed, 'a committed spell cannot be undone');
  committed = complete(committed, [1, 1]);
  assert.equal(committed.lastRoll.total, 6);
  const cancelled = cancelStagedAction(endTurn(committed));
  assert.equal(cancelled.players[0].loaded, 0); assert.deepEqual(cancelled.players, committed.players);
  assert.equal(cancelled.primaryUsed, true); assert.equal(cancelled.primaryAction, 'spell');
  assert.equal(canEnhance(cancelled), false); assertGame(cancelled);
});

test('background cancellation preserves committed primary spells, Enhancement, Aura and resource rewards', () => {
  for (const commit of [state => complete(cast(state, 'Fire-1')), state => cast(state, 'Fire-0'),
    state => complete(cast(state, 'Fire-15')), state => rollEnhancement(activateEnhancement(state), () => .5), activateAura]) {
    const source = fresh({ fire: ['Fire-0', 'Fire-15'] });
    handOf(source, 0, ['Fire-1', 'Fire-0', 'Fire-15', 'Fire-2']);
    Object.assign(source.players[0], { loaded: 4, loadedPending: 2, enhancement: 10 });
    const committed = commit(source), snapshot = structuredClone(committed);
    assert.equal(committed.primaryUsed, true);
    for (const refreshing of [false, true]) {
      let staged = endTurn(committed);
      if (refreshing) {
        staged = beginRefresh(staged);
        staged = toggleRefreshCard(staged, staged.players[0].hand[0].id);
      }
      const cancelled = cancelStagedAction(staged);
      assert.deepEqual(cancelled, committed); assert.deepEqual(committed, snapshot);
      assert.equal(cancelled.primaryUsed, true); assert.equal(cancelled.primaryAction, committed.primaryAction);
      assert.equal(canEnhance(cancelled), false); assert.equal(canActivateAura(cancelled), false);
      const selected = selectCard(cancelled, cancelled.players[0].hand.find(card => card.category !== 'Fate').id);
      assert.equal(canCastSelected(selected), false); assert.equal(castSelected(selected), selected);
      assert.deepEqual(cancelStagedAction(selected), committed); assertGame(cancelled);
    }
  }
});

test('background cancellation clears only the selected Fate link in either a spell or Enhancement chain', () => {
  for (const kind of ['spell', 'enhancement']) {
    const source = fateFixture(); source.players[0].loaded = 4;
    const waiting = kind === 'spell' ? roll(cast(source, 'Fire-1')) : rollEnhancementAction(activateEnhancement(source), () => .5);
    const defenderCard = waiting.players[1].hand.find(card => card.spellId === 'FAT-002');
    const selected = selectCard(waiting, defenderCard.id), snapshot = structuredClone(selected);
    assert.equal(canCancelStagedAction(selected), true);
    const cancelled = cancelStagedAction(selected);
    assert.deepEqual(cancelled, waiting); assert.deepEqual(selected, snapshot);
    assert.equal(cancelStagedAction(cancelled), cancelled); assert.equal(cancelled.fatePlayer, 1);
    assert.equal(cancelled.pendingSpell.fateHistory.length, 0);
    const casted = castFateSelected(selectCard(cancelled, defenderCard.id));
    assert.equal(casted.players[1].discard.at(-1).id, defenderCard.id);
    assert.equal(casted.lastRoll.defendingFate, -4); assert.equal(casted.fatePlayer, 0);
    assert.equal(cancelStagedAction(casted), casted, 'casting Fate already committed the response');
    const attackerCard = casted.players[0].hand.find(card => card.spellId === 'FAT-001');
    assert.deepEqual(cancelStagedAction(selectCard(casted, attackerCard.id)), casted);
    const skipped = skipFate(casted);
    assert.equal(skipped.pendingSpell.fateHistory.at(-1).action, 'skip');
    assert.equal(cancelStagedAction(skipped), skipped, 'a Fate pass is already committed');
    assertGame(cancelled); assertGame(casted); assertGame(skipped);
  }
});

test('confirmed refreshes and actual turn passes are never undone by a later background tap', () => {
  const initial = fateFixture(); initial.players[0].loaded = 4; initial.players[0].auraTurns = 2;
  const staged = beginRefresh(endTurn(initial));
  const selected = toggleRefreshCard(staged, staged.players[0].hand[0].id);
  const refreshed = confirmRefresh(selected), snapshot = structuredClone(refreshed);
  assert.equal(refreshed.activePlayer, 1); assert.equal(refreshed.players[0].discard.length, 1);
  assert.equal(refreshed.players[0].loaded, 0); assert.equal(refreshed.players[0].auraTurns, 1);
  assert.equal(canCancelStagedAction(refreshed), false); assert.equal(cancelStagedAction(refreshed), refreshed);
  assert.deepEqual(refreshed, snapshot);
  const passed = pass(initial); assert.equal(cancelStagedAction(passed), passed);
  assertGame(refreshed); assertGame(passed);
});

test('cancellation is unavailable during committed roll phases, finished games and legacy ready-to-pass', () => {
  const initial = fateFixture();
  const rolling = cast(initial, 'Fire-1'), resolving = completePending(roll(rolling));
  const initiative = createGame(9, { fire: fixtureDeck('fire'), water: fixtureDeck('water') });
  const ready = { ...endTurn(initial), phase: 'ready-to-pass' };
  for (const state of [createGame(), initiative, activateEnhancement(initial), rolling, resolving,
    applyDamage(initial, 1, 100), ready]) {
    const snapshot = structuredClone(state);
    assert.equal(canCancelStagedAction(state), false); assert.equal(cancelStagedAction(state), state);
    assert.deepEqual(state, snapshot); assertGame(state);
  }
  function completePending(state) { while (state.phase === 'fate') state = skipFate(state); return state; }
});

test('v14 staged saves retain unspent Loaded and cancellation never refunds old expired Loaded', () => {
  const initial = fateFixture(); initial.players[0].loaded = 4; initial.players[0].auraTurns = 2;
  for (const staged of [endTurn(initial), beginRefresh(endTurn(initial))]) {
    const saved = JSON.parse(JSON.stringify(staged));
    assert.equal(saved.version, 14); assert.equal(validateSavedGame(saved), true);
    assert.equal(migrateSavedGame(saved), saved); assert.deepEqual(cancelStagedAction(saved), initial);
  }
  const old = version13Save(endTurn(initial)); old.players[0].loaded = 0;
  old.log.push({ id: old.log.length + 1, round: old.round, playerId: 'fire', type: 'loaded', message: "Fire's unused Loaded +4 expires." });
  const migrated = migrateSavedGame(old); assert.ok(migrated);
  const cancelled = cancelStagedAction(migrated);
  assert.equal(cancelled.phase, 'main'); assert.equal(cancelled.players[0].loaded, 0);
  assert.deepEqual(cancelled.log, old.log); assert.equal(cancelled.players[0].auraTurns, 2);
  assertGame(cancelled);
});

test('cancelling End Turn after Aura activation preserves its primary marker and full three subsequent turns', () => {
  const activated = activateAura(fresh());
  const cancelled = cancelStagedAction(beginRefresh(endTurn(activated)));
  assert.deepEqual(cancelled, activated); assert.equal(cancelled.primaryAction, 'aura');
  let state = pass(cancelled); assert.equal(state.players[0].auraTurns, 3);
  state = pass(state); assert.equal(state.players[0].auraTurns, 3);
  state = pass(state); assert.equal(state.players[0].auraTurns, 2); assertGame(state);
});

test('Fire-15 Mana and Water-0 extra Flow use final Fate-modified totals, not the raw dice', () => {
  for (const spellId of ['Fire-15', 'Water-0']) for (const [dice, response, direction, final, mana] of [
    [[3, 3], 'FAT-001', undefined, 10, 1], [[3, 4], 'FAT-002', undefined, 3, 0],
    [[3, 3], 'FAT-003', 2, 8, 1], [[3, 4], 'FAT-003', -2, 5, 0],
  ]) {
    const index = spellId.startsWith('Water') ? 1 : 0;
    const initial = fresh({ first: index, fire: ['Fire-15', 'FAT-001', 'FAT-002', 'FAT-003'], water: ['Water-0', 'FAT-001', 'FAT-002', 'FAT-003'] });
    handOf(initial, index, [spellId, 'FAT-001', 'FAT-003']);
    handOf(initial, 1 - index, [index === 0 ? 'Water-1' : 'Fire-1', 'FAT-002', 'FAT-003']);
    Object.assign(initial.players[index], { mana: 0, element: 2, loadedPending: 2, enhancement: 20, auraTurns: 2 });
    let state = cast(initial, spellId), samples = 0;
    state = rollDice(state, () => (dice[samples++] - 1) / 6);
    assert.equal(samples, 2); assert.equal(state.fatePlayer, 1 - index);
    assert.deepEqual([state.players[index].mana, state.players[index].element], [index === 1 ? 1 : 0, 2]);
    if (response === 'FAT-001') state = skipFate(state);
    state = fate(state, [response], direction);
    assert.equal(state.lastRoll.total, final);
    assert.deepEqual([state.players[index].mana, state.players[index].element], [index === 1 ? 1 : 0, 2]);
    assert.equal(rollDice(state, () => { samples++; return .9; }), state); assert.equal(samples, 2);
    state = complete(state);
    assert.deepEqual([state.players[index].mana, state.players[index].element, state.players[index].loadedPending,
      state.players[index].enhancement, state.players[index].auraTurns], [index === 1 ? 1 : mana, index === 1 ? 3 + Number(final >= 7) : 3, 2, 20, 2]);
    assert.equal(state.primaryUsed, true); assert.equal(state.primaryAction, 'spell');
    assert.equal(state.players[index].discard.filter(card => card.spellId === spellId).length, 1);
    assert.equal(allCards(state.players[index]).length, 30); assert.equal(resolveSpell(state), state); assertGame(state);
  }
});

test('below seven Fire-15 misses Mana while Water-0 retains cast Mana and gains normal passive Flow', () => {
  for (const spellId of ['Fire-15', 'Water-0']) {
    const index = spellId.startsWith('Water') ? 1 : 0;
    const initial = fresh({ first: index, fire: ['Fire-15'], water: ['Water-0'] });
    handOf(initial, index, [spellId, index === 0 ? 'Fire-1' : 'Water-1']);
    Object.assign(initial.players[index], { mana: 0, element: 0, enhancement: 20, auraTurns: 2 });
    const state = complete(cast(initial, spellId), [3, 3]);
    assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.total, state.players[index].mana, state.players[index].element], [6, 6, index === 1 ? 1 : 0, 1]);
    assert.equal(state.primaryUsed, true); assert.equal(canEnhance(state), false); assert.equal(canActivateAura(state), false);
    const selected = selectCard(state, state.players[index].hand[0].id); assert.equal(canCastSelected(selected), false);
    assert.deepEqual([state.players[index].enhancement, state.players[index].auraTurns], [20, 2]);
    assert.equal(state.players[index].discard.length, 1); assertGame(state);
  }
});

test('Loaded reaches seven for Fire-15 Mana or Water-0 extra Flow and is consumed once', () => {
  for (const spellId of ['Fire-15', 'Water-0']) {
    const index = spellId.startsWith('Water') ? 1 : 0;
    const initial = fresh({ first: index, fire: ['Fire-15'], water: ['Water-0'] }); handOf(initial, index, [spellId]);
    Object.assign(initial.players[index], { mana: 0, loaded: 4, loadedPending: 2 });
    const pending = cast(initial, spellId);
    assert.deepEqual([pending.players[index].loaded, pending.pendingSpell.loadedBonus], [0, 4]);
    assert.equal(validateSavedGame(JSON.parse(JSON.stringify(pending))), true);
    const state = complete(pending, [1, 2]);
    assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.loadedBonus, state.lastRoll.total], [3, 4, 7]);
    assert.deepEqual([state.players[index].mana, state.players[index].loaded, state.players[index].loadedPending], [1, 0, 2]);
    assert.equal(state.players[index].element, index === 1 ? 2 : 1);
    assert.equal(state.players[index].discard.length, 1); assertGame(state);
  }
});

test('on-cast Water Mana and conditional Fire Mana or extra Flow respect independent caps', () => {
  for (const spellId of ['Fire-15', 'Water-0']) for (const dice of [[3, 3], [3, 4]]) {
    for (const mana of [0, 9, 10]) for (const element of [0, 4, 5]) {
      const index = spellId.startsWith('Water') ? 1 : 0;
      const initial = fresh({ first: index, fire: ['Fire-15'], water: ['Water-0'] }); handOf(initial, index, [spellId]);
      Object.assign(initial.players[index], { mana, element, loadedPending: 2, enhancement: 30, auraTurns: 2 });
      const state = complete(cast(initial, spellId), dice), gain = dice[1] === 4 ? 1 : 0;
      assert.deepEqual([state.players[index].mana, state.players[index].element], [Math.min(10, mana + (index === 1 ? 1 : gain)), Math.min(5, element + 1 + (index === 1 ? gain : 0))]);
      assert.deepEqual([state.players[index].loadedPending, state.players[index].enhancement, state.players[index].auraTurns], [2, 30, 2]);
      assert.equal(state.players[index].discard.length, 1); assert.equal(allCards(state.players[index]).length, 30);
      assert.equal(state.primaryUsed, true); assertGame(state);
    }
  }
});

test('rolled resource spells reject all Ember payments and save safely before and after dice', () => {
  for (const spellId of ['Fire-15', 'Water-0']) {
    const index = spellId.startsWith('Water') ? 1 : 0;
    const initial = fresh({ first: index, fire: ['Fire-15'], water: ['Water-0'] }); handOf(initial, index, [spellId]);
    const selected = selectCard(initial, initial.players[index].hand[0].id);
    for (const emberSpend of [-1, 1, .5, '0', NaN]) assert.equal(castSelected(selected, { emberSpend }), selected);
    const pending = castSelected(selected), rolled = roll(pending, [3, 4]);
    for (const state of [pending, rolled]) {
      const saved = JSON.parse(JSON.stringify(state)); assert.equal(validateSavedGame(saved), true); assert.equal(migrateSavedGame(saved), saved);
    }
  }
});

test('a one-slab rolled Water-0 deck resumes without rerolling, replaying gains or fabricating cards', () => {
  let state = createGame(601, { fire: { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 1 }] },
    water: { element: 'water', entries: [{ spellId: 'Water-0', quantity: 1 }] } });
  state = rollInitiative(rollInitiative(state, 0, () => 0), 1, () => .9);
  state = cast(state, 'Water-0');
  const pending = JSON.parse(JSON.stringify(state)); assert.equal(validateSavedGame(pending), true);
  assert.deepEqual([pending.players[1].mana, pending.players[1].element, pending.players[1].hand.length, pending.players[1].discard.length], [4, 0, 1, 0]);
  state = complete(pending, [3, 4]);
  assert.deepEqual([state.players[1].mana, state.players[1].element, state.players[1].hand.length, state.players[1].deck.length, state.players[1].discard.length], [4, 2, 0, 0, 1]);
  const saved = JSON.parse(JSON.stringify(state)), snapshot = structuredClone(saved);
  assert.equal(saved.version, 14); assert.equal(validateSavedGame(saved), true); assert.equal(migrateSavedGame(saved), saved);
  assert.equal(resolveSpell(saved), saved); assert.deepEqual(saved, snapshot);
  state = pass(pass(saved));
  assert.deepEqual([state.players[1].mana, state.players[1].element, state.players[1].hand.length, state.players[1].deck.length, state.players[1].discard.length], [6, 2, 0, 0, 1]);
  assert.equal(allCards(state.players[1]).length, 1); assertGame(state);
});

test('Water-0 grants capped Mana exactly at commitment and reserves its primary before rolling or Fate', () => {
  for (const mana of [0, 9, 10]) for (const flow of [0, 4, 5]) {
    const initial = fresh({ first: 1, water: ['Water-0'] });
    handOf(initial, 1, ['Water-0', 'Water-1']); handOf(initial, 0, ['Fire-1']);
    Object.assign(initial.players[1], { mana, element: flow, loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
    const initialSnapshot = structuredClone(initial), card = initial.players[1].hand[0];
    const selected = selectCard(initial, card.id);
    assert.equal(selected.players[1].mana, mana, 'selection does not earn Mana');
    const committed = castSelected(selected);
    assert.deepEqual(initial, initialSnapshot, 'committing does not mutate the input snapshot');
    assert.deepEqual([committed.phase, committed.primaryUsed, committed.primaryAction], ['rolling', true, 'spell']);
    assert.equal(committed.pendingSpell.manaOnCastApplied, true);
    assert.deepEqual([committed.players[1].mana, committed.players[1].element], [Math.min(10, mana + 1), flow]);
    assert.deepEqual([committed.players[1].loaded, committed.pendingSpell.loadedBonus,
      committed.players[1].loadedPending, committed.players[1].enhancement, committed.players[1].auraTurns], [0, 4, 2, 20, 2]);
    assert.equal(committed.players[1].hand[0].id, card.id); assert.equal(committed.players[1].discard.length, 0);
    for (const repeat of [castSelected, endTurn, beginRefresh, cancelStagedAction]) assert.equal(repeat(committed), committed);
    assert.equal(canEnhance(committed), false); assert.equal(canActivateAura(committed), false);
    const saved = JSON.parse(JSON.stringify(committed));
    assert.equal(validateSavedGame(saved), true); assert.equal(migrateSavedGame(saved), saved);
    assert.equal(saved.players[1].mana, Math.min(10, mana + 1), 'reload grants no second Mana');
    const completeState = complete(saved, [1, 2]);
    assert.deepEqual([completeState.lastRoll.rawTotal, completeState.lastRoll.loadedBonus, completeState.lastRoll.total], [3, 4, 7]);
    assert.deepEqual([completeState.players[1].mana, completeState.players[1].element], [Math.min(10, mana + 1), Math.min(5, flow + 2)]);
    assert.deepEqual([completeState.players[1].loadedPending, completeState.players[1].enhancement, completeState.players[1].auraTurns], [2, 20, 2]);
    assert.equal(completeState.players[1].discard.filter(card => card.spellId === 'Water-0').length, 1);
    assert.equal(resolveSpell(completeState), completeState);
    assert.equal(allCards(completeState.players[1]).length, 30); assertGame(completeState);
  }
});

function emberBookGame(first = 0) {
  const definition = (element, entries) => ({ element, spellbookId: 'spellbook-2', entries: entries.map(([spellId, quantity]) => ({ spellId, quantity })) });
  const decks = {
    fire: definition('fire', [['Fire-11', 2], ['Fire-6', 2], ['Fire-14', 2], ['FAT-001', 1]]),
    water: definition('water', [['Water-9', 3], ['Water-0', 3], ['FAT-002', 1]]),
  };
  let state = createGame(59, decks);
  state = rollInitiative(rollInitiative(state, 0, () => first === 0 ? .9 : 0), 1, () => first === 1 ? .9 : 0);
  handOf(state, 0, ['Fire-11', 'Fire-6', 'Fire-14']);
  handOf(state, 1, ['Water-9', 'Water-0']);
  return state;
}

test('Xineoph uses stored Embers before its gain, and the persistent bank strengthens a later Fire attack', () => {
  let state = emberBookGame(); state.players[0].element = 3;
  state = cast(state, 'Fire-11');
  assert.equal(state.players[0].element, 3, 'casting a normal attack does not spend Embers');
  const saved = structuredClone(state);
  state = complete(migrateSavedGame(saved), [3, 4]);
  assert.deepEqual([state.players[1].hp, state.players[0].element, state.players[0].mana], [88, 5, 2]);
  assert.match(state.log.findLast(entry => entry.type === 'damage').message, /15% Embers = 12 damage/);
  assert.equal(resolveSpell(state), state);
  state = pass(pass(state));
  assert.equal(state.players[0].element, 5, 'the bank survives both players passing');
  state.players[0].mana = 10;
  state = complete(cast(state, 'Fire-6'), [4, 4]);
  assert.deepEqual([state.players[1].hp, state.players[0].element, state.players[0].mana], [53, 5, 5]);
  assert.match(state.log.findLast(entry => entry.type === 'damage').message, /25% Embers = 35 damage/);
  assertGame(state);
});

test('Embers add to Enhancement and Aura once before Shield without amplifying resource gains', () => {
  const initial = emberBookGame();
  Object.assign(initial.players[0], { element: 3, enhancement: 30, auraTurns: 2 });
  initial.players[1].shield = 7;
  const result = complete(cast(initial, 'Fire-11'), [3, 4]);
  // 10 * (1 + .15 + .30 + .10) = 15.5, rounded once to 16; Shield absorbs 7.
  assert.deepEqual([result.players[1].hp, result.players[1].shield], [91, 0]);
  assert.deepEqual([result.players[0].element, result.players[0].mana, result.players[0].enhancement, result.players[0].auraTurns], [5, 2, 0, 2]);
  assert.match(result.log.findLast(entry => entry.type === 'damage').message, /30% Enhancement \+ 10% Aura \+ 15% Embers = 16 damage/);
  assert.equal(resolveSpell(result), result); assertGame(result);
});

test('Sunsetter spends its Ember bank before the roll and never counts the spent bank as percentage power', () => {
  for (const [dice, expectedDamage] of [[[3, 4], 77], [[4, 4], 91]]) {
    const initial = emberBookGame();
    Object.assign(initial.players[0], { mana: 10, element: 5, enhancement: 30, auraTurns: 2 });
    const pending = cast(initial, 'Fire-14');
    assert.deepEqual([pending.players[0].mana, pending.players[0].element, pending.pendingSpell.emberSpent], [2, 0, 5]);
    const restored = migrateSavedGame(structuredClone(pending));
    const result = complete(restored, dice);
    assert.deepEqual([result.players[1].hp, result.players[0].element, result.players[0].enhancement], [100 - expectedDamage, 0, 0]);
    assert.doesNotMatch(result.log.findLast(entry => entry.type === 'damage').message, /% Embers/);
    assert.equal(resolveSpell(result), result); assertGame(result);
  }
});

test('Water uses Flow damage without an Ember percentage and completed pre-Ember results remain historical', () => {
  const water = emberBookGame(1); water.players[1].element = 5;
  const waterResult = complete(cast(water, 'Water-9'), [4, 4]);
  assert.equal(waterResult.players[0].hp, 84);
  assert.equal(waterResult.players[1].element, 5);
  assert.doesNotMatch(waterResult.log.findLast(entry => entry.type === 'damage').message, /% Embers/);
  const fire = emberBookGame(); fire.players[0].element = 3;
  const historical = complete(cast(fire, 'Fire-11'), [3, 4]);
  historical.players[1].hp = 90;
  historical.log.findLast(entry => entry.type === 'damage').message = 'Base 10 + 0% Enhancement + 0% Aura = 10 damage. Water takes 10 damage; 10 HP damage.';
  const snapshot = structuredClone(historical);
  assert.equal(validateSavedGame(historical), true);
  assert.equal(migrateSavedGame(historical), historical);
  assert.equal(resolveSpell(historical), historical);
  assert.deepEqual(historical, snapshot); assertGame(waterResult);
});
