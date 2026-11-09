import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, castSelected, rollDice, resolveSpell,
  migrateSavedGame, validateSavedGame, SPELL_CATALOG,
} from '../src/game.js';

const previousText = { 'Fire-15': 'Gain 1 Ember and 1 Mana.', 'Water-0': 'Gain 1 Mana.' };
const cardsOf = player => ['hand', 'deck', 'discard'].flatMap(zone => player[zone]);
function fresh() {
  const definition = (element, spellId) => ({ element, entries: [{ spellId, quantity: 3 }] });
  let state=createGame(19,{fire:definition('fire','Fire-15'),water:definition('water','Water-0')});
  state=rollInitiative(rollInitiative(state,0,()=>.9),1,()=>0);
  return state;
}
function previousDefinitions(state) {
  const previous=structuredClone(state);
  for(const player of previous.players)for(const card of cardsOf(player)) {
    if(Object.hasOwn(previousText,card.spellId))card.effectText=card.description=previousText[card.spellId];
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
