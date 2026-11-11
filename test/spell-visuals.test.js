import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpellVisual, getResolvedSpellVisuals, getResolvedBattleVisuals } from '../src/spell-visuals.js';
import { SPELL_CATALOG } from '../src/spells.js';
import {
  createGame, rollInitiative, selectCard, castSelected, rollDice, skipFate, castFateSelected,
  resolveSpell, endTurn, beginRefresh, toggleRefreshCard, confirmRefresh,
  activateAura, activateEnhancement, rollEnhancement, applyDamage,
} from '../src/game.js';

const EXPECTED = {
  'basic-attack': ['Fire-1', 'Fire-4', 'Fire-5', 'Fire-8', 'Fire-11', 'Water-1', 'Water-2', 'Water-4', 'Water-5', 'Water-8', 'Water-9', 'Water-11', 'Water-12', 'Earth-1', 'Earth-3'],
  'simple-cast': ['Fire-6', 'Fire-12', 'Water-6'],
  'large-cast': ['Fire-7', 'Fire-13', 'Fire-14', 'Water-7', 'Water-13', 'Water-14', 'Earth-5'],
  shield: ['Fire-3', 'Fire-10', 'Water-3', 'Water-10', 'Earth-2'],
  'power-up': ['Fire-0', 'Fire-2', 'Fire-9', 'Fire-15', 'Water-0', 'Earth-4'],
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

test('all 36 primary spells have the specified routes and Fate has no primary animation', () => {
  const mapped = Object.values(EXPECTED).flat();
  assert.equal(mapped.length, 36); assert.equal(new Set(mapped).size, 36);
  assert.equal(Object.keys(SPELL_CATALOG).length, 39);
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
    ['Water-5', 3, 'basic-attack'], ['Water-12', 3, 'basic-attack'], ['Water-6', 5, 'simple-cast'], ['Water-13', 6, 'large-cast'],
    ['Fire-0', 0, 'power-up'], ['Fire-15', 0, 'power-up'], ['Fire-9', 2, 'power-up'], ['Fire-10', 3, 'shield'], ['Water-10', 3, 'shield'],
    ['Water-0', 0, 'power-up'],
  ]) {
    assert.equal(getSpellVisual(spellId).manaCost, cost); assert.equal(getSpellVisual(spellId).kind, kind);
  }
});

test('resumed casts at prior prices animate once without changing paid costs', () => {
  for (const [spellId, casterIndex, oldCost, currentCost, kind] of [['Fire-11', 0, 3, 2, 'basic-attack'], ['Water-12', 1, 4, 3, 'basic-attack'], ['Water-14', 1, 8, 6, 'large-cast']]) {
    let initial = fresh({ fire: ['Fire-11'], water: ['Water-12', 'Water-14'] });
    if (casterIndex === 1) initial = pass(initial);
    initial.players[casterIndex].mana = 10;
    const pending = cast(initial, spellId);
    assert.equal(SPELL_CATALOG[spellId].manaCost, currentCost);
    pending.players[casterIndex].mana = 10 - oldCost;
    const commitment = pending.log.findLast(entry => entry.type === 'cast');
    commitment.message = `${pending.players[casterIndex].name} casts ${spellId} for ${oldCost} mana.`;
    const snapshot = structuredClone(pending), after = complete(pending);
    const events = getResolvedSpellVisuals(pending, after);
    assert.equal(events.length, 1);
    assert.equal(events[0].spellId, spellId); assert.equal(events[0].kind, kind);
    assert.equal(events[0].manaCost, SPELL_CATALOG[spellId].manaCost);
    assert.equal(after.log.findLast(entry => entry.type === 'cast').message, commitment.message);
    assert.deepEqual(pending, snapshot);
    assert.equal(getResolvedSpellVisuals(privateView(pending, 1 - casterIndex), privateView(after, 1 - casterIndex)).length, 1);
    assert.deepEqual(getResolvedSpellVisuals(after, after), []);
    assert.deepEqual(getResolvedSpellVisuals(null, after), []);
    for (const cost of [1, 5, 30]) {
      const wrongBefore = structuredClone(pending), wrongAfter = structuredClone(after);
      for (const state of [wrongBefore, wrongAfter]) state.log.findLast(entry => entry.type === 'cast').message = `${state.players[casterIndex].name} casts ${spellId} for ${cost} mana.`;
      assert.deepEqual(getResolvedSpellVisuals(wrongBefore, wrongAfter), [], `unexpected cost ${cost} is not a legacy exception`);
    }
  }
});

test('unknown, retired, malformed and prototype names never produce an animation', () => {
  for (const value of [null, undefined, 1, {}, [], 'Fire-16', 'Fire--1', 'FIR-001', 'Earth-6', 'fire-1', '__proto__', 'constructor']) {
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

test('Fire-15 gets one power-up visual after its conditional resource roll resolves', () => {
  const before = fresh({fire:['Fire-15'],water:['Water-1']});
  before.players[0].mana=0;
  const committed=cast(before,'Fire-15');
  assert.equal(committed.players[0].mana,0,'Fire-15 still waits for its resolved Mana threshold');
  assert.equal(Object.hasOwn(committed.pendingSpell,'manaOnCastApplied'),false);
  assert.deepEqual(getResolvedBattleVisuals(before,committed),[]);
  const after=complete(committed);
  const [event]=getResolvedSpellVisuals(before,after);
  assert.equal(event.spellId,'Fire-15');
  assert.equal(event.kind,'power-up');
  assert.equal(event.damaging,false);
  assert.equal(event.manaCost,0);
  assert.deepEqual([after.players[0].mana,after.players[0].element],[1,1]);
  assert.deepEqual(getResolvedSpellVisuals(after,JSON.parse(JSON.stringify(after))),[]);
});

test('Water-0 cast Mana has no visual and its completed Flow has one Water power-up', () => {
  const before = pass(fresh({fire:['Fire-1','FAT-001'],water:['Water-0','FAT-003']}));
  Object.assign(before.players[1], {mana:0,element:4,loaded:4,enhancement:20,auraTurns:3});
  const card = before.players[1].hand.find(card => card.spellId === 'Water-0');
  const committed = cast(before,'Water-0');
  const commitment = committed.log.find(entry => entry.id > before.log.length && entry.type === 'cast');
  assert.equal(committed.phase,'rolling');
  assert.equal(committed.pendingSpell.manaOnCastApplied,true);
  assert.deepEqual([committed.players[1].mana,committed.players[1].element],[1,4], 'Mana is already granted while Flow still waits');
  assert.deepEqual(getResolvedBattleVisuals(before,committed),[]);
  assert.deepEqual(getResolvedBattleVisuals(null,committed),[], 'a cast-time Mana gain is not an animation completion');
  const rolled = rollDice(committed,()=>.5);
  assert.equal(rolled.pendingSpell.manaOnCastApplied,true);
  assert.equal(rolled.players[1].mana,1);
  assert.deepEqual(getResolvedBattleVisuals(committed,rolled),[]);
  const after = complete(JSON.parse(JSON.stringify(rolled))), events = getResolvedBattleVisuals(before,after);
  assert.equal(events.length,1);
  assert.deepEqual(events[0], {
    key:`${after.log.at(-1).id}:${commitment.id}:1:Water-0`,
    logId:after.log.at(-1).id,commitLogId:commitment.id,cardId:card.id,
    casterIndex:1,spellId:'Water-0',kind:'power-up',element:'Water',manaCost:0,damaging:false,modifiedTotal:12,
  });
  assert.deepEqual([after.phase,after.primaryUsed,after.primaryAction,after.pendingSpell],['main',true,'spell',null]);
  assert.equal(after.lastRoll.spellId,'Water-0');
  assert.equal(after.lastRoll.loadedBonus,4);
  assert.deepEqual([after.players[1].mana,after.players[1].element,after.players[1].loaded,after.players[1].enhancement,after.players[1].auraTurns],[1,5,0,20,3]);
  assert.equal(after.players[1].discard.filter(card=>card.spellId==='Water-0').length,1);
  assert.deepEqual(getResolvedSpellVisuals(before,after),events);
  assert.deepEqual(getResolvedBattleVisuals(rolled,after),events, 'resuming after the cast does not create a second Mana visual');
  for(const viewer of[0,1])assert.deepEqual(getResolvedBattleVisuals(privateView(before,viewer),privateView(after,viewer)),events);
  assert.deepEqual(getResolvedBattleVisuals(after,structuredClone(after)),[]);
  assert.deepEqual(getResolvedBattleVisuals(null,after),[]);
  assert.deepEqual(getResolvedBattleVisuals(after,endTurn(after)),[]);
});

test('Water-0 below seven keeps its cast Mana and plays only the ordinary Flow power-up', () => {
  const before=pass(fresh({fire:['Fire-1'],water:['Water-0']}));
  before.players[1].mana=0;
  const committed=cast(before,'Water-0'), rolled=rollDice(committed,()=>0);
  assert.deepEqual([committed.players[1].mana,committed.players[1].element],[1,0]);
  assert.deepEqual(getResolvedBattleVisuals(before,committed),[]);
  assert.deepEqual(getResolvedBattleVisuals(committed,rolled),[]);
  const after=resolveSpell(rolled), events=getResolvedBattleVisuals(rolled,after);
  assert.equal(after.lastRoll.total,2);
  assert.deepEqual([after.players[1].mana,after.players[1].element],[1,1]);
  assert.equal(events.length,1);
  assert.equal(events[0].kind,'power-up');
  assert.deepEqual(getResolvedBattleVisuals(after,structuredClone(after)),[]);
});

test('Water-0 Fate changes only its resolved Flow reward, with one completion visual', () => {
  const before=pass(fresh({fire:['Fire-1','FAT-002'],water:['Water-0','FAT-001','FAT-003']}));
  before.players[1].mana=0;
  const committed=cast(before,'Water-0');
  const dice=[2.5/6,3.5/6];
  const rolled=rollDice(committed,()=>dice.shift());
  const defend=castFateSelected(selectCard(rolled,rolled.players[0].hand.find(card=>card.spellId==='FAT-002').id));
  assert.equal(defend.lastRoll.total,3);
  const linked=castFateSelected(selectCard(defend,defend.players[1].hand.find(card=>card.spellId==='FAT-001').id));
  assert.equal(linked.lastRoll.total,7);
  for(const pending of [committed,rolled,defend,linked]){
    assert.deepEqual([pending.players[1].mana,pending.players[1].element],[1,0]);
    assert.deepEqual(getResolvedBattleVisuals(before,pending).filter(event=>event.kind!=='fate'),[], 'cast Mana and Fate feedback never start the Flow animation early');
  }
  const after=complete(linked), events=getResolvedBattleVisuals(before,after);
  assert.deepEqual([after.players[1].mana,after.players[1].element],[1,2]);
  assert.deepEqual(events.map(event=>event.kind),['fate','fate','power-up']);
  const primary=events.filter(event=>event.kind!=='fate');
  assert.equal(primary[0].spellId,'Water-0');assert.equal(primary[0].modifiedTotal,7);
  for(const viewer of [0,1])assert.deepEqual(getResolvedBattleVisuals(privateView(linked,viewer),privateView(after,viewer)),primary);
  const snapshot=structuredClone(after);
  assert.deepEqual(getResolvedBattleVisuals(after,snapshot),[]);
  assert.deepEqual(getResolvedBattleVisuals(null,snapshot),[]);
  assert.deepEqual(after,snapshot, 'visual collection never reapplies the immediate Mana or resolved Flow');
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

test('Fate links never masquerade as primaries and final resolution produces one primary visual', () => {
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

function enhance(state, dice = [3, 3]) {
  let index = 0;
  return complete(rollEnhancement(activateEnhancement(state), () => (dice[index++] - 1) / 6));
}

test('battle visuals emit one stable Enhancement event for every successful tier and actual capped gain', () => {
  for (const [dice, bank, bonus, gain] of [[[3, 3], 0, 10, 10], [[3, 6], 0, 20, 20], [[6, 6], 0, 30, 30], [[6, 6], 20, 30, 10]]) {
    const before = fresh(); before.players[0].enhancement = bank;
    const pending = activateEnhancement(before);
    let index = 0;
    const after = complete(rollEnhancement(pending, () => (dice[index++] - 1) / 6));
    assert.deepEqual(getResolvedBattleVisuals(before, pending), []);
    const [event] = getResolvedBattleVisuals(before, after);
    assert.deepEqual(event, {
      key: `enhancement:${after.log.at(-1).id}:0`, logId: after.log.at(-1).id, commitLogId: pending.log.at(-1).id,
      casterIndex: 0, element: 'Fire', kind: 'enhancement', spellId: null, manaCost: 0, damaging: false,
      enhancementBonus: bonus, enhancementGain: gain, enhancementBefore: bank, enhancementAfter: bank + gain,
    });
    assert.equal(getResolvedBattleVisuals(pending, after)[0].key, event.key);
    assert.deepEqual(getResolvedSpellVisuals(before, after), [], 'the original primary-only API remains unchanged');
    assert.deepEqual(getResolvedBattleVisuals(after, structuredClone(after)), []);
    assert.deepEqual(getResolvedBattleVisuals(after, endTurn(after)), []);
  }
});

test('Water Enhancement visuals are identical across local and either private online view', () => {
  const before = pass(fresh()), after = enhance(before, [3, 6]);
  const events = getResolvedBattleVisuals(before, after);
  assert.equal(events.length, 1); assert.equal(events[0].casterIndex, 1); assert.equal(events[0].element, 'Water');
  assert.equal(events[0].kind, 'enhancement'); assert.equal(events[0].enhancementGain, 20);
  for (const viewer of [0, 1]) assert.deepEqual(getResolvedBattleVisuals(privateView(before, viewer), privateView(after, viewer)), events);
});

test('Aura activation animates once while its owner passes, countdown and expiry never create another activation', () => {
  const before = fresh(), activated = activateAura(before), [event] = getResolvedBattleVisuals(before, activated);
  assert.deepEqual(event, { key: `aura:${activated.log.at(-1).id}:0`, logId: activated.log.at(-1).id, casterIndex: 0, element: 'Fire', kind: 'aura', spellId: null, manaCost: 1, damaging: false });
  assert.deepEqual(getResolvedBattleVisuals(activated, endTurn(activated)), []);
  let state = pass(activated);
  assert.equal(state.players[0].auraTurns, 3);
  assert.deepEqual(getResolvedBattleVisuals(activated, state), []);
  for (const remaining of [3, 2, 1]) {
    state = pass(state);
    assert.equal(state.players[0].auraTurns, remaining);
    const next = pass(state);
    assert.equal(next.players[0].auraTurns, remaining - 1);
    assert.deepEqual(getResolvedBattleVisuals(state, next), []);
    state = next;
  }
  assert.deepEqual(getResolvedBattleVisuals(activated, state), []);
  assert.equal(getResolvedBattleVisuals(before, state).length, 1, 'even a large batch contains just the one activation');
  const waterBefore = pass(fresh()), waterAfter = activateAura(waterBefore);
  const waterEvent = getResolvedBattleVisuals(waterBefore, waterAfter)[0];
  assert.equal(waterEvent.element, 'Water'); assert.equal(waterEvent.casterIndex, 1);
  for (const viewer of [0, 1]) assert.deepEqual(getResolvedBattleVisuals(privateView(waterBefore, viewer), privateView(waterAfter, viewer)), [waterEvent]);
});

test('a batched poll merges primaries, successful Enhancement and Aura in authoritative log order', () => {
  const before = fresh();
  let state = enhance(before, [3, 6]); state = pass(state); state = activateAura(state);
  state = pass(state); state = cast(state, 'Fire-0');
  state = pass(state); state = complete(cast(state, 'Water-1'));
  state = pass(state); state = complete(cast(state, 'Fire-1'));
  const events = getResolvedBattleVisuals(before, state);
  assert.deepEqual(events.map(event => [event.kind, event.casterIndex, event.spellId]), [
    ['enhancement', 0, null], ['aura', 1, null], ['power-up', 0, 'Fire-0'], ['basic-attack', 1, 'Water-1'], ['basic-attack', 0, 'Fire-1'],
  ]);
  assert.equal(new Set(events.map(event => event.key)).size, 5);
  assert.ok(events.every((event, index) => index === 0 || event.logId > events[index - 1].logId));
  assert.deepEqual(events.filter(event => event.spellId), getResolvedSpellVisuals(before, state));
  for (const viewer of [0, 1]) assert.deepEqual(getResolvedBattleVisuals(privateView(before, viewer), privateView(state, viewer)), events);
  assert.deepEqual(getResolvedBattleVisuals(state, structuredClone(state)), []);
});

test('failed, capped and legacy Enhancement have no ability visual; Fate gets dice feedback only', () => {
  const before = fresh(), failed = enhance(before, [2, 3]);
  assert.deepEqual(getResolvedBattleVisuals(before, failed), []);
  const capped = fresh(); capped.players[0].enhancement = 30;
  assert.deepEqual(getResolvedBattleVisuals(capped, enhance(capped, [6, 6])), []);
  const legacy = enhance(before, [6, 6]);
  legacy.players[0].enhancement = 10; legacy.lastRoll.enhancementAfter = 10;
  delete legacy.lastRoll.enhancementRule; delete legacy.lastRoll.enhancementBonus; delete legacy.lastRoll.enhancementGain;
  legacy.log.at(-1).message = 'Fire rolls 6 + 6 = 12 for Enhancement (6+): gains +10% damage; 10% Enh.';
  assert.deepEqual(getResolvedBattleVisuals(before, legacy), [], 'unmarked historical reward text is never inferred as a new tier animation');
  assert.deepEqual(getResolvedBattleVisuals(null, legacy), []);
  const fateBefore = fresh({ fire: ['Fire-1', 'FAT-001'], water: ['Water-1', 'FAT-002'] });
  let linked = rollDice(cast(fateBefore, 'Fire-1'), () => .5);
  linked = castFateSelected(selectCard(linked, linked.players[1].hand.find(card => card.spellId === 'FAT-002').id));
  assert.deepEqual(getResolvedBattleVisuals(fateBefore, linked).map(event=>event.kind), ['fate']);
});

test('ability visuals require unchanged history, canonical caster, cost and mathematically valid positive tier rewards', () => {
  const before = fresh(), success = enhance(before, [3, 6]), aura = activateAura(before);
  const invalidEnhancementMessages = [
    'Fire rolls 3 + 6 = 8 for Enhancement: tier +20%; gains +20%; 20% Enh.',
    'Fire rolls 3 + 6 = 9 for Enhancement: tier +10%; gains +10%; 10% Enh.',
    'Fire rolls 3 + 6 = 9 for Enhancement: tier +20%; gains +30%; 30% Enh.',
    'Fire rolls 3 + 6 = 9 for Enhancement: tier +20%; gains +20%; 20% Enh. (maximum 30%)',
    'Water rolls 3 + 6 = 9 for Enhancement: tier +20%; gains +20%; 20% Enh.',
  ];
  for (const message of invalidEnhancementMessages) {
    const copy = structuredClone(success); copy.log.at(-1).message = message;
    assert.deepEqual(getResolvedBattleVisuals(before, copy), [], message);
  }
  const wrongCost = structuredClone(success);
  wrongCost.log.find(entry => entry.message.includes('attempts Enhancement')).message = 'Fire attempts Enhancement for 1 Mana instead of casting a primary spell.';
  assert.deepEqual(getResolvedBattleVisuals(before, wrongCost), []);
  assert.deepEqual(getResolvedBattleVisuals(before, appendLog(before, 'enhancement', success.log.at(-1).message, 'fire')), [], 'a completed result needs its matching zero-Mana attempt');
  const duplicate = appendLog(success, 'enhancement', success.log.at(-1).message, 'fire');
  assert.equal(getResolvedBattleVisuals(before, duplicate).length, 1, 'one attempt cannot commit two reward animations');
  for (const message of [aura.log.at(-1).message.replace('1 Mana', '0 Mana'), aura.log.at(-1).message.replace('+10%', '+20%'), aura.log.at(-1).message.replace('next 3 turns', 'next 4 turns')]) {
    const copy = structuredClone(aura); copy.log.at(-1).message = message;
    assert.deepEqual(getResolvedBattleVisuals(before, copy), [], message);
  }
  for (const next of [success, aura]) {
    assert.deepEqual(getResolvedBattleVisuals(null, next), []);
    assert.deepEqual(getResolvedBattleVisuals(undefined, next), []);
    assert.deepEqual(getResolvedBattleVisuals(next, fresh()), []);
    const changed = structuredClone(next); changed.log[0].message = 'Another duel.';
    assert.deepEqual(getResolvedBattleVisuals(before, changed), []);
    const truncated = structuredClone(next); truncated.log.shift();
    assert.deepEqual(getResolvedBattleVisuals(before, truncated), []);
    assert.deepEqual(getResolvedBattleVisuals(before, { ...next, version: next.version + 1 }), []);
  }
});

test('the battle collector is pure for frozen snapshots and its output can be freely changed by presentation', () => {
  const before = fresh(), after = enhance(before, [6, 6]);
  const original = JSON.stringify([before, after]);
  const events = getResolvedBattleVisuals(deepFreeze(before), deepFreeze(after));
  assert.equal(events.length, 1); events[0].enhancementGain = 0;
  assert.equal(JSON.stringify([before, after]), original);
  assert.equal(getResolvedBattleVisuals(before, after)[0].enhancementGain, 30);
});


test('Enhancement Fate responses change the final award and animate only after two passes and resolution', () => {
  const before = fresh({ fire: ['Fire-1', 'FAT-001', 'FAT-003'], water: ['Water-1', 'FAT-002', 'FAT-003'] });
  const pending = activateEnhancement(before);
  const rolled = rollEnhancement(pending, () => (3 - 1) / 6);
  assert.equal(rolled.phase, 'fate'); assert.equal(rolled.fatePlayer, 1);
  assert.equal(rolled.lastRoll.total, 6); assert.equal(rolled.lastRoll.resolved, false);
  assert.equal(rolled.players[0].enhancement, 0);
  const fate = (state, id, twist) => {
    const card = state.players[state.fatePlayer].hand.find(card => card.spellId === id);
    return castFateSelected(selectCard(state, card.id), twist === undefined ? {} : { twistDirections: { [card.id]: twist } });
  };
  const defended = fate(rolled, 'FAT-002');
  const attacked = fate(defended, 'FAT-001');
  const twisted = fate(attacked, 'FAT-003', 2);
  const countered = fate(twisted, 'FAT-003', 2);
  assert.equal(countered.lastRoll.total, 10);
  const resolving = skipFate(skipFate(countered));
  assert.equal(resolving.phase, 'resolving');
  for (const state of [pending, rolled, defended, attacked, twisted, countered, resolving]) {
    assert.equal(state.players[0].enhancement, 0);
    assert.deepEqual(getResolvedBattleVisuals(before, state).filter(event=>event.kind!=='fate'), [], `${state.phase} never awards an early Enhancement animation`);
  }
  const after = resolveSpell(resolving), visuals = getResolvedBattleVisuals(before, after), event=visuals.find(visual=>visual.kind==='enhancement');
  assert.deepEqual(visuals.map(visual=>visual.kind),['fate','fate','fate','fate','enhancement']);
  assert.equal(after.lastRoll.resolved, true); assert.equal(after.lastRoll.total, 10);
  assert.equal(after.players[0].enhancement, 20);
  assert.equal(event.kind, 'enhancement'); assert.equal(event.enhancementGain, 20);
  for (const baseline of [pending, rolled, defended, attacked, twisted, countered, resolving]) {
    assert.deepEqual(getResolvedBattleVisuals(baseline, after).filter(visual=>visual.kind!=='fate'), [event]);
  }
  for (const viewer of [0, 1]) assert.deepEqual(getResolvedBattleVisuals(privateView(countered, viewer), privateView(after, viewer)), [event]);
  assert.deepEqual(getResolvedBattleVisuals(after, structuredClone(after)), []);
  assert.deepEqual(getResolvedBattleVisuals(after, endTurn(after)), []);
  assert.deepEqual(getResolvedSpellVisuals(before, after), [], 'Fate and Enhancement never masquerade as slab animations');
});

test('Fate can remove an Enhancement tier, while successful final logs must preserve the modified-roll arithmetic', () => {
  const before = fresh({ fire: ['Fire-1', 'FAT-001'], water: ['Water-1', 'FAT-002'] });
  const rolled = rollEnhancement(activateEnhancement(before), () => (3 - 1) / 6);
  const card = rolled.players[1].hand.find(card => card.spellId === 'FAT-002');
  const linked = castFateSelected(selectCard(rolled, card.id));
  const failed = complete(linked);
  assert.equal(failed.lastRoll.rawTotal, 6); assert.equal(failed.lastRoll.total, 2);
  assert.equal(failed.players[0].enhancement, 0);
  assert.deepEqual(getResolvedBattleVisuals(before, failed).filter(event=>event.kind!=='fate'), []);
  const success = enhance(fresh(), [3, 6]);
  for (const replacement of [
    'Fire resolves Enhancement at Modified Roll 9 (raw 8; attacking Fate +0; defending Fate +0): tier +20%; gains +20%; 20% Enh.',
    'Fire resolves Enhancement at Modified Roll 9 (raw 9; attacking Fate +4; defending Fate +0): tier +20%; gains +20%; 20% Enh.',
    'Fire resolves Enhancement at Modified Roll 9 (raw 9; attacking Fate +0; defending Fate +0): tier +10%; gains +10%; 10% Enh.',
  ]) {
    const invalid = structuredClone(success); invalid.log.at(-1).message = replacement;
    assert.deepEqual(getResolvedBattleVisuals(fresh(), invalid), []);
  }
});

test('compatible tiered Enhancement completion logs keep their original award semantics', () => {
  const before = fresh(), legacy = enhance(before, [3, 6]);
  legacy.log.at(-1).message = 'Fire rolls 3 + 6 = 9 for Enhancement: tier +20%; gains +20%; 20% Enh.';
  assert.equal(getResolvedBattleVisuals(before, legacy)[0].enhancementGain, 20);
  assert.deepEqual(getResolvedBattleVisuals(null, legacy), [], 'loading a historical result is a baseline');
});

test('Earth mirror completions use unique seats and cast before the resulting Golem transformation', () => {
  const before = {
    version: 1, status: 'playing', round: 1, startingPlayer: 0,
    players: [0, 1].map(index => ({ id: `seat-${index + 1}`, name: 'Earth', school: 'earth', golemActive: false, discard: [] })),
    log: [{ id: 1, round: 1, playerId: null, type: 'start', message: 'Earth mirror begins.' }],
  };
  const after = structuredClone(before);
  after.players[1].discard.push({ id: 'earth-card', spellId: 'Earth-3' });
  after.players[1].golemActive = true;
  after.log.push(
    { id: 2, round: 1, playerId: 'seat-2', type: 'cast', message: 'Earth casts Earth-3 for 3 mana.' },
    { id: 3, round: 1, playerId: 'seat-2', type: 'golem', message: 'Earth transforms.', visual: { kind: 'golem-transform', casterIndex: 1 } },
    { id: 4, round: 1, playerId: 'seat-2', type: 'resolve', message: 'Earth-3 resolves and moves to discard.' },
  );
  const events = getResolvedBattleVisuals(before, after);
  assert.deepEqual(events.map(event => [event.kind, event.casterIndex]), [['basic-attack', 1], ['golem-transform', 1]]);
  assert.equal(events[0].golem, false, 'a Shield-granting cast keeps its original wizard form');
  assert.deepEqual(getResolvedBattleVisuals(after, structuredClone(after)), []);
  assert.deepEqual(getResolvedBattleVisuals(null, after), []);

  const ended = structuredClone(after);
  ended.log.push({ id: 5, round: 1, playerId: 'seat-1', type: 'damage', message: 'Earth strikes.',
    visual: { kind: 'golem-strike', casterIndex: 1, targetIndex: 0, amount: 15 } });
  const [strike] = getResolvedBattleVisuals(after, ended);
  assert.deepEqual([strike.kind, strike.casterIndex, strike.targetIndex, strike.amount, strike.golem], ['golem-strike', 1, 0, 15, true]);
  assert.deepEqual(getResolvedBattleVisuals(ended, structuredClone(ended)), []);
  ended.log.at(-1).visual.amount = 25;
  assert.deepEqual(getResolvedBattleVisuals(after, ended), []);
});

test('real Earth mirror Shield resolution and end turn produce one cast, transformation and Golem strike', () => {
  let state = createGame(3, { players: [
    { element: 'earth', deck: { element: 'earth', entries: [{ spellId: 'Earth-2', quantity: 1 }] } },
    { element: 'earth', deck: { element: 'earth', entries: [{ spellId: 'Earth-1', quantity: 1 }] } },
  ] });
  state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
  state.players[0].shield = 15; state.players[0].mana = 10;
  const before = state, resolved = complete(cast(state, 'Earth-2'));
  assert.deepEqual(getResolvedBattleVisuals(before, resolved).map(event => event.kind), ['shield', 'golem-transform']);
  assert.equal(resolved.players[0].golemActive, true);
  const ended = endTurn(endTurn(resolved)), [strike] = getResolvedBattleVisuals(resolved, ended);
  assert.equal(ended.players[1].hp, 85);
  assert.deepEqual([strike.kind, strike.casterIndex, strike.targetIndex, strike.amount], ['golem-strike', 0, 1, 15]);
  assert.deepEqual(getResolvedBattleVisuals(before, ended).map(event => event.kind), ['shield', 'golem-transform', 'golem-strike']);
  assert.deepEqual(getResolvedBattleVisuals(ended, structuredClone(ended)), []);
});

test('each committed Fate link gets one ordered feedback event with its own modified total', () => {
  const before=fresh({fire:['Fire-1','FAT-001','FAT-003'],water:['Water-1','FAT-002','FAT-003']});
  before.players[0].loaded=2;
  let state=rollDice(cast(before,'Fire-1'),()=>.5);
  assert.equal(state.lastRoll.total,10);
  const snapshots=[state];
  for(const[spellId,direction]of[['FAT-002'],['FAT-001'],['FAT-003',-2],['FAT-003',2]]){
    const card=state.players[state.fatePlayer].hand.find(card=>card.spellId===spellId);
    const selected=selectCard(state,card.id);
    assert.deepEqual(getResolvedBattleVisuals(state,selected),[],'selecting never plays feedback');
    const next=castFateSelected(selected,direction===undefined?{}:{twistDirections:{[card.id]:direction}});
    const events=getResolvedBattleVisuals(state,next);
    assert.equal(events.length,1);assert.equal(events[0].kind,'fate');assert.equal(events[0].cardId,card.id);
    assert.equal(events[0].modifier,direction??(spellId==='FAT-001'?4:-4));
    assert.equal(events[0].previousTotal,state.lastRoll.total);assert.equal(events[0].modifiedTotal,next.lastRoll.total);
    assert.deepEqual(events[0].dice,[4,4]);assert.equal(events[0].primaryCasterIndex,0);
    for(const viewer of[0,1])assert.deepEqual(getResolvedBattleVisuals(privateView(state,viewer),privateView(next,viewer)),events);
    assert.deepEqual(getResolvedBattleVisuals(null,next),[]);assert.deepEqual(getResolvedBattleVisuals(next,structuredClone(next)),[]);
    snapshots.push(next);state=next;
  }
  const resolving=skipFate(skipFate(state));
  assert.deepEqual(getResolvedBattleVisuals(state,resolving),[],'passes never create feedback');
  const after=resolveSpell(resolving),events=getResolvedBattleVisuals(before,after);
  assert.deepEqual(events.map(event=>event.kind),['fate','fate','fate','fate','basic-attack']);
  assert.deepEqual(events.slice(0,4).map(event=>[event.previousTotal,event.modifiedTotal]),[[10,6],[6,10],[10,8],[8,10]]);
  assert.equal(events.at(-1).modifiedTotal,10);
  for(const snapshot of snapshots){
    const incremental=getResolvedBattleVisuals(snapshot,after);
    assert.ok(incremental.every(event=>event.logId>snapshot.log.at(-1).id));
    assert.equal(incremental.at(-1).modifiedTotal,10);
  }
});

test('Fate feedback rejects missing discards, wrong roles, forged modifiers and changed history', () => {
  const initial=fresh({fire:['Fire-1','FAT-001'],water:['Water-1','FAT-002']});
  const before=rollDice(cast(initial,'Fire-1'),()=>.5);
  const card=before.players[1].hand.find(card=>card.spellId==='FAT-002');
  const after=castFateSelected(selectCard(before,card.id));
  assert.equal(getResolvedBattleVisuals(before,after).length,1);
  const changes=[
    state=>{state.players[1].discard=[];},
    state=>{state.log.find(entry=>entry.message==='Water casts Misfortune: -4 to the rolled total.').message='Water casts Misfortune: -8 to the rolled total.';},
    state=>{state.players[1].discard[0].spellId='FAT-001';state.log.find(entry=>entry.message==='Water casts Misfortune: -4 to the rolled total.').message='Water casts Fortune: +4 to the rolled total.';},
    state=>{state.log[0].message='Changed duel history.';},
  ];
  for(const change of changes){const invalid=structuredClone(after);change(invalid);assert.deepEqual(getResolvedBattleVisuals(before,invalid),[]);}
});

test('batched primary visual totals come from each committed roll, not the last snapshot roll', () => {
  const before=fresh({fire:['Fire-1'],water:['Water-1']});
  const fire=resolveSpell(rollDice(cast(before,'Fire-1'),()=>1/6));
  const water=resolveSpell(rollDice(cast(pass(fire),'Water-1'),()=>.99));
  assert.deepEqual(getResolvedSpellVisuals(before,water).map(event=>event.modifiedTotal),[4,12]);
});
