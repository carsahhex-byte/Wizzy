import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMultiplayerServer } from '../server/room-server.js';
import { createGame, rollInitiative } from '../src/game.js';
import { createStarterDeck, normalizeDeck } from '../src/decks.js';

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
  arrangeHand(state, 0, ['FIR-004', 'FAT-001', 'NEU-004', 'FIR-001']);
  arrangeHand(state, 1, ['FAT-002', 'FAT-003', 'NEU-002', 'WAT-001']);
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
  const create = async (element = 'fire', deck = createStarterDeck(element)) => {
    const result = await request('/api/rooms', { method: 'POST', body: { name: 'Host', element, deck } });
    assert.equal(result.status, 201); return result.data;
  };
  const join = async (host, deck = createStarterDeck(host.element === 'fire' ? 'water' : 'fire')) => {
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
  assert.deepEqual((await api.request('/api/health')).data, { ok: true, service: 'wizzy-multiplayer', storage: 'memory', accounts: { enabled: true, storage: 'memory' } });
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
    assert.equal(view.state.players[own].hand.length, 4);
    assert.equal(view.state.players[1 - own].hand.length, 0);
    assert.equal(view.state.players[1 - own].handCount, 4);
    assert.equal(view.state.players[1 - own].deckDefinition, null);
    assert.ok(view.state.players[own].deckDefinition);
    for (const player of view.state.players) assert.deepEqual([player.deck, player.deckCount], [[], 26]);
    assert.equal(view.players[0].name, 'Host'); assert.equal(view.players[1].name, 'Guest');
    assert.equal(JSON.stringify(view).includes('tokenHash'), false);
  }
  assert.deepEqual((await api.get(host)).state, fire.state, 'reconnect gets the current private view');
  assert.equal((await api.request(`/api/rooms/${host.code}/join`, { method: 'POST', body: { name: 'Third', deck: createStarterDeck('water') } })).status, 409);
});

test('server controls roles, selections, Fate, secure dice totals, one primary and refresh passing', async t => {
  const api = await service(t), host = await api.create(), guest = await api.join(host);
  let fire = await api.get(host);
  assert.equal((await api.action(guest, 'endTurn')).status, 403);
  const primary = fire.state.players[0].hand.find(card => card.spellId === 'FIR-004');
  assert.equal((await api.action(host, 'selectCard', { cardId: primary.id })).status, 200);
  const hiddenSelection = await api.get(guest); assert.equal(hiddenSelection.state.selectedCardId, null);
  let result = await api.action(host, 'castSpell'); assert.equal(result.status, 200);
  assert.deepEqual([result.data.state.phase, result.data.state.players[0].mana, result.data.state.primaryUsed], ['fate', 1, true]);
  const publicSpell = (await api.get(guest)).state.pendingSpell;
  assert.equal(publicSpell.spellId, 'FIR-004'); assert.equal(publicSpell.cardId, undefined);
  const fortune = result.data.state.players[0].hand.find(card => card.spellId === 'FAT-001');
  await api.action(host, 'selectCard', { cardId: fortune.id });
  result = await api.action(host, 'castFate'); assert.equal(result.data.state.fatePlayer, 1);
  assert.equal((await api.action(host, 'skipFate')).status, 403);
  const defending = await api.get(guest);
  for (const spellId of ['FAT-002', 'FAT-003']) {
    const card = defending.state.players[1].hand.find(entry => entry.spellId === spellId);
    assert.equal((await api.action(guest, 'selectCard', { cardId: card.id })).status, 200);
  }
  result = await api.action(guest, 'castFate');
  assert.equal(result.status, 200); assert.equal(result.data.state.phase, 'main');
  assert.deepEqual(result.data.state.lastRoll.dice, [4, 4]);
  assert.equal(result.data.state.lastRoll.total, 6, '8 dice +4 Fortune -4 Misfortune -2 Twist');
  assert.equal(result.data.state.players[1].hp, 27);
  assert.deepEqual(result.data.state.players.map(player => player.handCount), [2, 2]);
  fire = await api.get(host);
  const spark = fire.state.players[0].hand.find(card => card.spellId === 'FIR-001');
  await api.action(host, 'selectCard', { cardId: spark.id });
  assert.equal((await api.action(host, 'castSpell')).status, 422, 'a second primary is rejected');
  assert.equal((await api.action(host, 'endTurn')).data.state.phase, 'end');
  assert.equal((await api.action(host, 'beginRefresh')).data.state.phase, 'refresh');
  assert.equal((await api.action(host, 'toggleRefreshCard', { cardId: spark.id })).status, 200);
  assert.deepEqual((await api.get(guest)).state.refreshCardIds, [], 'staged discards stay private');
  result = await api.action(host, 'confirmRefresh');
  assert.deepEqual([result.data.state.activePlayer, result.data.state.primaryUsed, result.data.state.players[0].handCount], [1, false, 5]);
  const refreshedGuest = await api.get(guest);
  assert.equal(refreshedGuest.state.players[0].hand.length, 0);
  assert.equal((await api.action(guest, 'endTurn')).status, 200, 'opponent can act on their new turn');
});

test('stale and repeated network requests cannot duplicate moves or apply client-supplied state', async t => {
  const api = await service(t), host = await api.create(); await api.join(host);
  const initial = await api.get(host), card = initial.state.players[0].hand.find(entry => entry.spellId === 'FIR-001');
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
  assert.equal((await api.get(host)).state.players[0].discard.length, 1);
  assert.equal((await send({ type: 'rollDice', payload: { dice: [6, 6] }, revision: castResult.data.revision, requestId: 'fake-dice' })).status, 400);
  assert.equal((await send({ type: 'endTurn', payload: {}, state: { hp: 99 }, revision: castResult.data.revision, requestId: 'fake-state' })).status, 400);
});

test('custom deck legality and opposite seats are checked before creating a match', async t => {
  const api = await service(t, { createMatch: decks => createGame(32, decks) });
  const custom = createStarterDeck('fire');
  custom.entries.find(entry => entry.spellId === 'FIR-006').quantity -= 1;
  custom.entries.push({ spellId: 'FIR-003', quantity: 1 });
  const host = await api.create('fire', custom), guest = await api.join(host);
  assert.deepEqual((await api.get(host)).state.players[0].deckDefinition, normalizeDeck(custom));
  assert.equal((await api.get(guest)).state.players[0].deckDefinition, null);
  const bad = createStarterDeck('fire'); bad.entries[0].quantity = 4;
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: { name: 'Bad', element: 'fire', deck: bad } })).status, 400);
  const waterHost = await api.create('water');
  assert.deepEqual((await api.request(`/api/rooms/${waterHost.code}/info`)).data, { code: waterHost.code, status: 'waiting', joiningElement: 'fire' });
  assert.equal((await api.request(`/api/rooms/${waterHost.code}/join`, { method: 'POST', body: { name: 'Wrong', deck: createStarterDeck('water') } })).status, 400);
  const fireGuest = await api.join(waterHost);
  assert.deepEqual([fireGuest.playerIndex, fireGuest.element, fireGuest.state.activePlayer], [0, 'fire', 0]);
});

test('room expiry, capacity, CORS and bounded request bodies fail clearly', async t => {
  let clock = 100000;
  const api = await service(t, { now: () => clock, roomTtlMs: 1000, maxRooms: 1 });
  const host = await api.create();
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: { name: 'Another', element: 'fire', deck: createStarterDeck('fire') } })).status, 503);
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
