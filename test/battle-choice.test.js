import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBattleChoice } from '../src/battle-choice.js';
import { createGame, rollInitiative, endTurn, beginRefresh, toggleRefreshCard,
  cancelStagedAction, selectCard, castSelected } from '../src/game.js';

function battle() {
  const deck = (element, spellId) => ({ element, spellbookId: 'spellbook-2', entries: [{ spellId, quantity: 6 }] });
  let state = createGame(47, { players: [
    { element: 'earth', deck: deck('earth', 'Earth-1') },
    { element: 'water', deck: deck('water', 'Water-0') },
  ] });
  return rollInitiative(rollInitiative(state, 0, () => .99), 1, () => 0);
}

test('End Turn and blue Hand Refresh keep only their intended next controls', () => {
  const ending = endTurn(battle());
  assert.equal(classifyBattleChoice(ending, 'end-turn'), 'keep');
  assert.equal(classifyBattleChoice(ending, 'hand-refresh'), 'keep');
  assert.equal(classifyBattleChoice(ending, 'background'), 'cancel');
  for (const target of ['card', 'other', 'open-settings', 'view-deck', 'enhance', 'aura']) {
    assert.equal(classifyBattleChoice(ending, target), 'cancel-and-continue', target);
  }
  const refreshing = beginRefresh(ending);
  assert.equal(classifyBattleChoice(refreshing, 'hand-refresh'), 'keep', 'red confirmation can commit');
  assert.equal(classifyBattleChoice(refreshing, 'card'), 'keep', 'card checks do not dismiss refresh');
  assert.equal(classifyBattleChoice(refreshing, 'end-turn'), 'cancel-and-continue', 'a different control cannot confirm refresh');
  assert.equal(classifyBattleChoice(refreshing, 'other'), 'cancel-and-continue');
  assert.equal(classifyBattleChoice(refreshing, 'background'), 'cancel');
});

test('switching from End Turn to a card cancels first and selects that card in the same turn', () => {
  const initial = battle(), cardId = initial.players[0].hand[0].id;
  const ending = endTurn(initial);
  assert.equal(classifyBattleChoice(ending, 'card'), 'cancel-and-continue');
  const resumed = cancelStagedAction(ending);
  const selected = selectCard(resumed, cardId);
  assert.deepEqual([selected.phase, selected.activePlayer, selected.selectedCardId], ['main', 0, cardId]);
  assert.deepEqual(selected.players, initial.players, 'no costs, discards, draws or turn counters change');
  assert.deepEqual(selected.log, initial.log);
});

test('changing from refresh to End Turn discards no slabs and requires a later explicit pass', () => {
  const initial = battle();
  const refreshing = toggleRefreshCard(beginRefresh(endTurn(initial)), initial.players[0].hand[0].id);
  assert.equal(classifyBattleChoice(refreshing, 'end-turn'), 'cancel-and-continue');
  const endingAgain = endTurn(cancelStagedAction(refreshing));
  assert.deepEqual([endingAgain.phase, endingAgain.activePlayer, endingAgain.refreshCardIds], ['end', 0, []]);
  assert.deepEqual(endingAgain.players, initial.players);
  assert.deepEqual(endingAgain.log, initial.log);
  assert.equal(endTurn(endingAgain).activePlayer, 1, 'only repeating the intended End Turn confirms its pass');
});

test('canceling staged choices preserves a committed primary and its exact battle effects', () => {
  let initial = battle();
  Object.assign(initial, { primaryUsed: true, primaryAction: 'spell' });
  Object.assign(initial.players[0], { mana: 1, enhancement: 20, auraTurns: 2, loaded: 4 });
  const refreshing = toggleRefreshCard(beginRefresh(endTurn(initial)), initial.players[0].hand[0].id);
  const before = structuredClone(refreshing);
  assert.equal(classifyBattleChoice(refreshing, 'open-settings'), 'cancel-and-continue');
  assert.deepEqual(refreshing, before, 'classification does not mutate the state');
  const canceled = cancelStagedAction(refreshing);
  assert.deepEqual([canceled.phase, canceled.primaryUsed, canceled.primaryAction], ['main', true, 'spell']);
  assert.deepEqual(canceled.players, initial.players);
  assert.deepEqual(canceled.log, initial.log);
});

test('selected primary and Fate slabs keep their own actions but clear on unrelated clicks', () => {
  for (const phase of ['main', 'fate']) {
    const state = { status: 'playing', phase, selectedCardId: 'selected', selectedFateCardIds: phase === 'fate' ? ['selected'] : [] };
    assert.equal(classifyBattleChoice(state, 'card'), 'keep', 'normal card replacement/toggle remains intact');
    assert.equal(classifyBattleChoice(state, 'cast-spell'), 'keep');
    assert.equal(classifyBattleChoice(state, 'inspect-selected'), 'keep');
    assert.equal(classifyBattleChoice(state, 'background'), 'cancel');
    assert.equal(classifyBattleChoice(state, 'other'), 'cancel-and-continue');
  }
  const fate = { status: 'playing', phase: 'fate', selectedCardId: null, selectedFateCardIds: ['selected'] };
  assert.equal(classifyBattleChoice(fate, 'twist'), 'keep');
  assert.equal(classifyBattleChoice(fate, 'skip-fate'), 'keep');
  assert.equal(classifyBattleChoice(fate, 'end-turn'), 'cancel-and-continue');
});

test('casts, Fate passes, finished games and confirmed turn passes cannot be undone', () => {
  const initial = battle();
  const casting = castSelected(selectCard(initial, initial.players[0].hand[0].id));
  assert.equal(classifyBattleChoice(casting, 'background'), 'keep', 'a committed cast is rolling');
  assert.equal(cancelStagedAction(casting), casting);
  const passed = endTurn(endTurn(initial));
  assert.equal(classifyBattleChoice(passed, 'background'), 'keep', 'new turn has no old staged choice');
  assert.equal(cancelStagedAction(passed), passed);
  const fate = { status: 'playing', phase: 'fate', selectedCardId: null, selectedFateCardIds: [] };
  assert.equal(classifyBattleChoice(fate, 'background'), 'keep', 'an earlier Cast/Skip Fate is already committed');
  for (const phase of ['setup', 'initiative', 'rolling', 'resolving', 'enhancing', 'ready-to-pass']) {
    assert.equal(classifyBattleChoice({ status: 'playing', phase, selectedCardId: 'old' }, 'other'), 'keep', phase);
  }
  assert.equal(classifyBattleChoice({ status: 'finished', phase: 'end' }, 'background'), 'keep');
  assert.equal(classifyBattleChoice(null, 'background'), 'keep');
});
