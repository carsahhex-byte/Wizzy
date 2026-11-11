import test from 'node:test';
import assert from 'node:assert/strict';
import {SPELL_CATALOG,SPELL_NAME_ALIASES} from '../src/spells.js';
import {SPELLBOOK_2} from '../src/spellbooks.js';
import {createGame,rollInitiative,selectCard,castSelected,rollDice,resolveSpell,migrateSavedGame,validateSavedGame} from '../src/game.js';
import {getResolvedSpellVisuals} from '../src/spell-visuals.js';

test('approved Earth and Carbonate display names keep stable spell identities and aliases',()=>{
  const names={'Earth-1':'OffoDefo','Earth-2':'Bengal Shield','Earth-3':'Earthbound','Earth-4':'Merciful','Earth-5':'Tectonic','Water-12':'Carbonate'};
  for(const[id,name]of Object.entries(names)){
    assert.equal(SPELL_CATALOG[id].name,name);assert.equal(SPELL_CATALOG[id].spellId,id);
    assert.ok(SPELL_NAME_ALIASES[id].includes(id));assert.ok(SPELL_NAME_ALIASES[id].includes(name));
  }
  assert.ok(SPELL_NAME_ALIASES['Water-12'].includes('Coral Crash'));
});

test('exact previous names migrate across all zones while IDs, deck quantities, resources and logs stay intact',()=>{
  const earthIds=['Earth-1','Earth-2','Earth-3','Earth-4','Earth-5'];
  const deck=(element,ids)=>({element,spellbookId:SPELLBOOK_2,entries:ids.map(spellId=>({spellId,quantity:element==='water'?6:3}))});
  let current=createGame(12,{players:[{element:'earth',deck:deck('earth',earthIds)},{element:'water',deck:deck('water',['Water-12'])}]});
  current=rollInitiative(rollInitiative(current,0,()=>.9),1,()=>0);
  for(const player of current.players){
    const cards=[...player.hand,...player.deck];player.hand=cards.splice(0,3);player.discard=cards.splice(0,1);player.deck=cards;
  }
  const previous=structuredClone(current);
  for(const player of previous.players)for(const zone of['hand','deck','discard'])for(const card of player[zone]){
    card.name=card.spellId==='Water-12'?'Coral Crash':card.spellId;
  }
  const preserved=structuredClone(previous),migrated=migrateSavedGame(previous);
  assert.equal(validateSavedGame(previous),false);assert.deepEqual(migrated,current);assert.deepEqual(previous,preserved);
  assert.equal(migrateSavedGame(migrated),migrated);
  const invalid=structuredClone(previous);invalid.players[0].hand[0].name='OffoeDefo';
  assert.equal(migrateSavedGame(invalid),null,'unapproved misspellings are not broadly accepted');
});

test('a paid Coral Crash cast resumes as Carbonate and retains its historical log and final roll',()=>{
  const deck=(element,spellId)=>({element,spellbookId:SPELLBOOK_2,entries:[{spellId,quantity:2}]});
  let before=createGame(3,{fire:deck('fire','Fire-2'),water:deck('water','Water-12')});
  before=rollInitiative(rollInitiative(before,0,()=>0),1,()=>.9);
  before.players[1].mana=10;
  let pending=castSelected(selectCard(before,before.players[1].hand[0].id));
  for(const zone of['hand','deck','discard'])for(const card of pending.players[1][zone])card.name='Coral Crash';
  pending.log.findLast(entry=>entry.type==='cast').message='Water casts Coral Crash for 3 mana.';
  const previous=structuredClone(pending),migrated=migrateSavedGame(pending);
  assert.ok(migrated);assert.deepEqual(migrated.log,pending.log);assert.equal(migrated.players[1].mana,7);
  const after=resolveSpell(rollDice(migrated,()=>.5)),[event]=getResolvedSpellVisuals(migrated,after);
  assert.equal(event.spellId,'Water-12');assert.equal(event.modifiedTotal,8);
  assert.equal(after.log.at(-1).message,'Carbonate resolves and moves to discard.');
  assert.equal(after.players[1].discard.length,1);assert.deepEqual(pending,previous);
});
