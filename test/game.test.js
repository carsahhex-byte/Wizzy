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

function fate(state, spellId) {
  const card = state.players[getActingPlayerIndex(state)].hand.find((entry) => entry.spellId === spellId);
  assert.ok(card, `${spellId} is in the responder's hand`);
  return castFateSelected(selectCard(state, card.id));
}

function finishRoll(state, dice = [1, 1]) {
  let index = 0;
  return resolveSpell(rollDice(skipFate(skipFate(state)), () => (dice[index++] - 1) / 6));
}

// Published preview fixtures do not run actions from the current engine.
function previewSave() {
  const state = createGame(6); state.version = 3;
  delete state.pendingSpell; delete state.fatePlayer; delete state.lastRoll;
  for (const player of state.players) {
    delete player.loadedPending;
    for (const card of allCards(player)) { card.cost = 0; card.effectPending = true; }
  }
  return state;
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
  assert.deepEqual([state.round, state.activePlayer, state.phase, SAVE_VERSION, DECK_SIZE], [1, 0, 'main', 4, 30]);
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
  for (const id of ['FIR-002', 'NEU-004', 'NEU-003']) state = cast(state, id);
  assert.deepEqual([state.players[0].mana, state.players[0].element, state.players[0].shield, state.players[0].hand.length, state.players[0].discard.length], [1, 3, 12, 0, 4]);
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

test('any number of eligible Fate may stack and each moves to its own player’s discard', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FAT-001', 'FAT-001', 'FAT-001', 'FAT-003']);
  handOf(initial, 1, ['FAT-002', 'FAT-002', 'FAT-003', 'FAT-003', 'WAT-001']); initial.players[0].loaded = 3;
  let state = cast(initial, 'FIR-004'); assert.equal(canSelectCard(state, state.players[1].hand[0].id), false);
  for (const id of ['FAT-001', 'FAT-001', 'FAT-001', 'FAT-003']) {
    const selected = selectCard(state, state.players[0].hand.find((card) => card.spellId === id).id);
    assert.equal(canCastSelected(selected), true); assertGame(selected);
    state = castFateSelected(selected); assert.equal(state.selectedCardId, null); assertGame(state);
  }
  state = skipFate(state); assert.equal(canSelectCard(state, state.players[1].hand.at(-1).id), false);
  for (const id of ['FAT-002', 'FAT-002', 'FAT-003', 'FAT-003']) state = fate(state, id);
  assert.deepEqual([state.pendingSpell.attackingFate, state.pendingSpell.defendingFate, state.players[0].discard.length, state.players[1].discard.length], [14, -12, 4, 4]);
  assert.equal(state.players[1].mana, 3); state = rollDice(skipFate(state), () => 0);
  assert.equal(state.lastRoll.total, 7, '2 raw +3 Loaded +14 attacking −12 defending');
  state = resolveSpell(state); assert.deepEqual(state.players.map((p) => p.discard.length), [5, 4]); assertGame(state);
});

test('Fortune is attack-only, Misfortune defense-only, and modified roll totals may be negative', () => {
  const initial = handOf(createGame(2), 0, ['FIR-004', 'FAT-002', 'FAT-003']);
  handOf(initial, 1, ['FAT-001', 'FAT-002', 'FAT-002', 'FAT-003', 'FAT-003']);
  let state = cast(initial, 'FIR-004'); assert.equal(canSelectCard(state, state.players[0].hand[1].id), false);
  state = skipFate(state); assert.equal(canSelectCard(state, state.players[1].hand[0].id), false);
  for (const id of ['FAT-002', 'FAT-002', 'FAT-003', 'FAT-003']) state = fate(state, id);
  state = rollDice(skipFate(state), () => 0); assert.equal(state.lastRoll.total, -10); assertGame(state);
  assert.equal(resolveSpell(state).players[0].element, 1, 'negative roll still resolves the base effect');
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
  let pending = cast(state, 'FIR-010'); assert.equal(pending.pendingSpell.loadedBonus, 0);
  state = pass(finishRoll(pending)); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [0, 3]);
  state = pass(state); assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending], [3, 0]);
  pending = cast(state, 'FIR-010'); assert.deepEqual([pending.pendingSpell.loadedBonus, pending.players[0].loaded], [3, 0]);
  state = finishRoll(pending, [2, 2]); assert.equal(state.lastRoll.total, 7); assert.equal(state.players[0].loaded, 0); assertGame(state);
});

test('new Loaded queues independently; unused eligible Loaded expires when End Turn first opens refresh', () => {
  let state = pass(handOf(createGame(2), 1, ['WAT-003', 'NEU-002', 'WAT-006', 'WAT-002'])); state.players[1].loaded = 4;
  state = cast(cast(state, 'WAT-003'), 'NEU-002');
  assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending, state.lastRoll], [4, 5, null]);
  state = endTurn(state); assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending], [0, 5]);
  state = pass(endTurn(state)); assert.deepEqual([state.activePlayer, state.players[1].loaded, state.players[1].loadedPending], [1, 5, 0]);
  state = cast(state, 'WAT-006'); assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending], [5, 2]);
  const pending = cast(state, 'WAT-002'); assert.deepEqual([pending.pendingSpell.loadedBonus, pending.players[1].loadedPending], [5, 2]);
  state = finishRoll(pending); assert.equal(state.lastRoll.total, 7); assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending], [0, 2]); assertGame(state);
});

test('Ember spending is reserved before Fate; invalid choices fail and Sunsetter spends all automatically', () => {
  const initial = handOf(createGame(2), 0, ['FIR-011', 'FIR-012']); initial.players[0].mana = 10; initial.players[0].element = 3;
  const selected = selectCard(initial, initial.players[0].hand[0].id);
  for (const amount of [-1, 3, 0.5, NaN]) assert.equal(castSelected(selected, { emberSpend: amount }), selected);
  const inferno = castSelected(selected, { emberSpend: 2 });
  assert.deepEqual([inferno.players[0].mana, inferno.players[0].element, inferno.pendingSpell.emberSpent], [7, 1, 2]);
  let state = finishRoll(inferno, [6, 6]); assert.deepEqual([state.players[1].hp, state.players[0].element, state.players[0].loadedPending], [22, 1, 0]);
  state = cast(state, 'FIR-012', { emberSpend: 0 }); assert.deepEqual([state.players[0].element, state.pendingSpell.emberSpent, state.players[0].mana], [0, 1, 3]);
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
  state.players[0].hp = 5; state = finishRoll(cast(state, 'FIR-006'));
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

test('refresh selects any number of own cards and executes once before passing', () => {
  const initial = createGame(4); let state = beginRefresh(endTurn(initial));
  assert.equal(endTurn(state), state); assert.equal(selectCard(state, state.players[0].hand[0].id), state);
  assert.equal(toggleRefreshCard(state, state.players[1].hand[0].id), state);
  const [first, second] = state.players[0].hand; state = toggleRefreshCard(toggleRefreshCard(state, first.id), second.id);
  assert.deepEqual(state.refreshCardIds, [first.id, second.id]); state = toggleRefreshCard(state, second.id); assert.deepEqual(state.refreshCardIds, [first.id]);
  state = confirmRefresh(toggleRefreshCard(state, second.id));
  assert.deepEqual([state.phase, state.activePlayer, state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], ['ready-to-pass', 0, 5, 23, 2]);
  assert.deepEqual(state.players[0].discard.map((c) => c.id), [first.id, second.id]);
  for (const action of [beginRefresh, confirmRefresh, castSelected]) assert.equal(action(state), state);
  assert.equal(initial.players[0].discard.length, 0); assert.equal(endTurn(state).activePlayer, 1); assertGame(state);
});

test('refresh supports zero, all, cancellation and exhausted towers without inventing slabs', () => {
  const ending = endTurn(createGame(3)); const selecting = toggleRefreshCard(beginRefresh(ending), ending.players[0].hand[0].id);
  const cancelled = cancelRefresh(selecting); assert.deepEqual([cancelled.phase, cancelled.refreshCardIds, cancelled.players], ['end', [], ending.players]);
  const zero = confirmRefresh(beginRefresh(cancelled)); assert.deepEqual([zero.players[0].hand.length, zero.players[0].deck.length, zero.players[0].discard.length], [5, 25, 0]);
  let all = beginRefresh(ending); for (const card of all.players[0].hand) all = toggleRefreshCard(all, card.id);
  all = confirmRefresh(all); assert.deepEqual([all.players[0].hand.length, all.players[0].deck.length, all.players[0].discard.length], [5, 21, 4]);
  const empty = createGame(4); empty.players[0].discard.push(...empty.players[0].deck.splice(0));
  let state = beginRefresh(endTurn(empty)); state = confirmRefresh(toggleRefreshCard(state, state.players[0].hand[0].id));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], [3, 0, 27]); assert.match(state.log.at(-1).message, /Spell Tower is empty/);
  for (const s of [zero, all, state, pass(pass(state))]) assertGame(s);
});

test('saved games round-trip every phase including selected defender Fate and completed dice', () => {
  const main = handOf(createGame(2), 0, ['FIR-004', 'FAT-001']); handOf(main, 1, ['FAT-002']);
  const attacking = fate(cast(main, 'FIR-004'), 'FAT-001'); const defending = skipFate(attacking);
  const selected = selectCard(defending, defending.players[1].hand[0].id); const rolling = skipFate(castFateSelected(selected));
  const resolving = rollDice(rolling, () => 0.9); const resolved = resolveSpell(resolving);
  const ending = endTurn(main); const refresh = toggleRefreshCard(beginRefresh(ending), main.players[0].hand[0].id);
  for (const state of [main, attacking, defending, selected, rolling, resolving, resolved, ending, refresh, confirmRefresh(refresh)]) {
    const saved = JSON.parse(JSON.stringify(state)); assert.equal(validateSavedGame(saved), true, state.phase); assert.equal(migrateSavedGame(saved), saved);
  }
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
  ];
  for (const mutate of mutations) { const s = structuredClone(main); mutate(s); assert.equal(validateSavedGame(s), false); }
  const pending = cast(main, 'FIR-004');
  for (const mutate of [
    (s) => { s.pendingSpell.spellId = 'FIR-002'; }, (s) => { s.pendingSpell.emberSpent = 1; },
    (s) => { s.pendingSpell.attackingFate = 4; }, (s) => { s.pendingSpell.attackingFateCardIds = [s.players[0].deck[0].id]; }, (s) => { s.players[0].loaded = 1; },
  ]) { const s = structuredClone(pending); mutate(s); assert.equal(validateSavedGame(s), false); }
  const resolving = rollDice(skipFate(skipFate(pending)), () => 0);
  for (const mutate of [
    (s) => { s.lastRoll.dice[0] = 7; }, (s) => { s.lastRoll.total = 12; }, (s) => { s.lastRoll.spellId = 'FIR-010'; }, (s) => { s.lastRoll.loadedBonus = 1; },
  ]) { const s = structuredClone(resolving); mutate(s); assert.equal(validateSavedGame(s), false); }
  assert.equal(validateSavedGame(null), false); assert.equal(validateSavedGame({}), false);
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
