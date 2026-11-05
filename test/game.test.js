import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, canSelectCard, canCastSelected, canPlayFate, getActingPlayerIndex,
  castSelected, castFateSelected, skipFate, rollDice, resolveSpell, endTurn,
  beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh, applyDamage,
  assertGame, validateSavedGame, migrateSavedGame, SPELL_CATALOG, SPELL_RULES, SAVE_VERSION, DECK_SIZE,
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
function fateFixture() {
  const state = fresh({ fire: ['FAT-001', 'FAT-003', 'FAT-003'], water: ['FAT-002', 'FAT-002', 'FAT-003'] });
  handOf(state, 0, ['Fire-1', 'FAT-001', 'FAT-003', 'FAT-003']);
  handOf(state, 1, ['Water-1', 'FAT-002', 'FAT-002', 'FAT-003']);
  return state;
}

test('replacement catalog has 31 spells, 28 rolling primary slabs and no old IDs', () => {
  assert.equal(SAVE_VERSION, 10); assert.equal(DECK_SIZE, 30);
  assert.equal(Object.keys(SPELL_CATALOG).length, 31);
  assert.equal(Object.keys(SPELL_RULES).length, 28);
  for (const element of ['Fire', 'Water']) for (let index = 1; index <= 14; index += 1) {
    assert.ok(SPELL_CATALOG[`${element}-${index}`]);
    assert.equal(SPELL_RULES[`${element}-${index}`].requiresRoll, true);
  }
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

test('custom decks open at 100 HP, 3 mana and exactly four slabs, with deterministic shuffling', () => {
  const decks = { fire: fixtureDeck('fire'), water: fixtureDeck('water') };
  const state = createGame(17, decks);
  assert.equal(state.phase, 'initiative');
  for (const player of state.players) {
    assert.deepEqual([player.hp, player.maxHp, player.mana, player.shield, player.element, player.loaded, player.loadedPending], [100, 100, 3, 0, 0, 0, 0]);
    assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [4, 26, 0]);
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
    assert.deepEqual([state.activePlayer, state.round, state.players[1 - first].hand.length, state.players[1 - first].mana], [1 - first, 1, 5, 3]);
    assert.equal(state.secondPlayerOpeningDrawPending, false);
    state = pass(state);
    assert.deepEqual([state.activePlayer, state.round, state.players[first].mana, state.players[first].hand.length], [first, 2, 5, 5]);
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
  assert.deepEqual(state.pendingSpell.fateHistory.map(entry => [entry.step, entry.action]), [['defender-first', 'auto-skip'], ['attacker', 'auto-skip']]);
  assert.equal(state.players[1].hp, 100); assertGame(state);
  state = resolveSpell(state);
  assert.deepEqual([state.phase, state.players[1].hp, state.players[0].element, state.players[0].discard.length], ['main', 94, 1, 1]);
  assert.equal(resolveSpell(state), state); assertGame(state);
});

test('defender responds first to visible dice and only role-eligible Fate can be selected', () => {
  let state = fateFixture();
  const attackerCard = state.players[0].hand.find(card => card.spellId === 'FAT-001');
  state = roll(cast(state, 'Fire-1'), [4, 4]);
  assert.deepEqual([state.phase, state.fatePlayer, getActingPlayerIndex(state), state.pendingSpell.fateStep], ['fate', 1, 1, 'defender-first']);
  assert.equal(state.lastRoll.total, 8); assert.equal(canSelectCard(state, attackerCard.id), false);
  assert.equal(resolveSpell(state), state); assert.equal(endTurn(state), state); assertGame(state);
});

test('defender cast then attacker skip ends immediately without a second defender response', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'), [4, 4]);
  state = fate(state, ['FAT-002']);
  assert.deepEqual([state.fatePlayer, state.pendingSpell.fateStep, state.lastRoll.total], [0, 'attacker', 4]);
  assertGame(state); state = skipFate(state);
  assert.equal(state.phase, 'resolving');
  assert.equal(state.pendingSpell.fateHistory.length, 2);
  assert.equal(state.players[1].hand.filter(card => card.spellId === 'FAT-002').length, 1);
  state = resolveSpell(state);
  assert.deepEqual([state.players[0].element, state.players[1].hp], [0, 94]); assertGame(state);
});

test('attacker casting enables one final defender response, then the spell resolves', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'), [3, 4]);
  state = skipFate(state); assert.equal(state.fatePlayer, 0);
  state = fate(state, ['FAT-001']);
  assert.deepEqual([state.fatePlayer, state.pendingSpell.fateStep, state.lastRoll.total], [1, 'defender-final', 11]); assertGame(state);
  state = fate(state, ['FAT-002']);
  assert.equal(state.phase, 'resolving'); assert.equal(state.lastRoll.total, 7);
  assert.equal(state.pendingSpell.fateHistory.length, 3); assertGame(state);
  state = resolveSpell(state); assert.equal(state.players[0].element, 1); assertGame(state);
});

test('final defender prompt is skipped automatically if their eligible Fate is exhausted', () => {
  let state = fresh({ fire: ['FAT-001'], water: ['FAT-002', 'FAT-001'] });
  handOf(state, 0, ['Fire-1', 'FAT-001']); handOf(state, 1, ['Water-1', 'FAT-002', 'FAT-001']);
  state = fate(roll(cast(state, 'Fire-1')), ['FAT-002']);
  state = fate(state, ['FAT-001']);
  assert.equal(state.phase, 'resolving');
  assert.equal(state.pendingSpell.fateHistory.at(-1).step, 'defender-final');
  assert.equal(state.pendingSpell.fateHistory.at(-1).action, 'auto-skip'); assertGame(state);
});

test('multiple Fate slabs stack in a batch and raw dice and Loaded never change', () => {
  let state = fateFixture(); state.players[0].loaded = 3;
  state = roll(cast(state, 'Fire-1'), [5, 5]);
  state = fate(state, ['FAT-002', 'FAT-002', 'FAT-003']);
  assert.equal(state.lastRoll.total, 3);
  state = fate(state, ['FAT-001', 'FAT-003']);
  assert.equal(state.phase, 'resolving');
  assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.loadedBonus, state.lastRoll.attackingFate, state.lastRoll.defendingFate, state.lastRoll.total], [10, 3, 6, -10, 9]);
  assert.deepEqual(state.lastRoll.dice, [5, 5]); assert.equal(state.pendingSpell.fatePlays.length, 5); assertGame(state);
  state = resolveSpell(state); assert.equal(state.players[0].element, 1); assertGame(state);
});

test('Twist supports either sign for either role, with directions tracked in save data', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'), [3, 4]);
  state = fate(state, ['FAT-003'], 2);
  assert.equal(state.lastRoll.defendingFate, 2); assert.equal(state.lastRoll.total, 9); assertGame(state);
  state = fate(state, ['FAT-003'], -2);
  assert.equal(state.lastRoll.attackingFate, -2); assert.equal(state.lastRoll.total, 7); assertGame(state);
  state = skipFate(state); assert.equal(state.phase, 'resolving'); assertGame(state);
});

test('multiple selected Twists can choose different directions within one batch', () => {
  let state = roll(cast(fateFixture(), 'Fire-1'));
  state = skipFate(state);
  const cards = state.players[0].hand.filter(card => card.spellId === 'FAT-003');
  for (const card of cards) state = selectCard(state, card.id);
  state = castFateSelected(state, { twistDirections: { [cards[0].id]: 2, [cards[1].id]: -2 } });
  assert.equal(state.lastRoll.attackingFate, 0); assert.equal(state.pendingSpell.attackingFateCardIds.length, 2); assertGame(state);
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

test('Fate selection toggles whole batches and cannot spend the primary slot a second time', () => {
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

test('a second player who used Fate draws one extra slab rather than refilling to five', () => {
  let state = fresh({ fire: ['FAT-001'], water: ['FAT-002', 'FAT-002'] });
  handOf(state, 0, ['Fire-1']); handOf(state, 1, ['Water-1', 'FAT-002', 'FAT-002', 'Water-2']);
  state = fate(roll(cast(state, 'Fire-1')), ['FAT-002', 'FAT-002']);
  state = resolveSpell(state);
  assert.equal(state.players[1].hand.length, 2);
  state = pass(state); assert.equal(state.players[1].hand.length, 3); assert.equal(state.players[1].mana, 3); assertGame(state);
});

test('Loaded bonuses apply to the next own turn and expire unused at its end', () => {
  let state = handOf(fresh(), 0, ['Fire-4', 'Fire-1']); state.players[0].mana = 10;
  state = complete(cast(state, 'Fire-4'), [4, 4]);
  assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [0, 2]);
  state = pass(state); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [0, 2]);
  state = pass(state); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [2, 0]);
  const ending = endTurn(state); assert.equal(ending.players[0].loaded, 0); assertGame(ending);
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
  assert.deepEqual([state.activePlayer, state.phase, state.players[0].hand.length, state.players[0].discard.length, state.primaryUsed], [1, 'main', 5, 2, false]); assertGame(state);
  const zero = confirmRefresh(beginRefresh(endTurn(afterCast)));
  assert.deepEqual([zero.players[0].hand.length, zero.players[0].discard.length, zero.activePlayer], [5, 1, 1]); assertGame(zero);
});

test('empty towers never fabricate cards or reshuffle the discard pile', () => {
  let state = fresh();
  for (const player of state.players) { player.discard.push(...player.deck, ...player.hand.splice(1)); player.deck = []; }
  state = pass(pass(state));
  for (const player of state.players) assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [1, 0, 29]);
  state = confirmRefresh(toggleRefreshCard(beginRefresh(endTurn(state)), state.players[0].hand[0].id));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], [0, 0, 30]); assertGame(state);
});

test('every post-roll response step and selected batch round-trips through saved-state validation', () => {
  const main = fateFixture(), casted = cast(main, 'Fire-1'), defender = roll(casted);
  const selected = selectCard(defender, defender.players[1].hand.find(card => card.spellId === 'FAT-003').id);
  const attacker = castFateSelected(selected, { twistDirections: { [selected.selectedCardId]: 2 } });
  const final = fate(attacker, ['FAT-001']), resolving = skipFate(final), resolved = resolveSpell(resolving);
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
