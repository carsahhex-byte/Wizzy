import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLBOOK_VERSION } from '../src/spells.js';
import { createStarterDeck, getEligibleSpells, normalizeDeckSlot, setDeckQuantity } from '../src/decks.js';
import { createHubStorage, HUB_SAVE_KEY, GUEST_SAVE_KEY, restoreHubDraft } from '../src/hub-storage.js';

class BrowserStorage {
  constructor(entries = []) { this.items = new Map(entries); this.blocked = new Set(); this.blockReads = false; }
  get length() { return this.items.size; }
  key(index) { return [...this.items.keys()][index] ?? null; }
  getItem(key) { if (this.blockReads) throw new Error('Storage blocked'); return this.items.get(key) ?? null; }
  setItem(key, value) { if (this.blocked.has('*') || this.blocked.has(key)) throw new Error('Storage full'); this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
}

const legal = element => normalizeDeckSlot({ element, entries: getEligibleSpells(element)
  .filter(card => card.category !== 'Fate').slice(0, 10).map(card => ({ spellId: card.spellId, quantity: 3 })) });
const alternate = element => {
  const deck = legal(element);
  return setDeckQuantity(setDeckQuantity(deck, deck.entries[0].spellId, 2), 'FAT-001', 1);
};
const snapshot = (name = 'Guest', accountId = null) => {
  const savedDecks = { fire: legal('fire'), water: legal('water') };
  return { profile: { name, element: 'fire' }, savedDecks, drafts: structuredClone(savedDecks),
    accountId, accountUsername: accountId ? name.toLowerCase() : '', cloudDecks: accountId ? structuredClone(savedDecks) : null };
};
const json = value => JSON.stringify(value);

test('guest deck saves are synchronous, mirrored and survive a new storage owner', () => {
  const disk = new BrowserStorage();
  const state = snapshot();
  state.drafts.fire = setDeckQuantity(state.drafts.fire, state.drafts.fire.entries[0].spellId, 2);
  assert.equal(createHubStorage(disk).save(state), true);
  assert.equal(disk.getItem(HUB_SAVE_KEY), disk.getItem(GUEST_SAVE_KEY));
  const restored = createHubStorage(disk).load();
  assert.deepEqual(restored.state.savedDecks, state.savedDecks);
  assert.deepEqual(restored.state.drafts, state.drafts, 'an unfinished draft does not replace a saved battle deck');
  assert.deepEqual(restored.guestSnapshot.savedDecks, state.savedDecks);
  assert.equal(restored.state.accountId, null);
  assert.equal(restored.recovered, false);
  assert.equal(JSON.parse(disk.getItem(HUB_SAVE_KEY)).version, 2);
});

test('compatible versioned saves migrate without deleting or changing original data', () => {
  for (const source of [`wizzy.hub.${SPELLBOOK_VERSION}`, 'wizzy.hub.some-previous-compatible-book', 'wizzy.hub.v1']) {
    const old = { version: 1, spellbook: 'previous-label', ...snapshot('Returning wizard') };
    const disk = new BrowserStorage([[source, json(old)]]);
    const store = createHubStorage(disk);
    const restored = store.load();
    assert.equal(restored.recovered, true);
    assert.deepEqual(restored.state.savedDecks, old.savedDecks);
    assert.equal(store.save(restored.state), true);
    assert.equal(disk.getItem(source), json(old), 'legacy source remains available for manual recovery');
    assert.equal(JSON.parse(disk.getItem(HUB_SAVE_KEY)).spellbook, SPELLBOOK_VERSION);
  }
});

test('valid guest backups recover when the main record is absent or malformed', () => {
  const state = snapshot('Backup wizard');
  for (const bad of [null, '{', '[]', json({ version: 88, ...state })]) {
    const disk = new BrowserStorage([[GUEST_SAVE_KEY, json({ version: 2, savedAt: 20, ...state })]]);
    if (bad !== null) disk.setItem(HUB_SAVE_KEY, bad);
    const restored = createHubStorage(disk).load();
    assert.deepEqual(restored.state.savedDecks, state.savedDecks);
    assert.equal(restored.state.profile.name, 'Backup wizard');
    assert.equal(restored.recovered, true);
  }
});

test('older valid slots recover independently without replacing a newer valid slot', () => {
  const old = snapshot('Old');
  const recent = snapshot('Recent');
  recent.savedDecks.water = alternate('water');
  recent.drafts.water = recent.savedDecks.water;
  recent.savedDecks.fire = { element: 'fire', entries: [{ spellId: 'not-a-spell', quantity: 30 }] };
  recent.drafts.fire = recent.savedDecks.fire;
  const disk = new BrowserStorage([[HUB_SAVE_KEY, json({ version: 2, savedAt: 30, ...recent })],
    [GUEST_SAVE_KEY, json({ version: 2, savedAt: 20, ...old })]]);
  const restored = createHubStorage(disk).load();
  assert.deepEqual(restored.state.savedDecks.fire, old.savedDecks.fire);
  assert.deepEqual(restored.state.savedDecks.water, recent.savedDecks.water);
  assert.equal(restored.state.profile.name, 'Recent');
  assert.equal(restored.recovered, true);
});

test('retired spell IDs are never remapped to current cards', () => {
  const old = snapshot('Legacy');
  old.savedDecks.fire = { element: 'fire', entries: Array.from({ length: 10 }, (_, index) => ({ spellId: `FIR-${String(index + 1).padStart(3, '0')}`, quantity: 3 })) };
  old.drafts.fire = old.savedDecks.fire;
  const source = 'wizzy.hub.old-spellbook';
  const disk = new BrowserStorage([[source, json({ version: 1, ...old })]]);
  const restored = createHubStorage(disk).load();
  assert.deepEqual(restored.state.savedDecks.fire, createStarterDeck('fire'));
  assert.deepEqual(restored.state.drafts.fire, createStarterDeck('fire'));
  assert.deepEqual(restored.state.savedDecks.water, old.savedDecks.water);
  assert.equal(disk.getItem(source), json({ version: 1, ...old }));
});

test('an intentional newer empty slot wins over an older full deck', () => {
  const old = snapshot();
  const current = snapshot();
  current.savedDecks.fire = createStarterDeck('fire');
  current.drafts.fire = createStarterDeck('fire');
  const disk = new BrowserStorage([[HUB_SAVE_KEY, json({ version: 2, savedAt: 30, ...current })],
    [GUEST_SAVE_KEY, json({ version: 2, savedAt: 20, ...old })]]);
  assert.deepEqual(createHubStorage(disk).load().state.savedDecks.fire, createStarterDeck('fire'));
});

test('guest backup still succeeds if primary writes fail, including same-millisecond saves', () => {
  const disk = new BrowserStorage();
  const store = createHubStorage(disk, { now: () => 100 });
  const first = snapshot('First');
  const second = snapshot('Second');
  second.savedDecks.fire = alternate('fire');
  second.drafts.fire = second.savedDecks.fire;
  assert.equal(store.save(first), true);
  disk.blocked.add(HUB_SAVE_KEY);
  assert.equal(store.save(second), true);
  const restored = createHubStorage(disk).load();
  assert.equal(restored.state.profile.name, 'Second');
  assert.deepEqual(restored.state.savedDecks.fire, second.savedDecks.fire);
  assert.equal(restored.recovered, true);
  assert.ok(JSON.parse(disk.getItem(GUEST_SAVE_KEY)).savedAt > JSON.parse(disk.getItem(HUB_SAVE_KEY)).savedAt);
});

test('a new tab observes a newer backup before issuing its next save', () => {
  const disk = new BrowserStorage();
  const firstTab = createHubStorage(disk, { now: () => 100 });
  const secondTab = createHubStorage(disk, { now: () => 100 });
  firstTab.save(snapshot('First'));
  secondTab.save(snapshot('Second'));
  disk.blocked.add(HUB_SAVE_KEY);
  firstTab.save(snapshot('Third'));
  assert.equal(createHubStorage(disk).load().state.profile.name, 'Third');
});

test('a blocked backup can use the primary, while two blocked writes report failure', () => {
  const disk = new BrowserStorage();
  const store = createHubStorage(disk);
  disk.blocked.add(GUEST_SAVE_KEY);
  assert.equal(store.save(snapshot()), true);
  assert.deepEqual(createHubStorage(disk).load().state.savedDecks, snapshot().savedDecks);
  disk.blocked.add(HUB_SAVE_KEY);
  assert.equal(store.save(snapshot('Unsaved')), false);
  assert.equal(store.isAvailable(), false);
  assert.equal(createHubStorage(disk).load().state.profile.name, 'Guest');
});

test('account saves and caches never replace the guest deck backup', () => {
  const disk = new BrowserStorage();
  const store = createHubStorage(disk, { now: () => 100 });
  const guest = snapshot('Guest');
  const account = snapshot('Alice', 'alice-id');
  account.savedDecks.fire = alternate('fire');
  account.drafts.fire = account.savedDecks.fire;
  store.save(guest);
  const guestText = disk.getItem(GUEST_SAVE_KEY);
  store.save(account);
  assert.equal(disk.getItem(GUEST_SAVE_KEY), guestText);
  assert.equal(store.load().state.accountId, 'alice-id');
  assert.deepEqual(store.readGuest().savedDecks, guest.savedDecks);
  assert.deepEqual(store.readAccount('alice-id').savedDecks, account.savedDecks);
  assert.equal(store.readAccount('bob-id'), null);
  store.save(guest);
  assert.equal(createHubStorage(disk).load().state.accountId, null);
});

test('newer account backup recovers after primary failure and retains the correct owner', () => {
  const disk = new BrowserStorage();
  const store = createHubStorage(disk, { now: () => 100 });
  const account = snapshot('Alice', 'alice-id');
  store.save(account);
  disk.blocked.add(HUB_SAVE_KEY);
  account.savedDecks.water = alternate('water');
  account.drafts.water = account.savedDecks.water;
  store.save(account);
  const restored = createHubStorage(disk).load();
  assert.equal(restored.state.accountId, 'alice-id');
  assert.deepEqual(restored.state.savedDecks.water, account.savedDecks.water);
  assert.equal(restored.recovered, true);
  assert.equal(restored.guestSnapshot, null);
  disk.removeItem(HUB_SAVE_KEY);
  assert.deepEqual(createHubStorage(disk).load().state.savedDecks.water, account.savedDecks.water);
});

test('ownerless legacy account caches only restore their explicitly requested account', () => {
  const cached = snapshot('Alice');
  delete cached.accountId;
  const disk = new BrowserStorage([[`wizzy.hub.account.${SPELLBOOK_VERSION}.alice-id`, json(cached)]]);
  const store = createHubStorage(disk);
  assert.equal(store.load().state, null);
  assert.equal(store.readGuest(), null);
  assert.deepEqual(store.readAccount('alice-id').savedDecks, cached.savedDecks);
  assert.equal(store.readAccount('bob-id'), null);
});

test('draft and payload validation reject malformed data without deleting raw storage', () => {
  const fallback = legal('fire');
  for (const candidate of [null, [], { element: 'water', entries: [] },
    { element: 'fire', entries: [{ spellId: 'Fire-1', quantity: 4 }] },
    { element: 'fire', entries: [{ spellId: 'Fire-1', quantity: 1 }, { spellId: 'Fire-1', quantity: 1 }] },
    { element: 'fire', entries: [{ spellId: 'FIR-001', quantity: 1 }] }]) {
    assert.deepEqual(restoreHubDraft(candidate, 'fire', fallback), fallback);
    assert.equal(restoreHubDraft(candidate, 'fire'), null);
  }
  const disk = new BrowserStorage([[HUB_SAVE_KEY, '{']]);
  const store = createHubStorage(disk);
  assert.equal(store.load().state, null);
  assert.equal(disk.getItem(HUB_SAVE_KEY), '{');
  assert.equal(store.save({ profile: { name: 'Bad', element: 'fire' }, savedDecks: { fire: fallback } }), false);
  assert.equal(disk.getItem(HUB_SAVE_KEY), '{');
  disk.blockReads = true;
  assert.equal(createHubStorage(disk).load().available, false);
});
