import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMultiplayerServer } from '../server/room-server.js';
import { normalizeDeck } from '../src/decks.js';
import { SPELLBOOK_VERSION } from '../src/spells.js';
import { DatabaseSync } from 'node:sqlite';

const legalDeck = element => ({ element, entries: [
  ...Array.from({ length: 7 }, (_, i) => ({ spellId: `${element === 'fire' ? 'Fire' : 'Water'}-${i + 1}`, quantity: 3 })),
  ...['FAT-001', 'FAT-002', 'FAT-003'].map(spellId => ({ spellId, quantity: 3 })),
] });

const profile = { name: 'Seattle Wizzy', element: 'fire' };
const decks = () => ({ fire: legalDeck('fire'), water: legalDeck('water') });
const registration = (username = 'seattle_wizzy') => ({ username, password: 'Wizzy-test-password-2026', profile: { ...profile }, decks: decks() });

async function service(t, options = {}) {
  const errors = [];
  const server = createMultiplayerServer({ rateLimit: false, onError: error => errors.push(error.message), ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const stop = async () => { if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
  t.after(async () => { await stop(); assert.deepEqual(errors, [], 'no unexpected server failures'); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (pathname, { method = 'GET', body, token, headers = {} } = {}) => {
    const response = await fetch(base + pathname, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers };
  };
  const register = async input => {
    const result = await request('/api/accounts/register', { method: 'POST', body: input || registration() });
    assert.equal(result.status, 201, result.data.error); return result.data;
  };
  const login = async (username = 'seattle_wizzy', password = 'Wizzy-test-password-2026') => {
    const result = await request('/api/accounts/login', { method: 'POST', body: { username, password } });
    assert.equal(result.status, 200, result.data.error); return result.data;
  };
  return { server, request, register, login, stop };
}

test('account registration, independent logins and logout use private bearer sessions', async t => {
  const api = await service(t), created = await api.register(registration('Seattle_Wizzy'));
  assert.equal(created.account.username, 'seattle_wizzy'); assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(created.account.profile, profile); assert.equal(created.account.revision, 0);
  assert.equal((await api.request('/api/accounts/me')).status, 401);
  assert.equal((await api.request(`/api/accounts/me?token=${created.token}`)).status, 401);
  assert.equal((await api.request('/api/accounts/register', { method: 'POST', body: registration('SEATTLE_WIZZY') })).status, 409);
  assert.equal((await api.request('/api/accounts/register', { method: 'POST', body: { ...registration('bad_user'), password: 'short' } })).status, 400);
  const wrong = await api.request('/api/accounts/login', { method: 'POST', body: { username: 'Seattle_Wizzy', password: 'wrong-password-value' } });
  const unknown = await api.request('/api/accounts/login', { method: 'POST', body: { username: 'unknown_user', password: 'wrong-password-value' } });
  assert.deepEqual([wrong.status, wrong.data], [unknown.status, unknown.data]); assert.equal(wrong.status, 401);
  const second = await api.login('SEATTLE_WIZZY');
  assert.notEqual(second.token, created.token); assert.equal(second.account.id, created.account.id);
  const own = await api.request('/api/accounts/me', { token: second.token });
  assert.deepEqual(own.data, { account: second.account });
  assert.equal(JSON.stringify(own.data).includes('password'), false); assert.equal(JSON.stringify(own.data).includes('token'), false);
  assert.equal((await api.request('/api/accounts/logout', { method: 'POST', token: created.token, body: {} })).status, 200);
  assert.equal((await api.request('/api/accounts/me', { token: created.token })).status, 401);
  assert.equal((await api.request('/api/accounts/me', { token: second.token })).status, 200, 'logging out one phone does not revoke another phone');
  const preflight = await api.request('/api/accounts/me', { method: 'OPTIONS', headers: { Origin: 'https://carsahhex-byte.github.io' } });
  assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);
});

test('saved decks synchronize across logins while stale or illegal saves cannot overwrite them', async t => {
  const api = await service(t), first = await api.register(), second = await api.login();
  const custom = decks();
  custom.fire.entries.find(entry => entry.spellId === 'Fire-6').quantity -= 1;
  custom.fire.entries.push({ spellId: 'Fire-8', quantity: 1 });
  const next = { profile: { name: 'My Saved Wizzy', element: 'water' }, decks: custom, revision: 0 };
  const saved = await api.request('/api/accounts/me', { method: 'PUT', token: first.token, body: next });
  assert.equal(saved.status, 200); assert.equal(saved.data.account.revision, 1);
  assert.deepEqual(saved.data.account.decks.fire, normalizeDeck(custom.fire));
  const read = await api.request('/api/accounts/me', { token: second.token });
  assert.deepEqual(read.data.account, saved.data.account);
  const conflict = await api.request('/api/accounts/me', { method: 'PUT', token: second.token, body: { ...next, profile } });
  assert.equal(conflict.status, 409); assert.deepEqual(conflict.data.account, saved.data.account);
  const bad = structuredClone(next); bad.revision = 1; bad.decks.fire.entries[0].quantity = 4;
  assert.equal((await api.request('/api/accounts/me', { method: 'PUT', token: first.token, body: bad })).status, 400);
  assert.deepEqual((await api.request('/api/accounts/me', { token: first.token })).data.account, saved.data.account);
  const other = await api.register(registration('another_wizzy'));
  const privateRead = await api.request(`/api/accounts/me?id=${first.account.id}`, { token: other.token });
  assert.equal(privateRead.data.account.id, other.account.id, 'a supplied account ID never changes authenticated identity');
  assert.notDeepEqual(privateRead.data.account.decks, saved.data.account.decks);
});

test('accounts allow empty slots while battle seats require at least one legal slab', async t => {
  const api = await service(t);
  const empty = { fire: { element: 'fire', entries: [] }, water: { element: 'water', entries: [] } };
  const account = await api.register({ ...registration('fresh_builder'), decks: empty });
  assert.deepEqual(account.account.decks, empty);
  assert.equal(account.account.spellbookVersion, SPELLBOOK_VERSION);
  assert.equal((await api.request('/api/rooms', { method: 'POST', token: account.token, body: { element: 'fire' } })).status, 400);
  const completed = { fire: legalDeck('fire'), water: empty.water };
  const save = await api.request('/api/accounts/me', { method: 'PUT', token: account.token,
    body: { profile, decks: completed, revision: 0, spellbookVersion: SPELLBOOK_VERSION } });
  assert.equal(save.status, 200);
  assert.deepEqual(save.data.account.decks, { fire: normalizeDeck(completed.fire), water: empty.water });
  assert.equal((await api.request('/api/rooms', { method: 'POST', token: account.token, body: { element: 'fire' } })).status, 201);
  assert.equal((await api.request('/api/rooms', { method: 'POST', token: account.token, body: { element: 'water' } })).status, 400);
  const short = { fire: { element: 'fire', entries: [{ spellId: 'Fire-1', quantity: 1 }] }, water: empty.water };
  const shortSave = await api.request('/api/accounts/me', { method: 'PUT', token: account.token, body: { profile, decks: short, revision: 1 } });
  assert.equal(shortSave.status, 200);
  assert.deepEqual(shortSave.data.account.decks, short);
  assert.deepEqual((await api.login('fresh_builder')).account.decks, short, 'a new login sees the saved one-card deck');
  assert.equal((await api.request('/api/rooms', { method: 'POST', token: account.token, body: { element: 'fire' } })).status, 201);
  for (const quantity of [0, 31]) {
    const invalid = { fire: { element: 'fire', entries: [{ spellId: 'Fire-1', quantity }] }, water: empty.water };
    assert.equal((await api.request('/api/accounts/me', { method: 'PUT', token: account.token,
      body: { profile, decks: invalid, revision: 2 } })).status, 400);
    assert.deepEqual((await api.request('/api/accounts/me', { token: account.token })).data.account.decks, short);
  }
  assert.equal((await api.request('/api/accounts/me', { method: 'PUT', token: account.token,
    body: { profile, decks: completed, revision: 2, spellbookVersion: 'old-spellbook' } })).status, 400);
});

test('SQLite accounts, saved decks and hashed sessions survive restart and expire on schedule', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'wizzy-accounts-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const dbPath = path.join(folder, 'accounts.sqlite');
  let clock = 100000;
  const first = await service(t, { accountDbPath: dbPath, now: () => clock, accountSessionTtlMs: 1000 });
  const shortInput = registration();
  shortInput.decks = {
    fire: { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 1 }] },
    water: { element: 'water', entries: [{ spellId: 'Water-1', quantity: 29 }] },
  };
  const registered = await first.register(shortInput);
  await first.stop();
  const bytes = await readFile(dbPath);
  assert.equal(bytes.includes(Buffer.from(registration().password)), false, 'raw password is never stored');
  assert.equal(bytes.includes(Buffer.from(registered.token)), false, 'raw bearer token is never stored');
  assert.equal((await stat(dbPath)).mode & 0o777, 0o600);
  clock += 500;
  const second = await service(t, { accountDbPath: dbPath, now: () => clock, accountSessionTtlMs: 1000 });
  assert.deepEqual((await second.request('/api/accounts/me', { token: registered.token })).data.account, registered.account);
  clock += 501;
  assert.equal((await second.request('/api/accounts/me', { token: registered.token })).status, 401);
  assert.equal((await second.login()).account.id, registered.account.id);
  await second.stop();
});

test('accounts save unrestricted spell quantities across login and SQLite restart without relaxing deck legality', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'wizzy-unrestricted-decks-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const dbPath = path.join(folder, 'accounts.sqlite');
  const first = await service(t, { accountDbPath: dbPath });
  const input = registration('unrestricted_builder');
  input.decks = {
    fire: { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 30 }] },
    water: { element: 'water', entries: [{ spellId: 'Water-1', quantity: 30 }] },
  };
  const registered = await first.register(input);
  assert.deepEqual(registered.account.decks, input.decks, 'registration accepts thirty identical elemental slabs');
  const custom = {
    fire: { element: 'fire', entries: [{ spellId: 'Fire-1', quantity: 12 }, { spellId: 'Fire-2', quantity: 15 }, { spellId: 'FAT-003', quantity: 3 }] },
    water: { element: 'water', entries: [{ spellId: 'FAT-001', quantity: 30 }] },
  };
  const saved = await first.request('/api/accounts/me', { method: 'PUT', token: registered.token, body: { profile, decks: custom, revision: 0 } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.account.decks, { fire: normalizeDeck(custom.fire), water: normalizeDeck(custom.water) });
  assert.deepEqual((await first.login(input.username)).account, saved.data.account, 'a separate login retains mixed high quantities and thirty identical Fate slabs');
  for (const invalidFire of [
    { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 31 }] },
    { element: 'fire', entries: [{ spellId: 'Water-1', quantity: 30 }] },
  ]) {
    const rejected = await first.request('/api/accounts/me', { method: 'PUT', token: registered.token,
      body: { profile, decks: { ...custom, fire: invalidFire }, revision: 1 } });
    assert.equal(rejected.status, 400);
    assert.deepEqual((await first.request('/api/accounts/me', { token: registered.token })).data.account, saved.data.account, 'invalid quantities or elements cannot overwrite the saved deck');
  }
  await first.stop();
  const restarted = await service(t, { accountDbPath: dbPath });
  assert.deepEqual((await restarted.request('/api/accounts/me', { token: registered.token })).data.account, saved.data.account);
  assert.deepEqual((await restarted.login(input.username)).account, saved.data.account, 'unrestricted quantities survive persistent storage and a fresh login');
});

test('old account databases archive replaced decks without losing identities or active sessions', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'wizzy-legacy-accounts-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const dbPath = path.join(folder, 'accounts.sqlite');
  const first = await service(t, { accountDbPath: dbPath });
  const registered = await first.register();
  await first.stop();
  const oldDecks = { fire: { element: 'fire', entries: [{ spellId: 'FIR-001', quantity: 30 }] }, water: { element: 'water', entries: [{ spellId: 'WAT-001', quantity: 30 }] } };
  const db = new DatabaseSync(dbPath);
  db.exec('ALTER TABLE accounts DROP COLUMN spellbook_version;');
  db.prepare('UPDATE accounts SET decks_json = ?, revision = 7 WHERE id = ?').run(JSON.stringify(oldDecks), registered.account.id);
  db.close();
  const second = await service(t, { accountDbPath: dbPath });
  const migrated = await second.request('/api/accounts/me', { token: registered.token });
  assert.equal(migrated.status, 200);
  assert.equal(migrated.data.account.id, registered.account.id);
  assert.equal(migrated.data.account.revision, 8);
  assert.equal(migrated.data.account.spellbookVersion, SPELLBOOK_VERSION);
  assert.match(migrated.data.account.migrationMessage, /archived/);
  assert.deepEqual(migrated.data.account.decks, { fire: { element: 'fire', entries: [] }, water: { element: 'water', entries: [] } });
  assert.equal((await second.login()).account.id, registered.account.id);
  assert.equal((await second.request('/api/accounts/me', { token: registered.token })).data.account.revision, 8, 'migration only happens once');
  await second.stop();
  const saved = new DatabaseSync(dbPath);
  const archives = saved.prepare('SELECT decks_json FROM account_deck_archives WHERE account_id = ?').all(registered.account.id);
  assert.equal(archives.length, 1);
  assert.deepEqual(JSON.parse(archives[0].decks_json), oldDecks);
  saved.close();
});

test('authenticated rooms use account-owned decks and identities rather than submitted guest data', async t => {
  const api = await service(t);
  const fireInput = registration('fire_wizzy');
  fireInput.profile.name = 'Real Fire';
  fireInput.decks.fire.entries.find(entry => entry.spellId === 'Fire-6').quantity -= 1;
  fireInput.decks.fire.entries.push({ spellId: 'Fire-8', quantity: 1 });
  const fireAccount = await api.register(fireInput), waterAccount = await api.register(registration('water_wizzy'));
  const made = await api.request('/api/rooms', { method: 'POST', token: fireAccount.token, body: { element: 'fire', name: 'Forged Name', deck: legalDeck('water') } });
  assert.equal(made.status, 201); assert.equal(made.data.players[0].name, 'Real Fire');
  const joined = await api.request(`/api/rooms/${made.data.code}/join`, { method: 'POST', token: waterAccount.token, body: { name: 'Forged Guest', deck: legalDeck('fire') } });
  assert.equal(joined.status, 200); assert.equal(joined.data.players[1].name, 'Seattle Wizzy');
  const own = await api.request(`/api/rooms/${made.data.code}`, { token: made.data.token });
  assert.deepEqual(own.data.state.players[0].deckDefinition, normalizeDeck(fireInput.decks.fire));
  assert.equal(own.data.state.players[1].deckDefinition, null);
  assert.equal((await api.request(`/api/rooms/${made.data.code}`, { token: fireAccount.token })).status, 401, 'account and private room tokens are separate');
  assert.equal((await api.request('/api/accounts/me', { token: made.data.token })).status, 401);
});

test('both remote players roll server-controlled opening dice and the second starter draws once', async t => {
  const samples = [1.5 / 6, 5.5 / 6];
  const api = await service(t, { initiativeRandom: () => samples.shift() });
  const fire = await api.request('/api/rooms', { method: 'POST', body: { name: 'Fire', element: 'fire', deck: legalDeck('fire') } });
  const water = await api.request(`/api/rooms/${fire.data.code}/join`, { method: 'POST', body: { name: 'Water', deck: legalDeck('water') } });
  let serial = 0;
  const act = async (player, type, payload = {}) => {
    const current = await api.request(`/api/rooms/${player.code}`, { token: player.token });
    return api.request(`/api/rooms/${player.code}/actions`, { method: 'POST', token: player.token, body: { type, payload, revision: current.data.revision, requestId: `opening-${++serial}` } });
  };
  assert.equal(water.data.state.phase, 'initiative');
  assert.equal((await act(fire.data, 'endTurn')).status, 403);
  assert.equal((await act(fire.data, 'rollInitiative', { roll: 6 })).status, 400);
  const first = await act(fire.data, 'rollInitiative'); assert.equal(first.status, 200); assert.deepEqual(first.data.state.initiative.rolls, [2, null]);
  assert.equal((await act(fire.data, 'rollInitiative')).status, 422);
  const second = await act(water.data, 'rollInitiative'); assert.equal(second.status, 200);
  assert.deepEqual([second.data.state.startingPlayer, second.data.state.activePlayer, second.data.state.phase], [1, 1, 'main']);
  assert.deepEqual(second.data.state.initiative.rolls, [2, 6]); assert.equal(second.data.state.players[1].handCount, 5);
  await act(water.data, 'endTurn'); const passed = await act(water.data, 'endTurn');
  assert.deepEqual([passed.data.state.activePlayer, passed.data.state.round, passed.data.state.players[0].handCount, passed.data.state.players[0].mana], [0, 1, 6, 3]);
  assert.equal(passed.data.state.secondPlayerOpeningDrawPending, false);
  await act(fire.data, 'endTurn'); const back = await act(fire.data, 'endTurn');
  assert.deepEqual([back.data.state.activePlayer, back.data.state.round, back.data.state.players[1].mana], [1, 2, 5]);
});
