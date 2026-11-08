import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMultiplayerServer } from '../server/room-server.js';
import { createGame, rollInitiative, ENHANCEMENT_ROLL_RULE } from '../src/game.js';
import { normalizeDeck } from '../src/decks.js';
import { SPELLBOOK_VERSION } from '../src/spells.js';

const legalDeck = element => ({ element, entries: [
  ...Array.from({ length: 7 }, (_, i) => ({ spellId: `${element === 'fire' ? 'Fire' : 'Water'}-${i + 1}`, quantity: 3 })),
  ...['FAT-001', 'FAT-002', 'FAT-003'].map(spellId => ({ spellId, quantity: 3 })),
] });

function arrangeHand(state, playerIndex, spellIds) {
  const player = state.players[playerIndex];
  const pool = [...player.hand, ...player.deck, ...player.discard];
  player.hand = spellIds.map(spellId => {
    const index = pool.findIndex(card => card.spellId === spellId);
    assert.ok(index >= 0, `${spellId} is available`);
    return pool.splice(index, 1)[0];
  });
  player.deck = pool; player.discard = [];
  return state;
}

function fixtureMatch(decks) {
  let state = createGame(19, decks);
  state = rollInitiative(state, 0, () => .99);
  state = rollInitiative(state, 1, () => 0);
  arrangeHand(state, 0, ['Fire-4', 'FAT-001', 'Fire-2', 'Fire-1', 'Fire-3']);
  arrangeHand(state, 1, ['FAT-002', 'FAT-003', 'Water-2', 'Water-1', 'Water-3']);
  return state;
}

function fixtureWithoutFate(decks) {
  const state = fixtureMatch(decks);
  arrangeHand(state, 0, ['Fire-1', 'Fire-2', 'Fire-3', 'Fire-4', 'Fire-5']);
  arrangeHand(state, 1, ['Water-1', 'Water-2', 'Water-3', 'Water-4', 'Water-5']);
  return state;
}

async function service(t, options = {}) {
  const unexpected = [];
  const server = createMultiplayerServer({ createMatch: fixtureMatch, rollRandom: () => .5, onError: error => unexpected.push(error.message), ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.deepEqual(unexpected, [], 'unexpected server exceptions'); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (pathname, { method = 'GET', body, token, headers = {} } = {}) => {
    const response = await fetch(base + pathname, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  };
  const create = async (element = 'fire', deck = legalDeck(element)) => {
    const result = await request('/api/rooms', { method: 'POST', body: { name: 'Host', element, deck } });
    assert.equal(result.status, 201); return result.data;
  };
  const join = async (host, deck = legalDeck(host.element === 'fire' ? 'water' : 'fire')) => {
    const result = await request(`/api/rooms/${host.code}/join`, { method: 'POST', body: { name: 'Guest', deck } });
    assert.equal(result.status, 200); return result.data;
  };
  const get = async player => {
    const result = await request(`/api/rooms/${player.code}`, { token: player.token });
    assert.equal(result.status, 200); return result.data;
  };
  let sequence = 0;
  const action = async (player, type, payload = {}, extra = {}) => {
    const current = await get(player);
    return request(`/api/rooms/${player.code}/actions`, { method: 'POST', token: player.token, body: { type, payload, revision: current.revision, requestId: `action-${++sequence}`, ...extra } });
  };
  return { server, base, request, create, join, get, action };
}

test('room creation, opposite-element joins and private player views support two independent screens', async t => {
  const api = await service(t);
  assert.deepEqual((await api.request('/api/health')).data, { ok: true, service: 'wizzy-multiplayer', storage: 'memory', spellbookVersion: SPELLBOOK_VERSION, accounts: { enabled: true, storage: 'memory' } });
  const host = await api.create();
  assert.match(host.code, /^[A-Z2-9]{8}$/); assert.match(host.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual([host.revision, host.status, host.state, host.playerIndex], [0, 'waiting', null, 0]);
  const info = await api.request(`/api/rooms/${host.code}/info`);
  assert.deepEqual(info.data, { code: host.code, status: 'waiting', joiningElement: 'water' });
  assert.equal((await api.request(`/api/rooms/${host.code}`)).status, 401);
  assert.equal((await api.request(`/api/rooms/${host.code}?token=${host.token}`)).status, 401, 'query strings do not authenticate');
  const guest = await api.join(host);
  assert.notEqual(guest.token, host.token);
  assert.deepEqual([guest.playerIndex, guest.element, guest.status, guest.revision], [1, 'water', 'playing', 1]);
  const fire = await api.get(host), water = await api.get(guest);
  assert.equal(fire.token, undefined); assert.equal(water.token, undefined);
  for (const [view, own] of [[fire, 0], [water, 1]]) {
    assert.equal(view.state.players[own].hand.length, 5);
    assert.equal(view.state.players[1 - own].hand.length, 0);
    assert.equal(view.state.players[1 - own].handCount, 5);
    assert.equal(view.state.players[1 - own].deckDefinition, null);
    assert.ok(view.state.players[own].deckDefinition);
    for (const player of view.state.players) assert.deepEqual([player.deck, player.deckCount], [[], 25]);
    assert.equal(view.players[0].name, 'Host'); assert.equal(view.players[1].name, 'Guest');
    assert.equal(JSON.stringify(view).includes('tokenHash'), false);
  }
  assert.deepEqual((await api.get(host)).state, fire.state, 'reconnect gets the current private view');
  assert.equal((await api.request(`/api/rooms/${host.code}/join`, { method: 'POST', body: { name: 'Third', deck: legalDeck('water') } })).status, 409);
});

test('server controls roles, selections, Fate, secure dice totals, one primary and refresh passing', async t => {
  const api = await service(t), host = await api.create(), guest = await api.join(host);
  let fire = await api.get(host);
  assert.equal((await api.action(guest, 'endTurn')).status, 403);
  const primary = fire.state.players[0].hand.find(card => card.spellId === 'Fire-4');
  assert.equal((await api.action(host, 'selectCard', { cardId: primary.id })).status, 200);
  const hiddenSelection = await api.get(guest); assert.equal(hiddenSelection.state.selectedCardId, null);
  let result = await api.action(host, 'castSpell'); assert.equal(result.status, 200);
  assert.deepEqual([result.data.state.phase, result.data.state.players[0].mana, result.data.state.primaryUsed], ['fate', 1, true]);
  const publicSpell = (await api.get(guest)).state.pendingSpell;
  assert.equal(publicSpell.spellId, 'Fire-4'); assert.equal(publicSpell.cardId, undefined);
  assert.deepEqual(result.data.state.lastRoll.dice, [4, 4], 'raw dice are visible before Fate');
  assert.equal(result.data.state.lastRoll.total, 8);
  assert.equal(result.data.state.fatePlayer, 1, 'defender decides first after the roll');
  assert.equal((await api.action(host, 'skipFate')).status, 403);
  const defending = await api.get(guest);
  const misfortune = defending.state.players[1].hand.find(entry => entry.spellId === 'FAT-002');
  const twist = defending.state.players[1].hand.find(entry => entry.spellId === 'FAT-003');
  await api.action(guest, 'selectCard', { cardId: misfortune.id });
  result = await api.action(guest, 'castFate');
  assert.equal(result.status, 200); assert.equal(result.data.state.fatePlayer, 0);
  assert.equal(result.data.state.lastRoll.total, 4);
  const fortune = (await api.get(host)).state.players[0].hand.find(card => card.spellId === 'FAT-001');
  await api.action(host, 'selectCard', { cardId: fortune.id });
  result = await api.action(host, 'castFate');
  assert.equal(result.status, 200); assert.equal(result.data.state.fatePlayer, 1, 'every caster Fate gives the defender another response');
  assert.equal(result.data.state.lastRoll.total, 8);
  await api.action(guest, 'selectCard', { cardId: twist.id });
  assert.equal((await api.action(guest, 'castFate', { twistDirections: { [twist.id]: 4 } })).status, 400);
  assert.equal((await api.action(guest, 'castFate', { twistDirections: { forged: -2 } })).status, 400);
  result = await api.action(guest, 'castFate', { twistDirections: { [twist.id]: -2 } });
  assert.equal(result.status, 200); assert.equal(result.data.state.phase, 'main');
  assert.deepEqual(result.data.state.lastRoll.dice, [4, 4], 'Fate never rerolls raw dice');
  assert.equal(result.data.state.lastRoll.total, 6, '8 dice -4 Misfortune +4 Fortune -2 Twist');
  assert.equal(result.data.state.players[1].hp, 95);
  assert.deepEqual(result.data.state.players.map(player => player.handCount), [3, 3]);
  fire = await api.get(host);
  const spark = fire.state.players[0].hand.find(card => card.spellId === 'Fire-1');
  await api.action(host, 'selectCard', { cardId: spark.id });
  assert.equal((await api.action(host, 'castSpell')).status, 422, 'a second primary is rejected');
  assert.equal((await api.action(host, 'endTurn')).data.state.phase, 'end');
  assert.equal((await api.action(host, 'beginRefresh')).data.state.phase, 'refresh');
  assert.equal((await api.action(host, 'toggleRefreshCard', { cardId: spark.id })).status, 200);
  assert.deepEqual((await api.get(guest)).state.refreshCardIds, [], 'staged discards stay private');
  result = await api.action(host, 'confirmRefresh');
  assert.deepEqual([result.data.state.activePlayer, result.data.state.primaryUsed, result.data.state.players[0].handCount], [1, false, 6]);
  const refreshedGuest = await api.get(guest);
  assert.equal(refreshedGuest.state.players[0].hand.length, 0);
  assert.equal((await api.action(guest, 'endTurn')).status, 200, 'opponent can act on their new turn');
});

test('background cancellation clears only the acting player selection and retries cannot clear a later selection', async t => {
  const api = await service(t, { createMatch: fixtureWithoutFate });
  const host = await api.create(), guest = await api.join(host);
  const initial = await api.get(host);
  const [first, second] = initial.state.players[0].hand;
  await api.action(host, 'selectCard', { cardId: first.id });
  const selected = await api.get(host);
  assert.equal((await api.action(guest, 'cancelStagedAction')).status, 403);
  assert.equal((await api.action(host, 'cancelStagedAction', { cardId: first.id })).status, 400);
  assert.deepEqual(await api.get(host), selected, 'invalid cancellation leaves the staged choice untouched');
  const request = { type: 'cancelStagedAction', payload: {}, revision: selected.revision, requestId: 'cancel-selection-once' };
  const cancel = () => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body: request });
  const result = await cancel(); assert.equal(result.status, 200);
  assert.equal(result.data.state.selectedCardId, null);
  assert.deepEqual(result.data.state.players, initial.state.players);
  assert.deepEqual(result.data.state.log, initial.state.log);
  const noOp = await api.action(host, 'cancelStagedAction');
  assert.equal(noOp.status, 200); assert.deepEqual(noOp.data, result.data, 'extra background taps do not create revisions');
  await api.action(host, 'selectCard', { cardId: second.id });
  const later = await api.get(host);
  const duplicate = await cancel(); assert.equal(duplicate.status, 200);
  assert.deepEqual(duplicate.data, later, 'retrying an old cancellation cannot clear the new selected slab');
  const cast = await api.action(host, 'castSpell'); assert.equal(cast.status, 200);
  assert.equal(cast.data.state.primaryUsed, true);
  const after = await api.action(host, 'cancelStagedAction');
  assert.equal(after.status, 200); assert.deepEqual(after.data, cast.data, 'a committed cast is never undone');
});

test('cancelled End Turn and Hand Refresh preserve cards and bonuses until an actual pass', async t => {
  const api = await service(t, { createMatch: decks => {
    const state = fixtureWithoutFate(decks);
    Object.assign(state.players[0], { loaded: 4, loadedPending: 2, auraTurns: 2 });
    return state;
  } });
  const host = await api.create(), guest = await api.join(host);
  const before = (await api.get(host)).state;
  let result = await api.action(host, 'endTurn');
  assert.equal(result.data.state.phase, 'end');
  assert.equal(result.data.state.players[0].loaded, 4, 'opening End Turn does not expire Loaded');
  result = await api.action(host, 'cancelStagedAction');
  assert.equal(result.data.state.phase, 'main');
  assert.deepEqual(result.data.state.players, before.players);
  assert.deepEqual(result.data.state.log, before.log);
  await api.action(host, 'endTurn'); await api.action(host, 'beginRefresh');
  for (const card of before.players[0].hand.slice(0, 2)) await api.action(host, 'toggleRefreshCard', { cardId: card.id });
  result = await api.action(host, 'cancelStagedAction');
  assert.deepEqual([result.data.state.phase, result.data.state.refreshCardIds, result.data.state.activePlayer], ['main', [], 0]);
  assert.deepEqual(result.data.state.players, before.players, 'cancelling refresh neither discards nor draws');
  assert.deepEqual(result.data.state.log, before.log);
  await api.action(host, 'endTurn'); await api.action(host, 'beginRefresh');
  await api.action(host, 'toggleRefreshCard', { cardId: before.players[0].hand[0].id });
  result = await api.action(host, 'confirmRefresh');
  assert.deepEqual([result.data.state.activePlayer, result.data.state.players[0].loaded, result.data.state.players[0].auraTurns], [1, 0, 1]);
  assert.deepEqual([result.data.state.players[0].handCount, result.data.state.players[0].discard.length], [6, 1]);
  assert.equal((await api.action(host, 'cancelStagedAction')).status, 403, 'the previous player cannot undo the confirmed pass');
  const current = await api.get(guest);
  assert.deepEqual((await api.action(guest, 'cancelStagedAction')).data, current, 'a background tap on the new turn cannot undo the refresh');
});

test('clearing a selected Fate slab never passes priority or undoes Cast Fate and Skip Fate', async t => {
  const api = await service(t), host = await api.create(), guest = await api.join(host);
  const card = (await api.get(host)).state.players[0].hand.find(entry => entry.spellId === 'Fire-4');
  await api.action(host, 'selectCard', { cardId: card.id }); await api.action(host, 'castSpell');
  const responding = (await api.get(guest)).state;
  const fate = responding.players[1].hand.find(entry => entry.spellId === 'FAT-002');
  await api.action(guest, 'selectCard', { cardId: fate.id });
  let result = await api.action(guest, 'cancelStagedAction');
  assert.deepEqual([result.data.state.phase, result.data.state.fatePlayer, result.data.state.selectedCardId, result.data.state.selectedFateCardIds], ['fate', 1, null, []]);
  for (const key of ['players', 'pendingSpell', 'lastRoll', 'log']) assert.deepEqual(result.data.state[key], responding[key], key);
  await api.action(guest, 'selectCard', { cardId: fate.id });
  result = await api.action(guest, 'castFate'); assert.equal(result.status, 200);
  const afterCast = await api.get(host);
  assert.equal(afterCast.state.players[1].discard.length, 1);
  assert.equal(afterCast.state.pendingSpell.defendingFate, -4);
  assert.deepEqual((await api.action(host, 'cancelStagedAction')).data, afterCast, 'Cast Fate stays committed');
  result = await api.action(host, 'skipFate'); assert.equal(result.status, 200);
  const afterSkip = await api.get(guest);
  assert.equal(afterSkip.state.pendingSpell.fatePasses, 1);
  assert.deepEqual((await api.action(guest, 'cancelStagedAction')).data, afterSkip, 'Skip Fate stays committed');
  result = await api.action(guest, 'skipFate');
  assert.equal(result.data.state.phase, 'main');
  assert.equal(result.data.state.primaryUsed, true);
  assert.deepEqual(result.data.state.players.map(player => player.discard.length), [1, 1]);
});

test('Fate alternates after every single slab beyond three windows and skips exhausted hands privately', async t => {
  const api = await service(t, { createMatch: decks => {
    const state = fixtureMatch(decks);
    arrangeHand(state, 0, ['Fire-4', 'FAT-001', 'FAT-001', 'FAT-003', 'Fire-1']);
    arrangeHand(state, 1, ['FAT-002', 'FAT-002', 'FAT-003', 'Water-1', 'Water-2']);
    return state;
  } });
  const host = await api.create(), guest = await api.join(host);
  const primary = (await api.get(host)).state.players[0].hand.find(card => card.spellId === 'Fire-4');
  await api.action(host, 'selectCard', { cardId: primary.id });
  let result = await api.action(host, 'castSpell');
  assert.equal(result.data.state.fatePlayer, 1);
  const links = [
    [guest, 'FAT-002', undefined, 4],
    [host, 'FAT-001', undefined, 8],
    [guest, 'FAT-003', -2, 6],
    [host, 'FAT-001', undefined, 10],
    [guest, 'FAT-002', undefined, 6],
    [host, 'FAT-003', 2, 8],
  ];
  for (const [index, [player, spellId, direction, total]] of links.entries()) {
    const view = await api.get(player);
    assert.equal(view.state.fatePlayer, player.playerIndex, `link ${index + 1} belongs to the responding player`);
    const own = view.state.players[player.playerIndex];
    const card = own.hand.find(card => card.spellId === spellId);
    assert.ok(card);
    await api.action(player, 'selectCard', { cardId: card.id });
    result = await api.action(player, 'castFate', direction === undefined ? {} : { twistDirections: { [card.id]: direction } });
    assert.equal(result.status, 200);
    assert.equal(result.data.state.players[player.playerIndex].handCount, own.handCount - (index === 5 ? 2 : 1), 'one Fate is spent per link; final resolution also discards the pending primary');
    assert.equal(result.data.state.lastRoll.total, total);
    assert.deepEqual(result.data.state.lastRoll.dice, [4, 4]);
    assert.equal(result.data.state.players[1 - player.playerIndex].hand.length, 0, 'opposing hand remains hidden');
    if (index < 5) assert.equal(result.data.state.phase, 'fate');
  }
  assert.equal(result.data.state.phase, 'main', 'two automatic passes finish after both eligible hands are exhausted');
  assert.equal(result.data.state.players[1].hp, 95);
  assert.equal(result.data.state.primaryUsed, true);
});

test('passing does not lock out a later Fate response and two voluntary passes resolve with cards remaining', async t => {
  const api = await service(t, { createMatch: decks => {
    const state = fixtureMatch(decks);
    arrangeHand(state, 0, ['Fire-4', 'FAT-001', 'FAT-003', 'Fire-1', 'Fire-2']);
    return state;
  } });
  const host = await api.create(), guest = await api.join(host);
  const primary = (await api.get(host)).state.players[0].hand.find(card => card.spellId === 'Fire-4');
  await api.action(host, 'selectCard', { cardId: primary.id }); await api.action(host, 'castSpell');
  let result = await api.action(guest, 'skipFate'); assert.equal(result.data.state.fatePlayer, 0);
  const fortune = (await api.get(host)).state.players[0].hand.find(card => card.spellId === 'FAT-001');
  await api.action(host, 'selectCard', { cardId: fortune.id });
  result = await api.action(host, 'castFate'); assert.equal(result.data.state.fatePlayer, 1);
  const misfortune = (await api.get(guest)).state.players[1].hand.find(card => card.spellId === 'FAT-002');
  await api.action(guest, 'selectCard', { cardId: misfortune.id });
  result = await api.action(guest, 'castFate'); assert.equal(result.status, 200, 'initial pass still permits this later response');
  result = await api.action(host, 'skipFate'); assert.equal(result.data.state.phase, 'fate');
  assert.equal(result.data.state.fatePlayer, 1);
  result = await api.action(guest, 'skipFate'); assert.equal(result.data.state.phase, 'main');
  const fire = await api.get(host), water = await api.get(guest);
  assert.ok(fire.state.players[0].hand.some(card => card.spellId === 'FAT-003'));
  assert.ok(water.state.players[1].hand.some(card => card.spellId === 'FAT-003'));
  assert.equal(result.data.state.lastRoll.total, 8);
  assert.equal(result.data.state.players[1].hp, 95);
});

test('Fire-0 resolves online at zero Mana without dice or Fate, preserves Loaded and uses the primary action', async t => {
  const deck = legalDeck('fire');
  deck.entries.find(entry => entry.spellId === 'Fire-6').quantity = 1;
  deck.entries.push({ spellId: 'Fire-0', quantity: 2 });
  for (const startingEmbers of [4, 5]) {
    let samples = 0;
    const api = await service(t, { rollRandom: () => { samples += 1; return .5; }, createMatch: decks => {
      const state = fixtureMatch(decks);
      arrangeHand(state, 0, ['Fire-0', 'Fire-0', 'FAT-001', 'Fire-1', 'Fire-3']);
      state.players[0].mana = 0;
      state.players[0].element = startingEmbers;
      state.players[0].loaded = 4;
      return state;
    } });
    const host = await api.create('fire', deck), guest = await api.join(host);
    const initial = (await api.get(host)).state;
    const [primary, anotherPrimary] = initial.players[0].hand.filter(card => card.spellId === 'Fire-0');
    assert.ok(initial.players[0].hand.some(card => card.spellId === 'FAT-001'));
    const defending = (await api.get(guest)).state;
    assert.ok(defending.players[1].hand.some(card => card.spellId === 'FAT-002'));
    assert.equal((await api.action(guest, 'castSpell')).status, 403);
    assert.equal((await api.action(host, 'selectCard', { cardId: primary.id })).status, 200);
    const result = await api.action(host, 'castSpell'); assert.equal(result.status, 200);
    const state = result.data.state;
    assert.deepEqual([state.phase, state.primaryUsed, state.players[0].mana, state.players[0].element, state.players[0].loaded], ['main', true, 0, 5, 4]);
    assert.equal(state.lastRoll, null); assert.equal(state.pendingSpell, null); assert.equal(state.fatePlayer, null);
    assert.equal(samples, 0, 'an immediate spell never samples server dice, even with Fate in both hands');
    assert.equal(state.players[0].hand.length, 4);
    assert.deepEqual(state.players[0].discard.map(card => card.id), [primary.id]);
    assert.ok(state.players[0].hand.some(card => card.spellId === 'FAT-001'));
    const visible = (await api.get(guest)).state;
    assert.equal(visible.players[0].element, 5); assert.equal(visible.players[0].hand.length, 0);
    assert.equal(visible.players[0].handCount, 4);
    assert.deepEqual(visible.players[1].hand.map(card => card.id), defending.players[1].hand.map(card => card.id), 'the defender spends no Fate');
    assert.equal((await api.action(guest, 'skipFate')).status, 403, 'an immediate spell opens no opponent response');
    assert.equal((await api.action(host, 'selectCard', { cardId: anotherPrimary.id })).status, 200);
    assert.equal((await api.action(host, 'castSpell')).status, 422, 'a second zero-Mana primary is still unavailable');
    assert.equal((await api.action(host, 'enhance')).status, 422, 'the primary action also excludes Enhancement');
    assert.equal((await api.action(host, 'aura')).status, 422, 'the primary action also excludes Aura');
    assert.equal(samples, 0);
  }
});

test('Fire-15 gains independently capped Ember and Mana online without rolls, Fate or duplicate rewards', async t => {
  const deck = legalDeck('fire');
  deck.entries.find(entry => entry.spellId === 'Fire-6').quantity = 1;
  deck.entries.push({ spellId: 'Fire-15', quantity: 2 });
  for (const [mana, embers, expectedMana, expectedEmbers] of [[0, 4, 1, 5], [9, 4, 10, 5], [10, 4, 10, 5], [0, 5, 1, 5], [10, 5, 10, 5]]) {
    let samples = 0;
    const api = await service(t, { rollRandom: () => { samples += 1; return .5; }, createMatch: decks => {
      const state = fixtureMatch(decks);
      arrangeHand(state, 0, ['Fire-15', 'Fire-15', 'FAT-001', 'Fire-1', 'Fire-3']);
      Object.assign(state.players[0], { mana, element: embers, loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
      return state;
    } });
    const host = await api.create('fire', deck), guest = await api.join(host);
    const [primary, anotherPrimary] = (await api.get(host)).state.players[0].hand.filter(card => card.spellId === 'Fire-15');
    assert.deepEqual([primary.manaCost, primary.effectText], [0, 'Gain 1 Ember and 1 Mana.']);
    const defending = (await api.get(guest)).state;
    assert.ok(defending.players[1].hand.some(card => card.spellId === 'FAT-002'));
    assert.equal((await api.action(guest, 'castSpell')).status, 403);
    await api.action(host, 'selectCard', { cardId: primary.id });
    const selected = await api.get(host);
    assert.equal((await api.action(host, 'castSpell', { emberSpend: 1 })).status, 422, 'this spell never spends Embers');
    assert.deepEqual(await api.get(host), selected, 'an invalid spend changes no card, resource or revision');
    const request = { type: 'castSpell', payload: {}, revision: selected.revision, requestId: 'fire-fifteen-once' };
    const send = () => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body: request });
    const result = await send(); assert.equal(result.status, 200);
    const state = result.data.state;
    assert.deepEqual([state.phase, state.primaryUsed, state.primaryAction, state.players[0].mana, state.players[0].element], ['main', true, 'spell', expectedMana, expectedEmbers]);
    assert.deepEqual([state.players[0].loaded, state.players[0].loadedPending, state.players[0].enhancement, state.players[0].auraTurns], [4, 2, 20, 2]);
    assert.deepEqual(state.players.map(player => [player.hp, player.shield]), [[100, 0], [100, 0]], 'a resource spell deals no damage');
    assert.equal(state.lastRoll, null); assert.equal(state.pendingSpell, null); assert.equal(state.fatePlayer, null);
    assert.deepEqual(state.players[0].discard.map(card => card.id), [primary.id]);
    assert.equal(state.players[0].hand.length, 4);
    assert.ok(state.players[0].hand.some(card => card.spellId === 'FAT-001'));
    const duplicate = await send(); assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.revision, result.data.revision);
    assert.deepEqual([duplicate.data.state.players[0].mana, duplicate.data.state.players[0].element], [expectedMana, expectedEmbers], 'retry never grants resources twice');
    const visible = (await api.get(guest)).state;
    assert.deepEqual([visible.players[0].mana, visible.players[0].element, visible.players[0].hand, visible.players[0].handCount], [expectedMana, expectedEmbers, [], 4]);
    assert.deepEqual(visible.players[1].hand, defending.players[1].hand, 'Fate is skipped even when the defender can respond');
    assert.equal((await api.action(guest, 'skipFate')).status, 403);
    await api.action(host, 'selectCard', { cardId: anotherPrimary.id });
    assert.equal((await api.action(host, 'castSpell')).status, 422, 'the zero-Mana resource slab consumes the normal primary action');
    assert.equal((await api.action(host, 'enhance')).status, 422);
    assert.equal(samples, 0, 'Fire-15 never asks the server for a die roll');
  }
});

test('Water-0 gains capped Mana and passive Flow online without dice, Fate or duplicate rewards', async t => {
  const deck = legalDeck('water');
  deck.entries.find(entry => entry.spellId === 'Water-6').quantity = 1;
  deck.entries.push({ spellId: 'Water-0', quantity: 2 });
  for (const [mana, flow, expectedMana, expectedFlow] of [[0, 0, 1, 1], [9, 4, 10, 5], [10, 4, 10, 5], [0, 5, 1, 5], [10, 5, 10, 5]]) {
    let samples = 0;
    const api = await service(t, { rollRandom: () => { samples += 1; return .5; }, createMatch: decks => {
      let state = createGame(24, decks);
      state = rollInitiative(rollInitiative(state, 0, () => 0), 1, () => .99);
      arrangeHand(state, 0, ['FAT-002', 'Fire-1', 'Fire-2', 'Fire-3', 'Fire-4']);
      arrangeHand(state, 1, ['Water-0', 'Water-0', 'FAT-001', 'Water-1', 'Water-3']);
      Object.assign(state.players[1], { mana, element: flow, loaded: 4, loadedPending: 2, enhancement: 20, auraTurns: 2 });
      return state;
    } });
    const host = await api.create('water', deck), guest = await api.join(host);
    const initial = (await api.get(host)).state;
    const [primary, second] = initial.players[1].hand.filter(card => card.spellId === 'Water-0');
    assert.deepEqual([primary.name, primary.type, primary.manaCost, primary.effectText], ['Water-0', 'Water', 0, 'Gain 1 Mana.']);
    assert.ok(initial.players[1].hand.some(card => card.spellId === 'FAT-001'));
    const defending = (await api.get(guest)).state;
    assert.ok(defending.players[0].hand.some(card => card.spellId === 'FAT-002'));
    assert.equal((await api.action(guest, 'castSpell')).status, 403);
    await api.action(host, 'selectCard', { cardId: primary.id });
    const selected = await api.get(host);
    assert.equal((await api.action(host, 'castSpell', { emberSpend: 1 })).status, 422);
    assert.deepEqual(await api.get(host), selected, 'Water-0 cannot spend either elemental resource');
    const request = { type: 'castSpell', payload: {}, revision: selected.revision, requestId: 'water-zero-once' };
    const send = () => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body: request });
    const result = await send(); assert.equal(result.status, 200);
    const state = result.data.state;
    assert.deepEqual([state.phase, state.primaryUsed, state.primaryAction, state.players[1].mana, state.players[1].element], ['main', true, 'spell', expectedMana, expectedFlow]);
    assert.deepEqual([state.lastRoll, state.pendingSpell, state.fatePlayer], [null, null, null]);
    assert.deepEqual([state.players[1].loaded, state.players[1].loadedPending, state.players[1].enhancement, state.players[1].auraTurns], [4, 2, 20, 2]);
    assert.deepEqual(state.players.map(player => [player.hp, player.shield]), [[100, 0], [100, 0]]);
    assert.deepEqual(state.players[1].discard.map(card => card.id), [primary.id]);
    assert.equal(state.players[1].hand.length, 4);
    const retry = await send(); assert.equal(retry.status, 200); assert.deepEqual(retry.data, result.data);
    const visible = (await api.get(guest)).state;
    assert.deepEqual([visible.players[1].mana, visible.players[1].element, visible.players[1].hand, visible.players[1].handCount], [expectedMana, expectedFlow, [], 4]);
    assert.deepEqual(visible.players[0].hand, defending.players[0].hand, 'the opponent spends no Fate');
    assert.equal((await api.action(guest, 'skipFate')).status, 403);
    await api.action(host, 'selectCard', { cardId: second.id });
    assert.equal((await api.action(host, 'castSpell')).status, 422);
    assert.equal((await api.action(host, 'enhance')).status, 422);
    assert.equal((await api.action(host, 'aura')).status, 422);
    assert.equal(samples, 0, 'an immediate Water slab never samples server dice');
  }
});

test('Aura is a fixed server-authorized primary action with private hands, public duration and safe retries', async t => {
  let samples = 0;
  const api = await service(t, { rollRandom: () => { samples += 1; return .5; }, createMatch: decks => {
    const state = fixtureMatch(decks);
    state.players[0].mana = 1;
    state.players[0].loaded = 4;
    state.players[0].enhancement = 20;
    return state;
  } });
  const host = await api.create(), guest = await api.join(host);
  const before = await api.get(host);
  const primary = before.state.players[0].hand.find(card => card.spellId === 'Fire-4');
  assert.equal((await api.action(guest, 'aura')).status, 403);
  assert.equal((await api.action(host, 'aura', { auraTurns: 99 })).status, 400);
  assert.equal((await api.action(host, 'aura', { manaCost: 0 })).status, 400);
  assert.equal((await api.action(host, 'aura', { damageBonus: 100 })).status, 400);
  const request = { type: 'aura', payload: {}, revision: before.revision, requestId: 'aura-once' };
  const send = () => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body: request });
  const result = await send(); assert.equal(result.status, 200);
  const state = result.data.state;
  assert.deepEqual([state.phase, state.primaryUsed, state.primaryAction, state.players[0].mana, state.players[0].auraTurns], ['main', true, 'aura', 0, 3]);
  assert.deepEqual([state.players[0].loaded, state.players[0].enhancement, state.players[0].element], [4, 20, 0]);
  assert.deepEqual(state.players[0].hand, before.state.players[0].hand);
  assert.deepEqual(state.players[0].discard, []);
  assert.equal(state.pendingSpell, null); assert.equal(state.lastRoll, null); assert.equal(state.fatePlayer, null);
  const duplicate = await send(); assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.revision, result.data.revision);
  assert.equal(duplicate.data.state.players[0].mana, 0, 'retry charges Aura once');
  assert.equal(samples, 0, 'Aura never samples dice or opens Fate');
  assert.equal((await api.action(host, 'aura')).status, 422);
  assert.equal((await api.action(host, 'enhance')).status, 422);
  await api.action(host, 'selectCard', { cardId: primary.id });
  assert.equal((await api.action(host, 'castSpell')).status, 422);
  const visible = (await api.get(guest)).state;
  assert.deepEqual([visible.players[0].auraTurns, visible.players[0].enhancement, visible.players[0].handCount, visible.players[0].hand], [3, 20, 5, []]);
  assert.equal(visible.players[1].hand.length, 5);
});

test('Aura requires one Mana and lasts three subsequent owner turns after activation, including refresh paths', async t => {
  let samples = 0;
  const emptyApi = await service(t, { createMatch: decks => {
    const state = fixtureMatch(decks); state.players[0].mana = 0; return state;
  } });
  const emptyHost = await emptyApi.create(); await emptyApi.join(emptyHost);
  const unaffordableBefore = await emptyApi.get(emptyHost);
  assert.equal((await emptyApi.action(emptyHost, 'aura')).status, 422);
  assert.deepEqual(await emptyApi.get(emptyHost), unaffordableBefore, 'unaffordable Aura changes no state or revision');
  const api = await service(t, { rollRandom: () => { samples += 1; return .5; } });
  const host = await api.create(), guest = await api.join(host);
  assert.equal((await api.action(host, 'aura')).status, 200);
  let result = await api.action(host, 'endTurn');
  assert.equal(result.data.state.players[0].auraTurns, 3, 'opening refresh controls does not spend a duration turn');
  result = await api.action(host, 'beginRefresh'); assert.equal(result.data.state.players[0].auraTurns, 3);
  result = await api.action(host, 'confirmRefresh');
  assert.deepEqual([result.data.state.activePlayer, result.data.state.players[0].auraTurns], [1, 3], 'activation pass does not count');
  assert.equal((await api.action(guest, 'aura')).status, 200, 'both seats can activate their own Aura');
  await api.action(guest, 'endTurn'); result = await api.action(guest, 'endTurn');
  assert.deepEqual(result.data.state.players.map(player => player.auraTurns), [3, 3], 'neither activation turn consumes its duration');
  const active = await api.get(host);
  assert.equal((await api.action(host, 'aura')).status, 422, 'an active Aura cannot refresh or stack');
  const rejected = await api.get(host);
  assert.deepEqual([rejected.revision, rejected.state.players[0].mana, rejected.state.primaryUsed], [active.revision, active.state.players[0].mana, false]);
  for (const remaining of [3, 2, 1]) {
    await api.action(host, 'endTurn'); result = await api.action(host, 'endTurn');
    assert.deepEqual(result.data.state.players.map(player => player.auraTurns), [remaining - 1, remaining]);
    await api.action(guest, 'endTurn'); await api.action(guest, 'beginRefresh');
    result = await api.action(guest, 'confirmRefresh');
    assert.deepEqual(result.data.state.players.map(player => player.auraTurns), [remaining - 1, remaining - 1]);
    assert.deepEqual((await api.get(host)).state.players.map(player => player.auraTurns), [remaining - 1, remaining - 1], 'both private screens agree');
  }
  const manaBefore = result.data.state.players[0].mana;
  result = await api.action(host, 'aura'); assert.equal(result.status, 200, 'expired Aura can be activated on a later owner turn');
  assert.deepEqual([result.data.state.players[0].auraTurns, result.data.state.players[0].mana], [3, manaBefore - 1]);
  assert.equal(samples, 0);
});

test('Enhancement rolls are server-controlled at six, consume one primary action and cannot duplicate on retry', async t => {
  let samples = 0;
  const api = await service(t, { rollRandom: () => { samples += 1; return 2.5 / 6; }, createMatch: decks => {
    const state = fixtureWithoutFate(decks); state.players[0].loaded = 4; return state;
  } });
  const host = await api.create(), guest = await api.join(host);
  assert.equal((await api.action(guest, 'enhance')).status, 403);
  assert.equal((await api.action(host, 'enhance', { dice: [6, 6] })).status, 400);
  assert.equal((await api.action(host, 'enhance', { enhancement: 30 })).status, 400);
  assert.equal(samples, 0);
  const before = await api.get(host);
  const request = { type: 'enhance', payload: {}, revision: before.revision, requestId: 'enhance-once' };
  const send = () => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body: request });
  const result = await send(); assert.equal(result.status, 200);
  const state = result.data.state;
  assert.deepEqual([state.phase, state.primaryUsed, state.players[0].enhancement, state.players[0].mana, state.players[0].loaded, state.players[0].element], ['main', true, 10, 3, 4, 0]);
  assert.deepEqual(state.lastRoll.dice, [3, 3]); assert.equal(state.lastRoll.kind, 'enhancement');
  assert.equal(state.lastRoll.total, 6); assert.equal(state.lastRoll.loadedBonus, 0);
  assert.equal(state.lastRoll.success, true); assert.equal(state.pendingSpell, null);
  assert.equal(state.players[0].handCount, 5);
  const duplicate = await send(); assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.revision, result.data.revision); assert.equal(samples, 2, 'the retry does not roll again');
  assert.equal((await api.action(host, 'enhance')).status, 422, 'a second attempt is unavailable this turn');
  assert.equal((await api.action(host, 'aura')).status, 422, 'Enhancement also excludes Aura this turn');
  const primary = state.players[0].hand.find(card => card.spellId === 'Fire-1');
  await api.action(host, 'selectCard', { cardId: primary.id });
  assert.equal((await api.action(host, 'castSpell')).status, 422, 'Enhancement replaces the primary spell');
  const visible = await api.get(guest);
  assert.equal(visible.state.players[0].enhancement, 10); assert.equal(visible.state.players[0].hand.length, 0);
  await api.action(host, 'endTurn'); await api.action(host, 'endTurn');
  const next = await api.get(guest);
  assert.equal(next.state.players[0].enhancement, 10, 'the earned bonus persists after passing');
  assert.equal(next.state.players[0].loaded, 0, 'normal end-of-turn Loaded expiry is unchanged');
});

test('failed Enhancement still spends the turn action and the thirty-percent cap rejects further attempts', async t => {
  const values = [1.5 / 6, 2.5 / 6];
  const api = await service(t, { rollRandom: () => values.shift(), createMatch: fixtureWithoutFate });
  const host = await api.create(), guest = await api.join(host);
  let result = await api.action(host, 'enhance'); assert.equal(result.status, 200);
  assert.deepEqual(result.data.state.lastRoll.dice, [2, 3]); assert.equal(result.data.state.lastRoll.success, false);
  assert.deepEqual([result.data.state.players[0].enhancement, result.data.state.primaryUsed, result.data.state.players[0].mana], [0, true, 3]);
  assert.equal((await api.action(host, 'enhance')).status, 422);
  const capApi = await service(t, { rollRandom: () => 2.5 / 6, createMatch: decks => {
    const state = fixtureWithoutFate(decks); state.players[0].enhancement = 20; return state;
  } });
  const capHost = await capApi.create(), capGuest = await capApi.join(capHost);
  result = await capApi.action(capHost, 'enhance'); assert.equal(result.status, 200);
  assert.equal(result.data.state.players[0].enhancement, 30);
  await capApi.action(capHost, 'endTurn'); await capApi.action(capHost, 'endTurn');
  await capApi.action(capGuest, 'endTurn'); await capApi.action(capGuest, 'endTurn');
  result = await capApi.action(capHost, 'enhance'); assert.equal(result.status, 422);
  const capped = (await capApi.get(capHost)).state;
  assert.equal(capped.players[0].enhancement, 30); assert.equal(capped.primaryUsed, false, 'being capped does not spend a new turn action');
  assert.equal(capped.players[0].mana, 5);
});

test('Enhancement waits for the full server-controlled Fate chain and awards its final tier only once', async t => {
  const values = [1.5 / 6, 2.5 / 6];
  let samples = 0;
  const api = await service(t, { rollRandom: () => { samples += 1; return values.shift(); }, createMatch: decks => {
    const state = fixtureMatch(decks);
    arrangeHand(state, 0, ['FAT-001', 'FAT-001', 'FAT-003', 'Fire-1', 'Fire-2']);
    arrangeHand(state, 1, ['FAT-002', 'FAT-002', 'FAT-003', 'Water-1', 'Water-2']);
    Object.assign(state.players[0], { loaded: 4, loadedPending: 2 });
    return state;
  } });
  const host = await api.create(), guest = await api.join(host), before = await api.get(host);
  const startRequest = { type: 'enhance', payload: {}, revision: before.revision, requestId: 'enhancement-chain-start' };
  const sendStart = () => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body: startRequest });
  let result = await sendStart();
  assert.equal(result.status, 200);
  let state = result.data.state;
  assert.deepEqual([state.phase, state.fatePlayer, state.pendingSpell.kind, state.pendingCardId], ['fate', 1, 'enhancement', null]);
  assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.total, state.lastRoll.resolved, state.players[0].enhancement], [5, 5, false, 0]);
  assert.equal(state.lastRoll.enhancementAfter, null, 'no provisional tier is awarded');
  assert.equal((await sendStart()).status, 200); assert.equal(samples, 2, 'retrying activation cannot roll again');
  assert.equal((await api.action(host, 'skipFate')).status, 403, 'the defender responds first');
  await api.action(guest, 'skipFate');
  const links = [
    [host, 'FAT-001', null, 9],
    [guest, 'FAT-002', null, 5],
    [host, 'FAT-003', 2, 7],
    [guest, 'FAT-003', -2, 5],
    [host, 'FAT-001', null, 9],
  ];
  for (const [player, spellId, direction, total] of links) {
    const view = (await api.get(player)).state;
    assert.equal(view.fatePlayer, player.playerIndex);
    const card = view.players[player.playerIndex].hand.find(entry => entry.spellId === spellId);
    assert.ok(card);
    assert.equal((await api.action(player, 'selectCard', { cardId: card.id })).status, 200);
    result = await api.action(player, 'castFate', direction === null ? {} : { twistDirections: { [card.id]: direction } });
    assert.equal(result.status, 200);
    state = result.data.state;
    assert.deepEqual([state.lastRoll.rawTotal, state.lastRoll.total, state.lastRoll.resolved, state.players[0].enhancement], [5, total, false, 0]);
    assert.equal(state.pendingSpell.fatePasses, 0, 'every played card resets the pass count');
    assert.equal(samples, 2, 'Fate modifies the original dice rather than rerolling');
  }
  const finalView = await api.get(guest);
  const finalRequest = { type: 'skipFate', payload: {}, revision: finalView.revision, requestId: 'enhancement-final-pass' };
  const sendFinal = () => api.request(`/api/rooms/${guest.code}/actions`, { method: 'POST', token: guest.token, body: finalRequest });
  result = await sendFinal(); assert.equal(result.status, 200);
  state = result.data.state;
  assert.deepEqual([state.phase, state.pendingSpell, state.lastRoll.resolved, state.lastRoll.total], ['main', null, true, 9]);
  assert.deepEqual([state.lastRoll.enhancementBonus, state.lastRoll.enhancementGain, state.players[0].enhancement], [20, 20, 20]);
  assert.deepEqual([state.players[0].mana, state.players[0].loaded, state.players[0].loadedPending], [3, 4, 2]);
  assert.deepEqual(state.players.map(player => [player.handCount, player.discard.length]), [[2, 3], [3, 2]], 'only the five Fate slabs were spent');
  assert.equal(state.players[0].hand.length, 0, 'opponent hand remains private after the award');
  const retry = await sendFinal(); assert.equal(retry.status, 200); assert.deepEqual(retry.data, result.data);
  const lateStart = await sendStart(); assert.equal(lateStart.status, 200);
  assert.equal(lateStart.data.state.players[0].enhancement, 20); assert.equal(samples, 2);
  assert.equal((await api.action(host, 'enhance')).status, 422, 'the turn action remains spent');
  assert.equal((await api.get(host)).state.players[0].enhancement, 20, 'polls and retries never re-award');
});

test('defending Fate can downgrade Enhancement to a lower tier or a miss', async t => {
  for (const [dice, bank, finalTotal, bonus] of [[[6, 6], 20, 8, 10], [[3, 3], 0, 2, 0]]) {
    const values = dice.map(die => (die - .5) / 6);
    const api = await service(t, { rollRandom: () => values.shift(), createMatch: decks => {
      const state = fixtureMatch(decks); state.players[0].enhancement = bank; return state;
    } });
    const host = await api.create(), guest = await api.join(host);
    const start = await api.action(host, 'enhance');
    assert.equal(start.status, 200);
    assert.deepEqual([start.data.state.phase, start.data.state.players[0].enhancement], ['fate', bank]);
    const card = (await api.get(guest)).state.players[1].hand.find(entry => entry.spellId === 'FAT-002');
    await api.action(guest, 'selectCard', { cardId: card.id });
    await api.action(guest, 'castFate');
    await api.action(host, 'skipFate');
    const result = await api.action(guest, 'skipFate');
    assert.equal(result.status, 200);
    assert.deepEqual([result.data.state.lastRoll.total, result.data.state.lastRoll.enhancementBonus, result.data.state.lastRoll.success], [finalTotal, bonus, bonus > 0]);
    assert.equal(result.data.state.players[0].enhancement, Math.min(30, bank + bonus));
    assert.equal(result.data.state.primaryUsed, true);
    assert.equal(result.data.state.lastRoll.resolved, true);
  }
});

test('the server spends damage Enhancement at resolution with one rounding step before Shield', async t => {
  const api = await service(t, { createMatch: decks => {
    const state = fixtureMatch(decks);
    arrangeHand(state, 0, ['Fire-4', 'Fire-1', 'Fire-2', 'Fire-3', 'Fire-5']);
    arrangeHand(state, 1, ['Water-1', 'Water-2', 'Water-3', 'Water-4', 'Water-5']);
    state.players[0].enhancement = 10;
    state.players[1].shield = 2;
    return state;
  } });
  const host = await api.create(), guest = await api.join(host);
  const primary = (await api.get(host)).state.players[0].hand.find(card => card.spellId === 'Fire-4');
  await api.action(host, 'selectCard', { cardId: primary.id });
  const result = await api.action(host, 'castSpell'); assert.equal(result.status, 200);
  const state = result.data.state;
  assert.equal(state.phase, 'main', 'empty Fate windows resolve automatically');
  assert.deepEqual([state.players[1].shield, state.players[1].hp], [0, 96], '5 base × 110% rounds to 6; two Shield absorbs two, leaving four HP damage');
  assert.equal(state.players[0].enhancement, 0, 'the damaging spell consumes the stored bonus');
  assert.equal(state.players[0].mana, 1);
  assert.ok(state.log.some(entry => entry.type === 'damage' && /10%/.test(entry.message)), 'the public log explains the damage percentage calculation');
  const other = await api.get(guest);
  assert.equal(other.state.players[1].hp, 96);
  assert.equal(other.state.players[0].hand.length, 0);
});

test('Enhancement waits for Fate resolution, adds to Aura and is consumed even when Shield absorbs all damage', async t => {
  const api = await service(t, { createMatch: decks => {
    const state = fixtureMatch(decks);
    state.players[0].enhancement = 20;
    state.players[0].auraTurns = 2;
    state.players[1].shield = 30;
    return state;
  } });
  const host = await api.create(), guest = await api.join(host);
  const primary = (await api.get(host)).state.players[0].hand.find(card => card.spellId === 'Fire-4');
  await api.action(host, 'selectCard', { cardId: primary.id });
  let result = await api.action(host, 'castSpell'); assert.equal(result.status, 200);
  assert.deepEqual([result.data.state.phase, result.data.state.players[0].enhancement, result.data.state.players[1].shield], ['fate', 20, 30]);
  await api.action(guest, 'skipFate');
  const fortune = (await api.get(host)).state.players[0].hand.find(card => card.spellId === 'FAT-001');
  await api.action(host, 'selectCard', { cardId: fortune.id });
  result = await api.action(host, 'castFate'); assert.equal(result.status, 200);
  assert.equal(result.data.state.players[0].enhancement, 20, 'a Fate link does not consume the pending spell bonus');
  result = await api.action(guest, 'skipFate'); assert.equal(result.status, 200);
  const state = result.data.state;
  assert.equal(state.phase, 'main');
  assert.deepEqual([state.players[1].shield, state.players[1].hp], [23, 100], '5 base × (100 + 20 Enhancement + 10 Aura)% rounds once to 7');
  assert.deepEqual([state.players[0].enhancement, state.players[0].auraTurns], [0, 2], 'damage consumes Enhancement while Aura waits for the owner turn to pass');
  const visible = (await api.get(guest)).state;
  assert.deepEqual([visible.players[0].enhancement, visible.players[0].auraTurns, visible.players[0].hand.length], [0, 2, 0]);
  assert.equal(visible.players[0].handCount, 3, 'only the primary and played Fortune left hand');
});

test('stale and repeated network requests cannot duplicate moves or apply client-supplied state', async t => {
  const api = await service(t), host = await api.create(), guest = await api.join(host);
  const initial = await api.get(host), card = initial.state.players[0].hand.find(entry => entry.spellId === 'Fire-1');
  const request = { type: 'selectCard', payload: { cardId: card.id }, revision: initial.revision, requestId: 'select-once' };
  const send = body => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body });
  const selected = await send(request); assert.equal(selected.status, 200);
  const duplicate = await send(request); assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.revision, selected.data.revision);
  assert.equal(duplicate.data.state.selectedCardId, card.id, 'retry does not toggle it off');
  const stale = await send({ ...request, requestId: 'stale-try' });
  assert.equal(stale.status, 409); assert.equal(stale.data.view.revision, selected.data.revision);
  assert.equal((await send({ ...request, revision: selected.data.revision, payload: {}, requestId: 'select-once' })).status, 409);
  const cast = { type: 'castSpell', payload: {}, revision: selected.data.revision, requestId: 'cast-once' };
  const castResult = await send(cast); assert.equal(castResult.status, 200);
  assert.equal((await send(cast)).data.revision, castResult.data.revision);
  const committed = (await api.get(host)).state;
  assert.equal(committed.players[0].discard.length, 0, 'committed primary stays in hand until post-roll Fate finishes');
  assert.equal(committed.players[0].mana, 2, 'retried cast pays exactly once');
  assert.equal(committed.pendingSpell.spellId, 'Fire-1');
  assert.equal((await api.action(guest, 'rollDice', { dice: [6, 6] })).status, 400, 'even the acting defender cannot supply dice');
  assert.equal((await send({ type: 'endTurn', payload: {}, state: { hp: 99 }, revision: castResult.data.revision, requestId: 'fake-state' })).status, 400);
});

test('custom deck legality and opposite seats are checked before creating a match', async t => {
  const api = await service(t, { createMatch: decks => createGame(32, decks) });
  const custom = legalDeck('fire');
  custom.entries.find(entry => entry.spellId === 'Fire-6').quantity -= 1;
  custom.entries.push({ spellId: 'Fire-8', quantity: 1 });
  const host = await api.create('fire', custom), guest = await api.join(host);
  assert.deepEqual((await api.get(host)).state.players[0].deckDefinition, normalizeDeck(custom));
  assert.equal((await api.get(guest)).state.players[0].deckDefinition, null);
  const bad = legalDeck('fire'); bad.entries[0].quantity = 4;
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: { name: 'Bad', element: 'fire', deck: bad } })).status, 400);
  const waterHost = await api.create('water');
  assert.deepEqual((await api.request(`/api/rooms/${waterHost.code}/info`)).data, { code: waterHost.code, status: 'waiting', joiningElement: 'fire' });
  assert.equal((await api.request(`/api/rooms/${waterHost.code}/join`, { method: 'POST', body: { name: 'Wrong', deck: legalDeck('water') } })).status, 400);
  const fireGuest = await api.join(waterHost);
  assert.deepEqual([fireGuest.playerIndex, fireGuest.element, fireGuest.state.activePlayer], [0, 'fire', 0]);
});

test('rooms accept one through thirty slabs while preserving element checks and private hands', async t => {
  const api = await service(t, { createMatch: decks => createGame(32, decks) });
  const repeated = (element, spellId, quantity = 30) => ({ element, entries: [{ spellId, quantity }] });
  const pairs = [
    ...[1, 5, 29].map(quantity => [repeated('fire', 'Fire-0', quantity), repeated('water', 'Water-1', quantity)]),
    [repeated('fire', 'Fire-0'), repeated('water', 'Water-1')],
    [repeated('fire', 'FAT-001'), repeated('water', 'FAT-002')],
    [
      { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 10 }, { spellId: 'Fire-1', quantity: 12 }, { spellId: 'FAT-003', quantity: 8 }] },
      { element: 'water', entries: [{ spellId: 'Water-2', quantity: 10 }, { spellId: 'Water-3', quantity: 16 }, { spellId: 'FAT-003', quantity: 4 }] },
    ],
  ];
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: { element: 'fire', deck: { element: 'fire', entries: [] } } })).status, 400);
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: { element: 'fire', deck: repeated('fire', 'Fire-0', 31) } })).status, 400);
  for (const [fireDeck, waterDeck] of pairs) {
    const host = await api.create('fire', fireDeck);
    assert.equal((await api.request(`/api/rooms/${host.code}/join`, { method: 'POST', body: { deck: repeated('water', 'Fire-0') } })).status, 400, 'thirty copies do not allow the other element');
    assert.equal((await api.request(`/api/rooms/${host.code}/join`, { method: 'POST', body: { deck: repeated('water', 'Water-1', 31) } })).status, 400, 'joining also enforces the thirty-slab maximum');
    const guest = await api.join(host, waterDeck);
    for (const [player, ownIndex, expected] of [[host, 0, fireDeck], [guest, 1, waterDeck]]) {
      const state = (await api.get(player)).state;
      assert.deepEqual(state.players[ownIndex].deckDefinition, normalizeDeck(expected));
      const ownTotal = expected.entries.reduce((sum, entry) => sum + entry.quantity, 0);
      const ownHand = Math.min(5, ownTotal);
      const otherTotal = [fireDeck, waterDeck][1 - ownIndex].entries.reduce((sum, entry) => sum + entry.quantity, 0);
      assert.equal(state.players[ownIndex].hand.length, ownHand);
      assert.equal(new Set(state.players[ownIndex].hand.map(card => card.id)).size, ownHand, 'repeated spells still have distinct physical slab IDs');
      assert.ok(state.players[ownIndex].hand.every(card => expected.entries.some(entry => entry.spellId === card.spellId)));
      assert.deepEqual([state.players[1 - ownIndex].hand, state.players[1 - ownIndex].handCount, state.players[1 - ownIndex].deckDefinition], [[], Math.min(5, otherTotal), null]);
      assert.deepEqual(state.players.map(entry => [entry.deck, entry.deckCount]), [fireDeck, waterDeck].map(deck => {
        const total = deck.entries.reduce((sum, entry) => sum + entry.quantity, 0);
        return [[], Math.max(0, total - 5)];
      }));
    }
  }
});

test('room expiry, capacity, CORS and bounded request bodies fail clearly', async t => {
  let clock = 100000;
  const api = await service(t, { now: () => clock, roomTtlMs: 1000, maxRooms: 1 });
  const host = await api.create();
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: { name: 'Another', element: 'fire', deck: legalDeck('fire') } })).status, 503);
  clock += 1001;
  assert.equal((await api.request(`/api/rooms/${host.code}`, { token: host.token })).status, 404);
  await api.create();
  assert.equal((await api.request('/api/health', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const preflight = await api.request('/api/rooms', { method: 'OPTIONS', headers: { Origin: 'https://carsahhex-byte.github.io' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://carsahhex-byte.github.io');
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: 'not json' })).status, 400);
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: JSON.stringify({ content: 'x'.repeat(66000) }) })).status, 413);
});

test('static hosting serves only public build files and never traverses into source or secrets', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'wizzy-room-static-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'wizzy-room-private-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'index.html'), '<h1>Wizzy</h1>');
  await writeFile(path.join(outside, 'secret.txt'), 'PRIVATE');
  await writeFile(path.join(root, '.env'), 'PRIVATE');
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'escape.txt'));
  const api = await service(t, { staticRoot: root });
  const index = await api.request('/'); assert.equal(index.status, 200); assert.equal(index.data, '<h1>Wizzy</h1>');
  assert.equal((await api.request('/.env')).status, 403);
  assert.equal((await api.request('/escape.txt')).status, 403);
  assert.notEqual((await api.request('/%2e%2e%2fsecret.txt')).status, 200);
  assert.equal((await api.request('/src/game.js')).status, 404);
});

test('server Enhancement without playable Fate uses raw tiers and retries preserve the actual capped gain', async t => {
  let bank = 0, values = [], samples = 0;
  const api = await service(t, { rollRandom: () => { samples += 1; return values.shift(); }, createMatch: decks => {
    const state = fixtureWithoutFate(decks);
    Object.assign(state.players[0], { enhancement: bank, mana: 0, loaded: 4, loadedPending: 2, element: 3, auraTurns: 2 });
    return state;
  } });
  const cases = [[0, [2, 3], 0, 0], [0, [3, 3], 10, 10], [0, [4, 4], 10, 10], [0, [3, 6], 20, 20], [0, [5, 6], 20, 20], [0, [6, 6], 30, 30], [10, [6, 6], 30, 20], [20, [3, 6], 20, 10], [20, [6, 6], 30, 10]];
  for (const [index, [starting, dice, bonus, gain]] of cases.entries()) {
    bank = starting; values = dice.map(die => (die - 1) / 6);
    const host = await api.create(), guest = await api.join(host), before = await api.get(host), priorSamples = samples;
    assert.equal((await api.action(host, 'enhance', { enhancementBonus: 30 })).status, 400, 'clients cannot choose their tier');
    const request = { type: 'enhance', payload: {}, revision: before.revision, requestId: `tier-once-${index}` };
    const send = () => api.request(`/api/rooms/${host.code}/actions`, { method: 'POST', token: host.token, body: request });
    const result = await send(); assert.equal(result.status, 200);
    const state = result.data.state;
    assert.deepEqual([state.lastRoll.enhancementRule, state.lastRoll.enhancementBonus, state.lastRoll.enhancementGain], [ENHANCEMENT_ROLL_RULE, bonus, gain]);
    assert.deepEqual([state.lastRoll.enhancementBefore, state.lastRoll.enhancementAfter, state.players[0].enhancement], [starting, starting + gain, starting + gain]);
    assert.deepEqual(state.lastRoll.dice, dice); assert.equal(state.lastRoll.rawTotal, dice[0] + dice[1]);
    assert.equal(state.lastRoll.total, state.lastRoll.rawTotal); assert.equal(state.lastRoll.success, bonus > 0);
    assert.deepEqual([state.players[0].mana, state.players[0].loaded, state.players[0].loadedPending, state.players[0].element, state.players[0].auraTurns], [0, 4, 2, 3, 2]);
    assert.deepEqual([state.primaryUsed, state.primaryAction, state.pendingSpell, state.fatePlayer], [true, 'enhancement', null, null]);
    const duplicate = await send(); assert.equal(duplicate.status, 200);
    assert.deepEqual(duplicate.data, result.data); assert.equal(samples, priorSamples + 2, 'the retry neither rolls nor awards again');
    const visible = (await api.get(guest)).state;
    assert.equal(visible.players[0].hand.length, 0); assert.equal(visible.players[0].enhancement, starting + gain);
    assert.deepEqual(visible.lastRoll, state.lastRoll);
  }
  bank = 30; values = [0, 0];
  const host = await api.create(); await api.join(host);
  const before = await api.get(host), priorSamples = samples;
  assert.equal((await api.action(host, 'enhance')).status, 422);
  assert.equal(samples, priorSamples); assert.deepEqual(await api.get(host), before, 'a full bank cannot spend the primary or roll');
});
