import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, rollInitiative, selectCard, castSelected, castFateSelected, skipFate, rollDice, resolveSpell,
  migrateSavedGame, validateSavedGame, SPELL_CATALOG, SAVE_VERSION,
} from '../src/game.js';
import { getResolvedSpellVisuals } from '../src/spell-visuals.js';

const previousText = {
  'Fire-9': 'Gain 2 Embers. On a 7+, gain 3 instead. If you have 4 or more Embers after resolution, gain 8 Shield.',
  'Fire-11': 'Deal 8 damage and gain 2 Embers. On a 7+, gain +2 to your next roll. On a 10+, gain +4 instead.',
  'Fire-14': 'Spend all Embers. Deal 20 damage plus 9 per Ember spent. On an 8+, deal 12 per Ember instead.', 'Fire-15': 'Gain 1 Ember and 1 Mana.', 'Water-0': 'Gain 1 Mana.' };
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
    if(Object.hasOwn(previousText,card.spellId)) {
      card.effectText=card.description=card.spellId==='Water-0'?waterText:previousText[card.spellId];
      if(card.spellId==='Fire-11')card.manaCost=card.cost=3;
    }
  }
  if (['rolling', 'fate', 'resolving'].includes(previous.phase) && previous.pendingSpell?.spellId === 'Fire-14') {
    previous.pendingSpell.emberSpent = previous.players[0].element;
    previous.players[0].element = 0;
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
  assert.equal(upgraded.version, SAVE_VERSION);
  assert.equal(upgraded.selectedCardId, fireCards[0].id);
  assert.equal(migrateSavedGame(upgraded), upgraded);
});

test('Fire-14 pending rolling, selected Fate, paid Fate and resolving saves restore the old bank and preserve priority', () => {
  const initial = fireFourteenFresh(); initial.players[0].loaded = 2;
  const rolling = castFireFourteen(initial), fate = rollPair(rolling, [2, 3]);
  const defenderId = fate.players[1].hand.find(card => card.spellId === 'FAT-002').id;
  const fateSelected = selectCard(fate, defenderId), fatePaid = castFateSelected(fateSelected);
  const resolving = passFate(fatePaid);
  assert.deepEqual([rolling.players[0].mana, rolling.players[0].element, rolling.pendingSpell.emberSpent], [2, 3, 0]);
  for (const current of [rolling, fate, fateSelected, fatePaid, resolving]) {
    const old = previousDefinitions(current), before = structuredClone(old);
    const upgraded = migrateSavedGame(old);
    assert.deepEqual(upgraded, current, current.phase);
    assert.deepEqual(old, before);
    assert.equal(validateSavedGame(upgraded), true);
    assert.equal(migrateSavedGame(upgraded), upgraded);
    assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.pendingSpell.emberSpent], [2, 3, 0]);
    if (upgraded.lastRoll) assert.equal(rollDice(upgraded, () => { throw new Error('saved dice must not reroll'); }), upgraded);
  }
});

test('migrated committed Fire-14 uses the restored Ember bonus once without re-paying Mana', () => {
  for (const [dice, total, base, damage] of [[[3, 4], 7, 55, 63], [[4, 4], 8, 65, 75]]) {
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
      assert.match(upgraded.log.find(entry => entry.type === 'damage').message, new RegExp(`Base ${base} .*15% Embers = ${damage} damage`));
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
  const mixedBank = previousDefinitions(castFireFourteen(fireFourteenFresh()));
  mixedBank.players[0].element = 1;
  assert.equal(migrateSavedGame(mixedBank), null, 'legacy all-bank reservations cannot also have a held bank');
  const currentSpend = castFireFourteen(fireFourteenFresh());
  currentSpend.players[0].element = 0; currentSpend.pendingSpell.emberSpent = 3;
  assert.equal(migrateSavedGame(currentSpend), null, 'current Sunsetter cannot invent an old reservation');
});

test('both prior Sunsetter definitions restore zero or five reserved Embers once across supported save versions', () => {
  for (const version of [10, 11, 12, 13, 14]) for (const embers of [0, 5]) for (const text of [
    previousText['Fire-14'],
    'Spend all Embers. Deal 20 damage plus 7 per Ember spent. On an 8+, deal 9 per Ember instead.',
  ]) {
    const initial = fireFourteenFresh(); initial.players[0].element = embers;
    const previous = previousDefinitions(castFireFourteen(initial)); previous.version = version;
    for (const card of cardsOf(previous.players[0])) if (card.spellId === 'Fire-14') card.effectText = card.description = text;
    const castLog = previous.log.find(entry => entry.type === 'cast');
    castLog.message = `Fire casts Sunsetter for 8 mana${embers ? ` and ${embers} Embers` : ''}.`;
    const snapshot = structuredClone(previous);
    const upgraded = migrateSavedGame(previous);
    assert.ok(upgraded, `${version}: ${embers}: ${text}`);
    assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.pendingSpell.emberSpent], [2, embers, 0]);
    assert.deepEqual(upgraded.log.slice(0, previous.log.length), previous.log, 'historical payment log stays intact');
    assert.deepEqual(previous, snapshot);
    assert.equal(migrateSavedGame(upgraded), upgraded);
    const completed = resolveSpell(passFate(rollPair(upgraded, [4, 4])));
    assert.deepEqual([completed.players[1].hp, completed.players[0].element, completed.players[0].mana], [embers ? 19 : 35, 0, 2]);
    assert.equal(completed.log.filter(entry => entry.message.includes('Embers return to 0')).length, Number(embers > 0));
    assert.equal(getResolvedSpellVisuals(upgraded, completed).length, 1, 'consumption does not hide the spell animation');
    assert.equal(migrateSavedGame(completed), completed); assert.equal(resolveSpell(completed), completed);
  }
});

test('the previous Charred Blade and Blaze definitions refresh without changing decks or paid resources', () => {
  const current = createGame(719, {
    fire: { element: 'fire', spellbookId: 'spellbook-2', entries: [{ spellId: 'Fire-6', quantity: 3 }, { spellId: 'Fire-15', quantity: 3 }] },
    water: { element: 'water', spellbookId: 'spellbook-2', entries: [{ spellId: 'Water-0', quantity: 1 }] },
  });
  current.players[0].discard.push(current.players[0].hand.pop());
  const previous = structuredClone(current);
  const texts = {
    'Fire-6': 'Deal 22 damage. On a 7+, deal 28 instead. On a 10+, deal 36 instead.',
    'Fire-15': 'Gain 1 Ember. On a 7+, gain 1 Mana.',
  };
  for (const card of cardsOf(previous.players[0])) card.effectText = card.description = texts[card.spellId];
  const snapshot = structuredClone(previous);
  assert.deepEqual(migrateSavedGame(previous), current);
  assert.deepEqual(previous, snapshot);
});


function fireBuffFresh() {
  const fire = { element: 'fire', entries: [
    { spellId: 'Fire-9', quantity: 3 }, { spellId: 'Fire-11', quantity: 3 },
    { spellId: 'FAT-001', quantity: 1 }, { spellId: 'FAT-003', quantity: 1 },
  ] };
  const water = { element: 'water', entries: [
    { spellId: 'Water-1', quantity: 1 }, { spellId: 'FAT-002', quantity: 1 }, { spellId: 'FAT-003', quantity: 1 },
  ] };
  let state = createGame(71, { fire, water });
  state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
  const player = state.players[0], pool = cardsOf(player);
  player.hand = ['Fire-9', 'Fire-11', 'FAT-001', 'FAT-003'].map(id => pool.splice(pool.findIndex(card => card.spellId === id), 1)[0]);
  player.deck = pool; player.discard = [];
  Object.assign(player, { mana: 10, element: 2 });
  return state;
}
function castBuff(state, spellId) {
  return castSelected(selectCard(state, state.players[0].hand.find(card => card.spellId === spellId).id));
}
function oldPaidFireEleven(state) {
  // Original Loaded-text saves paid three Mana before this price change.
  const previous = structuredClone(state), currentCost = SPELL_CATALOG['Fire-11'].manaCost;
  previous.players[0].mana += currentCost - 3;
  const log = previous.log.findLast(entry => entry.type === 'cast');
  log.message = log.message.replace(`for ${currentCost} mana`, 'for 3 mana');
  return previous;
}

test('Fire-9 and Fire-11 old definitions refresh in all zones while preserving selected state and banks', () => {
  const current = fireBuffFresh(), fire = current.players[0];
  for (const id of ['Fire-9', 'Fire-11']) {
    fire.discard.push(fire.deck.splice(fire.deck.findIndex(card => card.spellId === id), 1)[0]);
  }
  Object.assign(fire, { hp: 81, shield: 19, loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
  const selected = selectCard(current, fire.hand.find(card => card.spellId === 'Fire-11').id);
  const previous = previousDefinitions(selected), before = structuredClone(previous);
  assert.equal(validateSavedGame(selected), true); assert.equal(validateSavedGame(previous), false);
  const upgraded = migrateSavedGame(previous);
  assert.deepEqual(upgraded, selected); assert.deepEqual(previous, before);
  for (const zone of ['hand', 'deck', 'discard']) {
    const card = upgraded.players[0][zone].find(card => card.spellId === 'Fire-11');
    assert.deepEqual([card.manaCost, card.cost], [2, 2]);
  }
  assert.equal(migrateSavedGame(upgraded), upgraded);
  const newCast = castSelected(upgraded);
  assert.equal(newCast.players[0].mana, 8);
  assert.match(newCast.log.findLast(entry => entry.type === 'cast').message, /for 2 mana/);
});

test('old-paid Fire-11 retains its three-Mana payment through rolling and every post-roll Fate stage', () => {
  const initial = fireBuffFresh(); initial.players[0].loaded = 4; initial.players[0].loadedPending = 2;
  const rolling = oldPaidFireEleven(castBuff(initial, 'Fire-11')), fate = rollPair(rolling, [1, 2]);
  const fateSelected = selectCard(fate, fate.players[1].hand.find(card => card.spellId === 'FAT-002').id);
  const defenderPaid = castFateSelected(fateSelected);
  const attackerPaid = castFateSelected(selectCard(defenderPaid, defenderPaid.players[0].hand.find(card => card.spellId === 'FAT-001').id));
  const resolving = passFate(attackerPaid);
  for (const current of [rolling, fate, fateSelected, defenderPaid, attackerPaid, resolving]) {
    const previous = previousDefinitions(current), before = structuredClone(previous), upgraded = migrateSavedGame(previous);
    assert.deepEqual(upgraded, current); assert.deepEqual(previous, before);
    assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.players[0].loaded, upgraded.players[0].loadedPending], [7, 2, 0, 2]);
    assert.equal(upgraded.pendingSpell.loadedBonus, 4);
    assert.match(upgraded.log.find(entry => entry.type === 'cast').message, /for 3 mana/);
    assert.equal(migrateSavedGame(upgraded), upgraded);
    if (upgraded.lastRoll) assert.equal(rollDice(upgraded, () => { throw new Error('a saved roll must not replay'); }), upgraded);
    assert.equal(validateSavedGame(upgraded), true);
  }
});

test('migrated pending Fire-11 applies its new damage and conditional Mana once with no cost refund', () => {
  for (const [dice, total] of [[[3, 3], 6], [[3, 4], 7], [[5, 5], 10]]) {
    const initial = fireBuffFresh(); initial.players[0].loadedPending = 2;
    const rolling = oldPaidFireEleven(castBuff(initial, 'Fire-11'));
    const rolled = rollPair(rolling, dice), resolving = passFate(rolled);
    for (const current of [rolling, rolled, resolving]) {
      let upgraded = migrateSavedGame(previousDefinitions(current));
      const cardId = upgraded.pendingCardId;
      if (upgraded.phase === 'rolling') upgraded = rollPair(upgraded, dice);
      upgraded = resolveSpell(passFate(upgraded));
      assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.players[1].hp, upgraded.players[0].loadedPending], [7 + Number(total >= 7), 2, 89, 2]);
      assert.equal(upgraded.players[0].discard.filter(card => card.id === cardId).length, 1);
      assert.equal(upgraded.log.filter(entry => entry.type === 'cast').length, 1);
      assert.equal(upgraded.log.filter(entry => entry.type === 'damage').length, 1);
      assert.equal(upgraded.log.filter(entry => entry.type === 'resource' && entry.message.includes('Mana')).length, Number(total >= 7));
      assert.equal(resolveSpell(upgraded), upgraded); assert.equal(migrateSavedGame(upgraded), upgraded);
    }
  }
});

function historicalBuffCompletion(spellId, total, hp = 100) {
  const initial = fireBuffFresh(); initial.players[0].loadedPending = 1; initial.players[1].hp = hp;
  let state = castBuff(initial, spellId);
  if (spellId === 'Fire-11') state = oldPaidFireEleven(state);
  state = resolveSpell(passFate(rollPair(state, total === 10 ? [5, 5] : [3, total - 3])));
  const player = state.players[0], beforeResolve = state.log.filter(entry => !['resource', 'shield', 'loaded', 'damage', 'resolve', 'victory'].includes(entry.type));
  const events = [];
  const add = (type, playerId, message) => events.push({ round: state.round, playerId, message, type });
  if (spellId === 'Fire-9') {
    player.mana = 8; player.shield = 8; player.element = total >= 7 ? 5 : 4;
    add('resource', 'fire', `Fire gains ${total >= 7 ? 3 : 2} Embers.`);
    add('shield', 'fire', 'Fire gains 8 Shield.');
  } else {
    player.mana = 7; player.element = 4; player.loadedPending = 1 + (total >= 10 ? 4 : total >= 7 ? 2 : 0);
    state.players[1].hp = Math.max(0, hp - 8);
    add('damage', 'water', `Base 8 + 0% Enhancement + 0% Aura = 8 damage. Water takes 8 damage; ${Math.min(hp, 8)} HP damage.`);
    add('resource', 'fire', 'Fire gains 2 Embers.');
    if (total >= 7) add('loaded', 'fire', `Fire gains +${total >= 10 ? 4 : 2} Loaded for their next turn.`);
  }
  add('resolve', 'fire', `${spellId} resolves and moves to discard.`);
  if (state.status === 'finished') add('victory', 'fire', 'Fire wins the duel!');
  state.log = [...beforeResolve, ...events].map((entry, index) => ({ ...entry, id: index + 1 }));
  return state;
}

test('completed Fire-9 Shield and Fire-11 damage/Loaded rewards remain historical without Mana replay', () => {
  for (const [spellId, total, hp] of [['Fire-9', 6, 100], ['Fire-9', 7, 100], ['Fire-11', 7, 100], ['Fire-11', 10, 100], ['Fire-11', 10, 5]]) {
    const current = historicalBuffCompletion(spellId, total, hp), previous = previousDefinitions(current), before = structuredClone(previous);
    assert.equal(validateSavedGame(current), true);
    const upgraded = migrateSavedGame(previous);
    assert.deepEqual(upgraded, current); assert.deepEqual(previous, before);
    assert.deepEqual(upgraded.log, before.log);
    assert.equal(resolveSpell(upgraded), upgraded);
    assert.equal(rollDice(upgraded, () => { throw new Error('historical rewards cannot reroll'); }), upgraded);
    assert.equal(upgraded.players[0].mana, spellId === 'Fire-9' ? 8 : 7);
    assert.equal(migrateSavedGame(upgraded), upgraded);
  }
});

test('Fire-11 requires both exact old cost fields and paired old text; partial or unexpected definitions are rejected', () => {
  const previous = previousDefinitions(fireBuffFresh());
  for (const costs of [[3, 2], [2, 3], [2, 2], [4, 4], [undefined, 3]]) {
    const invalid = structuredClone(previous), card = invalid.players[0].hand.find(card => card.spellId === 'Fire-11');
    [card.manaCost, card.cost] = costs;
    assert.equal(migrateSavedGame(invalid), null, String(costs));
  }
  for (const mutate of [
    card => { card.description = 'Unexpected text.'; },
    card => { card.effectText = 'Deal 99 damage.'; },
    card => { card.description = card.effectText = SPELL_CATALOG['Fire-11'].effectText; card.cost = card.manaCost = 4; },
    card => { card.name = 'Unknown slab'; },
  ]) {
    const invalid = structuredClone(previous); mutate(invalid.players[0].hand.find(card => card.spellId === 'Fire-11'));
    assert.equal(migrateSavedGame(invalid), null, mutate.toString());
  }
  const invalidFireNine = structuredClone(previous);
  invalidFireNine.players[0].hand.find(card => card.spellId === 'Fire-9').description = 'Gain 8 Mana.';
  assert.equal(migrateSavedGame(invalidFireNine), null);
});


test('migrated pending Fire-9 uses its new post-gain Mana condition once without replaying old Shield', () => {
  for (const [embers, total, finalEmbers, mana] of [[0, 6, 2, 8], [1, 6, 3, 8], [2, 6, 4, 9], [1, 7, 4, 9]]) {
    const initial = fireBuffFresh(); initial.players[0].element = embers; initial.players[0].shield = 12;
    const rolling = castBuff(initial, 'Fire-9'), rolled = rollPair(rolling, [3, total - 3]);
    for (const current of [rolling, rolled, passFate(rolled)]) {
      let upgraded = migrateSavedGame(previousDefinitions(current));
      assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.players[0].shield], [8, embers, 12]);
      if (upgraded.phase === 'rolling') upgraded = rollPair(upgraded, [3, total - 3]);
      upgraded = resolveSpell(passFate(upgraded));
      assert.deepEqual([upgraded.players[0].mana, upgraded.players[0].element, upgraded.players[0].shield], [mana, finalEmbers, 12]);
      assert.equal(upgraded.players[0].discard.filter(card => card.spellId === 'Fire-9').length, 1);
      assert.equal(upgraded.log.filter(entry => entry.type === 'resource' && entry.message.includes('Mana')).length, mana - 8);
      assert.equal(upgraded.log.filter(entry => entry.type === 'shield').length, 0);
      assert.equal(resolveSpell(upgraded), upgraded); assert.equal(migrateSavedGame(upgraded), upgraded);
    }
  }
});


const previousCost = { 'Fire-11': 3, 'Water-12': 4, 'Water-14': 8 };
function costSnapshotFresh(first = 0, waterSpell = 'Water-12') {
  const definition = (element, spellId, fateId) => ({ element, entries: [
    { spellId, quantity: 3 }, { spellId: fateId, quantity: 1 }, { spellId: 'FAT-003', quantity: 1 },
  ] });
  let state = createGame(89, { fire: definition('fire', 'Fire-11', 'FAT-001'), water: definition('water', waterSpell, 'FAT-002') });
  state = rollInitiative(rollInitiative(state, 0, () => first === 0 ? .9 : 0), 1, () => first === 1 ? .9 : 0);
  for (const player of state.players) Object.assign(player, { mana: 10, element: 2, loadedPending: 2 });
  return state;
}
function previousCostSnapshots(state) {
  const previous = structuredClone(state);
  for (const player of previous.players) for (const card of cardsOf(player)) {
    if (Object.hasOwn(previousCost, card.spellId)) card.manaCost = card.cost = previousCost[card.spellId];
  }
  return previous;
}
function previouslyPaidCostCast(state, spellId) {
  const currentCost = SPELL_CATALOG[spellId].manaCost;
  const cast = castSelected(selectCard(state, state.players[state.activePlayer].hand.find(card => card.spellId === spellId).id));
  cast.players[state.activePlayer].mana += currentCost - previousCost[spellId];
  cast.log.findLast(entry => entry.type === 'cast').message = cast.log.findLast(entry => entry.type === 'cast').message.replace(`for ${currentCost} mana`, `for ${previousCost[spellId]} mana`);
  return cast;
}

test('current-text prior prices refresh across all zones without changing selected state or decklists', () => {
  for (const waterSpell of ['Water-12', 'Water-14']) for (const first of [0, 1]) {
    const current = costSnapshotFresh(first, waterSpell);
    for (const player of current.players) {
      const spellId = player.id === 'fire' ? 'Fire-11' : waterSpell;
      for (const zone of ['deck', 'discard']) player[zone].push(player.hand.splice(player.hand.findIndex(card => card.spellId === spellId), 1)[0]);
      Object.assign(player, { hp: 81, shield: 17, loaded: 4, enhancement: 20, auraTurns: 2 });
    }
    const selected = selectCard(current, current.players[first].hand.find(card => card.spellId === (first === 0 ? 'Fire-11' : waterSpell)).id);
    const previous = previousCostSnapshots(selected), before = structuredClone(previous);
    assert.equal(validateSavedGame(previous), false);
    const upgraded = migrateSavedGame(previous);
    assert.deepEqual(upgraded, selected); assert.deepEqual(previous, before);
    for (const player of upgraded.players) for (const card of cardsOf(player)) if (Object.hasOwn(previousCost, card.spellId)) assert.deepEqual([card.manaCost, card.cost], [SPELL_CATALOG[card.spellId].manaCost, SPELL_CATALOG[card.spellId].manaCost]);
    assert.equal(migrateSavedGame(upgraded), upgraded);
    const newCast = castSelected(upgraded);
    const cost = first === 0 ? 2 : SPELL_CATALOG[waterSpell].manaCost;
    assert.equal(newCast.players[first].mana, 10 - cost);
    assert.match(newCast.log.findLast(entry => entry.type === 'cast').message, new RegExp(`for ${cost} mana`));
  }
});

test('previous Mana payments and cast logs survive price refresh through pending and completed rolls', () => {
  for (const [spellId, first, finalMana] of [['Fire-11', 0, 8], ['Water-12', 1, 6], ['Water-14', 1, 2]]) {
    const rolling = previouslyPaidCostCast(costSnapshotFresh(first, spellId.startsWith('Water') ? spellId : 'Water-12'), spellId);
    const fate = rollPair(rolling, [3, 4]), resolving = passFate(fate), completed = resolveSpell(resolving);
    assert.equal(completed.players[first].mana, finalMana);
    for (const current of [rolling, fate, resolving, completed]) {
      const previous = previousCostSnapshots(current), before = structuredClone(previous), upgraded = migrateSavedGame(previous);
      assert.deepEqual(upgraded, current); assert.deepEqual(previous, before);
      assert.match(upgraded.log.find(entry => entry.type === 'cast').message, new RegExp(`for ${previousCost[spellId]} mana`));
      assert.equal(migrateSavedGame(upgraded), upgraded);
      if (upgraded.lastRoll) assert.equal(rollDice(upgraded, () => { throw new Error('saved dice cannot reroll'); }), upgraded);
      let continued = upgraded;
      if (continued.phase === 'rolling') continued = rollPair(continued, [3, 4]);
      continued = resolveSpell(passFate(continued));
      assert.deepEqual(continued, completed);
      assert.equal(continued.players[first].mana, finalMana);
      assert.equal(continued.players[first].discard.filter(card => card.spellId === spellId).length, 1);
      assert.equal(resolveSpell(continued), continued);
    }
  }
});

test('price refresh rejects mismatched fields, unknown prices and unpaired canonical descriptions', () => {
  for (const spellId of ['Fire-11', 'Water-12', 'Water-14']) {
    const currentCost = SPELL_CATALOG[spellId].manaCost;
    const freshPrice = () => previousCostSnapshots(costSnapshotFresh(0, spellId.startsWith('Water') ? spellId : 'Water-12'));
    for (const [manaCost, cost] of [[previousCost[spellId], currentCost], [currentCost, previousCost[spellId]], [1, 1], [previousCost[spellId], undefined]]) {
      const previous = freshPrice(), card = cardsOf(previous.players[spellId === 'Fire-11' ? 0 : 1]).find(card => card.spellId === spellId);
      Object.assign(card, { manaCost, cost });
      assert.equal(migrateSavedGame(previous), null, `${spellId}: ${manaCost}/${cost}`);
    }
    for (const key of ['effectText', 'description']) {
      const previous = freshPrice(), card = cardsOf(previous.players[spellId === 'Fire-11' ? 0 : 1]).find(card => card.spellId === spellId);
      card[key] = 'Unexpected rules text.';
      assert.equal(migrateSavedGame(previous), null, `${spellId}: ${key}`);
    }
  }
});
