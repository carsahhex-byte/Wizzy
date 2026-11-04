import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, selectCard, castSelected, skipFate, resolveSpell, endTurn,
  beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh,
  applyDamage, assertGame, validateSavedGame, migrateSavedGame,
} from '../src/game.js';

const castFirst = (state) => castSelected(selectCard(state, state.players[state.activePlayer].hand[0].id));
const resolveFirst = (state) => resolveSpell(skipFate(castFirst(state)));
const pass = (state) => endTurn(endTurn(state));

test('Fire and Water open with required stats, four cards, correct sample spells and conserved decks', () => {
  const state = createGame(7);
  assert.deepEqual([state.round, state.activePlayer, state.phase, state.version], [1, 0, 'main', 2]);
  assert.equal(state.players[1].name, 'Water');
  assert.equal(state.players[1].elementName, 'Flow');
  for (const player of state.players) {
    assert.deepEqual([player.hp, player.maxHp, player.mana, player.shield, player.element, player.loaded], [30, 30, 3, 0, 0, 0]);
    assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [4, 20, 0]);
    assert.ok(player.hand.every((card) => card.name === (player.id === 'fire' ? 'Fiery Comet' : 'Cresting Wave')));
  }
  assertGame(state);
  assert.deepEqual(createGame(7), state);
  assert.notDeepEqual(createGame(8).players[0].hand, state.players[0].hand);
});

test('casting waits for Skip Fate and complete resolution before discarding or permitting actions', () => {
  const initial = createGame(9);
  const card = initial.players[0].hand[0];
  const selected = selectCard(initial, card.id);
  const fate = castSelected(selected);
  assert.deepEqual([fate.phase, fate.selectedCardId, fate.pendingCardId], ['fate', null, card.id]);
  assert.deepEqual([fate.players[0].hand.length, fate.players[0].discard.length], [4, 0]);
  assert.equal(initial.selectedCardId, null);
  for (const action of [castSelected, endTurn, beginRefresh, confirmRefresh, resolveSpell]) assert.equal(action(fate), fate);
  assert.equal(selectCard(fate, fate.players[0].hand[1].id), fate);
  assert.equal(toggleRefreshCard(fate, fate.players[0].hand[1].id), fate);
  assertGame(fate);
  const resolving = skipFate(fate);
  assert.equal(resolving.phase, 'resolving');
  assert.equal(endTurn(resolving), resolving);
  assert.equal(skipFate(resolving), resolving);
  assert.equal(selectCard(resolving, card.id), resolving);
  assertGame(resolving);
  const resolved = resolveSpell(resolving);
  assert.deepEqual([resolved.phase, resolved.pendingCardId, resolved.players[0].hand.length, resolved.players[0].discard.length], ['main', null, 3, 1]);
  assert.equal(resolved.players[0].discard[0].id, card.id);
  assert.deepEqual([resolved.players[0].mana, resolved.players[1].hp], [3, 30]);
  assert.match(resolved.log.at(-1).message, /effect and dice rules are pending/);
  assert.equal(resolveSpell(resolved), resolved, 'cannot resolve twice');
  assert.equal(fate.players[0].discard.length, 0, 'resolution does not mutate input');
  assertGame(resolved);
});

test('invalid casts and selections are harmless, selection toggles, and future costs cannot overspend', () => {
  const state = createGame(1);
  assert.equal(castSelected(state), state);
  assert.equal(selectCard(state, 'missing'), state);
  assert.equal(selectCard(state, state.players[1].hand[0].id), state);
  const selected = selectCard(state, state.players[0].hand[0].id);
  assert.equal(selectCard(selected, selected.selectedCardId).selectedCardId, null);
  const unaffordable = structuredClone(selected);
  unaffordable.players[0].hand[0].cost = 4;
  assert.equal(castSelected(unaffordable), unaffordable);
});

test('End Turn first reveals refresh without passing, then passes on a second click', () => {
  const initial = selectCard(createGame(2), createGame(2).players[0].hand[0].id);
  const ending = endTurn(initial);
  assert.deepEqual([ending.phase, ending.activePlayer, ending.selectedCardId], ['end', 0, null]);
  assert.equal(castSelected(ending), ending);
  assert.equal(selectCard(ending, ending.players[0].hand[0].id), ending);
  assertGame(ending);
  const next = endTurn(ending);
  assert.deepEqual([next.phase, next.activePlayer, next.round], ['main', 1, 1]);
  assert.equal(next.players[1].hand.length, 4);
  assert.equal(initial.phase, 'main');
  assertGame(next);
});

test('both opening turns stay at four; next round grants mana and refills only the active wizard', () => {
  let state = resolveFirst(createGame(2));
  state = pass(state);
  assert.equal(state.players[1].hand.length, 4);
  assert.deepEqual(state.players.map((player) => player.mana), [3, 3]);
  state = resolveFirst(state);
  state = pass(state);
  assert.deepEqual([state.round, state.activePlayer], [2, 0]);
  assert.deepEqual(state.players.map((player) => player.mana), [5, 5]);
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length], [5, 18]);
  assert.equal(state.players[1].hand.length, 3);
  state = pass(state);
  assert.deepEqual([state.players[1].hand.length, state.players[1].deck.length], [5, 18]);
  assert.equal(state.round, 2);
  assertGame(state);
});

test('multiple spells can fully resolve in a turn; start-of-turn drawing never exceeds five', () => {
  let state = createGame(13);
  while (state.players[0].hand.length) state = resolveFirst(state);
  assert.equal(state.players[0].discard.length, 4);
  state = pass(pass(state));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length], [5, 15]);
  state = pass(pass(state));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length], [5, 15]);
  assertGame(state);
});

test('refresh selects multiple own cards, toggles selection, discards them and draws to five once', () => {
  const initial = createGame(4);
  let state = beginRefresh(endTurn(initial));
  assert.equal(state.phase, 'refresh');
  assert.equal(endTurn(state), state, 'cannot pass mid-selection');
  assert.equal(selectCard(state, state.players[0].hand[0].id), state, 'cannot cast while refreshing');
  assert.equal(toggleRefreshCard(state, state.players[1].hand[0].id), state);
  const [first, second] = state.players[0].hand;
  state = toggleRefreshCard(state, first.id);
  state = toggleRefreshCard(state, second.id);
  assert.deepEqual(state.refreshCardIds, [first.id, second.id]);
  state = toggleRefreshCard(state, second.id);
  assert.deepEqual(state.refreshCardIds, [first.id]);
  state = toggleRefreshCard(state, second.id);
  assertGame(state);
  const refreshed = confirmRefresh(state);
  assert.deepEqual([refreshed.phase, refreshed.players[0].hand.length, refreshed.players[0].deck.length, refreshed.players[0].discard.length], ['ready-to-pass', 5, 17, 2]);
  assert.equal(refreshed.activePlayer, 0, 'show refreshed hand before passing');
  assert.deepEqual(refreshed.players[0].discard.map((card) => card.id), [first.id, second.id]);
  assert.equal(beginRefresh(refreshed), refreshed, 'refresh cannot repeat this turn');
  assert.equal(confirmRefresh(refreshed), refreshed);
  assert.equal(castSelected(refreshed), refreshed);
  assert.equal(initial.players[0].discard.length, 0);
  assert.equal(endTurn(refreshed).activePlayer, 1);
  assertGame(refreshed);
});

test('refresh accepts zero or all cards and cancellation preserves the original hand', () => {
  const ending = endTurn(createGame(3));
  let selecting = beginRefresh(ending);
  selecting = toggleRefreshCard(selecting, selecting.players[0].hand[0].id);
  const cancelled = cancelRefresh(selecting);
  assert.equal(cancelled.phase, 'end');
  assert.deepEqual(cancelled.refreshCardIds, []);
  assert.deepEqual(cancelled.players, ending.players);
  const zero = confirmRefresh(beginRefresh(cancelled));
  assert.deepEqual([zero.players[0].hand.length, zero.players[0].deck.length, zero.players[0].discard.length], [5, 19, 0]);
  selecting = beginRefresh(ending);
  for (const card of selecting.players[0].hand) selecting = toggleRefreshCard(selecting, card.id);
  const all = confirmRefresh(selecting);
  assert.deepEqual([all.players[0].hand.length, all.players[0].deck.length, all.players[0].discard.length], [5, 15, 4]);
  assertGame(zero);
  assertGame(all);
});

test('empty towers do not invent cards or recycle discards during normal draws or refresh', () => {
  let state = createGame(5);
  for (let turn = 0; turn < 20; turn += 1) {
    while (state.players[state.activePlayer].hand.length) state = resolveFirst(state);
    state = pass(state);
    assertGame(state);
  }
  for (const player of state.players) assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [0, 0, 24]);
  state = confirmRefresh(beginRefresh(endTurn(state)));
  assert.equal(state.players[state.activePlayer].hand.length, 0);
  assert.match(state.log.at(-1).message, /Spell Tower is empty/);
  assertGame(state);
});

test('refresh with an exhausted tower keeps remaining cards and draws only the available number', () => {
  let state = createGame(11);
  const player = state.players[0];
  player.discard.push(...player.deck.splice(0, 18));
  assert.equal(player.deck.length, 2);
  state = beginRefresh(endTurn(state));
  for (const card of state.players[0].hand.slice(0, 3)) state = toggleRefreshCard(state, card.id);
  state = confirmRefresh(state);
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], [3, 0, 21]);
  assertGame(state);
});

test('damage consumes shield before HP, clamps lethal damage, and locks every action after victory', () => {
  const initial = createGame(4);
  initial.players[1].shield = 3;
  let state = applyDamage(initial, 1, 5);
  assert.deepEqual([state.players[1].shield, state.players[1].hp], [0, 28]);
  assert.equal(initial.players[1].shield, 3);
  state = applyDamage(castFirst(state), 1, 100);
  assert.deepEqual([state.players[1].hp, state.status, state.winner, state.phase, state.pendingCardId], [0, 'finished', 0, 'main', null]);
  for (const action of [castSelected, skipFate, resolveSpell, endTurn, beginRefresh, cancelRefresh, confirmRefresh]) assert.equal(action(state), state);
  assert.equal(selectCard(state, state.players[0].hand[0].id), state);
  assert.equal(toggleRefreshCard(state, state.players[0].hand[0].id), state);
  assert.equal(applyDamage(state, 0, 100), state);
  assertGame(state);
});

test('damage rejects invalid amounts and targets', () => {
  const state = createGame(4);
  for (const amount of [-1, 0, NaN, Infinity, 1.5, '5']) assert.equal(applyDamage(state, 1, amount), state);
  assert.equal(applyDamage(state, 2, 5), state);
});

test('save validation round-trips every phase and rejects corrupt phase/card/zone invariants', () => {
  const main = createGame(6);
  const fate = castFirst(main);
  const resolving = skipFate(fate);
  const ending = endTurn(main);
  const refresh = toggleRefreshCard(beginRefresh(ending), main.players[0].hand[0].id);
  const ready = confirmRefresh(refresh);
  for (const state of [main, fate, resolving, ending, refresh, ready]) assert.equal(validateSavedGame(JSON.parse(JSON.stringify(state))), true);
  const mutations = [
    (s) => { s.players[0].hp = 31; },
    (s) => { s.players[0].deck.pop(); },
    (s) => { s.selectedCardId = s.players[1].hand[0].id; },
    (s) => { s.players[0].hand[0].name = '<script>'; },
    (s) => { s.players[0].hand[0].id = s.players[0].hand[1].id; },
    (s) => { s.pendingCardId = s.players[0].hand[0].id; },
    (s) => { s.phase = 'fate'; },
    (s) => { s.refreshCardIds = [s.players[0].hand[0].id]; },
    (s) => { s.phase = 'refresh'; s.refreshCardIds = [s.players[1].hand[0].id]; },
    (s) => { s.phase = 'refresh'; s.refreshCardIds = [s.players[0].hand[0].id, s.players[0].hand[0].id]; },
    (s) => { s.status = 'finished'; s.winner = 1; },
  ];
  for (const mutate of mutations) { const broken = structuredClone(main); mutate(broken); assert.equal(validateSavedGame(broken), false); }
  assert.equal(validateSavedGame(null), false);
  assert.equal(validateSavedGame({}), false);
});

test('v1 migration preserves stats, zones, progress and selection while replacing Earth with Water', () => {
  const legacy = structuredClone(pass(resolveFirst(createGame(6))));
  legacy.version = 1;
  delete legacy.phase; delete legacy.pendingCardId; delete legacy.refreshCardIds;
  const selectedOldId = legacy.players[1].hand[0].id.replace('water-', 'earth-');
  legacy.selectedCardId = selectedOldId;
  legacy.players[1].id = 'earth'; legacy.players[1].name = 'Earth'; legacy.players[1].elementName = 'Runes';
  legacy.players[1].mana = 8; legacy.players[1].element = 3;
  for (const zone of ['hand', 'deck', 'discard']) for (const card of legacy.players[1][zone]) card.id = card.id.replace('water-', 'earth-');
  legacy.log = legacy.log.map((entry) => ({ ...entry, playerId: entry.playerId === 'water' ? 'earth' : entry.playerId, message: entry.message.replaceAll('Water', 'Earth') }));
  const migrated = migrateSavedGame(legacy);
  assertGame(migrated);
  assert.equal(migrated.players[1].name, 'Water');
  assert.equal(migrated.players[1].elementName, 'Flow');
  assert.deepEqual([migrated.players[1].mana, migrated.players[1].element], [8, 3]);
  assert.deepEqual([migrated.round, migrated.activePlayer, migrated.players[0].hand.length, migrated.players[0].discard.length], [1, 1, 3, 1]);
  assert.equal(migrated.selectedCardId, migrated.players[1].hand[0].id);
  assert.equal(legacy.players[1].name, 'Earth', 'migration does not mutate source');
  assert.equal(migrateSavedGame(migrated), migrated);
  assert.equal(migrateSavedGame({ version: 1 }), null);
  legacy.players[0].deck.pop();
  assert.equal(migrateSavedGame(legacy), null);
});
