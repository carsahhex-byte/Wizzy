import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, castSelected, castFateSelected, rollDice, skipFate, resolveSpell,
  migrateSavedGame, validateSavedGame, assertGame, SAVE_VERSION,
} from '../src/game.js';
import { SPELL_CATALOG } from '../src/spells.js';
import { getResolvedSpellVisuals } from '../src/spell-visuals.js';

const OLD_EARTH = {
  'Earth-3': { manaCost: 3, effectText: 'Deal 5 damage. On a 9+, gain 20 Shield.' },
  'Earth-4': { manaCost: 5, effectText: 'Gain 2 Mana. If Golem is already active, protect it through your next turn. At the end of that turn, check Shield normally.' },
};
const cardsOf = player => ['hand', 'deck', 'discard'].flatMap(zone => player[zone]);

function fresh() {
  const definition = {
    element: 'earth', spellbookId: 'spellbook-2',
    entries: [{ spellId: 'Earth-3', quantity: 3 }, { spellId: 'Earth-4', quantity: 3 },
      { spellId: 'FAT-001', quantity: 1 }, { spellId: 'FAT-002', quantity: 1 }],
  };
  let state = createGame(17, { players: [{ element: 'earth', deck: definition }, { element: 'earth', deck: definition }] });
  state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
  for (const player of state.players) {
    const pool = cardsOf(player);
    const take = id => pool.splice(pool.findIndex(card => card.spellId === id), 1)[0];
    player.hand = ['Earth-3', 'Earth-4', 'FAT-001', 'FAT-002'].map(take);
    player.discard = ['Earth-3', 'Earth-4'].map(take);
    player.deck = pool;
  }
  return state;
}

function withOldDefinitions(current) {
  const previous = structuredClone(current);
  for (const player of previous.players) for (const card of cardsOf(player)) {
    const old = OLD_EARTH[card.spellId];
    if (!old) continue;
    card.manaCost = card.cost = old.manaCost;
    card.effectText = card.description = old.effectText;
  }
  return previous;
}

function roll(state) {
  let index = 0;
  return rollDice(state, () => [0, 1 / 6][index++]); // 1 + 2, before Loaded and Fate.
}

function closeFate(state) {
  while (state.phase === 'fate') state = skipFate(state);
  return state;
}

test('Earth balance refreshes all three live zones while preserving deck IDs, selections and duel progress', () => {
  const current = fresh();
  assert.equal(SAVE_VERSION, 15);
  assert.equal(SPELL_CATALOG['Earth-3'].manaCost, 2);
  assert.equal(SPELL_CATALOG['Earth-4'].manaCost, 3);
  for (const player of current.players) Object.assign(player, {
    hp: 82, mana: 7, shield: 15, loaded: 4, loadedPending: 2, enhancement: 20,
    auraTurns: 2, golemActive: true, golemProtectedUntilTurn: player.turnsStarted + 1,
  });
  current.selectedCardId = current.players[0].hand.find(card => card.spellId === 'Earth-3').id;
  assertGame(current);
  const previous = withOldDefinitions(current), before = structuredClone(previous);
  assert.equal(validateSavedGame(previous), false);
  const migrated = migrateSavedGame(previous);
  assert.deepEqual(migrated, current);
  assert.deepEqual(previous, before, 'loading does not mutate the stored snapshot');
  assert.equal(migrateSavedGame(migrated), migrated, 'refresh is idempotent');
  for (const player of migrated.players) for (const zone of ['hand', 'deck', 'discard']) {
    for (const id of ['Earth-3', 'Earth-4']) {
      const card = player[zone].find(card => card.spellId === id);
      assert.ok(card, `${id} is covered in ${zone}`);
      assert.equal(card.cost, SPELL_CATALOG[id].manaCost);
      assert.equal(card.description, SPELL_CATALOG[id].effectText);
    }
  }
});

test('a previously committed Earth-3 keeps its three-Mana payment, captured Loaded and Fate state in every pending phase', () => {
  let initial = fresh();
  Object.assign(initial.players[0], { mana: 8, loaded: 4, shield: 8 });
  const card = initial.players[0].hand.find(card => card.spellId === 'Earth-3');
  let rolling = castSelected(selectCard(initial, card.id));
  // Model the old payment rather than refunding the reduction from three to two.
  rolling.players[0].mana = 5;
  rolling.log.findLast(entry => entry.type === 'cast').message = 'Earth casts Earth-3 for 3 mana.';
  const fate = roll(rolling), resolving = closeFate(fate);
  const misfortune = fate.players[1].hand.find(card => card.spellId === 'FAT-002');
  const responded = castFateSelected(selectCard(fate, misfortune.id));
  const fortune = responded.players[0].hand.find(card => card.spellId === 'FAT-001');
  const raised = castFateSelected(selectCard(responded, fortune.id));
  for (const current of [rolling, fate, responded, raised, resolving]) {
    assertGame(current);
    const previous = withOldDefinitions(current), before = structuredClone(previous);
    const migrated = migrateSavedGame(previous);
    assert.ok(migrated, `${current.phase} migrates`);
    assert.deepEqual(migrated, current, 'only live card metadata changes');
    assert.deepEqual(previous, before);
    assert.equal(migrated.players[0].mana, 5);
    assert.equal(migrated.players[0].loaded, 0);
    assert.equal(migrated.pendingSpell.loadedBonus, 4);
    let ready = migrated.phase === 'rolling' ? roll(migrated) : migrated;
    ready = closeFate(ready);
    const completed = resolveSpell(ready);
    const expectedShield = ready.lastRoll.total >= 7 ? 20 : 8;
    assert.deepEqual([completed.players[0].mana, completed.players[0].shield, completed.players[1].hp], [5, expectedShield, 95]);
    assert.equal(completed.players[0].discard.filter(card => card.id === initial.players[0].hand.find(card => card.spellId === 'Earth-3').id).length, 1);
    assert.equal(resolveSpell(completed), completed);
    assertGame(completed);
    const visual = getResolvedSpellVisuals(migrated, completed);
    assert.equal(visual.length, 1, 'the historical three-Mana commitment still identifies the completed attack');
    assert.equal(visual[0].spellId, 'Earth-3');
  }
});

test('a completed old Earth-3 keeps its historical Shield20 outcome and three-Mana payment', () => {
  let current = fresh(); current.players[0].mana = 8;
  const card = current.players[0].hand.find(card => card.spellId === 'Earth-3');
  current = castSelected(selectCard(current, card.id));
  current.players[0].mana = 5;
  let sample = 0;
  current = resolveSpell(closeFate(rollDice(current, () => [3 / 6, 4 / 6][sample++])));
  current.players[0].shield = 20;
  current.players[0].golemActive = true;
  current.log.findLast(entry => entry.type === 'cast').message = 'Earth casts Earth-3 for 3 mana.';
  current.log.findLast(entry => entry.type === 'shield').message = 'Earth gains 20 Shield.';
  assertGame(current);
  const previous = withOldDefinitions(current), before = structuredClone(previous);
  const migrated = migrateSavedGame(previous);
  assert.deepEqual(migrated, current);
  assert.deepEqual(previous, before);
  assert.deepEqual([migrated.players[0].mana, migrated.players[0].shield, migrated.players[0].golemActive], [5, 20, true]);
  assert.equal(resolveSpell(migrated), migrated);
  assert.equal(rollDice(migrated, () => { throw new Error('a completed cast cannot reroll'); }), migrated);
});

function historicalEarthFour(active) {
  const current = fresh(), caster = current.players[0];
  const index = caster.hand.findIndex(card => card.spellId === 'Earth-4');
  caster.discard.push(...caster.hand.splice(index, 1));
  // Eight Mana before the old five-Mana payment and two-Mana reward.
  Object.assign(caster, { mana: 5, loaded: 4, golemActive: active, shield: active ? 10 : 0,
    golemProtectedUntilTurn: active ? 2 : null });
  current.primaryUsed = true; current.primaryAction = 'spell'; current.lastRoll = null;
  const append = (message, type) => current.log.push({ id: current.log.length + 1, round: current.round, playerId: caster.id, message, type });
  append('Earth casts Earth-4 for 5 mana.', 'cast');
  append('Earth gains 2 Mana.', 'resource');
  if (active) append('Earth protects Golem through their next turn; the normal Shield check returns at its end.', 'shield');
  append('Earth-4 resolves and moves to discard.', 'resolve');
  return current;
}

test('historically completed immediate Earth-4 casts retain their Mana gain, Loaded and ward without any new roll', () => {
  for (const active of [false, true]) {
    const current = historicalEarthFour(active); assertGame(current);
    const previous = withOldDefinitions(current), before = structuredClone(previous);
    const migrated = migrateSavedGame(previous);
    assert.deepEqual(migrated, current);
    assert.deepEqual(previous, before);
    assert.equal(migrated.players[0].mana, 5, 'the historical two-Mana reward is kept');
    assert.equal(migrated.players[0].loaded, 4, 'the old immediate spell consumed no Loaded');
    assert.equal(migrated.players[0].golemProtectedUntilTurn, active ? 2 : null);
    assert.equal(rollDice(migrated, () => { throw new Error('completed casts do not roll'); }), migrated);
    assert.equal(resolveSpell(migrated), migrated);
    assert.equal(migrateSavedGame(migrated), migrated);
  }
});

test('legacy Earth refresh rejects corrupt card metadata and impossible pending old immediate Earth-4', () => {
  const previous = withOldDefinitions(fresh());
  for (const mutate of [
    state => { state.players[0].hand.find(card => card.spellId === 'Earth-3').cost = 4; },
    state => { state.players[0].hand.find(card => card.spellId === 'Earth-4').manaCost = 4; },
    state => { state.players[1].deck.find(card => card.spellId === 'Earth-3').effectText = 'Gain 99 Shield.'; },
    state => { state.players[1].discard.find(card => card.spellId === 'Earth-4').description = 'Gain 99 Mana.'; },
    state => { state.players[0].mana = 11; },
    state => { state.players[1].hand.pop(); },
  ]) {
    const corrupt = structuredClone(previous); mutate(corrupt);
    assert.equal(migrateSavedGame(corrupt), null, mutate.toString());
  }
  const current = fresh(); current.players[0].mana = 8;
  const card = current.players[0].hand.find(card => card.spellId === 'Earth-4');
  const pending = castSelected(selectCard(current, card.id));
  assert.equal(pending.phase, 'rolling'); assertGame(pending);
  assert.equal(migrateSavedGame(withOldDefinitions(pending)), null, 'old Earth-4 never had a pending dice or Fate state');
  const priorPrice = structuredClone(pending);
  const priorCard = priorPrice.players[0].hand.find(card => card.id === priorPrice.pendingSpell.cardId);
  priorCard.manaCost = priorCard.cost = 5;
  assert.equal(migrateSavedGame(priorPrice), null, 'a partially refreshed old immediate price cannot forge a pending cast');
});
