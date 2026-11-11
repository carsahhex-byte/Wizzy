import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, castSelected, rollDice, skipFate, castFateSelected,
  resolveSpell, endTurn, beginRefresh, confirmRefresh, cancelStagedAction, applyDamage,
  activateEnhancement, rollEnhancement, assertGame, validateSavedGame, migrateSavedGame, SAVE_VERSION,
} from '../src/game.js';
import { applySpellEffect, SPELL_RULES, GOLEM_SHIELD_THRESHOLD, GOLEM_END_TURN_DAMAGE } from '../src/effects.js';
import { SPELL_CATALOG } from '../src/spells.js';
import { ACTIVE_SPELLBOOK_ID, getActiveSpells } from '../src/spellbooks.js';
import { createStarterDeck, setDeckQuantity, validateDeck, getEligibleSpells, parseDeckList, serializeDeck } from '../src/decks.js';
import { ELEMENTS, getPlayerSchool } from '../src/elements.js';

function deck(element, ids) {
  const entries = new Map();
  for (const id of ids) entries.set(id, (entries.get(id) ?? 0) + 1);
  return { element, spellbookId: ACTIVE_SPELLBOOK_ID, entries: [...entries].map(([spellId, quantity]) => ({ spellId, quantity })) };
}
const basics = { fire: ['Fire-2', 'Fire-11', 'Fire-6', 'Fire-14', 'Fire-15'], water: ['Water-0', 'Water-2', 'Water-9', 'Water-12', 'Water-14'], earth: ['Earth-1', 'Earth-2', 'Earth-3', 'Earth-4', 'Earth-5'] };
function fresh(schools = ['earth', 'water'], extra = [[], []], first = 0) {
  let state = createGame(29, { players: schools.map((element, index) => ({ element, deck: deck(element, [...basics[element], ...extra[index]]) })) });
  state = rollInitiative(state, 0, () => first === 0 ? .9 : 0);
  return rollInitiative(state, 1, () => first === 1 ? .9 : 0);
}
function hand(state, index, ids) {
  const player = state.players[index], pool = [...player.hand, ...player.deck, ...player.discard];
  player.hand = ids.map(id => {
    const found = pool.findIndex(card => card.spellId === id);
    assert.ok(found >= 0, `${id} belongs to the fixture`);
    return pool.splice(found, 1)[0];
  });
  player.deck = pool; player.discard = [];
  return state;
}
const cast = (state, id) => castSelected(selectCard(state, state.players[state.activePlayer].hand.find(card => card.spellId === id).id));
const pass = state => endTurn(endTurn(state));
function roll(state, dice = [3, 4]) {
  let index = 0;
  return rollDice(state, () => (dice[index++] - 1) / 6);
}
function complete(state, dice) {
  state = roll(state, dice);
  while (state.phase === 'fate') state = skipFate(state);
  return resolveSpell(state);
}
function effect(id, total, overrides = {}) {
  const state = fresh();
  Object.assign(state.players[0], overrides);
  const events = applySpellEffect(state, { casterIndex: 0, spellId: id, rollTotal: total });
  return { state, caster: state.players[0], opponent: state.players[1], events };
}
const strikes = state => state.log.filter(entry => entry.visual?.kind === 'golem-strike');

test('Earth joins the active book with five cards, correct costs, no starter deck and unlimited copies', () => {
  assert.equal(getActiveSpells().length, 18);
  assert.deepEqual(getActiveSpells().filter(card => card.element === 'Earth').map(card => [card.spellId, card.manaCost]), [
    ['Earth-1', 0], ['Earth-2', 2], ['Earth-3', 2], ['Earth-4', 3], ['Earth-5', 5],
  ]);
  assert.equal(getEligibleSpells('earth', ACTIVE_SPELLBOOK_ID).length, 8);
  assert.deepEqual(createStarterDeck('earth'), { element: 'earth', entries: [] });
  const empty = createStarterDeck('earth', ACTIVE_SPELLBOOK_ID);
  const filled = setDeckQuantity(empty, 'Earth-1', 30);
  assert.equal(validateDeck(filled), true);
  assert.deepEqual(parseDeckList(serializeDeck(filled)), filled);
  assert.throws(() => setDeckQuantity(filled, 'Earth-1', 31), /more than 30/);
  assert.equal(SPELL_CATALOG['Earth-1'].art, 'earthCard');
});

test('all nine school pairings have independent seat IDs and card ownership, including mirrors', () => {
  for (const left of ELEMENTS) for (const right of ELEMENTS) {
    const state = fresh([left, right]);
    assert.deepEqual(state.players.map(player => player.id), ['seat-1', 'seat-2']);
    assert.deepEqual(state.players.map(getPlayerSchool), [left, right]);
    const cards = state.players.flatMap(player => [...player.hand, ...player.deck]);
    assert.equal(new Set(cards.map(card => card.id)).size, cards.length);
    assertGame(state);
    const next = pass(state);
    assert.equal(next.players[1].turnsStarted, 1); assertGame(next);
  }
  const old = createGame(29, { fire: deck('fire', basics.fire), water: deck('water', basics.water) });
  assert.deepEqual(old.players.map(player => player.id), ['fire', 'water']); assertGame(old);
  for (const players of [[], [{ element: 'earth' }], [{ element: 'earth' }, { element: 'air' }], [{ element: 'earth', deck: deck('fire', basics.fire) }, { element: 'water' }]]) {
    assert.throws(() => createGame(1, { players }));
  }
});

for (const [id, threshold, low, high] of [
  ['Earth-1', 7, { hp: 95, shield: 5, mana: 3 }, { hp: 95, shield: 10, mana: 3 }],
  ['Earth-2', 6, { hp: 100, shield: 10, mana: 3 }, { hp: 100, shield: 10, mana: 4 }],
  ['Earth-3', 7, { hp: 95, shield: 0, mana: 3 }, { hp: 95, shield: 12, mana: 3 }],
]) test(`${id} resolves its base effect and exact Modified Roll threshold`, () => {
  assert.equal(SPELL_RULES[id].requiresRoll, true);
  for (const [total, expected] of [[threshold - 1, low], [threshold, high]]) {
    const result = effect(id, total);
    assert.deepEqual({ hp: result.opponent.hp, shield: result.caster.shield, mana: result.caster.mana }, expected);
    assert.equal(result.caster.element, 0);
  }
});

test('Earth shares the full defender-first Fate chain and transforms at the final threshold', () => {
  let state = fresh(['earth', 'earth'], [['FAT-001'], ['FAT-002', 'FAT-003']]);
  hand(state, 0, ['Earth-3', 'FAT-001']); hand(state, 1, ['FAT-002', 'FAT-003']);
  state.players[0].shield = 8;
  state = roll(cast(state, 'Earth-3'));
  assert.deepEqual([state.phase, state.fatePlayer, state.lastRoll.total], ['fate', 1, 7]);
  for (const [id, total] of [['FAT-002', 3], ['FAT-001', 7], ['FAT-003', 9]]) {
    const card = state.players[state.fatePlayer].hand.find(card => card.spellId === id);
    state = castFateSelected(selectCard(state, card.id), id === 'FAT-003' ? { twistDirections: { [card.id]: 2 } } : {});
    assert.equal(state.lastRoll.total, total); assertGame(state);
  }
  while (state.phase === 'fate') state = skipFate(state);
  state = resolveSpell(state);
  assert.deepEqual([state.players[0].shield, state.players[0].golemActive, state.players[1].hp], [20, true, 95]);
  assert.equal(state.log.filter(entry => entry.visual?.kind === 'golem-transform').length, 1); assertGame(state);
});

test('Shield20 transforms immediately, caps at30, and Golem adds no bonus to spell damage', () => {
  const transformed = effect('Earth-1', 6, { shield: 15, enhancement: 0 });
  assert.deepEqual([transformed.caster.shield, transformed.caster.golemActive, transformed.opponent.hp], [20, true, 95]);
  const active = effect('Earth-1', 7, { shield: 29, golemActive: true });
  assert.deepEqual([active.caster.shield, active.opponent.hp], [30, 95]);
  assert.equal(active.events.filter(event => event.visual?.kind === 'golem-transform').length, 0);
});

test('Golem survives Shield loss until its own final pass, then reverts before any passive damage', () => {
  let state = fresh(); Object.assign(state.players[0], { shield: 20, golemActive: true });
  state = applyDamage(state, 0, 1);
  assert.deepEqual([state.players[0].shield, state.players[0].golemActive], [19, true]);
  const staged = endTurn(state); assert.equal(staged.players[0].golemActive, true); assert.equal(strikes(staged).length, 0);
  assert.deepEqual(cancelStagedAction(staged), state);
  state = endTurn(staged);
  assert.deepEqual([state.players[0].golemActive, state.players[1].hp, strikes(state).length], [false, 100, 0]);
  assert.equal(state.log.findLast(entry => entry.visual)?.visual.kind, 'golem-revert'); assertGame(state);
});

test('opponent damage does not revert Golem during the opponent turn or at the start of Earth turn', () => {
  let state = fresh(); Object.assign(state.players[0], { shield: 20, golemActive: true });
  state = pass(state); state = applyDamage(state, 0, 20); state = pass(state);
  assert.deepEqual([state.activePlayer, state.players[0].shield, state.players[0].golemActive], [0, 0, true]);
  state = pass(state); assert.equal(state.players[0].golemActive, false); assert.equal(strikes(state).length, 1); assertGame(state);
});

test('passive damage is exactly15 through normal Shield and preserves Enhancement and elemental resources', () => {
  let state = fresh(); Object.assign(state.players[0], { shield: 20, golemActive: true, enhancement: 30, auraTurns: 3 });
  state.players[1].shield = 10;
  state = pass(state);
  assert.deepEqual([state.players[1].hp, state.players[1].shield, state.players[0].enhancement, state.players[0].element], [95, 0, 30, 0]);
  assert.deepEqual(strikes(state)[0].visual, { kind: 'golem-strike', casterIndex: 0, targetIndex: 1, amount: 15 });
  assert.deepEqual([GOLEM_SHIELD_THRESHOLD, GOLEM_END_TURN_DAMAGE], [20, 15]); assertGame(state);
});

test('each final pass path strikes once; staging, cancellation and refresh selection never strike', () => {
  for (const route of [state => endTurn(state), state => confirmRefresh(beginRefresh(state)), state => endTurn(beginRefresh(state))]) {
    let state = fresh(); Object.assign(state.players[0], { shield: 20, golemActive: true });
    state = endTurn(state); assert.equal(strikes(state).length, 0);
    const saved = JSON.parse(JSON.stringify(state)); assert.equal(validateSavedGame(saved), true);
    state = route(migrateSavedGame(saved));
    assert.deepEqual([state.activePlayer, state.players[1].hp, strikes(state).length], [1, 85, 1]);
    assert.equal(strikes(endTurn(state)).length, 1); assertGame(state);
  }
});

test('a lethal passive strike finishes immediately without starting or drawing the next turn', () => {
  let state = fresh(); Object.assign(state.players[0], { shield: 20, golemActive: true, enhancement: 20 });
  state.players[1].hp = 15;
  state = pass(state);
  assert.deepEqual([state.status, state.winner, state.activePlayer, state.players[1].turnsStarted], ['finished', 0, 0, 0]);
  assert.equal(strikes(state).length, 1); assert.equal(endTurn(state), state); assert.equal(state.players[0].enhancement, 20); assertGame(state);
});

test('Earth4 pays3 Mana, captures Loaded, rolls before Fate and protects only an already-active Golem', () => {
  for (const active of [false, true]) {
    let state = fresh(['earth', 'water'], [[], ['FAT-002']]); hand(state, 0, ['Earth-4']);
    Object.assign(state.players[0], { mana: 3, loaded: 4, loadedPending: 2, enhancement: 20, shield: 0, golemActive: active });
    state = cast(state, 'Earth-4');
    assert.deepEqual([state.phase, state.lastRoll, state.pendingSpell.loadedBonus, state.players[0].mana, state.players[0].loaded, state.players[0].enhancement], ['rolling', null, 4, 0, 0, 20]);
    assert.equal(state.players[0].golemProtectedUntilTurn, null);
    assert.equal(state.players[0].discard.length, 0); assertGame(state);
    state = complete(state, [1, 1]);
    assert.deepEqual([state.phase, state.lastRoll.total, state.players[0].mana, state.players[0].loadedPending, state.players[0].enhancement], ['main', 6, 0, 2, 20]);
    assert.equal(state.players[0].golemProtectedUntilTurn, active ? 2 : null);
    assert.equal(state.players[0].golemActive, active); assert.equal(state.players[0].discard.length, 1);
    assert.equal(state.log.some(entry => entry.type === 'resource' && entry.id > 4), false); assertGame(state);
  }
});

test('Earth3 charges2 Mana once and Loaded can reach its7 Shield threshold', () => {
  let state = fresh(); hand(state, 0, ['Earth-3']);
  Object.assign(state.players[0], { mana: 2, loaded: 2, shield: 8 });
  state = cast(state, 'Earth-3');
  assert.deepEqual([state.phase, state.players[0].mana, state.players[0].loaded, state.pendingSpell.loadedBonus], ['rolling', 0, 0, 2]);
  assert.equal(state.players[0].shield, 8); assertGame(state);
  state = complete(state, [2, 3]);
  assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.total, state.players[0].mana, state.players[0].shield, state.players[0].golemActive], [5, 7, 0, 20, true]);
  assert.equal(state.players[1].hp, 95); assert.equal(resolveSpell(state), state); assertGame(state);
  for (const [id, mana] of [['Earth-3', 1], ['Earth-4', 2]]) {
    const poor = hand(fresh(), 0, [id]); poor.players[0].mana = mana;
    const selected = selectCard(poor, poor.players[0].hand[0].id);
    assert.equal(castSelected(selected), selected); assert.equal(selected.primaryUsed, false);
  }
});

test('Earth4 fails at5, succeeds at6 only with Golem, and never grants Mana or consumes Enhancement', () => {
  assert.deepEqual(SPELL_RULES['Earth-4'], { requiresRoll: true, emberSpend: 'none' });
  assert.throws(() => effect('Earth-4', null), /requires a resolved Modified Roll/);
  for (const total of [5, 6]) for (const active of [false, true]) {
    const result = effect('Earth-4', total, { mana: 0, enhancement: 30, golemActive: active });
    assert.deepEqual([result.caster.mana, result.caster.enhancement, result.caster.golemActive], [0, 30, active]);
    assert.equal(result.caster.golemProtectedUntilTurn, active && total >= 6 ? 2 : null);
    assert.equal(result.events.some(event => event.resource === 'mana'), false);
  }
});

test('failed Earth4 preserves an existing Ward deadline while success extends it', () => {
  for (const total of [5, 6]) {
    let state = fresh(); hand(state, 0, ['Earth-4']);
    Object.assign(state.players[0], { mana: 3, golemActive: true, shield: 0, turnsStarted: 2, golemProtectedUntilTurn: 2 });
    state = complete(cast(state, 'Earth-4'), total === 5 ? [2, 3] : [3, 3]);
    assert.deepEqual([state.players[0].golemProtectedUntilTurn, state.players[0].mana], [total === 5 ? 2 : 3, 0]); assertGame(state);
    state = pass(state);
    assert.equal(state.players[0].golemActive, total >= 6);
    assert.equal(strikes(state).length, total >= 6 ? 1 : 0); assertGame(state);
  }
});

test('Fate changes the final Earth3 Shield and Earth4 protection thresholds in both directions', () => {
  for (const spellId of ['Earth-3', 'Earth-4']) for (const boost of [false, true]) {
    let state = fresh(['earth', 'water'], boost ? [['FAT-001'], []] : [[], ['FAT-002']]);
    hand(state, 0, boost ? [spellId, 'FAT-001'] : [spellId]);
    hand(state, 1, boost ? [] : ['FAT-002']);
    Object.assign(state.players[0], { mana: 3, golemActive: spellId === 'Earth-4' });
    const dice = spellId === 'Earth-3' ? boost ? [1, 2] : [3, 4] : boost ? [1, 1] : [3, 3];
    state = roll(cast(state, spellId), dice);
    assert.equal(state.fatePlayer, boost ? 0 : 1);
    const fate = state.players[state.fatePlayer].hand.find(card => card.category === 'Fate');
    state = castFateSelected(selectCard(state, fate.id));
    while (state.phase === 'fate') state = skipFate(state);
    state = resolveSpell(state);
    assert.equal(state.lastRoll.total, spellId === 'Earth-3' ? boost ? 7 : 3 : boost ? 6 : 2);
    if (spellId === 'Earth-3') assert.equal(state.players[0].shield, boost ? 12 : 0);
    else assert.equal(state.players[0].golemProtectedUntilTurn, boost ? 2 : null);
    assert.equal(state.players[0].mana, spellId === 'Earth-3' ? 1 : 0); assertGame(state);
  }
});

test('Earth4 protects the cast turn and the next turn, expires before that next final Shield check', () => {
  let state = fresh(); hand(state, 0, ['Earth-4']);
  Object.assign(state.players[0], { mana: 5, shield: 0, golemActive: true });
  state = complete(cast(state, 'Earth-4')); state = pass(state);
  assert.deepEqual([state.players[0].golemActive, strikes(state).length], [true, 1]);
  state = pass(state);
  assert.deepEqual([state.players[0].turnsStarted, state.players[0].golemProtectedUntilTurn], [2, 2]); assertGame(state);
  state = migrateSavedGame(JSON.parse(JSON.stringify(state)));
  state = endTurn(state); assert.equal(state.players[0].golemActive, true);
  state = endTurn(state);
  assert.deepEqual([state.players[0].golemActive, state.players[0].golemProtectedUntilTurn, strikes(state).length], [false, null, 1]);
  const expiration = state.log.findIndex(entry => /protection expires/.test(entry.message));
  const reversion = state.log.findIndex(entry => entry.visual?.kind === 'golem-revert');
  assert.ok(expiration >= 0 && reversion > expiration); assertGame(state);
});

test('Earth4 expiration still allows the passive strike when Shield is20 or more', () => {
  let state = fresh(); hand(state, 0, ['Earth-4']); Object.assign(state.players[0], { mana: 5, shield: 20, golemActive: true });
  state = pass(pass(pass(complete(cast(state, 'Earth-4')))));
  assert.deepEqual([state.players[0].golemActive, state.players[0].golemProtectedUntilTurn, strikes(state).length, state.players[1].hp], [true, null, 2, 70]); assertGame(state);
});

test('recasting Earth4 on the next turn extends its protection to the following final Shield check', () => {
  let state = fresh(['earth', 'water'], [['Earth-4'], []]); hand(state, 0, ['Earth-4', 'Earth-4']);
  Object.assign(state.players[0], { mana: 10, shield: 0, golemActive: true });
  state = pass(pass(complete(cast(state, 'Earth-4'))));
  state = complete(cast(state, 'Earth-4'));
  assert.equal(state.players[0].golemProtectedUntilTurn, 3);
  state = pass(state); assert.equal(state.players[0].golemActive, true); assert.equal(strikes(state).length, 2);
  state = pass(state); assertGame(state);
  state = pass(state);
  assert.deepEqual([state.players[0].golemActive, state.players[0].golemProtectedUntilTurn, strikes(state).length], [false, null, 2]); assertGame(state);
});

test('Earth Shield and Mana rewards keep the existing caps, and restored Shield retains Golem', () => {
  for (const id of ['Earth-1', 'Earth-2', 'Earth-3']) {
    const result = effect(id, 12, { shield: 29, mana: 10 });
    assert.deepEqual([result.caster.shield, result.caster.mana, result.caster.golemActive], [30, 10, true]);
  }
  assert.equal(effect('Earth-4', 6, { mana: 9 }).caster.mana, 9);
  let state = fresh(); hand(state, 0, ['Earth-1']);
  Object.assign(state.players[0], { shield: 15, golemActive: true });
  state = complete(cast(state, 'Earth-1'), [1, 1]);
  assert.equal(state.players[0].shield, 20);
  assert.equal(state.log.filter(entry => entry.visual?.kind === 'golem-transform').length, 0);
  state = pass(state);
  assert.equal(state.players[0].golemActive, true); assert.equal(strikes(state).length, 1); assertGame(state);
});

test('the second Earth seat uses its own turn count for protection and Golem checks', () => {
  let state = fresh(['water', 'earth']); hand(state, 1, ['Earth-4']);
  state = pass(state); Object.assign(state.players[1], { mana: 5, shield: 0, golemActive: true });
  state = complete(cast(state, 'Earth-4'));
  assert.deepEqual([state.players[1].turnsStarted, state.players[1].golemProtectedUntilTurn], [1, 2]);
  state = pass(pass(state)); assertGame(state);
  state = pass(state);
  assert.deepEqual([state.players[1].golemActive, strikes(state).length, state.players[0].hp], [false, 1, 85]); assertGame(state);
});

test('Earth5 inactive causes no damage and preserves Enhancement; active damage uses normal bonuses', () => {
  for (const active of [false, true]) {
    let state = fresh(); hand(state, 0, ['Earth-5']);
    Object.assign(state.players[0], { mana: 5, shield: active ? 20 : 0, golemActive: active, enhancement: 30, auraTurns: 2, loaded: 4 });
    state = cast(state, 'Earth-5');
    assert.deepEqual([state.phase, state.lastRoll, state.players[0].mana, state.players[0].loaded], ['main', null, 0, 4]);
    assert.equal(state.players[1].hp, active ? 79 : 100); assert.equal(state.players[0].enhancement, active ? 0 : 30);
    assert.equal(strikes(state).length, 0);
    state = pass(state); assert.equal(state.players[1].hp, active ? 64 : 100); assert.equal(strikes(state).length, active ? 1 : 0); assertGame(state);
  }
});

test('both Earth seats maintain their own Golem state and strikes', () => {
  let state = fresh(['earth', 'earth']);
  for (const player of state.players) Object.assign(player, { shield: 30, golemActive: true });
  state = pass(state);
  assert.deepEqual(state.players.map(player => [player.shield, player.golemActive]), [[30, true], [15, true]]);
  state = pass(state);
  assert.deepEqual(state.players.map(player => [player.shield, player.golemActive]), [[30, true], [15, false]]);
  assert.deepEqual(strikes(state).map(entry => entry.visual.casterIndex), [0]); assertGame(state);
});

test('v14 Fire/Water saves migrate every current phase without replaying payments, Fate or outcomes', () => {
  const fireDeck = deck('fire', [...basics.fire, 'FAT-001']);
  const waterDeck = deck('water', [...basics.water, 'FAT-002']);
  let initial = createGame(4, { fire: fireDeck, water: waterDeck });
  const initiative = structuredClone(initial);
  initial = rollInitiative(rollInitiative(initial, 0, () => .9), 1, () => 0);
  hand(initial, 0, ['Fire-11', 'FAT-001']); hand(initial, 1, ['FAT-002']);
  const rolling = cast(initial, 'Fire-11'), fate = roll(rolling);
  const enhancement = activateEnhancement(initial), enhancementFate = rollEnhancement(enhancement, () => .5);
  const resolved = complete(rolling);
  for (const current of [initiative, initial, rolling, fate, enhancement, enhancementFate, resolved, endTurn(resolved), beginRefresh(endTurn(resolved)), pass(resolved)]) {
    const saved = structuredClone(current); saved.version = 14;
    for (const player of saved.players) { delete player.school; delete player.golemActive; delete player.golemProtectedUntilTurn; }
    const before = structuredClone(saved), migrated = migrateSavedGame(saved);
    assert.ok(migrated, `${current.phase} migrates`); assert.equal(migrated.version, SAVE_VERSION); assertGame(migrated);
    const stripped = structuredClone(migrated); stripped.version = 14;
    for (const player of stripped.players) { delete player.school; delete player.golemActive; delete player.golemProtectedUntilTurn; }
    assert.deepEqual(stripped, before); assert.deepEqual(saved, before);
    assert.deepEqual(migrated.players.map(player => player.id), ['fire', 'water']);
  }
});

test('invalid Golem ownership, protection, mirror IDs and visual traces are rejected on save', () => {
  const initial = fresh(['earth', 'earth']);
  for (const mutate of [
    state => { state.players[1].id = 'seat-1'; },
    state => { state.players[0].element = 1; },
    state => { state.players[0].golemProtectedUntilTurn = 2; },
    state => { state.players[0].golemActive = true; state.players[0].golemProtectedUntilTurn = 9; },
    state => { state.log[0].visual = { kind: 'golem-strike', casterIndex: 0, targetIndex: 0, amount: 15 }; },
  ]) { const state = structuredClone(initial); mutate(state); assert.equal(validateSavedGame(state), false); }
  const wrongSchool = fresh(['fire', 'water']); wrongSchool.players[0].golemActive = true;
  assert.equal(validateSavedGame(wrongSchool), false);
});
