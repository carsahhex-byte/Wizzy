import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, castSelected, castFateSelected, skipFate, rollDice, resolveSpell,
  migrateSavedGame, validateSavedGame, SPELL_CATALOG,
} from '../src/game.js';

const previousText = { 'Fire-14': 'Spend all Embers. Deal 20 damage plus 9 per Ember spent. On an 8+, deal 12 per Ember instead.', 'Fire-15': 'Gain 1 Ember and 1 Mana.', 'Water-0': 'Gain 1 Mana.' };
const cardsOf = player => ['hand', 'deck', 'discard'].flatMap(zone => player[zone]);
function fresh(first = 0) {
  const definition = (element, spellId) => ({ element, entries: [{ spellId, quantity: 3 }] });
  let state=createGame(19,{fire:definition('fire','Fire-15'),water:definition('water','Water-0')});
  state=rollInitiative(rollInitiative(state,0,()=>first===0?.9:0),1,()=>first===1?.9:0);
  return state;
}
function previousDefinitions(state, waterText = previousText['Water-0']) {
  const previous=structuredClone(state);
  for(const player of previous.players)for(const card of cardsOf(player)) {
    if(Object.hasOwn(previousText,card.spellId))card.effectText=card.description=card.spellId==='Water-0'?waterText:previousText[card.spellId];
  }
  return previous;
}

test('existing v14 Mana-card definitions update in all zones without changing duel progress or input',()=>{
  const current=fresh();
  for(const player of current.players){
    player.deck.push(player.hand.pop()); player.discard.push(player.hand.pop());
    Object.assign(player,{hp:81,mana:9,shield:20,element:4,loaded:4,loadedPending:2,enhancement:20,auraTurns:2});
  }
  assert.equal(validateSavedGame(current),true);
  const previous=previousDefinitions(current), snapshot=structuredClone(previous);
  assert.equal(validateSavedGame(previous),false);
  const migrated=migrateSavedGame(previous);
  assert.deepEqual(migrated,current);
  assert.deepEqual(previous,snapshot);
  assert.equal(migrateSavedGame(migrated),migrated);
  for(const player of migrated.players)for(const card of cardsOf(player)) {
    assert.equal(card.effectText,SPELL_CATALOG[card.spellId].effectText);
    assert.equal(card.description,card.effectText);
  }
});

test('an already-paid immediate Mana cast is preserved and never rolled or rewarded again',()=>{
  let completed=fresh();
  completed=castSelected(selectCard(completed,completed.players[0].hand[0].id));
  completed=resolveSpell(rollDice(completed,()=>.9));
  // The previous build recorded no dice for these cards. Its paid resource
  // result and physical discard are historical data, not a pending new roll.
  completed.lastRoll=null;
  assert.equal(validateSavedGame(completed),true);
  const previous=previousDefinitions(completed), snapshot=structuredClone(previous);
  const migrated=migrateSavedGame(previous);
  assert.deepEqual(migrated,completed);
  assert.equal(resolveSpell(migrated),migrated);
  assert.equal(rollDice(migrated,()=>{throw new Error('completed casts must not reroll');}),migrated);
  assert.deepEqual(previous,snapshot);
  assert.deepEqual([migrated.players[0].mana,migrated.players[0].element,migrated.players[0].discard.length],[4,1,1]);
});

test('card-text migration still rejects corruption and unrecognized definitions',()=>{
  const previous=previousDefinitions(fresh());
  for(const mutate of[
    state=>{state.players[0].mana=11;},
    state=>{state.players[0].hand[0].cost=1;},
    state=>{state.players[0].hand[0].effectText='Gain 99 Mana.';},
    state=>{state.players[1].hand[0].description='Gain 99 Mana.';},
    state=>{state.players[1].hand.pop();},
    state=>{state.version=999;},
  ]){
    const corrupt=structuredClone(previous);mutate(corrupt);
    assert.equal(migrateSavedGame(corrupt),null,mutate.toString());
  }
});

test('older supported duel formats receive the same targeted Mana-card refresh',()=>{
  const current=fresh(), previous=previousDefinitions(current);
  previous.version=13;
  assert.deepEqual(migrateSavedGame(previous),current);
});

test('latest conditional-Mana Water-0 cards refresh in every zone without retroactive rewards',()=>{
  const current=fresh();
  for(const player of current.players){player.deck.push(player.hand.pop());player.discard.push(player.hand.pop());}
  const previous=previousDefinitions(current,'On a 7+, gain 1 Mana.'), snapshot=structuredClone(previous);
  assert.deepEqual(migrateSavedGame(previous),current);
  assert.deepEqual(previous,snapshot);
});

test('committed legacy Water-0 receives capped on-cast Mana exactly once before its Flow resolves',()=>{
  for(const startingMana of[0,9,10])for(const dice of[[1,2],[3,4]]){
    let current=fresh(1);current.players[1].mana=startingMana;current.players[1].element=2;
    current=castSelected(selectCard(current,current.players[1].hand[0].id));
    // Remove only the new on-cast work to model an old committed rolling save.
    current.players[1].mana=startingMana;
    delete current.pendingSpell.manaOnCastApplied;
    current.log=current.log.filter(entry=>!entry.message.includes('Mana on cast'));
    current.log.forEach((entry,index)=>{entry.id=index+1;});
    const previous=previousDefinitions(current,'On a 7+, gain 1 Mana.'), snapshot=structuredClone(previous);
    const upgraded=migrateSavedGame(previous);
    assert.ok(upgraded);
    assert.equal(upgraded.players[1].mana,Math.min(10,startingMana+1));
    assert.equal(upgraded.players[1].element,2);
    assert.equal(upgraded.pendingSpell.manaOnCastApplied,true);
    assert.equal(upgraded.log.filter(entry=>entry.message.includes('Mana on cast')).length,1);
    assert.deepEqual(previous,snapshot);
    assert.equal(migrateSavedGame(upgraded),upgraded);
    let index=0;
    const completed=resolveSpell(rollDice(upgraded,()=>(dice[index++]-1)/6));
    assert.equal(completed.players[1].mana,Math.min(10,startingMana+1));
    assert.equal(completed.players[1].element,dice[0]+dice[1]>=7?4:3);
    assert.equal(completed.players[1].discard.length,1);
    assert.equal(migrateSavedGame(completed),completed);
    assert.equal(resolveSpell(completed),completed);
  }
});

test('already completed old Water-0 rolls keep their original paid outcomes and logs',()=>{
  for(const total of[3,7]){
    let state=fresh(1);state.players[1].mana=0;state.players[1].element=2;
    state=castSelected(selectCard(state,state.players[1].hand[0].id));
    const dice=total===7?[3,4]:[1,2];let index=0;
    state=resolveSpell(rollDice(state,()=>(dice[index++]-1)/6));
    // The previous effect paid conditional Mana and only one passive Flow.
    state.players[1].mana=total>=7?1:0;state.players[1].element=3;
    state.log=state.log.filter(entry=>!entry.message.includes('Mana on cast'));
    state.log.forEach((entry,index)=>{entry.id=index+1;});
    const previous=previousDefinitions(state,'On a 7+, gain 1 Mana.'), snapshot=structuredClone(previous);
    const upgraded=migrateSavedGame(previous);
    assert.deepEqual(upgraded,state);
    assert.deepEqual(upgraded.log,previous.log);
    assert.deepEqual(previous,snapshot);
    assert.equal(resolveSpell(upgraded),upgraded);
  }
});

test('current Water-0 pending saves cannot replay or omit their on-cast marker',()=>{
  let state=fresh(1);state.players[1].mana=0;
  state=castSelected(selectCard(state,state.players[1].hand[0].id));
  assert.equal(state.players[1].mana,1);assert.equal(state.pendingSpell.manaOnCastApplied,true);
  assert.equal(migrateSavedGame(state),state);
  for(const mutate of[
    value=>{delete value.pendingSpell.manaOnCastApplied;},
    value=>{value.pendingSpell.manaOnCastApplied=false;},
  ]){
    const invalid=structuredClone(state);mutate(invalid);
    assert.equal(validateSavedGame(invalid),false);
    assert.equal(migrateSavedGame(invalid),null);
  }
  assert.equal(castSelected(state),state);
});


function fireFourteenFresh() {
  const fire = { element: 'fire', entries: [
    { spellId: 'Fire-14', quantity: 3 }, { spellId: 'FAT-001', quantity: 1 }, { spellId: 'FAT-003', quantity: 1 },
  ] };
  const water = { element: 'water', entries: [
    { spellId: 'Water-1', quantity: 1 }, { spellId: 'FAT-002', quantity: 1 }, { spellId: 'FAT-003', quantity: 1 },
  ] };
  let state = createGame(37, { fire, water });
  state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
  Object.assign(state.players[0], { mana: 10, element: 3 });
  return state;
}
function castFireFourteen(state) {
  return castSelected(selectCard(state, state.players[0].hand.find(card => card.spellId === 'Fire-14').id));
}
function rollPair(state, dice) {
  let index = 0;
  return rollDice(state, () => (dice[index++] - 1) / 6);
}
function passFate(state) {
  while (state.phase === 'fate') state = skipFate(state);
  return state;
}

test('old Fire-14 text refreshes in every zone and preserves selected cards and all duel data', () => {
  const current = fireFourteenFresh(), fire = current.players[0];
  const fireCards = fire.hand.filter(card => card.spellId === 'Fire-14');
  fire.deck.push(fire.hand.splice(fire.hand.indexOf(fireCards[1]), 1)[0]);
  fire.discard.push(fire.hand.splice(fire.hand.indexOf(fireCards[2]), 1)[0]);
  Object.assign(fire, { hp: 81, shield: 21, loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
  const selected = selectCard(current, fireCards[0].id);
  assert.equal(validateSavedGame(selected), true);
  const old = previousDefinitions(selected), before = structuredClone(old);
  assert.equal(validateSavedGame(old), false);
  const upgraded = migrateSavedGame(old);
  assert.deepEqual(upgraded, selected);
  assert.deepEqual(old, before);
  assert.equal(upgraded.version, 14);
  assert.equal(upgraded.selectedCardId, fireCards[0].id);
  assert.equal(migrateSavedGame(upgraded), upgraded);
});

test('Fire-14 pending rolling, selected Fate, paid Fate and resolving saves preserve reservations and priority', () => {
  const initial = fireFourteenFresh(); initial.players[0].loaded = 2;
  const rolling = castFireFourteen(initial), fate = rollPair(rolling, [2, 3]);
  const defenderId = fate.players[1].hand.find(card => card.spellId === 'FAT-002').id;
  const fateSelected = selectCard(fate, defenderId), fatePaid = castFateSelected(fateSelected);
  const resolving = passFate(fatePaid);
  assert.deepEqual([rolling.players[0].mana, rolling.players[0].element, rolling.pendingSpell.emberSpent], [2, 0, 3]);
  for (const current of [rolling, fate, fateSelected, fatePaid, resolving]) {
    const old = previousDefinitions(current), before = structuredClone(old);
    const upgraded = migrateSavedGame(old);
    assert.deepEqual(upgraded, current, current.phase);
    assert.deepEqual(old, before);
    assert.equal(validateSavedGame(upgraded), true);
    assert.equal(migrateSavedGame(upgraded), upgraded);
    assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.pendingSpell.emberSpent], [2, 0, 3]);
    if (upgraded.lastRoll) assert.equal(rollDice(upgraded, () => { throw new Error('saved dice must not reroll'); }), upgraded);
  }
});

test('migrated committed Fire-14 resolves new seven/nine scaling once without re-paying its cost or Embers', () => {
  for (const [dice, total, damage] of [[[3, 4], 7, 41], [[4, 4], 8, 47]]) {
    const rolling = castFireFourteen(fireFourteenFresh());
    const rolled = rollPair(rolling, dice), resolving = passFate(rolled);
    for (const pending of [rolling, rolled, resolving]) {
      let upgraded = migrateSavedGame(previousDefinitions(pending));
      const reservedId = upgraded.pendingCardId;
      if (upgraded.phase === 'rolling') upgraded = rollPair(upgraded, dice);
      upgraded = resolveSpell(passFate(upgraded));
      assert.equal(upgraded.lastRoll.total, total);
      assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.players[1].hp], [2, 0, 100 - damage]);
      assert.equal(upgraded.players[0].discard.filter(card => card.id === reservedId).length, 1);
      assert.equal(upgraded.players[0].hand.some(card => card.id === reservedId), false);
      assert.equal(upgraded.log.filter(entry => entry.type === 'cast').length, 1);
      assert.equal(upgraded.log.filter(entry => entry.type === 'damage').length, 1);
      assert.match(upgraded.log.find(entry => entry.type === 'damage').message, new RegExp(`Base ${damage} `));
      assert.equal(validateSavedGame(upgraded), true);
      assert.equal(resolveSpell(upgraded), upgraded);
      assert.equal(migrateSavedGame(upgraded), upgraded);
    }
  }
});

test('old completed and finished Fire-14 outcomes stay historical after the card definition refresh', () => {
  for (const hp of [100, 40]) {
    const initial = fireFourteenFresh(); initial.players[1].hp = hp;
    const completed = resolveSpell(passFate(rollPair(castFireFourteen(initial), [4, 4])));
    // Model the prior paid 20 + 12×3 = 56 outcome, rather than replaying it
    // with the current multiplier. Completed logs and HP are historical data.
    completed.players[1].hp = Math.max(0, hp - 56);
    completed.log.find(entry => entry.type === 'damage').message = `Base 56 + 0% Enhancement + 0% Aura = 56 damage. Water takes 56 damage; ${Math.min(hp, 56)} HP damage.`;
    assert.equal(completed.status, hp === 40 ? 'finished' : 'playing');
    assert.equal(validateSavedGame(completed), true);
    const old = previousDefinitions(completed), before = structuredClone(old);
    const upgraded = migrateSavedGame(old);
    assert.deepEqual(upgraded, completed);
    assert.deepEqual(upgraded.log, before.log);
    assert.deepEqual(old, before);
    assert.equal(resolveSpell(upgraded), upgraded);
    assert.equal(rollDice(upgraded, () => { throw new Error('a completed old spell must not reroll'); }), upgraded);
    assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.players[1].hp], [2, 0, Math.max(0, hp - 56)]);
  }
});

test('Fire-14 refresh cannot repair mismatched text, unexpected definitions, reservations or missing cards', () => {
  const initial = fireFourteenFresh();
  const selected = selectCard(initial, initial.players[0].hand.find(card => card.spellId === 'Fire-14').id);
  const previous = previousDefinitions(selected);
  for (const mutate of [
    state => { state.players[0].hand.find(card => card.spellId === 'Fire-14').description = 'Changed description.'; },
    state => { state.players[0].hand.find(card => card.spellId === 'Fire-14').effectText = 'Spend all Embers. Deal 99 damage.'; },
    state => { state.players[0].hand.find(card => card.spellId === 'Fire-14').manaCost = 0; },
    state => { state.players[0].hand.pop(); },
    state => { state.players[0].element = 6; },
  ]) {
    const corrupt = structuredClone(previous); mutate(corrupt);
    assert.equal(migrateSavedGame(corrupt), null, mutate.toString());
  }
  const corruptReservation = previousDefinitions(castFireFourteen(fireFourteenFresh()));
  corruptReservation.pendingSpell.emberSpent = 6;
  assert.equal(migrateSavedGame(corruptReservation), null);
});
