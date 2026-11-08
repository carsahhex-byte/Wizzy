import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpellVisual, getResolvedSpellVisuals } from '../src/spell-visuals.js';
import { SPELL_CATALOG } from '../src/spells.js';
import {
  createGame, rollInitiative, selectCard, castSelected, rollDice, skipFate, castFateSelected,
  resolveSpell, endTurn, beginRefresh, toggleRefreshCard, confirmRefresh,
  activateAura, activateEnhancement, rollEnhancement, applyDamage,
} from '../src/game.js';

const EXPECTED = {
  'basic-attack': ['Fire-1', 'Fire-4', 'Fire-5', 'Fire-8', 'Fire-11', 'Water-1', 'Water-2', 'Water-4', 'Water-5', 'Water-8', 'Water-9', 'Water-11'],
  'simple-cast': ['Fire-6', 'Fire-12', 'Water-6', 'Water-12'],
  'large-cast': ['Fire-7', 'Fire-13', 'Fire-14', 'Water-7', 'Water-13', 'Water-14'],
  shield: ['Fire-3', 'Fire-10', 'Water-3', 'Water-10'],
  'power-up': ['Fire-0', 'Fire-2', 'Fire-9'],
};

const allCards = player => [...player.hand, ...player.deck, ...player.discard];
function deck(element, required = []) {
  const counts = new Map();
  for (const spellId of required) counts.set(spellId, (counts.get(spellId) ?? 0) + 1);
  let total = required.length;
  for (let number = element === 'fire' ? 0 : 1; number <= 14 && total < 30; number += 1) {
    const spellId = `${element === 'fire' ? 'Fire' : 'Water'}-${number}`;
    const quantity = Math.min(3 - (counts.get(spellId) ?? 0), 30 - total);
    if (quantity > 0) counts.set(spellId, (counts.get(spellId) ?? 0) + quantity);
    total += quantity;
  }
  return { element, entries: [...counts].map(([spellId, quantity]) => ({ spellId, quantity })) };
}
function handOf(state, index, spellIds) {
  const player = state.players[index], cards = allCards(player);
  player.hand = spellIds.map(spellId => {
    const position = cards.findIndex(card => card.spellId === spellId);
    assert.notEqual(position, -1, `${spellId} must be in the fixture deck`);
    return cards.splice(position, 1)[0];
  });
  player.deck = cards; player.discard = [];
  return state;
}
function fresh({ fire = ['Fire-0', 'Fire-1', 'Fire-3'], water = ['Water-1', 'Water-3'] } = {}) {
  let state = createGame(71, { fire: deck('fire', fire), water: deck('water', water) });
  state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
  handOf(state, 0, fire); handOf(state, 1, water);
  return state;
}
function cast(state, spellId) {
  const card = state.players[state.activePlayer].hand.find(card => card.spellId === spellId);
  assert.ok(card, `${spellId} is in hand`);
  return castSelected(selectCard(state, card.id));
}
function complete(state) {
  if (state.phase === 'rolling') state = rollDice(state, () => .5);
  while (state.phase === 'fate') state = skipFate(state);
  return resolveSpell(state);
}
const pass = state => endTurn(endTurn(state));
function appendLog(state, type, message, playerId = null) {
  const next = structuredClone(state);
  next.log.push({ id: next.log.length + 1, round: next.round, type, message, playerId });
  return next;
}
function privateView(state, viewer) {
  const next = structuredClone(state);
  next.players.forEach((player, index) => {
    player.handCount = player.hand.length; player.deckCount = player.deck.length; player.deck = [];
    if (index !== viewer) { player.hand = []; player.deckDefinition = null; }
  });
  if (next.pendingSpell?.casterIndex !== viewer) {
    next.pendingCardId = null;
    if (next.pendingSpell) delete next.pendingSpell.cardId;
  }
  return next;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('all 29 primary spells have the specified routes and Fate has no animation', () => {
  const mapped = Object.values(EXPECTED).flat();
  assert.equal(mapped.length, 29); assert.equal(new Set(mapped).size, 29);
  assert.equal(Object.keys(SPELL_CATALOG).length, 32);
  for (const [kind, spellIds] of Object.entries(EXPECTED)) for (const spellId of spellIds) {
    const spell = SPELL_CATALOG[spellId], damaging = !['shield', 'power-up'].includes(kind);
    assert.deepEqual(getSpellVisual(spellId), { kind, element: spell.element, manaCost: spell.manaCost, damaging }, spellId);
  }
  for (const spell of Object.values(SPELL_CATALOG)) {
    assert.equal(mapped.includes(spell.spellId), spell.category !== 'Fate');
    if (spell.category === 'Fate') assert.equal(getSpellVisual(spell.spellId), null);
  }
});

test('damage routing covers Mana boundaries while Shield and power-up override the price tiers', () => {
  for (const [spellId, cost, kind] of [
    ['Fire-5', 3, 'basic-attack'], ['Fire-12', 4, 'simple-cast'], ['Fire-6', 5, 'simple-cast'], ['Fire-13', 6, 'large-cast'],
    ['Water-5', 3, 'basic-attack'], ['Water-12', 4, 'simple-cast'], ['Water-6', 5, 'simple-cast'], ['Water-13', 6, 'large-cast'],
    ['Fire-0', 0, 'power-up'], ['Fire-9', 2, 'power-up'], ['Fire-10', 3, 'shield'], ['Water-10', 3, 'shield'],
  ]) {
    assert.equal(getSpellVisual(spellId).manaCost, cost); assert.equal(getSpellVisual(spellId).kind, kind);
  }
});

test('unknown, retired, malformed and prototype names never produce an animation', () => {
  for (const value of [null, undefined, 1, {}, [], 'Fire-15', 'Fire--1', 'FIR-001', 'Earth-1', 'fire-1', '__proto__', 'constructor']) {
    assert.equal(getSpellVisual(value), null);
  }
  const visual = getSpellVisual('Fire-1'); visual.kind = 'changed';
  assert.equal(getSpellVisual('Fire-1').kind, 'basic-attack');
});

test('an immediate Fire-0 completion produces exactly one keyed primary event', () => {
  const before = fresh(), card = before.players[0].hand.find(card => card.spellId === 'Fire-0');
  const after = cast(before, 'Fire-0'), [event] = getResolvedSpellVisuals(before, after);
  assert.deepEqual(event, {
    key: `${after.log.at(-1).id}:${before.log.length + 1}:0:Fire-0`,
    logId: after.log.at(-1).id, commitLogId: before.log.length + 1, cardId: card.id,
    casterIndex: 0, spellId: 'Fire-0', kind: 'power-up', element: 'Fire', manaCost: 0, damaging: false,
  });
  assert.deepEqual(getResolvedSpellVisuals(after, after), []);
  assert.deepEqual(getResolvedSpellVisuals(after, JSON.parse(JSON.stringify(after))), []);
  assert.deepEqual(getResolvedSpellVisuals(after, endTurn(after)), []);
});

test('rolled spells animate only on completion and the same commitment has one stable key', () => {
  const before = fresh(), committed = cast(before, 'Fire-1');
  const rolled = rollDice(committed, () => .5), resolved = resolveSpell(rolled);
  assert.deepEqual(getResolvedSpellVisuals(before, committed), []);
  assert.deepEqual(getResolvedSpellVisuals(committed, rolled), []);
  const fromMain = getResolvedSpellVisuals(before, resolved), fromCommit = getResolvedSpellVisuals(committed, resolved);
  const fromRoll = getResolvedSpellVisuals(rolled, resolved);
  assert.equal(fromMain.length, 1); assert.equal(fromMain[0].kind, 'basic-attack');
  assert.equal(fromMain[0].key, fromCommit[0].key); assert.equal(fromCommit[0].key, fromRoll[0].key);
  assert.equal(fromCommit[0].cardId, committed.pendingCardId);
});

test('batched online updates collect multiple resolutions in log order with unique commitments', () => {
  const before = fresh();
  let state = cast(before, 'Fire-0');
  state = pass(state); state = complete(cast(state, 'Water-3'));
  state = pass(state); state = complete(cast(state, 'Fire-1'));
  const events = getResolvedSpellVisuals(before, state);
  assert.deepEqual(events.map(event => [event.spellId, event.casterIndex, event.kind]), [['Fire-0', 0, 'power-up'], ['Water-3', 1, 'shield'], ['Fire-1', 0, 'basic-attack']]);
  assert.equal(new Set(events.map(event => event.key)).size, 3);
  assert.ok(events.every((event, index) => index === 0 || event.logId > events[index - 1].logId));
  assert.deepEqual(getResolvedSpellVisuals(state, pass(state)), []);
});

test('two completed copies of the same spell retain different event keys', () => {
  const before = fresh({ fire: ['Fire-0', 'Fire-0', 'Fire-1'] });
  let state = cast(before, 'Fire-0'); state = pass(pass(state)); state = cast(state, 'Fire-0');
  const events = getResolvedSpellVisuals(before, state);
  assert.deepEqual(events.map(event => event.spellId), ['Fire-0', 'Fire-0']);
  assert.notEqual(events[0].key, events[1].key); assert.notEqual(events[0].commitLogId, events[1].commitLogId);
});

test('batched refreshes never guess the wrong physical copy for a later completed spell', () => {
  const before = fresh({ fire: ['Fire-0', 'Fire-0', 'Fire-1'] }), discarded = before.players[0].hand[0].id;
  let state = confirmRefresh(toggleRefreshCard(beginRefresh(endTurn(before)), discarded));
  state = pass(state); state = cast(state, 'Fire-0');
  const [event] = getResolvedSpellVisuals(before, state);
  assert.equal(event.spellId, 'Fire-0'); assert.equal(event.cardId, null);
  assert.ok(event.commitLogId > before.log.length); assert.equal(event.kind, 'power-up');
});

test('private online views can collect opposing spell completions without hands, draw orders or pending slab IDs', () => {
  const before = pass(fresh()), committed = cast(before, 'Water-1'), resolved = complete(committed);
  for (const baseline of [before, committed]) {
    const events = getResolvedSpellVisuals(privateView(baseline, 0), privateView(resolved, 0));
    assert.equal(events.length, 1); assert.equal(events[0].casterIndex, 1); assert.equal(events[0].element, 'Water');
    assert.equal(events[0].spellId, 'Water-1');
  }
});

test('Fate links do not animate and the final resolution produces only the primary visual', () => {
  const before = fresh({ fire: ['Fire-1', 'FAT-001'], water: ['Water-1', 'FAT-002'] });
  const committed = cast(before, 'Fire-1'), rolled = rollDice(committed, () => .5);
  let linked = castFateSelected(selectCard(rolled, rolled.players[1].hand.find(card => card.spellId === 'FAT-002').id));
  assert.deepEqual(getResolvedSpellVisuals(committed, linked), []);
  linked = castFateSelected(selectCard(linked, linked.players[0].hand.find(card => card.spellId === 'FAT-001').id));
  assert.deepEqual(getResolvedSpellVisuals(rolled, linked), []);
  const events = getResolvedSpellVisuals(before, resolveSpell(linked));
  assert.deepEqual(events.map(event => event.spellId), ['Fire-1']);
});

test('Aura, Enhancement, refreshes and an aborted committed primary have no completed spell visual', () => {
  const before = fresh(), aura = activateAura(before), enhancement = rollEnhancement(activateEnhancement(before), () => .5);
  const refreshed = confirmRefresh(toggleRefreshCard(beginRefresh(endTurn(before)), before.players[0].hand[0].id));
  const aborted = applyDamage(cast(before, 'Fire-1'), 0, 100, { selfDamage: true });
  for (const after of [aura, enhancement, refreshed, aborted]) assert.deepEqual(getResolvedSpellVisuals(before, after), []);
});

test('initial loads, reconnect baselines, reset histories and changed prefixes do not replay old animations', () => {
  const before = fresh(), after = complete(cast(before, 'Fire-1'));
  assert.deepEqual(getResolvedSpellVisuals(null, after), []);
  assert.deepEqual(getResolvedSpellVisuals(undefined, after), []);
  assert.deepEqual(getResolvedSpellVisuals({}, after), []);
  assert.deepEqual(getResolvedSpellVisuals(after, fresh()), []);
  const changed = structuredClone(after); changed.log[0].message = 'Different duel history.';
  assert.deepEqual(getResolvedSpellVisuals(before, changed), []);
  const truncated = structuredClone(after); truncated.log.shift();
  assert.deepEqual(getResolvedSpellVisuals(before, truncated), []);
  const migrated = { ...after, version: after.version + 1 };
  assert.deepEqual(getResolvedSpellVisuals(before, migrated), []);
  const otherStarter = { ...after, startingPlayer: 1 };
  assert.deepEqual(getResolvedSpellVisuals(before, otherStarter), []);
});

test('completion requires a matching canonical cast and a newly discarded primary', () => {
  const before = fresh(), message = 'Fire-1 resolves and moves to discard.';
  assert.deepEqual(getResolvedSpellVisuals(before, appendLog(before, 'resolve', message, 'fire')), []);
  const after = complete(cast(before, 'Fire-1'));
  const noDiscard = structuredClone(after); noDiscard.players[0].discard = [];
  assert.deepEqual(getResolvedSpellVisuals(before, noDiscard), []);
  const wrongOwner = structuredClone(after); wrongOwner.log.at(-1).playerId = 'water';
  assert.deepEqual(getResolvedSpellVisuals(before, wrongOwner), []);
  const wrongSpell = structuredClone(after); wrongSpell.log.at(-1).message = 'Fire-2 resolves and moves to discard.';
  assert.deepEqual(getResolvedSpellVisuals(before, wrongSpell), []);
  const misleading = appendLog(before, 'resolve', 'Fire gains 1 Ember.', 'fire');
  assert.deepEqual(getResolvedSpellVisuals(before, misleading), []);
  const duplicate = appendLog(after, 'resolve', message, 'fire');
  assert.equal(getResolvedSpellVisuals(before, duplicate).length, 1);
});

test('discard resets suppress unrelated history and fully shielded damage still animates', () => {
  const start = fresh(); start.players[1].shield = 30;
  const first = complete(cast(start, 'Fire-1'));
  assert.equal(first.players[1].hp, 100); assert.equal(getResolvedSpellVisuals(start, first)[0].kind, 'basic-attack');
  let second = pass(pass(first)); second = complete(cast(second, 'Fire-3'));
  assert.equal(getResolvedSpellVisuals(first, second)[0].kind, 'shield');
  const resetDiscard = structuredClone(second); resetDiscard.players[0].discard.shift();
  assert.deepEqual(getResolvedSpellVisuals(first, resetDiscard), []);
});

test('visual collection is pure and accepts frozen JSON snapshots', () => {
  const previous = fresh(), next = complete(cast(previous, 'Fire-1'));
  const previousJSON = JSON.stringify(previous), nextJSON = JSON.stringify(next);
  const events = getResolvedSpellVisuals(deepFreeze(previous), deepFreeze(next));
  assert.equal(events.length, 1);
  assert.equal(JSON.stringify(previous), previousJSON); assert.equal(JSON.stringify(next), nextJSON);
  events[0].kind = 'changed';
  assert.equal(getResolvedSpellVisuals(previous, next)[0].kind, 'basic-attack');
});
