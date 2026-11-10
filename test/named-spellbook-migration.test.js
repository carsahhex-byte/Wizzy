import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG, LEGACY_SPELL_NAMES } from '../src/spells.js';
import { SPELLBOOK_2 } from '../src/spellbooks.js';
import { createGame, rollInitiative, selectCard, castSelected, rollDice, skipFate, resolveSpell, migrateSavedGame, validateSavedGame, assertGame } from '../src/game.js';
import { createDuelStorage, duelSaveKey, RETIRED_DUEL_ARCHIVE_KEY } from '../src/duel-storage.js';
import { getResolvedSpellVisuals, getSpellVisual } from '../src/spell-visuals.js';

const ids = { fire: ['Fire-2', 'Fire-15', 'Fire-6', 'Fire-11', 'Fire-14'], water: ['Water-2', 'Water-0', 'Water-12', 'Water-9', 'Water-14'] };
const all = player => ['hand', 'deck', 'discard'].flatMap(zone => player[zone]);
function fresh(first = 0) {
  const decks = Object.fromEntries(['fire', 'water'].map(element => [element, {
    element, spellbookId: SPELLBOOK_2, entries: ids[element].map(spellId => ({ spellId, quantity: 3 })),
  }]));
  let state = createGame(19, decks);
  state = rollInitiative(rollInitiative(state, 0, () => first === 0 ? .9 : 0), 1, () => first === 1 ? .9 : 0);
  return state;
}
function oldNames(state) {
  const previous = structuredClone(state);
  for (const player of previous.players) for (const card of all(player)) if (Object.hasOwn(LEGACY_SPELL_NAMES, card.spellId)) card.name = LEGACY_SPELL_NAMES[card.spellId];
  previous.log = previous.log.map(entry => {
    for (const [id, name] of Object.entries(LEGACY_SPELL_NAMES)) {
      const spell = SPELL_CATALOG[id];
      if (entry.type === 'cast') entry.message = entry.message.replace(` casts ${spell.name} for `, ` casts ${name} for `);
      if (entry.type === 'resolve' && entry.message === `${spell.name} resolves and moves to discard.`) entry.message = `${name} resolves and moves to discard.`;
    }
    return entry;
  });
  return previous;
}
function rolling(spellId) {
  const first = spellId.startsWith('Water-') ? 1 : 0;
  const state = fresh(first), player = state.players[first], pool = all(player);
  const target = pool.splice(pool.findIndex(card => card.spellId === spellId), 1)[0];
  player.hand = [target]; player.deck = pool; player.discard = [];
  Object.assign(player, { mana: spellId === 'Water-0' ? 2 : 10, element: 3, loadedPending: 2, enhancement: 20, auraTurns: 2 });
  return castSelected(selectCard(state, target.id));
}
function rolled(state) { let index = 0; return rollDice(state, () => ([3, 4][index++] - 1) / 6); }
function complete(state) {
  if (state.phase === 'rolling') state = rolled(state);
  while (state.phase === 'fate') state = skipFate(state);
  return resolveSpell(state);
}

test('exact legacy names upgrade across all zones without changing IDs, stats, decks or history', () => {
  const current = fresh();
  for (const player of current.players) {
    const pool = all(player);
    player.hand = ids[player.id].map(id => pool.splice(pool.findIndex(card => card.spellId === id), 1)[0]);
    player.discard = ids[player.id].map(id => pool.splice(pool.findIndex(card => card.spellId === id), 1)[0]);
    player.deck = pool;
    Object.assign(player, { hp: 81, mana: 8, shield: 19, element: 3, enhancement: 20, auraTurns: 2, loadedPending: 2 });
  }
  const previous = oldNames(current), snapshot = structuredClone(previous);
  assert.equal(validateSavedGame(previous), false);
  const migrated = migrateSavedGame(previous);
  assert.deepEqual(migrated, current); assert.deepEqual(previous, snapshot);
  assert.equal(migrateSavedGame(migrated), migrated);
  const invalid = structuredClone(previous); invalid.players[0].hand[0].name = 'Unknown replacement';
  assert.equal(migrateSavedGame(invalid), null);
});

test('pending and completed named spells preserve paid costs and old log text while resolving once', () => {
  for (const spellId of ['Fire-11', 'Fire-6', 'Fire-14', 'Water-0', 'Water-12']) {
    const pending = rolling(spellId), resolution = rolled(pending), finished = complete(resolution);
    for (const state of [pending, resolution, finished]) {
      const previous = oldNames(state), snapshot = structuredClone(previous);
      const expected = structuredClone(state); expected.log = structuredClone(previous.log);
      const migrated = migrateSavedGame(previous);
      assert.deepEqual(migrated, expected, spellId); assert.deepEqual(previous, snapshot);
      assert.equal(migrateSavedGame(migrated), migrated);
      if (state.phase !== 'main') {
        const result = complete(migrated);
        assert.deepEqual(result.players, finished.players, spellId);
        const events = getResolvedSpellVisuals(migrated, result);
        assert.equal(events.length, 1); assert.equal(events[0].spellId, spellId);
        assert.equal(events[0].kind, getSpellVisual(spellId).kind);
        assert.deepEqual(getResolvedSpellVisuals(result, result), []);
        assert.equal(resolveSpell(result), result);
      }
      if (spellId === 'Water-0') assert.equal(migrated.players[1].mana, 3, 'Swell never credits its old on-cast Mana again');
    }
  }
  assert.equal(getSpellVisual('Fire-6').kind, 'simple-cast');
});

test('legacy paid prices remain historical through rename migration and animation collection', () => {
  for (const [spellId, playerIndex, oldCost] of [['Fire-11', 0, 3], ['Water-12', 1, 4]]) {
    const previous = oldNames(rolling(spellId));
    const paid = previous.players[playerIndex], card = paid.hand[0];
    paid.mana += card.manaCost - oldCost; card.manaCost = card.cost = oldCost;
    previous.log.findLast(entry => entry.type === 'cast').message = `${paid.name} casts ${spellId} for ${oldCost} mana.`;
    const current = migrateSavedGame(previous);
    assert.ok(current); assert.equal(current.players[playerIndex].mana, 10 - oldCost);
    assert.equal(current.players[playerIndex].hand[0].manaCost, SPELL_CATALOG[spellId].manaCost);
    const after = complete(current);
    assert.equal(getResolvedSpellVisuals(current, after).length, 1);
    assert.match(after.log.find(entry => entry.type === 'cast').message, new RegExp(`for ${oldCost} mana`));
    assert.equal(after.players[playerIndex].mana, 10 - oldCost + (spellId === 'Fire-11' ? 1 : 0));
  }
});

function retiredDuel() {
  let state = createGame(7, { fire: { element: 'fire', entries: [{ spellId: 'Fire-5', quantity: 3 }] }, water: { element: 'water', entries: [{ spellId: 'Water-9', quantity: 3 }] } });
  state = rollInitiative(rollInitiative(state, 0, () => .9), 1, () => 0);
  state.players[0].element = 1;
  state = castSelected(selectCard(state, state.players[0].hand[0].id), { emberSpend: 1 });
  for (const player of state.players) player.deckDefinition.spellbookId = SPELLBOOK_2;
  return oldNames(state);
}

test('old Fire-5 duels are archived exactly before a fresh duel can replace the active save', () => {
  const old = retiredDuel(), raw = JSON.stringify(old), data = new Map([[duelSaveKey(SPELLBOOK_2), raw]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(migrateSavedGame(old), null);
  const saves = createDuelStorage(storage), next = saves.load(SPELLBOOK_2);
  assert.equal(next.phase, 'setup'); assertGame(next);
  assert.equal(data.get(duelSaveKey(SPELLBOOK_2)), raw, 'loading leaves the original key intact');
  assert.equal(data.get(RETIRED_DUEL_ARCHIVE_KEY), raw);
  assert.match(saves.getNotice(), /archived/);
  assert.equal(saves.save(next), true);
  assert.equal(data.get(RETIRED_DUEL_ARCHIVE_KEY), raw);
  assert.equal(JSON.parse(data.get(RETIRED_DUEL_ARCHIVE_KEY)).pendingSpell.spellId, 'Fire-5');
  assert.equal(JSON.parse(data.get(RETIRED_DUEL_ARCHIVE_KEY)).players[0].mana, 0);
  assert.equal(JSON.parse(data.get(RETIRED_DUEL_ARCHIVE_KEY)).players[0].element, 0);
  const blocked = createDuelStorage({ getItem: key => key === duelSaveKey(SPELLBOOK_2) ? raw : null, setItem() { throw new Error('full'); } });
  const fresh = blocked.load(SPELLBOOK_2);
  assert.equal(blocked.save(fresh), false, 'an archive failure cannot overwrite the paid old cast');
});

test('a different retired duel from an old tab receives a separate archive before replacement', () => {
  const first = JSON.stringify(retiredDuel()), secondState = retiredDuel();
  secondState.players[1].hp = 91;
  const second = JSON.stringify(secondState), key = duelSaveKey(SPELLBOOK_2);
  const data = new Map([[key, first]]);
  const storage = { getItem: name => data.get(name) ?? null, setItem: (name, value) => data.set(name, value) };
  const saves = createDuelStorage(storage);
  assert.equal(saves.save(saves.load(SPELLBOOK_2)), true);
  data.set(key, second); // A stale tab later writes a different paid old duel.
  const next = saves.load(SPELLBOOK_2);
  const extra = [...data].filter(([name]) => name.startsWith(`${RETIRED_DUEL_ARCHIVE_KEY}.`));
  assert.equal(extra.length, 1); assert.equal(extra[0][1], second);
  assert.equal(data.get(RETIRED_DUEL_ARCHIVE_KEY), first);
  assert.equal(saves.save(next), true);
  data.set(key, second); saves.load(SPELLBOOK_2);
  assert.equal([...data.keys()].filter(name => name.startsWith(`${RETIRED_DUEL_ARCHIVE_KEY}.`)).length, 1, 'identical snapshots reuse their archive');
  const failing = createDuelStorage({
    getItem: name => data.get(name) ?? null,
    setItem(name, value) { if (name.startsWith(`${RETIRED_DUEL_ARCHIVE_KEY}.`)) throw new Error('full'); data.set(name, value); },
  });
  data.delete(extra[0][0]); data.set(key, second);
  const blocked = failing.load(SPELLBOOK_2);
  assert.equal(failing.save(blocked), false);
  assert.equal(data.get(key), second); assert.equal(data.get(RETIRED_DUEL_ARCHIVE_KEY), first);
});
