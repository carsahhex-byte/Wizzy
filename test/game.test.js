import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, selectCard, canSelectCard, canCastSelected, getActingPlayerIndex,
  castSelected, castFateSelected, skipFate, rollDice, resolveSpell, endTurn,
  beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh,
  applyDamage, assertGame, validateSavedGame, migrateSavedGame,
  SPELL_CATALOG, SPELL_RULES, DECK_LISTS, DECK_SIZE, SAVE_VERSION, getEmberSpendRange,
} from '../src/game.js';

const pass = (state) => endTurn(endTurn(state));
const allCards = (player) => [...player.hand, ...player.deck, ...player.discard];

// Arrange actual slab instances, preserving ownership and exact deck quantities.
function handOf(state, index, spellIds) {
  const player = state.players[index];
  const pool = allCards(player);
  player.hand = spellIds.map((spellId) => {
    const location = pool.findIndex((card) => card.spellId === spellId);
    assert.notEqual(location, -1, `${spellId} belongs to this deck`);
    return pool.splice(location, 1)[0];
  });
  player.deck = pool; player.discard = [];
  return state;
}

function cast(state, spellId, options) {
  const card = state.players[getActingPlayerIndex(state)].hand.find((entry) => entry.spellId === spellId);
  assert.ok(card, `${spellId} is in hand`);
  return castSelected(selectCard(state, card.id), options);
}

function fate(state, spellIds) {
  for (const spellId of [spellIds].flat()) {
    const card = state.players[getActingPlayerIndex(state)].hand.find((entry) => entry.spellId === spellId && !state.selectedFateCardIds.includes(entry.id));
    assert.ok(card, `${spellId} is in the responder's hand`);
    state = selectCard(state, card.id);
  }
  return castFateSelected(state);
}

function finishRoll(state, dice = [1, 1]) {
  let index = 0;
  return resolveSpell(rollDice(skipFate(skipFate(state)), () => (dice[index++] - 1) / 6));
}

// Published preview fixtures do not run actions from the current engine.
function previewSave() {
  const state = createGame(6); state.version = 3;
  delete state.pendingSpell; delete state.fatePlayer; delete state.lastRoll;
  delete state.primaryUsed; delete state.selectedFateCardIds;
  for (const player of state.players) {
    delete player.loadedPending;
    for (const card of allCards(player)) { card.cost = 0; card.effectPending = true; }
  }
  return state;
}

function versionFourSave(state) {
  const previous = structuredClone(state);
  previous.version = 4;
  delete previous.primaryUsed;
  delete previous.selectedFateCardIds;
  return previous;
}

function sampleSave() {
  const state = previewSave(); state.version = 2;
  for (const player of state.players) {
    const spellId = player.id === 'fire' ? 'fiery-comet' : 'cresting-wave';
    const cards = Array.from({ length: 24 }, (_, copy) => ({
      id: `${player.id}-${spellId}-${copy}`, spellId,
      name: player.id === 'fire' ? 'Fiery Comet' : 'Cresting Wave',
      art: player.id === 'fire' ? 'comet' : 'wave', cost: 0,
      description: 'Spell effect coming soon.', effectPending: true,
    }));
    player.hand = [cards[18], cards[3], cards[15], cards[9]];
    player.deck = cards.filter((card) => !player.hand.includes(card)); player.discard = [];
  }
  return state;
}

function previewPhases(base) {
  const selected = structuredClone(base);
  selected.selectedCardId = selected.players[0].hand.find((card) => card.category !== 'Fate')?.id ?? selected.players[0].hand[0].id;
  const fateState = { ...structuredClone(base), phase: 'fate', pendingCardId: selected.selectedCardId };
  const resolving = { ...structuredClone(fateState), phase: 'resolving' };
  const ending = { ...structuredClone(base), phase: 'end' };
  const refresh = { ...structuredClone(ending), phase: 'refresh', refreshCardIds: [base.players[0].hand[0].id] };
  return [base, selected, fateState, resolving, ending, refresh, { ...structuredClone(ending), phase: 'ready-to-pass' }];
}

test('opening stats, four-card hands and exact 30-slab deck quantities match the PDF lists', () => {
  const state = createGame(7);
  assert.deepEqual([state.round, state.activePlayer, state.phase, SAVE_VERSION, DECK_SIZE], [1, 0, 'main', 8, 30]);
  assert.deepEqual([state.primaryUsed, state.selectedFateCardIds], [false, []]);
  const expectedCounts = {
    fire: { 'FIR-001': 1, 'FIR-002': 2, 'FIR-004': 2, 'FIR-005': 3, 'FIR-006': 3, 'FIR-007': 2, 'FIR-010': 2, 'FIR-011': 3, 'FIR-012': 3, 'FAT-001': 3, 'FAT-002': 2, 'FAT-003': 2, 'NEU-004': 1, 'NEU-003': 1 },
    water: { 'WAT-001': 2, 'WAT-002': 2, 'WAT-003': 1, 'WAT-004': 3, 'WAT-005': 2, 'WAT-006': 2, 'WAT-007': 2, 'WAT-008': 1, 'WAT-009': 3, 'WAT-010': 3, 'NEU-002': 1, 'NEU-004': 1, 'FAT-001': 3, 'FAT-002': 2, 'FAT-003': 2 },
  };
  for (const player of state.players) {
    assert.deepEqual([player.hp, player.maxHp, player.mana, player.shield, player.element, player.loaded, player.loadedPending], [30, 30, 3, 0, 0, 0, 0]);
    assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [4, 26, 0]);
    const cards = allCards(player);
    const counts = Object.fromEntries(Object.keys(expectedCounts[player.id]).map((id) => [id, cards.filter((card) => card.spellId === id).length]));
    assert.deepEqual(counts, expectedCounts[player.id]);
    assert.deepEqual(Object.fromEntries(DECK_LISTS[player.id].map(({ spellId, quantity }) => [spellId, quantity])), expectedCounts[player.id]);
    assert.equal(new Set(cards.map((card) => card.id)).size, 30);
    assert.deepEqual(['Elemental', 'Neutral', 'Fate'].map((category) => cards.filter((card) => card.category === category).length), [21, 2, 7]);
    for (const card of cards) {
      const { id, ...definition } = SPELL_CATALOG[card.spellId];
      for (const [key, value] of Object.entries(definition)) assert.equal(card[key], value);
      assert.match(card.id, new RegExp(`^${player.id}-${id}-[0-2]$`));
      assert.deepEqual([card.cost, card.effectPending, card.description], [card.manaCost, false, card.effectText]);
    }
  }
  assert.deepEqual([state.players[1].name, state.players[1].elementName], ['Water', 'Flow']);
  assertGame(state); assert.deepEqual(createGame(7), state);
  assert.notDeepEqual(createGame(8).players[0].hand, state.players[0].hand);
});

test('source descriptions, mana and category artwork are retained without Earth or Air', () => {
  assert.deepEqual([Object.keys(SPELL_CATALOG).length, Object.keys(SPELL_RULES).length], [29, 26]);
  assert.deepEqual(Object.values(SPELL_CATALOG).filter((s) => ['Earth', 'Air'].includes(s.element)), []);
  assert.equal(SPELL_CATALOG['FIR-011'].effectText, 'Deal 4 damage. Spend up to 2 Embers to deal 2 additional damage per Ember. On a 6+, if no Embers were spent, gain +3 to your next roll and 1 Ember.');
  assert.equal(SPELL_CATALOG['WAT-010'].effectText, 'Deal damage equal to 2 × your Flow. On an 8+, deal damage equal to 3 × your Flow instead.');
  for (const player of createGame(4).players) {
    const cards = allCards(player); const shield = cards.find((card) => card.spellId === 'NEU-004');
    assert.deepEqual([shield.name, shield.category, shield.art], ['Mana Shield', 'Neutral', 'neutralCard']);
    assert.equal(cards.filter((card) => card.art === 'fateCard').length, 7);
    assert.equal(cards.filter((card) => card.art === `${player.id}Card`).length, 21);
  }
});

test('nonrolling spells immediately pay mana, apply effects and discard without Fate or dice', () => {
  const initial = handOf(createGame(2), 0, ['FIR-001', 'FIR-002', 'NEU-004', 'NEU-003']);
  initial.players[1].shield = 1;
  let state = cast(initial, 'FIR-001');
  assert.deepEqual([state.phase, state.players[0].mana, state.players[0].element, state.players[1].hp, state.players[1].shield], ['main', 2, 1, 30, 0]);
  assert.deepEqual([state.pendingCardId, state.pendingSpell, state.fatePlayer, state.lastRoll], [null, null, null, null]);
  assert.equal(initial.players[0].discard.length, 0, 'input is immutable');
  assert.equal(state.primaryUsed, true);
  for (const id of ['FIR-002', 'NEU-004', 'NEU-003']) {
    const selected = selectCard(state, state.players[0].hand.find((card) => card.spellId === id).id);
    assert.equal(canCastSelected(selected), false);
    assert.equal(castSelected(selected), selected, 'no second Elemental or Neutral primary may be paid for');
  }
  const neutral = cast(handOf(createGame(2), 0, ['NEU-004', 'FIR-001']), 'NEU-004');
  assert.deepEqual([neutral.primaryUsed, neutral.players[0].mana, neutral.players[0].shield], [true, 4, 5]);
  assert.equal(canCastSelected(selectCard(neutral, neutral.players[0].hand[0].id)), false);
  assert.deepEqual([state.players[0].mana, state.players[0].element, state.players[0].shield, state.players[0].hand.length, state.players[0].discard.length], [2, 1, 0, 3, 1]);
  assertGame(state);
});

test('unaffordable spells can be inspected but cannot overspend; Fate cannot be played in main', () => {
  const state = handOf(createGame(2), 0, ['FIR-012', 'FAT-001']); const card = state.players[0].hand[0];
  const selected = selectCard(state, card.id);
  assert.equal(canSelectCard(state, card.id), true); assert.equal(canCastSelected(selected), false);
  assert.equal(castSelected(selected), selected); assert.equal(castFateSelected(selected), selected);
  assert.equal(selectCard(selected, card.id).selectedCardId, null);
  for (const id of ['missing', state.players[1].hand[0].id, state.players[0].hand[1].id]) assert.equal(selectCard(state, id), state);
  assert.equal(castSelected(state), state); assertGame(selected);
});

test('rolling spells follow attacker Fate, defender Fate, one 2d6 roll, then effect resolution', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FIR-002', 'FAT-001', 'FAT-002']);
  const card = initial.players[0].hand[0]; const committed = cast(initial, 'FIR-004');
  assert.deepEqual([committed.phase, committed.activePlayer, committed.fatePlayer, committed.selectedCardId, committed.pendingCardId], ['fate', 0, 0, null, card.id]);
  assert.deepEqual([committed.players[0].mana, committed.players[0].hand.length, committed.players[0].discard.length], [1, 4, 0]);
  const defending = skipFate(committed);
  assert.deepEqual([defending.phase, defending.activePlayer, defending.fatePlayer, getActingPlayerIndex(defending)], ['fate', 0, 1, 1]);
  const rolling = skipFate(defending); assert.deepEqual([rolling.phase, rolling.fatePlayer], ['rolling', null]);
  let calls = 0; const rolled = rollDice(rolling, () => [0, 5 / 6][calls++]); assert.equal(calls, 2);
  assert.deepEqual(rolled.lastRoll, { dice: [1, 6], rawTotal: 7, loadedBonus: 0, attackingFate: 0, defendingFate: 0, total: 7, spellId: 'FIR-004', casterIndex: 0 });
  assert.equal(rolled.players[1].hp, 30, 'roll does not execute the spell early');
  const resolved = resolveSpell(rolled);
  assert.deepEqual([resolved.phase, resolved.pendingCardId, resolved.pendingSpell, resolved.players[0].hand.length, resolved.players[0].discard.length], ['main', null, null, 3, 1]);
  assert.deepEqual([resolved.players[1].hp, resolved.players[0].element, resolved.players[0].mana], [27, 1, 1]);
  assert.equal(resolveSpell(resolved), resolved); assert.equal(rollDice(rolled), rolled);
  const second = selectCard(resolved, resolved.players[0].hand[0].id);
  assert.equal(canCastSelected(second), false); assert.equal(castSelected(second), second);
  for (const state of [committed, defending, rolling, rolled, resolved]) assert.equal(state.primaryUsed, true);
  assert.equal(initial.players[0].mana, 3);
  for (const state of [committed, defending, rolling, rolled, resolved]) assertGame(state);
});

test('Fate, rolling and resolving prevent regular spells, End Turn and refresh', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FIR-002']); const attacking = cast(initial, 'FIR-004');
  const defending = skipFate(attacking); const rolling = skipFate(defending); const resolving = rollDice(rolling, () => 0.5);
  for (const state of [attacking, defending, rolling, resolving]) {
    for (const action of [castSelected, endTurn, beginRefresh, confirmRefresh, cancelRefresh]) assert.equal(action(state), state);
    assert.equal(toggleRefreshCard(state, state.players[0].hand[0].id), state);
    assert.equal(selectCard(state, state.players[0].hand[1].id), state); assertGame(state);
  }
  assert.equal(resolveSpell(attacking), attacking); assert.equal(resolveSpell(rolling), rolling);
  assert.equal(rollDice(attacking), attacking); assert.equal(skipFate(rolling), rolling);
});

test('eligible Fate slabs are selected together, stack and automatically advance each response', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FAT-001', 'FAT-001', 'FAT-001', 'FAT-003']);
  handOf(initial, 1, ['FAT-002', 'FAT-002', 'FAT-003', 'FAT-003', 'WAT-001']); initial.players[0].loaded = 3;
  let state = cast(initial, 'FIR-004'); assert.equal(canSelectCard(state, state.players[1].hand[0].id), false);
  const ids = state.players[0].hand.slice(1).map((card) => card.id);
  for (const id of ids) {
    state = selectCard(state, id); assert.equal(canCastSelected(state), true);
    assert.equal(state.fatePlayer, 0, 'selection alone does not advance'); assertGame(state);
  }
  assert.deepEqual(state.selectedFateCardIds, ids);
  const toggled = selectCard(state, ids[1]); assert.deepEqual(toggled.selectedFateCardIds, [ids[0], ids[2], ids[3]]);
  state = castFateSelected(state); assert.deepEqual([state.fatePlayer, state.selectedCardId, state.selectedFateCardIds], [1, null, []]); assertGame(state);
  assert.equal(canSelectCard(state, state.players[1].hand.at(-1).id), false);
  state = fate(state, ['FAT-002', 'FAT-002', 'FAT-003', 'FAT-003']);
  assert.deepEqual([state.phase, state.fatePlayer, state.selectedFateCardIds], ['rolling', null, []]);
  assert.deepEqual([state.pendingSpell.attackingFate, state.pendingSpell.defendingFate, state.players[0].discard.length, state.players[1].discard.length], [14, -12, 4, 4]);
  assert.equal(state.players[1].mana, 3); state = rollDice(state, () => 0);
  assert.equal(state.lastRoll.total, 7, '2 raw +3 Loaded +14 attacking −12 defending');
  state = resolveSpell(state); assert.deepEqual(state.players.map((p) => p.discard.length), [5, 4]); assertGame(state);
});

test('Fortune is attack-only, Misfortune defense-only, and modified roll totals may be negative', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FAT-002', 'FAT-003']);
  handOf(initial, 1, ['FAT-001', 'FAT-002', 'FAT-002', 'FAT-003', 'FAT-003']);
  let state = cast(initial, 'FIR-004'); assert.equal(canSelectCard(state, state.players[0].hand[1].id), false);
  state = skipFate(state); assert.equal(canSelectCard(state, state.players[1].hand[0].id), false);
  state = fate(state, ['FAT-002', 'FAT-002', 'FAT-003', 'FAT-003']);
  state = rollDice(state, () => 0); assert.equal(state.lastRoll.total, -10); assertGame(state);
  assert.equal(resolveSpell(state).players[0].element, 1, 'negative roll still resolves the base effect');
});

test('skipping Fate drops all selections without casting; an empty batch cannot advance', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FAT-001', 'FAT-003']); handOf(initial, 1, ['FAT-002', 'FAT-003']);
  let state = cast(initial, 'FIR-004'); assert.equal(castFateSelected(state), state);
  for (const card of state.players[0].hand.slice(1)) state = selectCard(state, card.id);
  const deselected = selectCard(selectCard(state, state.selectedFateCardIds[0]), state.selectedFateCardIds[1]);
  assert.deepEqual([deselected.selectedFateCardIds, deselected.selectedCardId], [[], null]);
  assert.equal(canCastSelected(deselected), false); assert.equal(castFateSelected(deselected), deselected);
  state = skipFate(state);
  assert.deepEqual([state.fatePlayer, state.selectedCardId, state.selectedFateCardIds, state.pendingSpell.attackingFate], [1, null, [], 0]);
  assert.deepEqual([state.players[0].hand.length, state.players[0].discard.length], [3, 0]);
  state = selectCard(state, state.players[1].hand[0].id); state = skipFate(state);
  assert.deepEqual([state.phase, state.selectedFateCardIds, state.players[1].hand.length, state.players[1].discard.length], ['rolling', [], 2, 0]);
  assertGame(state);
});

test('Fate does not spend the defender’s upcoming primary; primary limits persist until an actual pass', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FIR-002', 'FAT-001']); handOf(initial, 1, ['FAT-002', 'WAT-001']);
  let state = fate(skipFate(cast(initial, 'FIR-004')), 'FAT-002');
  state = resolveSpell(rollDice(state, () => 0)); assert.equal(state.primaryUsed, true);
  const ending = endTurn(state); assert.equal(ending.primaryUsed, true);
  const refreshing = beginRefresh(ending); assert.equal(refreshing.primaryUsed, true);
  state = endTurn(refreshing); assert.deepEqual([state.activePlayer, state.primaryUsed], [1, false]);
  state = cast(state, 'WAT-001'); assert.deepEqual([state.primaryUsed, state.players[1].discard.length], [true, 2]);
  state = pass(state); assert.deepEqual([state.activePlayer, state.primaryUsed], [0, false]);
  state = cast(state, 'FIR-002'); assert.equal(state.primaryUsed, true); assert.equal(state.players[0].discard.length, 2); assertGame(state);
});

test('invalid random samples cannot create impossible dice or reroll a completed roll', () => {
  const rolling = skipFate(skipFate(cast(handOf(createGame(2), 0, ['FIR-010']), 'FIR-010')));
  for (const value of [-1, 1, NaN, Infinity]) assert.equal(rollDice(rolling, () => value), rolling);
  for (const [value, dice] of [[0, [1, 1]], [0.999999, [6, 6]]]) {
    const state = rollDice(rolling, () => value); assert.deepEqual(state.lastRoll.dice, dice);
    assert.equal(rollDice(state, () => { throw new Error('must not call rng'); }), state); assertGame(state);
  }
});

test('Loaded earned this turn activates next own turn and its first roll consumes it', () => {
  let state = handOf(createGame(2), 0, ['FIR-007', 'FIR-010', 'FIR-010']); state = cast(state, 'FIR-007');
  assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [0, 3]);
  const blocked = cast(state, 'FIR-010'); assert.equal(blocked.pendingSpell, null); assert.equal(blocked.primaryUsed, true);
  state = pass(state); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [0, 3]);
  state = pass(state); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [3, 0]);
  assert.equal(state.primaryUsed, false);
  const pending = cast(state, 'FIR-010'); assert.deepEqual([pending.pendingSpell.loadedBonus, pending.players[0].loaded], [3, 0]);
  state = finishRoll(pending, [2, 2]); assert.equal(state.lastRoll.total, 7); assert.equal(state.players[0].loaded, 0); assertGame(state);
});

test('new Loaded queues independently; unused eligible Loaded expires when End Turn first opens refresh', () => {
  let state = pass(handOf(createGame(2), 1, ['WAT-003', 'NEU-002', 'WAT-006', 'WAT-002'])); state.players[1].loaded = 4;
  state = cast(state, 'WAT-003');
  assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending, state.lastRoll], [4, 2, null]);
  state = endTurn(state); assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending], [0, 2]);
  state = pass(endTurn(state)); assert.deepEqual([state.activePlayer, state.players[1].loaded, state.players[1].loadedPending], [1, 2, 0]);
  state = cast(state, 'WAT-006'); assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending], [2, 2]);
  state = pass(pass(state));
  const pending = cast(state, 'WAT-002'); assert.deepEqual([pending.pendingSpell.loadedBonus, pending.players[1].loadedPending], [2, 0]);
  state = finishRoll(pending); assert.equal(state.lastRoll.total, 4); assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending], [0, 0]); assertGame(state);
});

test('Ember spending is reserved before Fate; invalid choices fail and Sunsetter spends all automatically', () => {
  const initial = handOf(createGame(2), 0, ['FIR-011', 'FIR-012']); initial.players[0].mana = 10; initial.players[0].element = 3;
  const selected = selectCard(initial, initial.players[0].hand[0].id);
  for (const amount of [-1, 3, 0.5, NaN]) assert.equal(castSelected(selected, { emberSpend: amount }), selected);
  const inferno = castSelected(selected, { emberSpend: 2 });
  assert.deepEqual([inferno.players[0].mana, inferno.players[0].element, inferno.pendingSpell.emberSpent], [7, 1, 2]);
  let state = finishRoll(inferno, [6, 6]); assert.deepEqual([state.players[1].hp, state.players[0].element, state.players[0].loadedPending], [22, 1, 0]);
  state = pass(pass(state));
  state = cast(state, 'FIR-012', { emberSpend: 0 }); assert.deepEqual([state.players[0].element, state.pendingSpell.emberSpent, state.players[0].mana], [0, 1, 5]);
  state = finishRoll(state, [6, 6]); assert.equal(state.players[1].hp, 14);
  assert.deepEqual(getEmberSpendRange('FIR-011', 5), { min: 0, max: 2, mandatory: false });
  assert.deepEqual(getEmberSpendRange('FIR-012', 5), { min: 5, max: 5, mandatory: true }); assertGame(state);
});

test('successful zero-Ember Inferno queues Loaded after its roll, never modifies its own roll', () => {
  const state = finishRoll(cast(handOf(createGame(2), 0, ['FIR-011']), 'FIR-011'), [3, 3]);
  assert.deepEqual([state.players[0].element, state.players[0].loaded, state.players[0].loadedPending, state.lastRoll.total], [1, 0, 3, 6]); assertGame(state);
});

test('self-damage consumes Shield; self-lethal Burn discards normally and awards the opponent victory', () => {
  const initial = handOf(createGame(2), 0, ['FIR-006', 'FIR-006']); initial.players[0].shield = 6;
  let state = finishRoll(cast(initial, 'FIR-006'), [6, 6]); assert.deepEqual([state.players[0].shield, state.players[0].hp, state.players[0].element], [0, 29, 4]);
  state = pass(pass(state)); state.players[0].hp = 5; state = finishRoll(cast(state, 'FIR-006'));
  assert.deepEqual([state.status, state.winner, state.players[0].hp, state.players[1].hp, state.players[0].discard.length], ['finished', 1, 0, 30, 2]);
  assert.deepEqual([state.pendingCardId, state.pendingSpell, state.fatePlayer], [null, null, null]); assertGame(state);
});

test('lethal immediate and rolled spells conserve slabs and lock every action', () => {
  const instant = handOf(createGame(2), 0, ['FIR-001']); instant.players[1].hp = 1;
  const rolling = handOf(createGame(2), 0, ['FIR-004']); rolling.players[1].hp = 3;
  for (const state of [cast(instant, 'FIR-001'), finishRoll(cast(rolling, 'FIR-004'))]) {
    assert.deepEqual([state.status, state.winner, state.phase, state.players[0].discard.length], ['finished', 0, 'main', 1]);
    for (const action of [castSelected, castFateSelected, skipFate, rollDice, resolveSpell, endTurn, beginRefresh, cancelRefresh, confirmRefresh]) assert.equal(action(state), state);
    assert.equal(selectCard(state, state.players[1].hand[0].id), state); assert.equal(toggleRefreshCard(state, state.players[1].hand[0].id), state);
    assert.equal(applyDamage(state, 0, 100), state); assertGame(state);
  }
});

test('damage helper absorbs Shield, rejects invalid amounts and cleans committed slabs on victory', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004']); initial.players[1].shield = 3;
  let state = applyDamage(initial, 1, 5); assert.deepEqual([state.players[1].shield, state.players[1].hp], [0, 28]); assert.equal(initial.players[1].shield, 3);
  for (const amount of [-1, 0, NaN, Infinity, 1.5, '5']) assert.equal(applyDamage(state, 1, amount), state);
  assert.equal(applyDamage(state, 2, 5), state); state = applyDamage(cast(state, 'FIR-004'), 1, 100);
  assert.deepEqual([state.status, state.winner, state.pendingCardId, state.players[0].discard.length], ['finished', 0, null, 1]); assertGame(state);
});

test('opening turns keep their hands; 2 mana and mandatory draw happen only on subsequent own turns', () => {
  let state = handOf(createGame(2), 0, ['FIR-001']); handOf(state, 1, ['WAT-001']); state = cast(state, 'FIR-001');
  const ending = endTurn(state); assert.deepEqual([ending.phase, ending.activePlayer, ending.selectedCardId], ['end', 0, null]);
  state = endTurn(ending); assert.deepEqual([state.activePlayer, state.round, state.players[1].hand.length], [1, 1, 1]);
  assert.deepEqual(state.players.map((p) => p.mana), [2, 3]); state = pass(cast(state, 'WAT-001'));
  assert.deepEqual([state.activePlayer, state.round, state.players[0].hand.length], [0, 2, 5]); assert.deepEqual(state.players.map((p) => p.mana), [4, 2]);
  state = pass(state); assert.deepEqual([state.activePlayer, state.round, state.players[1].hand.length], [1, 2, 5]); assert.deepEqual(state.players.map((p) => p.mana), [4, 4]); assertGame(state);
});

test('refresh selects any number of own cards, executes once and immediately passes', () => {
  const initial = createGame(4); let state = beginRefresh(endTurn(initial));
  assert.equal(selectCard(state, state.players[0].hand[0].id), state);
  assert.equal(toggleRefreshCard(state, state.players[1].hand[0].id), state);
  const [first, second] = state.players[0].hand; state = toggleRefreshCard(toggleRefreshCard(state, first.id), second.id);
  assert.deepEqual(state.refreshCardIds, [first.id, second.id]); state = toggleRefreshCard(state, second.id); assert.deepEqual(state.refreshCardIds, [first.id]);
  state = confirmRefresh(toggleRefreshCard(state, second.id));
  assert.deepEqual([state.phase, state.activePlayer, state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], ['main', 1, 5, 23, 2]);
  assert.deepEqual(state.players[0].discard.map((c) => c.id), [first.id, second.id]);
  for (const action of [beginRefresh, confirmRefresh, castSelected]) assert.equal(action(state), state);
  assert.equal(initial.players[0].discard.length, 0); assert.equal(state.primaryUsed, false); assertGame(state);
});

test('refresh supports zero, all, cancellation and exhausted towers without inventing slabs', () => {
  const ending = endTurn(createGame(3)); const selecting = toggleRefreshCard(beginRefresh(ending), ending.players[0].hand[0].id);
  const cancelled = cancelRefresh(selecting); assert.deepEqual([cancelled.phase, cancelled.refreshCardIds, cancelled.players], ['end', [], ending.players]);
  const zero = confirmRefresh(beginRefresh(cancelled)); assert.deepEqual([zero.players[0].hand.length, zero.players[0].deck.length, zero.players[0].discard.length], [5, 25, 0]);
  let all = beginRefresh(ending); for (const card of all.players[0].hand) all = toggleRefreshCard(all, card.id);
  all = confirmRefresh(all); assert.deepEqual([all.players[0].hand.length, all.players[0].deck.length, all.players[0].discard.length], [5, 21, 4]);
  const empty = createGame(4); empty.players[0].discard.push(...empty.players[0].deck.splice(0));
  let state = beginRefresh(endTurn(empty)); state = confirmRefresh(toggleRefreshCard(state, state.players[0].hand[0].id));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], [3, 0, 27]); assert.match(state.log.findLast((entry) => entry.type === 'refresh').message, /Spell Tower is empty/);
  for (const s of [zero, all, state, pass(pass(state))]) assertGame(s);
});

test('End Turn during refresh skips selected discards and immediately passes without refreshing', () => {
  const initial = cast(handOf(createGame(4), 0, ['FIR-001', 'FIR-002', 'FAT-001']), 'FIR-001');
  const selecting = toggleRefreshCard(beginRefresh(endTurn(initial)), initial.players[0].hand[0].id);
  const next = endTurn(selecting);
  assert.deepEqual([next.phase, next.activePlayer, next.primaryUsed, next.refreshCardIds], ['main', 1, false, []]);
  assert.deepEqual(next.players[0], selecting.players[0], 'skipping never draws or discards the selected slabs');
  assert.equal(next.log.some((entry) => entry.type === 'refresh'), false); assertGame(next);
});

test('saved games round-trip every phase including selected defender Fate and completed dice', () => {
  const main = handOf(createGame(2), 0, ['FIR-004', 'FAT-001']); handOf(main, 1, ['FAT-002']);
  const attacking = cast(main, 'FIR-004'); const defending = fate(attacking, 'FAT-001');
  const selected = selectCard(defending, defending.players[1].hand[0].id); const rolling = castFateSelected(selected);
  const resolving = rollDice(rolling, () => 0.9); const resolved = resolveSpell(resolving);
  const ending = endTurn(main); const refresh = toggleRefreshCard(beginRefresh(ending), main.players[0].hand[0].id);
  for (const state of [main, attacking, defending, selected, rolling, resolving, resolved, ending, refresh, confirmRefresh(refresh)]) {
    const saved = JSON.parse(JSON.stringify(state)); assert.equal(validateSavedGame(saved), true, state.phase); assert.equal(migrateSavedGame(saved), saved);
  }
});

test('saved primary usage locks a reloaded turn and all selected Fate slabs survive reload', () => {
  const main = handOf(createGame(2), 0, ['FIR-001', 'FIR-002']);
  const saved = JSON.parse(JSON.stringify(cast(main, 'FIR-001')));
  const restored = migrateSavedGame(saved); assert.equal(restored.primaryUsed, true);
  const selected = selectCard(restored, restored.players[0].hand[0].id);
  assert.equal(canCastSelected(selected), false); assert.equal(castSelected(selected), selected);
  let fateState = cast(handOf(createGame(2), 0, ['FIR-004', 'FAT-001', 'FAT-003']), 'FIR-004');
  for (const card of fateState.players[0].hand.slice(1)) fateState = selectCard(fateState, card.id);
  const fateReloaded = migrateSavedGame(JSON.parse(JSON.stringify(fateState)));
  assert.deepEqual(fateReloaded.selectedFateCardIds, fateState.selectedFateCardIds);
  const next = castFateSelected(fateReloaded); assert.deepEqual([next.fatePlayer, next.pendingSpell.attackingFate, next.players[0].discard.length], [1, 6, 2]); assertGame(next);
});

test('validation rejects corrupt quantities, costs, resource timing, Fate ownership and dice context', () => {
  const main = handOf(createGame(2), 0, ['FIR-004', 'FIR-012']);
  const mutations = [
    (s) => { s.players[0].hp = 31; }, (s) => { s.players[0].loadedPending = -1; }, (s) => { s.players[0].deck.pop(); },
    (s) => { s.selectedCardId = s.players[1].hand[0].id; }, (s) => { s.players[0].hand[0].name = '<script>'; },
    (s) => { s.players[0].hand[0].id = s.players[0].hand[1].id; }, (s) => { s.players[0].hand[0].effectText = '999 damage'; },
    (s) => { s.players[0].hand[0].manaCost += 1; }, (s) => { s.players[0].hand[0].cost = 0; }, (s) => { s.players[0].hand[0].effectPending = true; },
    (s) => { [s.players[0].hand[0], s.players[1].hand[0]] = [s.players[1].hand[0], s.players[0].hand[0]]; },
    (s) => { s.pendingCardId = s.players[0].hand[0].id; }, (s) => { s.fatePlayer = 1; }, (s) => { s.phase = 'fate'; },
    (s) => { s.refreshCardIds = [s.players[0].hand[0].id]; }, (s) => { s.phase = 'refresh'; s.refreshCardIds = [s.players[1].hand[0].id]; },
    (s) => { s.phase = 'refresh'; s.refreshCardIds = [s.players[0].hand[0].id, s.players[0].hand[0].id]; },
    (s) => { s.status = 'finished'; s.winner = 1; }, (s) => { s.log[0].type = 'unknown'; },
    (s) => { delete s.primaryUsed; }, (s) => { s.primaryUsed = 'true'; }, (s) => { delete s.selectedFateCardIds; },
    (s) => { s.selectedFateCardIds = [s.players[0].hand[0].id]; },
  ];
  for (const mutate of mutations) { const s = structuredClone(main); mutate(s); assert.equal(validateSavedGame(s), false); }
  const pending = cast(main, 'FIR-004');
  for (const mutate of [
    (s) => { s.pendingSpell.spellId = 'FIR-002'; }, (s) => { s.pendingSpell.emberSpent = 1; },
    (s) => { s.pendingSpell.attackingFate = 4; }, (s) => { s.pendingSpell.attackingFateCardIds = [s.players[0].deck[0].id]; }, (s) => { s.players[0].loaded = 1; },
    (s) => { s.primaryUsed = false; },
  ]) { const s = structuredClone(pending); mutate(s); assert.equal(validateSavedGame(s), false); }
  const resolving = rollDice(skipFate(skipFate(pending)), () => 0);
  for (const mutate of [
    (s) => { s.lastRoll.dice[0] = 7; }, (s) => { s.lastRoll.total = 12; }, (s) => { s.lastRoll.spellId = 'FIR-010'; }, (s) => { s.lastRoll.loadedBonus = 1; },
  ]) { const s = structuredClone(resolving); mutate(s); assert.equal(validateSavedGame(s), false); }
  assert.equal(validateSavedGame(null), false); assert.equal(validateSavedGame({}), false);
});

test('validation rejects duplicate, foreign, ineligible and inconsistent Fate selections', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FAT-001', 'FAT-002', 'FAT-003']); handOf(initial, 1, ['FAT-002']);
  const pending = cast(initial, 'FIR-004');
  const valid = selectCard(pending, pending.players[0].hand[1].id); assertGame(valid);
  for (const mutate of [
    (state) => { state.selectedFateCardIds.push(state.selectedFateCardIds[0]); },
    (state) => { state.selectedFateCardIds = [state.players[1].hand[0].id]; state.selectedCardId = state.selectedFateCardIds[0]; },
    (state) => { state.selectedFateCardIds = [state.players[0].hand[2].id]; state.selectedCardId = state.selectedFateCardIds[0]; },
    (state) => { state.selectedCardId = state.players[0].hand[3].id; },
    (state) => { state.selectedCardId = null; },
    (state) => { state.selectedFateCardIds = []; },
  ]) { const source = structuredClone(valid); mutate(source); assert.equal(validateSavedGame(source), false); }
});

test('v4 upgrades preserve paid spells, Fate, dice, resources and every slab through all phases', () => {
  const base = handOf(createGame(2), 0, ['FIR-004', 'FIR-002', 'FAT-001', 'FAT-003']); handOf(base, 1, ['FAT-002', 'FAT-003', 'WAT-001']);
  Object.assign(base.players[0], { hp: 19, mana: 10, element: 3, loaded: 2, loadedPending: 1 });
  Object.assign(base.players[1], { hp: 23, shield: 4, loadedPending: 3 });
  const attacking = selectCard(cast(base, 'FIR-004'), base.players[0].hand[2].id);
  const defending = castFateSelected(attacking);
  const selected = selectCard(selectCard(defending, base.players[1].hand[0].id), base.players[1].hand[1].id);
  // A published v4 save holds just one selection while keeping earlier Fate in discard.
  const singleSelected = selectCard(defending, base.players[1].hand[0].id);
  const rolling = castFateSelected(selected); const resolving = rollDice(rolling, () => 0.75); const resolved = resolveSpell(resolving);
  const ending = endTurn(resolved); const refresh = toggleRefreshCard(beginRefresh(ending), resolved.players[0].hand[0].id);
  const legacyReady = { ...structuredClone(ending), phase: 'ready-to-pass' };
  const finished = applyDamage(resolved, 1, 100);
  for (const current of [base, attacking, defending, singleSelected, rolling, resolving, resolved, ending, refresh, legacyReady, finished]) {
    const source = versionFourSave(current); const original = structuredClone(source);
    const upgraded = migrateSavedGame(source); assertGame(upgraded); assert.deepEqual(source, original);
    for (const key of ['round', 'activePlayer', 'status', 'winner', 'phase', 'selectedCardId', 'pendingCardId', 'pendingSpell', 'fatePlayer', 'lastRoll', 'refreshCardIds', 'players']) assert.deepEqual(upgraded[key], source[key], key);
    assert.equal(upgraded.primaryUsed, current !== base);
    assert.deepEqual(upgraded.selectedFateCardIds, source.phase === 'fate' && source.selectedCardId ? [source.selectedCardId] : []);
    assert.deepEqual(upgraded.log.slice(0, source.log.length), source.log);
    if (upgraded.phase === 'main' && upgraded.status === 'playing' && upgraded.primaryUsed) {
      const selectedPrimary = selectCard(upgraded, upgraded.players[0].hand[0].id); assert.equal(canCastSelected(selectedPrimary), false);
    }
  }
});

test('v4 migration distinguishes untouched, completed and passed turns and resumes earlier Fate stacks', () => {
  const base = handOf(createGame(2), 0, ['FIR-001', 'FIR-004', 'FAT-001', 'FAT-003']);
  const completed = cast(base, 'FIR-001');
  for (const state of [base, endTurn(base), beginRefresh(endTurn(base)), pass(completed), pass(pass(completed))]) {
    const upgraded = migrateSavedGame(versionFourSave(state)); assertGame(upgraded); assert.equal(upgraded.primaryUsed, false, state.phase);
  }
  for (const state of [completed, endTurn(completed), beginRefresh(endTurn(completed))]) {
    const upgraded = migrateSavedGame(versionFourSave(state)); assertGame(upgraded); assert.equal(upgraded.primaryUsed, true);
  }
  let priorStack = fate(cast(base, 'FIR-004'), 'FAT-001');
  // v4 allowed multiple individual casts before the attacker explicitly skipped.
  priorStack = versionFourSave(priorStack); priorStack.fatePlayer = 0;
  priorStack.selectedCardId = priorStack.players[0].hand.find((card) => card.spellId === 'FAT-003').id;
  let upgraded = migrateSavedGame(priorStack); assertGame(upgraded);
  assert.equal(upgraded.pendingSpell.attackingFate, 4);
  upgraded = castFateSelected(upgraded);
  assert.deepEqual([upgraded.fatePlayer, upgraded.pendingSpell.attackingFate, upgraded.players[0].discard.length], [1, 6, 2]); assertGame(upgraded);
  const cancelledPreview = versionFourSave(base);
  cancelledPreview.log.push({ id: cancelledPreview.log.length + 1, round: 1, type: 'cast', playerId: 'fire', message: 'Fire casts Fireblast. Spell effects are coming soon.' });
  cancelledPreview.log.push({ id: cancelledPreview.log.length + 1, round: 1, type: 'info', playerId: null, message: 'The unfinished preview spell was cancelled without charging mana, spending Embers, discarding it or applying effects.' });
  const untouched = migrateSavedGame(cancelledPreview); assertGame(untouched); assert.equal(untouched.primaryUsed, false, 'cancelled unpaid preview casts do not spend this turn’s primary');
});

test('v4 migration rejects corrupted real-rule resources and pending roll context', () => {
  const pending = versionFourSave(cast(handOf(createGame(2), 0, ['FIR-004']), 'FIR-004'));
  for (const mutate of [
    (state) => { delete state.players[0].loadedPending; },
    (state) => { state.players[0].loadedPending = -1; },
    (state) => { state.pendingSpell.loadedBonus = -1; },
    (state) => { state.pendingSpell.attackingFate = 4; },
    (state) => { state.selectedCardId = state.players[1].hand[0].id; },
    (state) => { state.pendingCardId = state.players[0].deck[0].id; },
  ]) { const source = structuredClone(pending); mutate(source); assert.equal(migrateSavedGame(source), null); }
});

test('v3 upgrades preserve all 30 slabs and stats, cancelling unpaid preview spells without effects', () => {
  const base = previewSave(); Object.assign(base.players[0], { hp: 17, mana: 0, element: 4, loaded: 3 }); Object.assign(base.players[1], { loaded: 2, shield: 5 });
  for (const source of previewPhases(base)) {
    const original = structuredClone(source); const migrated = migrateSavedGame(source); assertGame(migrated); assert.deepEqual(source, original);
    assert.deepEqual([migrated.round, migrated.activePlayer, migrated.status, migrated.winner], [source.round, source.activePlayer, source.status, source.winner]);
    assert.equal(migrated.phase, ['fate', 'resolving'].includes(source.phase) ? 'main' : source.phase);
    for (let index = 0; index < 2; index += 1) {
      const old = source.players[index]; const player = migrated.players[index];
      for (const key of ['hp', 'maxHp', 'mana', 'shield', 'element', 'turnsStarted']) assert.equal(player[key], old[key]);
      assert.equal(player.loaded + player.loadedPending, old.loaded);
      for (const zone of ['hand', 'deck', 'discard']) assert.deepEqual(player[zone].map((c) => c.id), old[zone].map((c) => c.id));
      for (const card of allCards(player)) assert.deepEqual([card.cost, card.effectPending], [card.manaCost, false]);
    }
    assert.deepEqual(migrated.log.slice(0, source.log.length), source.log); assert.equal(migrated.pendingCardId, null); assert.equal(migrated.pendingSpell, null); assert.equal(migrated.lastRoll, null);
    if (['fate', 'resolving'].includes(source.phase)) assert.match(migrated.log.at(-1).message, /cancelled without charging mana/);
    assert.equal(migrateSavedGame(migrated), migrated);
  }
});

test('v2 upgrade keeps the established 24-to-30 mapping, zones, selection and refresh progress', () => {
  for (const source of previewPhases(sampleSave())) {
    const original = structuredClone(source); const migrated = migrateSavedGame(source); assertGame(migrated); assert.deepEqual(source, original);
    for (let i = 0; i < 2; i += 1) { const old = source.players[i]; const player = migrated.players[i]; assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [old.hand.length, old.deck.length + 6, old.discard.length]); }
    assert.equal(migrated.phase, ['fate', 'resolving'].includes(source.phase) ? 'main' : source.phase);
    if (source.selectedCardId) assert.equal(migrated.selectedCardId, migrated.players[0].hand[0].id);
    assert.deepEqual(migrated.refreshCardIds, source.refreshCardIds.map((id) => migrated.players[0].hand[source.players[0].hand.findIndex((card) => card.id === id)].id));
  }
  const migrated = migrateSavedGame(sampleSave()); assert.equal(migrated.players[0].hand[0].id, 'fire-FIR-012-0');
  assert.equal(migrated.players[0].deck.find((c) => c.id === 'fire-FIR-001-0').name, 'Spark Shot');
  assert.deepEqual(migrated.players[0].deck.slice(-6).map((c) => c.id), ['fire-FAT-002-0', 'fire-FAT-002-1', 'fire-FAT-003-0', 'fire-FAT-003-1', 'fire-NEU-004-0', 'fire-NEU-003-0']);
});

test('v1 upgrade preserves progress and selected slab while replacing Earth with Water', () => {
  const source = sampleSave(); source.version = 1; source.activePlayer = 1;
  delete source.phase; delete source.pendingCardId; delete source.refreshCardIds;
  Object.assign(source.players[1], { id: 'earth', name: 'Earth', elementName: 'Runes', mana: 8, element: 3 });
  const ids = { fire: ['spark-shot', 'kindle', 'fortune', 'heatbox', 'mana-shield', 'sunsetter'], earth: ['stone-shot', 'rootbound', 'earth-fortune', 'runestone', 'earth-mana-shield', 'mountain-call'] };
  for (const player of source.players) allCards(player).forEach((card, copy) => { card.id = `${player.id}-${ids[player.id][Math.floor(copy / 4)]}-${copy % 4}`; });
  source.selectedCardId = source.players[1].hand[0].id;
  source.log = source.log.map((entry) => ({ ...entry, playerId: entry.playerId === 'water' ? 'earth' : entry.playerId, message: entry.message.replaceAll('Water', 'Earth') }));
  const migrated = migrateSavedGame(source); assertGame(migrated);
  assert.deepEqual([migrated.players[1].name, migrated.players[1].elementName, migrated.players[1].mana, migrated.players[1].element], ['Water', 'Flow', 8, 3]);
  assert.equal(migrated.selectedCardId, migrated.players[1].hand[0].id); assert.equal(source.players[1].name, 'Earth');
  assert.equal(migrateSavedGame({ version: 1 }), null); source.players[0].deck.pop(); assert.equal(migrateSavedGame(source), null);
});

test('migration rejects corrupt legacy quantities, ownership, definitions and progress', () => {
  const mutations = [
    (s) => { s.players[0].deck.pop(); }, (s) => { s.players[0].hp = 31; }, (s) => { s.round = 0; },
    (s) => { s.players[0].hand[0].id = 'fire-fiery-comet-24'; }, (s) => { s.players[0].hand[0].id = s.players[0].hand[1].id; },
    (s) => { [s.players[0].hand[0], s.players[1].hand[0]] = [s.players[1].hand[0], s.players[0].hand[0]]; },
    (s) => { s.players[0].hand[0].description = 'forged'; }, (s) => { s.players[0].hand[0].cost = 7; },
    (s) => { s.selectedCardId = s.players[1].hand[0].id; }, (s) => { s.phase = 'fate'; s.pendingCardId = s.players[0].deck[0].id; },
    (s) => { s.phase = 'rolling'; }, (s) => { s.phase = 'refresh'; s.refreshCardIds = [s.players[1].hand[0].id]; },
    (s) => { s.log[0].message = null; }, (s) => { s.log[0].type = 'unknown'; },
  ];
  for (const mutate of mutations) { const source = sampleSave(); mutate(source); assert.equal(migrateSavedGame(source), null); }
  const preview = previewSave(); preview.players[0].hand[0].cost = 9; assert.equal(migrateSavedGame(preview), null);
  const current = createGame(6); current.players[0].deck.pop(); assert.equal(migrateSavedGame(current), null);
  assert.equal(migrateSavedGame({ version: 99 }), null);
});

test('Water instant spells use existing Flow, award it once after effects and preserve it through reload', () => {
  let state = pass(handOf(createGame(17), 1, ['WAT-001', 'WAT-006', 'NEU-004', 'FAT-001']));
  state.players[1].element = 3;
  state = cast(state, 'WAT-001');
  assert.deepEqual([state.players[0].hp, state.players[1].element, state.players[1].mana, state.phase, state.primaryUsed], [26, 4, 2, 'main', true]);
  const damageIndex = state.log.findLastIndex((entry) => entry.type === 'damage');
  const gainIndex = state.log.findLastIndex((entry) => entry.type === 'resource' && entry.message.includes('Flow'));
  assert.ok(damageIndex < gainIndex, 'damage precedes the post-resolution Flow gain');
  const restored = migrateSavedGame(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.equal(resolveSpell(restored), restored, 'a resolved saved spell cannot grant Flow twice');
  state = pass(pass(restored));
  assert.equal(state.players[1].element, 4, 'passing turns does not award Flow');
  state = cast(state, 'WAT-006');
  assert.deepEqual([state.players[0].hp, state.players[1].element], [20, 5]);
  assertGame(state);
});

test('Water Flow stays unchanged through both Fate batches and rolling until the spell resolves', () => {
  const initial = handOf(createGame(18), 1, ['WAT-009', 'FAT-001', 'FAT-003', 'WAT-001']);
  handOf(initial, 0, ['FAT-002', 'FAT-003']);
  let state = pass(initial); state.players[1].element = 2;
  state = cast(state, 'WAT-009');
  assert.equal(state.players[1].element, 2);
  state = fate(state, ['FAT-001', 'FAT-003']);
  assert.equal(state.players[1].element, 2, 'attacking Fate does not award Flow');
  state = fate(state, ['FAT-002', 'FAT-003']);
  assert.equal(state.players[1].element, 2, 'defending Fate does not award Flow');
  state = rollDice(state, () => 0.99);
  assert.deepEqual([state.phase, state.lastRoll.total, state.players[1].element], ['resolving', 12, 2]);
  state = resolveSpell(state);
  assert.deepEqual([state.players[0].hp, state.players[1].element], [17, 3], 'Tsunami deals 2 + old Flow + 9, then gains 1 Flow');
  const ending = endTurn(state); assert.equal(ending.players[1].element, 3);
  const refreshing = beginRefresh(ending); assert.equal(refreshing.players[1].element, 3);
  const passed = confirmRefresh(refreshing); assert.equal(passed.players[1].element, 3);
  assertGame(passed);
});

test('Pacific replaces the default gain and all Water spells respect the Flow cap', () => {
  for (const [flow, dice, expected] of [[0, [1, 1], 2], [0, [6, 6], 3], [3, [1, 1], 5], [4, [6, 6], 5], [5, [6, 6], 5]]) {
    let state = pass(handOf(createGame(19), 1, ['WAT-002'])); state.players[1].element = flow;
    state = finishRoll(cast(state, 'WAT-002'), dice);
    assert.equal(state.players[1].element, expected, `Pacific from ${flow} on ${dice}`);
    assertGame(state);
  }
  let capped = pass(handOf(createGame(20), 1, ['WAT-006'])); capped.players[1].element = 5;
  capped = cast(capped, 'WAT-006');
  assert.deepEqual([capped.players[0].hp, capped.players[1].element], [23, 5]); assertGame(capped);
});

test('Water casting Neutral or defending with Fate does not gain Flow', () => {
  let state = pass(handOf(createGame(21), 1, ['NEU-004', 'FAT-002', 'WAT-001'])); state.players[1].element = 3;
  state = cast(state, 'NEU-004'); assert.equal(state.players[1].element, 3);
  state = pass(state);
  // Bring an actual Fire rolling slab into hand while preserving all quantities.
  handOf(state, 0, ['FIR-004']);
  state = skipFate(cast(state, 'FIR-004'));
  state = fate(state, 'FAT-002'); assert.equal(state.players[1].element, 3);
  state = resolveSpell(rollDice(state, () => 0)); assert.equal(state.players[1].element, 3); assertGame(state);
});

test('current save validation caps both Fire Embers and Water Flow at five', () => {
  const state = createGame(22); state.players[0].element = 5; state.players[1].element = 5;
  assertGame(state);
  state.players[0].element = 6; assert.equal(validateSavedGame(state), false);
  state.players[0].element = 5;
  state.players[1].element = 6; assert.equal(validateSavedGame(state), false);
  state.players[1].element = -1; assert.equal(validateSavedGame(state), false);
});

test('v5 Flow upgrade preserves every phase, selection, slab and resource while capping saved Water Flow', () => {
  const base = handOf(createGame(23), 1, ['WAT-009', 'WAT-001', 'FAT-001', 'FAT-003']);
  handOf(base, 0, ['FAT-002', 'FAT-003']);
  let main = pass(base); Object.assign(main.players[1], { element: 4, mana: 12, loaded: 2, loadedPending: 3 });
  const attacking = selectCard(selectCard(cast(main, 'WAT-009'), main.players[1].hand[2].id), main.players[1].hand[3].id);
  const defending = castFateSelected(attacking);
  const selected = selectCard(selectCard(defending, base.players[0].hand[0].id), base.players[0].hand[1].id);
  const rolling = castFateSelected(selected);
  const resolving = rollDice(rolling, () => 0.5);
  const resolved = resolveSpell(resolving);
  const ending = endTurn(resolved);
  const refreshing = toggleRefreshCard(beginRefresh(ending), resolved.players[1].hand[0].id);
  const finished = applyDamage(resolved, 0, 100);
  for (const current of [main, attacking, defending, selected, rolling, resolving, resolved, ending, refreshing, finished]) {
    const source = structuredClone(current); source.version = 5; source.players[1].element = 9;
    const original = structuredClone(source); const upgraded = migrateSavedGame(source);
    assertGame(upgraded); assert.equal(upgraded.version, SAVE_VERSION); assert.equal(upgraded.players[1].element, 5);
    const expected = structuredClone(source); expected.players[1].element = 5;
    for (const key of ['round', 'activePlayer', 'status', 'winner', 'phase', 'primaryUsed', 'selectedCardId', 'selectedFateCardIds', 'pendingCardId', 'pendingSpell', 'fatePlayer', 'lastRoll', 'refreshCardIds', 'players']) assert.deepEqual(upgraded[key], expected[key], key);
    assert.deepEqual(upgraded.log.slice(0, source.log.length), source.log);
    assert.ok(upgraded.log.some((entry) => /capped from 9 to 5/.test(entry.message)));
    assert.deepEqual(source, original, 'migration never mutates the previous saved game');
    assert.equal(migrateSavedGame(upgraded), upgraded, 'reloading does not award more Flow');
  }
});

test('v5 Flow upgrade validates its primary allowance and selected Fate before migration', () => {
  const base = handOf(createGame(24), 1, ['WAT-009', 'FAT-001', 'FAT-003']);
  const main = pass(base); const pending = cast(main, 'WAT-009');
  const selected = selectCard(pending, main.players[1].hand[1].id);
  for (const mutate of [
    (s) => { delete s.primaryUsed; },
    (s) => { s.primaryUsed = false; },
    (s) => { delete s.selectedFateCardIds; },
    (s) => { s.selectedFateCardIds.push(s.selectedFateCardIds[0]); },
    (s) => { s.selectedFateCardIds = [s.players[0].hand[0].id]; s.selectedCardId = s.selectedFateCardIds[0]; },
    (s) => { s.selectedCardId = null; },
    (s) => { s.players[1].element = -1; },
  ]) {
    const source = structuredClone(selected); source.version = 5; mutate(source);
    assert.equal(migrateSavedGame(source), null);
  }
});

test('older v3 and v4 saves cap both elemental stores without changing HP or other progress', () => {
  const preview = previewSave(); preview.players[0].element = 11; preview.players[1].element = 8;
  const older = versionFourSave(createGame(25)); older.players[0].element = 12; older.players[1].element = 7;
  for (const source of [preview, older]) {
    const migrated = migrateSavedGame(source); assertGame(migrated);
    assert.deepEqual(migrated.players.map((p) => p.element), [5, 5]);
    assert.deepEqual(migrated.players.map((p) => p.hp), source.players.map((p) => p.hp));
  }
});

// Custom lists deliberately use a different Elemental/Neutral/Fate split.
function customDeck(element) {
  const elemental = element === 'fire'
    ? ['FIR-001', 'FIR-002', 'FIR-003', 'FIR-004', 'FIR-005']
    : ['WAT-001', 'WAT-002', 'WAT-003', 'WAT-004', 'WAT-006'];
  const shared = element === 'fire'
    ? ['NEU-001', 'NEU-002', 'NEU-004', 'FAT-001', 'FAT-003']
    : ['NEU-001', 'NEU-002', 'NEU-004', 'FAT-002', 'FAT-003'];
  return { element, entries: [...elemental, ...shared].map((spellId) => ({ spellId, quantity: 3 })) };
}

test('custom Fire and Water compositions deal exactly the chosen 30 slabs without composition quotas', () => {
  const configs = { fire: customDeck('fire'), water: customDeck('water') };
  const original = structuredClone(configs);
  const state = createGame(31, configs);
  assertGame(state); assert.deepEqual(configs, original);
  for (const player of state.players) {
    assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [4, 26, 0]);
    assert.deepEqual([player.hp, player.mana, player.element, player.loaded], [30, 3, 0, 0]);
    assert.deepEqual(['Elemental', 'Neutral', 'Fate'].map((category) => allCards(player).filter((card) => card.category === category).length), [15, 9, 6]);
    for (const { spellId, quantity } of configs[player.id].entries) {
      assert.equal(allCards(player).filter((card) => card.spellId === spellId).length, quantity);
    }
    assert.equal(new Set(allCards(player).map((card) => card.id)).size, 30);
    assert.notEqual(player.deckDefinition, configs[player.id]);
    assert.notEqual(player.deckDefinition.entries, configs[player.id].entries);
  }
  configs.fire.entries[0].quantity = 1;
  assert.equal(state.players[0].deckDefinition.entries.find((entry) => entry.spellId === 'FIR-001').quantity, 3);
});

test('custom deck shuffles are deterministic independently of editor entry order and optional defaults remain starters', () => {
  const fire = customDeck('fire');
  const left = createGame(32, { fire });
  const right = createGame(32, { fire: { ...fire, entries: fire.entries.toReversed() } });
  assert.deepEqual(left, right);
  assert.deepEqual(left.players[1], createGame(32, { fire }).players[1]);
  assert.deepEqual(Object.fromEntries(left.players[1].deckDefinition.entries.map(({ spellId, quantity }) => [spellId, quantity])),
    Object.fromEntries(DECK_LISTS.water.map(({ spellId, quantity }) => [spellId, quantity])));
  assert.notDeepEqual(allCards(left.players[0]).map((card) => card.id), allCards(createGame(33, { fire }).players[0]).map((card) => card.id));
});

test('custom-deck spells, Fate, dice, resource timing and reloads work through all combat and refresh phases', () => {
  const base = handOf(createGame(34, { fire: customDeck('fire'), water: customDeck('water') }), 0, ['NEU-001', 'FIR-003', 'FIR-004', 'FAT-001', 'FAT-003']);
  handOf(base, 1, ['WAT-001', 'FAT-002', 'FAT-003', 'NEU-004']);
  base.players[0].mana = 10;
  let state = cast(base, 'NEU-001');
  assert.deepEqual([state.players[0].shield, state.players[0].loadedPending, state.players[0].discard.length, state.primaryUsed], [3, 2, 1, true]);
  state = pass(state); state = pass(cast(state, 'WAT-001'));
  assert.deepEqual([state.players[0].shield, state.players[0].loaded, state.players[1].element], [2, 2, 1]);
  const attacking = cast(state, 'FIR-004');
  const selected = selectCard(selectCard(attacking, attacking.players[0].hand.find((card) => card.spellId === 'FAT-001').id), attacking.players[0].hand.find((card) => card.spellId === 'FAT-003').id);
  const defending = castFateSelected(selected);
  const defenderSelected = selectCard(selectCard(defending, defending.players[1].hand.find((card) => card.spellId === 'FAT-002').id), defending.players[1].hand.find((card) => card.spellId === 'FAT-003').id);
  const rolling = castFateSelected(defenderSelected);
  const resolving = rollDice(rolling, () => .5);
  const resolved = resolveSpell(resolving);
  assert.deepEqual([resolved.lastRoll.total, resolved.players[1].hp, resolved.players[0].element], [10, 27, 2]);
  const ending = endTurn(resolved);
  const refreshing = toggleRefreshCard(beginRefresh(ending), resolved.players[0].hand[0].id);
  for (const current of [base, state, attacking, selected, defending, defenderSelected, rolling, resolving, resolved, ending, refreshing, confirmRefresh(refreshing)]) {
    assertGame(current);
    const saved = JSON.parse(JSON.stringify(current));
    assert.equal(validateSavedGame(saved), true, current.phase);
    assert.equal(migrateSavedGame(saved), saved);
    assert.deepEqual(saved.players.map((player) => player.deckDefinition), base.players.map((player) => player.deckDefinition));
    for (const player of saved.players) assert.equal(allCards(player).length, 30);
  }
});

test('creation rejects incomplete, over-copy, mixed-element and mismatched custom decks', () => {
  const incomplete = customDeck('fire'); incomplete.entries[0].quantity = 2;
  const overCopy = customDeck('fire'); overCopy.entries[0].quantity = 4; overCopy.entries[1].quantity = 2;
  const mixed = customDeck('fire'); mixed.entries[0].spellId = 'WAT-001';
  const unknown = customDeck('fire'); unknown.entries[0].spellId = '???';
  for (const fire of [incomplete, overCopy, mixed, unknown, customDeck('water'), null, undefined]) {
    assert.throws(() => createGame(35, { fire }));
  }
  for (const configs of [null, [], new Date(), { earth: customDeck('fire') }]) assert.throws(() => createGame(35, configs));
});

test('custom save validation checks deck identity and exact owned quantities after cards move zones', () => {
  const base = createGame(36, { fire: customDeck('fire'), water: customDeck('water') });
  const mutations = [
    (s) => { delete s.players[0].deckDefinition; },
    (s) => { s.players[0].deckDefinition = customDeck('water'); },
    (s) => { s.players[0].deckDefinition.entries[0].quantity = 4; s.players[0].deckDefinition.entries[1].quantity = 2; },
    (s) => { s.players[0].deckDefinition.entries[0].spellId = 'WAT-001'; },
    (s) => { s.players[0].deckDefinition.entries[0].quantity = 2; },
    (s) => { s.players[0].deckDefinition.entries[0].quantity = 2; s.players[0].deckDefinition.entries.push({ spellId: 'FIR-006', quantity: 1 }); },
    (s) => { s.players[0].deckDefinition.entries.push(s.players[0].deckDefinition.entries[0]); },
  ];
  for (const mutate of mutations) {
    const source = structuredClone(base); mutate(source);
    assert.equal(validateSavedGame(source), false);
    assert.equal(migrateSavedGame(source), null);
  }
});

test('v6 starter duels migrate every phase without replacing cards, resources or paid pending decisions', () => {
  const base = handOf(createGame(37), 0, ['FIR-004', 'FIR-002', 'FAT-001', 'FAT-003']);
  handOf(base, 1, ['FAT-002', 'FAT-003', 'WAT-001']);
  base.players[0].mana = 10; base.players[1].element = 4;
  const attacking = cast(base, 'FIR-004');
  const selected = selectCard(selectCard(attacking, base.players[0].hand[2].id), base.players[0].hand[3].id);
  const defending = castFateSelected(selected);
  const rolling = skipFate(defending); const resolving = rollDice(rolling, () => .5); const resolved = resolveSpell(resolving);
  const ended = endTurn(resolved); const refresh = toggleRefreshCard(beginRefresh(ended), resolved.players[0].hand[0].id);
  for (const current of [base, attacking, selected, defending, rolling, resolving, resolved, ended, refresh, confirmRefresh(refresh), applyDamage(resolved, 1, 100)]) {
    const previous = structuredClone(current); previous.version = 6;
    for (const player of previous.players) delete player.deckDefinition;
    const original = structuredClone(previous);
    const upgraded = migrateSavedGame(previous); assertGame(upgraded);
    assert.equal(upgraded.version, SAVE_VERSION);
    for (const key of ['round', 'activePlayer', 'phase', 'status', 'winner', 'primaryUsed', 'selectedCardId', 'selectedFateCardIds', 'pendingCardId', 'pendingSpell', 'fatePlayer', 'lastRoll', 'refreshCardIds']) assert.deepEqual(upgraded[key], previous[key], key);
    upgraded.players.forEach((player, index) => {
      const { deckDefinition, ...progress } = player;
      assert.deepEqual(progress, previous.players[index]);
      assert.equal(deckDefinition.element, player.id);
      assert.deepEqual(Object.fromEntries(deckDefinition.entries.map(({ spellId, quantity }) => [spellId, quantity])), Object.fromEntries(DECK_LISTS[player.id].map(({ spellId, quantity }) => [spellId, quantity])));
    });
    assert.deepEqual(upgraded.log.slice(0, previous.log.length), previous.log);
    assert.deepEqual(previous, original);
  }
  for (const mutate of [
    (s) => { s.players[1].element = 6; },
    (s) => { s.players[0].hand[0].name = 'Forged spell'; },
    (s) => { s.selectedFateCardIds = [s.players[0].hand[1].id]; },
  ]) {
    const previous = structuredClone(selected); previous.version = 6;
    for (const player of previous.players) delete player.deckDefinition;
    mutate(previous); assert.equal(migrateSavedGame(previous), null);
  }
});

test('Fire capped gains can be spent and earned again without repeating on reload or passing', () => {
  const base = handOf(createGame(40), 0, ['FIR-002', 'FIR-002', 'FIR-012']);
  base.players[0].element = 4; base.players[0].mana = 20;
  let state = cast(base, 'FIR-002');
  assert.equal(state.players[0].element, 5);
  assert.match(state.log.findLast(entry => entry.type === 'resource').message, /gains 1 Ember \(maximum 5\)/);
  const saved = JSON.parse(JSON.stringify(state)); assert.equal(migrateSavedGame(saved), saved);
  state = pass(pass(saved)); assert.equal(state.players[0].element, 5);
  state = cast(state, 'FIR-012');
  assert.deepEqual([state.players[0].element, state.pendingSpell.emberSpent], [0, 5]);
  state = finishRoll(state, [6, 6]);
  assert.deepEqual([state.players[0].element, state.players[1].hp], [0, 2]);
  state = pass(pass(state)); state = cast(state, 'FIR-002');
  assert.equal(state.players[0].element, 2);
  assertGame(state);
});

test('v7 custom duels retain every phase and committed resource while excess stored Embers cap at five', () => {
  const base = handOf(createGame(41, { fire: customDeck('fire'), water: customDeck('water') }), 0, ['FIR-004', 'FIR-002', 'FAT-001', 'FAT-003']);
  handOf(base, 1, ['FAT-002', 'FAT-003', 'WAT-001']);
  Object.assign(base.players[0], { hp: 22, mana: 12, element: 4, loaded: 2, loadedPending: 3 });
  base.players[1].element = 4;
  const attacking = cast(base, 'FIR-004');
  const selected = selectCard(selectCard(attacking, base.players[0].hand[2].id), base.players[0].hand[3].id);
  const defending = castFateSelected(selected);
  const defenderSelected = selectCard(defending, base.players[1].hand[0].id);
  const rolling = castFateSelected(defenderSelected); const resolving = rollDice(rolling, () => .5); const resolved = resolveSpell(resolving);
  const ended = endTurn(resolved); const refresh = toggleRefreshCard(beginRefresh(ended), resolved.players[0].hand[0].id);
  for (const current of [base, attacking, selected, defending, defenderSelected, rolling, resolving, resolved, ended, refresh, confirmRefresh(refresh), applyDamage(resolved, 1, 100)]) {
    const previous = structuredClone(current); previous.version = 7; previous.players[0].element = 9;
    const original = structuredClone(previous); const upgraded = migrateSavedGame(previous); assertGame(upgraded);
    assert.equal(upgraded.version, SAVE_VERSION);
    const expected = structuredClone(previous); expected.players[0].element = 5;
    for (const key of ['round', 'activePlayer', 'phase', 'status', 'winner', 'primaryUsed', 'selectedCardId', 'selectedFateCardIds', 'pendingCardId', 'pendingSpell', 'fatePlayer', 'lastRoll', 'refreshCardIds', 'players']) assert.deepEqual(upgraded[key], expected[key], key);
    assert.deepEqual(upgraded.log.slice(0, previous.log.length), previous.log);
    assert.match(upgraded.log.at(-1).message, /capped from 9 to 5/);
    assert.deepEqual(previous, original);
    assert.equal(migrateSavedGame(upgraded), upgraded);
  }
});

test('v7 migration validates custom decks and preserves already-paid pre-cap Ember spells', () => {
  const base = createGame(42, { fire: customDeck('fire') }); base.version = 7; base.players[0].element = 9;
  for (const mutate of [
    state => { delete state.players[0].deckDefinition; },
    state => { state.players[0].deckDefinition.entries[0].quantity = 4; },
    state => { state.players[0].deckDefinition.entries[0].spellId = 'WAT-001'; },
    state => { state.players[0].element = -1; },
  ]) { const previous = structuredClone(base); mutate(previous); assert.equal(migrateSavedGame(previous), null); }
  // Old Sunsetter already paid its cost before the cap update. Do not charge it
  // again, refund it, or silently discard a legitimate pending spell on reload.
  const before = handOf(createGame(43), 0, ['FIR-012']); before.players[0].mana = 10; before.players[0].element = 9;
  const pending = cast(before, 'FIR-012'); pending.version = 7;
  const upgraded = migrateSavedGame(pending); assertGame(upgraded);
  assert.deepEqual(upgraded.pendingSpell, pending.pendingSpell);
  assert.equal(upgraded.pendingSpell.emberSpent, 9);
  assert.equal(upgraded.players[0].element, 0);
  assert.equal(finishRoll(upgraded).players[1].hp, 0);
});
