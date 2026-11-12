import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, castSelected, castFateSelected,
  rollDice, skipFate, resolveSpell, endTurn, cancelStagedAction, applyDamage,
  assertGame, validateSavedGame, migrateSavedGame, SAVE_VERSION,
} from '../src/game.js';
import { applySpellEffect, SPELL_RULES } from '../src/effects.js';
import { ACTIVE_SPELLBOOK_ID } from '../src/spellbooks.js';

const basic = {
  fire: ['Fire-16', 'Fire-16', 'Fire-11', 'Fire-2', 'Fire-15', 'Fire-6'],
  earth: ['Earth-6', 'Earth-6', 'Earth-1', 'Earth-2', 'Earth-3', 'Earth-4', 'Earth-5'],
};
function deck(element, extra = []) {
  const counts = new Map();
  for (const spellId of [...basic[element], ...extra]) counts.set(spellId, (counts.get(spellId) || 0) + 1);
  return { element, spellbookId: ACTIVE_SPELLBOOK_ID, entries: [...counts].map(([spellId, quantity]) => ({ spellId, quantity })) };
}
function fresh({ schools = ['fire', 'earth'], first = 0, extra = [[], []] } = {}) {
  let state = createGame(37, { players: schools.map((element, index) => ({ element, deck: deck(element, extra[index]) })) });
  state = rollInitiative(state, 0, () => first === 0 ? .99 : 0);
  return rollInitiative(state, 1, () => first === 1 ? .99 : 0);
}
function hand(state, index, spellIds) {
  const player = state.players[index], pool = [...player.hand, ...player.deck, ...player.discard];
  player.hand = spellIds.map(id => {
    const position = pool.findIndex(card => card.spellId === id);
    assert.ok(position >= 0, `${id} belongs to the fixture`);
    return pool.splice(position, 1)[0];
  });
  player.deck = pool; player.discard = [];
  return state;
}
function cast(state, spellId) {
  const card = state.players[state.activePlayer].hand.find(card => card.spellId === spellId);
  assert.ok(card, `${spellId} is in hand`);
  return castSelected(selectCard(state, card.id));
}
function roll(state, dice = [3, 4]) {
  let index = 0;
  return rollDice(state, () => (dice[index++] - 1) / 6);
}
function finish(state) {
  while (state.phase === 'fate') state = skipFate(state);
  return resolveSpell(state);
}
function complete(state, dice) {
  return finish(state.phase === 'rolling' ? roll(state, dice) : state);
}
const pass = state => endTurn(endTurn(state));
function fate(state, spellId) {
  const card = state.players[state.fatePlayer].hand.find(card => card.spellId === spellId);
  assert.ok(card, `${spellId} is in the responder hand`);
  return castFateSelected(selectCard(state, card.id));
}
function anti({ shield = 0, rollTotal = 7, fire = {}, earth = {} } = {}) {
  const state = fresh();
  Object.assign(state.players[0], fire); Object.assign(state.players[1], { shield, ...earth });
  const events = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-16', rollTotal });
  return { state, fire: state.players[0], earth: state.players[1], events };
}

test('Anti-Furnace strips fixed Shield before normal damage and rewards only a zero special hit', () => {
  for (const [shield, removed, hpDamage, remainingShield, reward] of [
    [0, 0, 10, 0, 2], [3, 3, 10, 0, 0], [15, 15, 10, 0, 0],
    [20, 15, 5, 0, 0], [30, 15, 0, 5, 0],
  ]) {
    const result = anti({ shield });
    assert.deepEqual([result.earth.hp, result.earth.shield, result.fire.element], [100 - hpDamage, remainingShield, reward]);
    assert.equal(result.events[0].type, 'shield'); assert.equal(result.events[0].removed, removed);
    assert.equal(result.events[1].type, 'damage'); assert.equal(result.events[1].baseDamage, 10);
    assert.deepEqual(result.earth.opponentTurnDamage, { turn: 1, shield: shield - remainingShield, hp: hpDamage, damagingSpell: true });
  }
});

test('below seven Anti-Furnace has no Shield strip or Ember reward, even against zero Shield', () => {
  assert.equal(SPELL_RULES['Fire-16'].requiresRoll, true);
  for (const shield of [0, 5, 30]) {
    const { fire, earth, events } = anti({ shield, rollTotal: 6 });
    assert.equal(fire.element, 0); assert.equal(earth.shield, Math.max(0, shield - 10));
    assert.equal(earth.hp, 100 - Math.max(0, 10 - shield));
    assert.equal(events.some(event => event.type === 'shield'), false);
  }
});

test('Anti-Furnace applies Ember, Enhancement and Aura only to normal damage, then banks new Embers', () => {
  for (const shield of [0, 30]) {
    const { fire, earth, events } = anti({ shield, fire: { element: 5, enhancement: 30, auraTurns: 2 } });
    const damage = events.find(event => event.type === 'damage');
    assert.equal(damage.totalDamage, 17); assert.equal(damage.emberBonus, 25);
    assert.equal(events[0].removed, Math.min(15, shield), 'Shield damage does not receive percentage bonuses');
    assert.deepEqual([fire.element, fire.enhancement, fire.auraTurns], [shield ? 0 : 2, 0, 2]);
    assert.deepEqual([earth.hp, earth.shield], [shield ? 98 : 83, 0]);
    assert.deepEqual(events.filter(event => event.resource === 'element').map(event => event.amount), shield ? [-5] : [-5, 2]);
  }
});

test('Anti-Furnace special Shield damage still applies during Merciful while the normal hit bypasses', () => {
  const { earth, events } = anti({ shield: 20, earth: { shieldBypassUntilOpponentTurn: 1 } });
  const damage = events.find(event => event.type === 'damage');
  assert.equal(events[0].removed, 15); assert.equal(damage.bypassShield, true);
  assert.deepEqual([earth.shield, earth.hp], [5, 90]);
  assert.deepEqual(earth.opponentTurnDamage, { turn: 1, shield: 15, hp: 10, damagingSpell: true });
});

test('Anti-Furnace tracks actual overkill losses rather than nominal damage', () => {
  let state = hand(fresh(), 0, ['Fire-16']); state.players[1].hp = 3;
  const before = structuredClone(state);
  state = complete(cast(state, 'Fire-16'));
  assert.equal(state.status, 'finished'); assert.equal(state.players[1].opponentTurnDamage.hp, 3);
  assert.equal(state.players[1].opponentTurnDamage.shield, 0); assert.deepEqual(before.players[1].opponentTurnDamage, { turn: 1, shield: 0, hp: 0, damagingSpell: false });
  assertGame(state);
});

test('Anti-Furnace uses final post-Fate thresholds, pays three Mana once and consumes its primary slot', () => {
  for (const raises of [false, true]) {
    let state = fresh({ extra: [['FAT-001'], ['FAT-002']] });
    hand(state, 0, ['Fire-16', ...(raises ? ['FAT-001'] : [])]);
    hand(state, 1, raises ? [] : ['FAT-002']);
    state = roll(cast(state, 'Fire-16'), raises ? [3, 3] : [3, 4]);
    assert.equal(state.players[0].mana, 0); assert.equal(state.primaryUsed, true);
    if (raises) state = fate(state, 'FAT-001'); else state = fate(state, 'FAT-002');
    state = finish(state);
    assert.equal(state.players[0].element, raises ? 2 : 0);
    assert.equal(state.lastRoll.total, raises ? 10 : 3);
    assert.equal(state.players[0].discard.filter(card => card.spellId === 'Fire-16').length, 1);
    assert.equal(castSelected(state), state); assertGame(state);
  }
});

test('Metamorphic halves actual Shield plus HP loss, rounds down, caps Shield and can trigger Golem', () => {
  assert.equal(SPELL_RULES['Earth-6'].requiresRoll, true);
  for (const [shield, hp, startShield, rollTotal, expected] of [
    [20, 10, 0, 5, 15], [14, 7, 0, 5, 10], [20, 11, 5, 5, 20],
    [20, 100, 29, 5, 30], [20, 10, 0, 4, 0],
  ]) {
    const state = pass(fresh({ schools: ['earth', 'fire'], first: 1 }));
    const earth = state.players[0]; earth.shield = startShield;
    earth.opponentTurnDamage = { turn: 1, shield, hp, damagingSpell: true };
    applySpellEffect(state, { casterIndex: 0, spellId: 'Earth-6', rollTotal });
    assert.equal(earth.shield, expected); assert.equal(earth.golemActive, expected >= 20);
  }
});

test('Metamorphic rejects stale or absent incoming damage, and preserves offensive bonuses', () => {
  for (const previous of [undefined, { turn: 0, shield: 20, hp: 20, damagingSpell: true }, { turn: 1, shield: 20, hp: 20, damagingSpell: false }]) {
    const state = pass(fresh({ schools: ['earth', 'fire'], first: 1 }));
    const earth = state.players[0]; earth.enhancement = 30; earth.auraTurns = 2;
    if (previous) earth.opponentTurnDamage = previous; else delete earth.opponentTurnDamage;
    applySpellEffect(state, { casterIndex: 0, spellId: 'Earth-6', rollTotal: 12 });
    assert.deepEqual([earth.shield, earth.enhancement, earth.auraTurns], [0, 30, 2]);
    assert.equal(state.players[1].hp, 100);
  }
});

for (const earthSeat of [0, 1]) for (const earthFirst of [false, true]) {
  test(`Metamorphic reads the last enemy turn across seat ${earthSeat} and ${earthFirst ? 'next round' : 'same round'}`, () => {
    const schools = earthSeat === 0 ? ['earth', 'fire'] : ['fire', 'earth'];
    const fireSeat = 1 - earthSeat;
    let state = fresh({ schools, first: earthFirst ? earthSeat : fireSeat });
    hand(state, fireSeat, ['Fire-11']); hand(state, earthSeat, ['Earth-6']);
    if (earthFirst) state = pass(state);
    state = complete(cast(state, 'Fire-11')); state = pass(state);
    assert.equal(state.activePlayer, earthSeat); assert.equal(state.round, earthFirst ? 2 : 1);
    state.players[earthSeat].mana = 4;
    state = complete(cast(state, 'Earth-6'), [2, 3]);
    assert.deepEqual([state.players[earthSeat].shield, state.players[earthSeat].mana], [5, 0]);
    assertGame(state);
  });
}

test('Metamorphic clears the previous attack only on a committed new enemy turn and cannot reuse a skipped turn', () => {
  let state = fresh(); hand(state, 0, ['Fire-16']); hand(state, 1, ['Earth-6', 'Earth-6']);
  state.players[1].shield = 12; state.players[1].mana = 8;
  state = complete(cast(state, 'Fire-16')); state = pass(state);
  assert.deepEqual(state.players[1].opponentTurnDamage, { turn: 1, shield: 12, hp: 10, damagingSpell: true });
  state = complete(cast(state, 'Earth-6'), [2, 3]); assert.equal(state.players[1].shield, 11);
  const staged = endTurn(state);
  assert.equal(staged.players[1].opponentTurnDamage.hp, 10);
  assert.deepEqual(cancelStagedAction(staged), state, 'canceling the staged pass does not mutate the damage window');
  state = endTurn(staged);
  assert.deepEqual(state.players[1].opponentTurnDamage, { turn: 2, shield: 0, hp: 0, damagingSpell: false });
  state = pass(state);
  state = complete(cast(state, 'Earth-6'), [2, 3]);
  assert.equal(state.players[1].shield, 11); assertGame(state);
});

test('Metamorphic includes a damaging enemy turn’s Golem strike but excludes a Golem-only setup turn', () => {
  for (const attack of [false, true]) {
    let state = fresh({ schools: ['earth', 'earth'], first: 1 });
    hand(state, 0, ['Earth-6']); hand(state, 1, [attack ? 'Earth-1' : 'Earth-2']);
    Object.assign(state.players[1], { shield: 20, golemActive: true });
    state = complete(cast(state, attack ? 'Earth-1' : 'Earth-2')); state = pass(state);
    assert.equal(state.players[0].opponentTurnDamage.hp, attack ? 20 : 15);
    assert.equal(state.players[0].opponentTurnDamage.damagingSpell, attack);
    state.players[0].mana = 4; state = complete(cast(state, 'Earth-6'), [2, 3]);
    assert.equal(state.players[0].shield, attack ? 10 : 0); assertGame(state);
  }
});

test('Metamorphic uses final Fate-modified five threshold and pays four Mana even when it fails', () => {
  for (const raises of [false, true]) {
    let state = fresh({ extra: [['FAT-002'], ['FAT-001']] });
    hand(state, 0, ['Fire-11', ...(!raises ? ['FAT-002'] : [])]);
    hand(state, 1, ['Earth-6', ...(raises ? ['FAT-001'] : [])]);
    state = complete(cast(state, 'Fire-11')); state = pass(state); state.players[1].mana = 4;
    state = roll(cast(state, 'Earth-6'), raises ? [2, 2] : [2, 3]);
    state = fate(state, raises ? 'FAT-001' : 'FAT-002'); state = finish(state);
    assert.equal(state.lastRoll.total, raises ? 8 : 1); assert.equal(state.players[1].shield, raises ? 5 : 0);
    assert.equal(state.players[1].mana, 0); assert.equal(state.primaryUsed, true); assertGame(state);
  }
});

test('self damage never enters incoming damage totals, and generic damage alone does not count as a damaging spell', () => {
  let state = fresh(); hand(state, 1, ['Earth-6']);
  state = applyDamage(state, 1, 7, { selfDamage: true });
  assert.equal(state.players[1].opponentTurnDamage.hp, 0);
  state = applyDamage(state, 1, 9);
  assert.deepEqual(state.players[1].opponentTurnDamage, { turn: 1, shield: 0, hp: 9, damagingSpell: false });
  state = pass(state); state.players[1].mana = 4;
  const previous = structuredClone(state.players[1].opponentTurnDamage);
  state = applyDamage(state, 1, 3, { selfDamage: true });
  assert.deepEqual(state.players[1].opponentTurnDamage, previous);
  state = complete(cast(state, 'Earth-6'), [2, 3]); assert.equal(state.players[1].shield, 0); assertGame(state);
});

test('incoming damage survives JSON save round trips, while legacy saves remain valid without new tracking', () => {
  let state = fresh(); hand(state, 0, ['Fire-16']); state.players[1].shield = 18;
  state = complete(cast(state, 'Fire-16')); state = pass(state);
  const serialized = JSON.parse(JSON.stringify(state)); assert.equal(serialized.version, SAVE_VERSION);
  assert.equal(validateSavedGame(serialized), true); assert.deepEqual(migrateSavedGame(serialized), serialized);
  assert.deepEqual(serialized.players[1].opponentTurnDamage, { turn: 1, shield: 18, hp: 7, damagingSpell: true });
  const legacy = structuredClone(serialized); for (const player of legacy.players) delete player.opponentTurnDamage;
  assert.equal(validateSavedGame(legacy), true); assert.equal(migrateSavedGame(legacy), legacy);
  for (const invalid of [null, [], {}, { turn: -1, shield: 0, hp: 0, damagingSpell: false },
    { turn: 9, shield: 0, hp: 0, damagingSpell: false }, { turn: 1, shield: 31, hp: 0, damagingSpell: true },
    { turn: 1, shield: 0, hp: 101, damagingSpell: true }, { turn: 1, shield: 0, hp: .5, damagingSpell: true },
    { turn: 1, shield: 0, hp: 0, damagingSpell: 'yes' }]) {
    const bad = structuredClone(serialized); bad.players[1].opponentTurnDamage = invalid;
    assert.equal(validateSavedGame(bad), false); assert.equal(migrateSavedGame(bad), null);
  }
});

test('Metamorphic pending roll, Fate and resolving saves retain the incoming window without awarding twice', () => {
  let state = fresh({ extra: [['FAT-002'], ['FAT-001']] });
  hand(state, 0, ['Fire-11', 'FAT-002']); hand(state, 1, ['Earth-6', 'FAT-001']);
  state = complete(cast(state, 'Fire-11')); state = pass(state); state.players[1].mana = 4;
  const expected = structuredClone(state.players[1].opponentTurnDamage);
  state = cast(state, 'Earth-6');
  for (const phase of ['rolling', 'fate', 'resolving']) {
    assert.equal(state.phase, phase);
    const saved = JSON.parse(JSON.stringify(state));
    assert.equal(validateSavedGame(saved), true); assert.deepEqual(migrateSavedGame(saved), saved);
    assert.deepEqual(saved.players[1].opponentTurnDamage, expected);
    assert.deepEqual([saved.players[1].mana, saved.players[1].shield], [0, 0]);
    state = saved;
    if (phase === 'rolling') state = roll(state, [2, 3]);
    else if (phase === 'fate') while (state.phase === 'fate') state = skipFate(state);
  }
  state = resolveSpell(state);
  assert.equal(state.players[1].shield, 5); assert.equal(resolveSpell(state), state); assertGame(state);
});
