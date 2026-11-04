import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, selectCard, castSelected, skipFate, resolveSpell, endTurn,
  beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh,
  applyDamage, assertGame, validateSavedGame, migrateSavedGame,
  SPELL_CATALOG, DECK_LISTS, DECK_SIZE, SAVE_VERSION,
} from '../src/game.js';

const castFirst = (state) => castSelected(selectCard(state, state.players[state.activePlayer].hand[0].id));
const resolveFirst = (state) => resolveSpell(skipFate(castFirst(state)));
const pass = (state) => endTurn(endTurn(state));
const allCards = (player) => [...player.hand, ...player.deck, ...player.discard];

// The previous published save format, independent of the new card definitions.
function sampleSave() {
  const state = createGame(6);
  state.version = 2;
  for (const player of state.players) {
    const spellId = player.id === 'fire' ? 'fiery-comet' : 'cresting-wave';
    const cards = Array.from({ length: 24 }, (_, copy) => ({
      id: `${player.id}-${spellId}-${copy}`, spellId,
      name: player.id === 'fire' ? 'Fiery Comet' : 'Cresting Wave',
      art: player.id === 'fire' ? 'comet' : 'wave', cost: 0,
      description: 'Spell effect coming soon.', effectPending: true,
    }));
    player.hand = [cards[18], cards[3], cards[15], cards[9]];
    player.deck = cards.filter((card) => !player.hand.includes(card));
    player.discard = [];
  }
  return state;
}

test('Fire and Water open with required stats, four cards and their exact 30-slab PDF decklists', () => {
  const state = createGame(7);
  assert.deepEqual([state.round, state.activePlayer, state.phase, state.version], [1, 0, 'main', 3]);
  assert.deepEqual([DECK_SIZE, SAVE_VERSION], [30, 3]);
  assert.equal(state.players[1].name, 'Water');
  assert.equal(state.players[1].elementName, 'Flow');
  const expectedCounts = {
    fire: { 'FIR-001': 1, 'FIR-002': 2, 'FIR-004': 2, 'FIR-005': 3, 'FIR-006': 3, 'FIR-007': 2, 'FIR-010': 2, 'FIR-011': 3, 'FIR-012': 3, 'FAT-001': 3, 'FAT-002': 2, 'FAT-003': 2, 'NEU-004': 1, 'NEU-003': 1 },
    water: { 'WAT-001': 2, 'WAT-002': 2, 'WAT-003': 1, 'WAT-004': 3, 'WAT-005': 2, 'WAT-006': 2, 'WAT-007': 2, 'WAT-008': 1, 'WAT-009': 3, 'WAT-010': 3, 'NEU-002': 1, 'NEU-004': 1, 'FAT-001': 3, 'FAT-002': 2, 'FAT-003': 2 },
  };
  for (const player of state.players) {
    assert.deepEqual([player.hp, player.maxHp, player.mana, player.shield, player.element, player.loaded], [30, 30, 3, 0, 0, 0]);
    assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [4, 26, 0]);
    const cards = allCards(player);
    const counts = Object.fromEntries(Object.keys(expectedCounts[player.id]).map((id) => [id, cards.filter((card) => card.spellId === id).length]));
    assert.deepEqual(counts, expectedCounts[player.id]);
    assert.deepEqual(Object.fromEntries(DECK_LISTS[player.id].map(({ spellId, quantity }) => [spellId, quantity])), expectedCounts[player.id]);
    assert.equal(new Set(cards.map((card) => card.id)).size, 30);
    assert.deepEqual(['Elemental', 'Neutral', 'Fate'].map((category) => cards.filter((card) => card.category === category).length), [21, 2, 7]);
    for (const card of cards) {
      const { id: canonicalId, ...definition } = SPELL_CATALOG[card.spellId];
      for (const [key, value] of Object.entries(definition)) assert.equal(card[key], value);
      assert.match(card.id, new RegExp(`^${player.id}-${canonicalId}-[0-2]$`));
      assert.equal(card.cost, 0);
      assert.equal(card.effectPending, true);
      assert.equal(card.description, card.effectText);
    }
  }
  assertGame(state);
  assert.deepEqual(createGame(7), state);
  assert.notDeepEqual(createGame(8).players[0].hand, state.players[0].hand);
});

test('the full scoped spell catalog preserves text, cost and type-specific artwork', () => {
  assert.equal(Object.keys(SPELL_CATALOG).length, 29);
  assert.deepEqual(Object.values(SPELL_CATALOG).map((spell) => spell.element).filter((value) => ['Earth', 'Air'].includes(value)), []);
  assert.equal(SPELL_CATALOG['FIR-011'].effectText, 'Deal 4 damage. Spend up to 2 Embers to deal 2 additional damage per Ember. On a 6+, if no Embers were spent, gain +3 to your next roll and 1 Ember.');
  assert.equal(SPELL_CATALOG['WAT-010'].effectText, 'Deal damage equal to 2 × your Flow. On an 8+, deal damage equal to 3 × your Flow instead.');
  assert.equal(SPELL_CATALOG['FAT-002'].effectText, 'Defending Fate: −4 to your opponent’s roll.');
  assert.equal(SPELL_CATALOG['FIR-012'].manaCost, 4);
  assert.equal(SPELL_CATALOG['WAT-010'].manaCost, 4);
  assert.equal(SPELL_CATALOG['NEU-004'].manaCost, 0);
  for (const player of createGame(4).players) {
    const manaShield = allCards(player).find((card) => card.spellId === 'NEU-004');
    assert.deepEqual([manaShield.name, manaShield.category, manaShield.type, manaShield.art], ['Mana Shield', 'Neutral', 'Neutral', 'neutralCard']);
    assert.equal(allCards(player).filter((card) => card.art === 'fateCard').length, 7);
    assert.equal(allCards(player).filter((card) => card.art === `${player.id}Card`).length, 21);
  }
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

test('printed spell costs and effects remain display data even when mana is insufficient', () => {
  const initial = createGame(12);
  const player = initial.players[0];
  const spell = allCards(player).find((card) => card.spellId === 'FIR-012');
  const index = player.deck.findIndex((card) => card.id === spell.id);
  if (index >= 0) [player.hand[0], player.deck[index]] = [player.deck[index], player.hand[0]];
  player.mana = 0;
  player.element = 5;
  player.shield = 3;
  player.loaded = 2;
  const beforeStats = initial.players.map(({ hp, mana, shield, element, loaded }) => ({ hp, mana, shield, element, loaded }));
  const fate = castSelected(selectCard(initial, spell.id));
  assert.equal(fate.phase, 'fate');
  const resolved = resolveSpell(skipFate(fate));
  assert.deepEqual(resolved.players.map(({ hp, mana, shield, element, loaded }) => ({ hp, mana, shield, element, loaded })), beforeStats);
  assert.equal(resolved.players[0].discard[0].spellId, 'FIR-012');
  assertGame(resolved);
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
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length], [5, 24]);
  assert.equal(state.players[1].hand.length, 3);
  state = pass(state);
  assert.deepEqual([state.players[1].hand.length, state.players[1].deck.length], [5, 24]);
  assert.equal(state.round, 2);
  assertGame(state);
});

test('multiple spells can fully resolve in a turn; start-of-turn drawing never exceeds five', () => {
  let state = createGame(13);
  while (state.players[0].hand.length) state = resolveFirst(state);
  assert.equal(state.players[0].discard.length, 4);
  state = pass(pass(state));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length], [5, 21]);
  state = pass(pass(state));
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length], [5, 21]);
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
  assert.deepEqual([refreshed.phase, refreshed.players[0].hand.length, refreshed.players[0].deck.length, refreshed.players[0].discard.length], ['ready-to-pass', 5, 23, 2]);
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
  assert.deepEqual([zero.players[0].hand.length, zero.players[0].deck.length, zero.players[0].discard.length], [5, 25, 0]);
  selecting = beginRefresh(ending);
  for (const card of selecting.players[0].hand) selecting = toggleRefreshCard(selecting, card.id);
  const all = confirmRefresh(selecting);
  assert.deepEqual([all.players[0].hand.length, all.players[0].deck.length, all.players[0].discard.length], [5, 21, 4]);
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
  for (const player of state.players) assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [0, 0, 30]);
  state = confirmRefresh(beginRefresh(endTurn(state)));
  assert.equal(state.players[state.activePlayer].hand.length, 0);
  assert.match(state.log.at(-1).message, /Spell Tower is empty/);
  assertGame(state);
});

test('refresh with an exhausted tower keeps remaining cards and draws only the available number', () => {
  let state = createGame(11);
  const player = state.players[0];
  player.discard.push(...player.deck.splice(0, 24));
  assert.equal(player.deck.length, 2);
  state = beginRefresh(endTurn(state));
  for (const card of state.players[0].hand.slice(0, 3)) state = toggleRefreshCard(state, card.id);
  state = confirmRefresh(state);
  assert.deepEqual([state.players[0].hand.length, state.players[0].deck.length, state.players[0].discard.length], [3, 0, 27]);
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
    (s) => { s.players[0].hand[0].effectText = 'Deal 999 damage.'; },
    (s) => { s.players[0].hand[0].manaCost += 1; },
    (s) => { s.players[0].hand[0].cost = 1; },
    (s) => { s.players[0].hand[0].category = 'Fate'; s.players[0].hand[0].art = 'fateCard'; },
    (s) => { s.players[0].hand[0].id = 'fire-FIR-001-1'; },
    (s) => { s.players[0].hand[0].spellId = 'FIR-003'; },
    (s) => { [s.players[0].hand[0], s.players[1].hand[0]] = [s.players[1].hand[0], s.players[0].hand[0]]; },
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

test('v2 migration preserves all turn phases, selections, zones, stats and log while adding six tower slabs', () => {
  const main = pass(pass(resolveFirst(sampleSave())));
  main.players[0].hp = 17;
  main.players[0].mana = 8;
  main.players[0].element = 4;
  main.players[0].loaded = 3;
  main.players[1].shield = 5;
  const selected = selectCard(main, main.players[0].hand[0].id);
  const fate = castSelected(selected);
  const resolving = skipFate(fate);
  const ending = endTurn(main);
  const refresh = toggleRefreshCard(beginRefresh(ending), main.players[0].hand[0].id);
  const ready = confirmRefresh(refresh);
  for (const legacy of [main, selected, fate, resolving, ending, refresh, ready]) {
    const source = structuredClone(legacy);
    const migrated = migrateSavedGame(JSON.parse(JSON.stringify(legacy)));
    assertGame(migrated);
    assert.deepEqual(legacy, source, 'migration does not mutate the source');
    assert.deepEqual([migrated.round, migrated.activePlayer, migrated.phase, migrated.status, migrated.winner], [legacy.round, legacy.activePlayer, legacy.phase, legacy.status, legacy.winner]);
    for (let index = 0; index < 2; index += 1) {
      const old = legacy.players[index];
      const player = migrated.players[index];
      for (const key of ['hp', 'maxHp', 'mana', 'shield', 'element', 'loaded', 'turnsStarted']) assert.equal(player[key], old[key]);
      assert.deepEqual([player.hand.length, player.deck.length, player.discard.length], [old.hand.length, old.deck.length + 6, old.discard.length]);
    }
    const active = migrated.players[migrated.activePlayer];
    if (legacy.selectedCardId) assert.equal(migrated.selectedCardId, active.hand[legacy.players[legacy.activePlayer].hand.findIndex((card) => card.id === legacy.selectedCardId)].id);
    if (legacy.pendingCardId) assert.equal(migrated.pendingCardId, active.hand[legacy.players[legacy.activePlayer].hand.findIndex((card) => card.id === legacy.pendingCardId)].id);
    assert.deepEqual(migrated.refreshCardIds, legacy.refreshCardIds.map((id) => active.hand[legacy.players[legacy.activePlayer].hand.findIndex((card) => card.id === id)].id));
    assert.deepEqual(migrated.log.slice(0, -1), legacy.log);
    assert.match(migrated.log.at(-1).message, /30-slab.*6 additional slabs.*still pending/);
    assert.equal(migrateSavedGame(migrated), migrated);
    if (migrated.phase === 'fate') assertGame(resolveSpell(skipFate(migrated)));
    if (migrated.phase === 'resolving') assertGame(resolveSpell(migrated));
    if (migrated.phase === 'refresh') assertGame(confirmRefresh(migrated));
  }
  const migrated = migrateSavedGame(sampleSave());
  assert.equal(migrated.players[0].hand[0].id, 'fire-FIR-012-0', 'copy18 maps to the same canonical slab regardless of its zone');
  assert.equal(migrated.players[0].deck.find((card) => card.id === 'fire-FIR-001-0').name, 'Spark Shot');
  assert.deepEqual(migrated.players[0].deck.slice(-6).map((card) => card.id), ['fire-FAT-002-0', 'fire-FAT-002-1', 'fire-FAT-003-0', 'fire-FAT-003-1', 'fire-NEU-004-0', 'fire-NEU-003-0']);
});

test('v1 migration preserves stats, zones, progress and selection while replacing Earth with Water', () => {
  const legacy = pass(resolveFirst(sampleSave()));
  legacy.version = 1;
  delete legacy.phase; delete legacy.pendingCardId; delete legacy.refreshCardIds;
  legacy.players[1].id = 'earth'; legacy.players[1].name = 'Earth'; legacy.players[1].elementName = 'Runes';
  legacy.players[1].mana = 8; legacy.players[1].element = 3;
  const spellIds = {
    fire: ['spark-shot', 'kindle', 'fortune', 'heatbox', 'mana-shield', 'sunsetter'],
    earth: ['stone-shot', 'rootbound', 'earth-fortune', 'runestone', 'earth-mana-shield', 'mountain-call'],
  };
  for (const player of legacy.players) {
    allCards(player).forEach((card, copy) => { card.id = `${player.id}-${spellIds[player.id][Math.floor(copy / 4)]}-${copy % 4}`; });
  }
  legacy.selectedCardId = legacy.players[1].hand[0].id;
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

test('legacy migration rejects corrupt counts, ownership, metadata, selections and progress', () => {
  const mutations = [
    (s) => { s.players[0].deck.pop(); },
    (s) => { s.players[0].hp = 31; },
    (s) => { s.round = 0; },
    (s) => { s.players[0].hand[0].id = 'fire-fiery-comet-24'; },
    (s) => { s.players[0].hand[0].id = s.players[0].hand[1].id; },
    (s) => { [s.players[0].hand[0], s.players[1].hand[0]] = [s.players[1].hand[0], s.players[0].hand[0]]; },
    (s) => { s.players[0].hand[0].description = 'forged'; },
    (s) => { s.players[0].hand[0].name = 'forged'; },
    (s) => { s.players[0].hand[0].cost = 7; },
    (s) => { s.selectedCardId = s.players[1].hand[0].id; },
    (s) => { s.phase = 'fate'; s.pendingCardId = s.players[0].deck[0].id; },
    (s) => { s.phase = 'refresh'; s.refreshCardIds = [s.players[1].hand[0].id]; },
    (s) => { s.log[0].message = null; },
    (s) => { s.log[0].type = 'unknown'; },
  ];
  for (const mutate of mutations) {
    const legacy = sampleSave();
    mutate(legacy);
    assert.equal(migrateSavedGame(legacy), null);
  }
  const invalidCurrent = createGame(6);
  invalidCurrent.players[0].deck.pop();
  assert.equal(migrateSavedGame(invalidCurrent), null);
  assert.equal(migrateSavedGame({ version: 4 }), null);
});
