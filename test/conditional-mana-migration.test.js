import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, castSelected, rollDice, resolveSpell,
  migrateSavedGame, validateSavedGame, SPELL_CATALOG,
} from '../src/game.js';

const previousText = { 'Fire-15': 'Gain 1 Ember and 1 Mana.', 'Water-0': 'Gain 1 Mana.' };
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
