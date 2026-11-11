import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLBOOK_1, SPELLBOOK_2 } from '../src/spellbooks.js';
import { SPELLBOOK_VERSION } from '../src/spells.js';
import { createStarterDeck, getEligibleSpells, normalizeDeckSlot, setDeckQuantity, validateDeck } from '../src/decks.js';
import { createHubStorage, HUB_SAVE_KEY, GUEST_SAVE_KEY, GUEST_BOOK2_SAVE_KEY, GUEST_NAMED_SAVE_KEY, GUEST_EARTH_SAVE_KEY, restoreHubDraft } from '../src/hub-storage.js';

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
  const savedDecks = { fire: legal('fire'), water: legal('water'), earth: createStarterDeck('earth') };
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
    { element: 'fire', entries: [{ spellId: 'Fire-1', quantity: 31 }] },
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

test('unrestricted saved quantities and drafts survive local reload, guest backup and account cache', () => {
  const disk = new BrowserStorage(), store = createHubStorage(disk);
  const guest = snapshot('Many slabs');
  guest.savedDecks.fire = { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 30 }] };
  guest.savedDecks.water = { element: 'water', entries: [{ spellId: 'FAT-003', quantity: 30 }] };
  guest.drafts.fire = { element: 'fire', entries: [{ spellId: 'FAT-001', quantity: 4 }, { spellId: 'Fire-0', quantity: 26 }] };
  guest.drafts.water = { element: 'water', entries: [{ spellId: 'Water-1', quantity: 4 }] };
  assert.equal(store.save(guest), true);
  let restored = createHubStorage(disk).load().state;
  assert.deepEqual(restored.savedDecks, guest.savedDecks); assert.deepEqual(restored.drafts, guest.drafts);
  assert.deepEqual(restoreHubDraft(guest.drafts.water, 'water'), guest.drafts.water);
  disk.removeItem(HUB_SAVE_KEY);
  restored = createHubStorage(disk).load().state;
  assert.deepEqual(restored.savedDecks, guest.savedDecks); assert.deepEqual(restored.drafts, guest.drafts);
  const account = { ...structuredClone(guest), accountId: 'many-slabs', accountUsername: 'many_slabs', cloudDecks: structuredClone(guest.savedDecks) };
  assert.equal(store.save(account), true);
  assert.deepEqual(createHubStorage(disk).readAccount('many-slabs').savedDecks, guest.savedDecks);
  assert.deepEqual(createHubStorage(disk).readGuest().savedDecks, guest.savedDecks);
});

test('empty slots and 1–30 slab decks retain their exact counts across guest and account saves', () => {
  for (const total of [0, 1, 5, 29, 30]) {
    const disk = new BrowserStorage();
    const store = createHubStorage(disk);
    const guest = snapshot(`Deck ${total}`);
    guest.savedDecks = {
      fire: { element: 'fire', entries: total ? [{ spellId: 'Fire-0', quantity: total }] : [] },
      water: { element: 'water', entries: total ? [{ spellId: 'Water-1', quantity: total }] : [] },
      earth: createStarterDeck('earth'),
    };
    guest.drafts = structuredClone(guest.savedDecks);
    assert.equal(store.save(guest), true, `${total} slabs`);
    let restored = createHubStorage(disk).load().state;
    assert.deepEqual(restored.savedDecks, guest.savedDecks);
    assert.deepEqual(restored.drafts, guest.drafts);
    for (const element of ['fire', 'water']) {
      assert.equal(validateDeck(restored.savedDecks[element]), total > 0, 'an empty saved slot remains unready for battle');
      assert.deepEqual(restoreHubDraft(guest.drafts[element], element), guest.drafts[element]);
    }
    disk.removeItem(HUB_SAVE_KEY);
    restored = createHubStorage(disk).load().state;
    assert.deepEqual(restored.savedDecks, guest.savedDecks, 'the guest backup preserves short decks');
    const account = { ...structuredClone(guest), accountId: 'short-deck-owner', accountUsername: 'short_decks', cloudDecks: structuredClone(guest.savedDecks) };
    assert.equal(store.save(account), true);
    const cached = createHubStorage(disk).readAccount(account.accountId);
    assert.deepEqual(cached.savedDecks, account.savedDecks);
    assert.deepEqual(cached.cloudDecks, account.cloudDecks);
    assert.deepEqual(createHubStorage(disk).readGuest().savedDecks, guest.savedDecks);
  }
});

test('a 31-slab save cannot replace an existing valid deck or its guest backup', () => {
  const disk = new BrowserStorage();
  const store = createHubStorage(disk);
  const valid = snapshot('Saved deck');
  assert.equal(store.save(valid), true);
  const before = disk.getItem(HUB_SAVE_KEY);
  const backup = disk.getItem(GUEST_SAVE_KEY);
  const oversized = structuredClone(valid);
  oversized.savedDecks.fire = { element: 'fire', entries: [{ spellId: 'Fire-0', quantity: 31 }] };
  oversized.drafts.fire = structuredClone(oversized.savedDecks.fire);
  assert.equal(store.save(oversized), false);
  assert.equal(store.cacheAccount('oversized-owner', oversized), false);
  assert.equal(disk.getItem(HUB_SAVE_KEY), before);
  assert.equal(disk.getItem(GUEST_SAVE_KEY), backup);
  assert.deepEqual(createHubStorage(disk).load().state.savedDecks, valid.savedDecks);
});

test('Water-0 short decks and unrestricted drafts survive guest backups and account caches', () => {
  const disk = new BrowserStorage();
  const store = createHubStorage(disk);
  const original = snapshot('Before Water-0');
  original.savedDecks.water = { element: 'water', entries: [{ spellId: 'Water-1', quantity: 30 }] };
  original.drafts.water = structuredClone(original.savedDecks.water);
  assert.equal(store.save(original), true);
  assert.deepEqual(createHubStorage(disk).load().state.savedDecks, original.savedDecks, 'older decks retain their exact composition');
  const guest = structuredClone(original);
  guest.savedDecks.water = setDeckQuantity(createStarterDeck('water'), 'Water-0', 1);
  guest.drafts.water = setDeckQuantity(createStarterDeck('water'), 'Water-0', 30);
  assert.equal(store.save(guest), true);
  disk.removeItem(HUB_SAVE_KEY);
  const restored = createHubStorage(disk).load().state;
  assert.deepEqual(restored.savedDecks, guest.savedDecks);
  assert.deepEqual(restored.drafts, guest.drafts);
  assert.equal(validateDeck(restored.savedDecks.water), true);
  assert.deepEqual(restored.savedDecks.fire, original.savedDecks.fire, 'the Fire slot remains unchanged');
  const account = { ...structuredClone(guest), accountId: 'water-zero-owner', accountUsername: 'water_zero', cloudDecks: structuredClone(guest.savedDecks) };
  assert.equal(store.save(account), true);
  const cached = createHubStorage(disk).readAccount(account.accountId);
  assert.deepEqual(cached.savedDecks, account.savedDecks);
  assert.deepEqual(cached.drafts, account.drafts);
  assert.deepEqual(cached.cloudDecks, account.cloudDecks);
  assert.deepEqual(createHubStorage(disk).readGuest().savedDecks, guest.savedDecks);
  assert.deepEqual(original.savedDecks.water, { element: 'water', entries: [{ spellId: 'Water-1', quantity: 30 }] });
});

test('existing Fire-15 and Water-0 guest and account caches survive compatible rule changes independently', () => {
  const guest = { version: 2, spellbook: 'nov4-v2.1', savedAt: 100, ...snapshot('Resource guest') };
  guest.savedDecks = {
    fire: { element: 'fire', entries: [{ spellId: 'Fire-15', quantity: 30 }] },
    water: { element: 'water', entries: [{ spellId: 'Water-0', quantity: 1 }] },
    earth: createStarterDeck('earth'),
  };
  guest.drafts = {
    fire: { element: 'fire', entries: [{ spellId: 'Fire-15', quantity: 4 }] },
    water: { element: 'water', entries: [{ spellId: 'Water-0', quantity: 29 }] },
    earth: createStarterDeck('earth'),
  };
  const account = { ...structuredClone(guest), savedAt: 200, accountId: 'resource-owner', accountUsername: 'resource_owner' };
  account.savedDecks = {
    fire: { element: 'fire', entries: [{ spellId: 'Fire-15', quantity: 1 }] },
    water: { element: 'water', entries: [{ spellId: 'Water-0', quantity: 30 }] },
    earth: createStarterDeck('earth'),
  };
  account.drafts = structuredClone(account.savedDecks);
  account.cloudDecks = structuredClone(guest.savedDecks);
  const disk = new BrowserStorage([
    [GUEST_SAVE_KEY, json(guest)], [HUB_SAVE_KEY, json(account)],
    ['wizzy.hub.account.v2.resource-owner', json(account)],
  ]);
  const store = createHubStorage(disk);
  const restored = store.load();
  assert.equal(restored.state.accountId, account.accountId);
  assert.deepEqual(restored.state.savedDecks, account.savedDecks);
  assert.deepEqual(restored.state.drafts, account.drafts);
  assert.deepEqual(restored.state.cloudDecks, account.cloudDecks, 'an unsynced saved deck does not replace its cloud baseline');
  assert.deepEqual(restored.guestSnapshot.savedDecks, guest.savedDecks);
  assert.equal(store.save(restored.state), true);
  assert.equal(disk.getItem(GUEST_SAVE_KEY), json(guest), 'saving the account leaves the distinct guest backup intact');
  disk.removeItem(HUB_SAVE_KEY);
  const reloaded = createHubStorage(disk);
  assert.deepEqual(reloaded.readAccount(account.accountId).savedDecks, account.savedDecks);
  assert.deepEqual(reloaded.readAccount(account.accountId).drafts, account.drafts);
  assert.deepEqual(reloaded.readAccount(account.accountId).cloudDecks, account.cloudDecks);
  assert.deepEqual(reloaded.readGuest().savedDecks, guest.savedDecks);
  assert.deepEqual(reloaded.readGuest().drafts, guest.drafts);
});


const testingBook = (quantity = 3) => {
  const savedDecks = {
    fire: setDeckQuantity(createStarterDeck('fire', SPELLBOOK_2), 'Fire-11', quantity),
    water: setDeckQuantity(createStarterDeck('water', SPELLBOOK_2), 'Water-9', quantity),
    earth: createStarterDeck('earth', SPELLBOOK_2),
  };
  return { savedDecks, drafts: structuredClone(savedDecks), cloudDecks: null };
};

test('two spellbooks keep separate saved decks, unfinished drafts and selection through reload and backup recovery', () => {
  const disk = new BrowserStorage(), store = createHubStorage(disk);
  const guest = snapshot('Two books');
  const original = structuredClone(guest.savedDecks);
  guest.selectedSpellbookId = SPELLBOOK_2;
  guest.spellbook2 = testingBook(5);
  guest.spellbook2.drafts.fire = setDeckQuantity(guest.spellbook2.drafts.fire, 'Fire-15', 2);
  assert.equal(store.save(guest), true);
  for (const removePrimary of [false, true]) {
    if (removePrimary) disk.removeItem(HUB_SAVE_KEY);
    const loaded = createHubStorage(disk).load().state;
    assert.deepEqual(loaded.savedDecks, original);
    assert.deepEqual(loaded.drafts, guest.drafts);
    assert.deepEqual(loaded.spellbook2, guest.spellbook2);
    assert.equal(loaded.selectedSpellbookId, SPELLBOOK_2);
    assert.deepEqual(restoreHubDraft(loaded.spellbook2.drafts.fire, 'fire', null, SPELLBOOK_2), guest.spellbook2.drafts.fire);
  }
});

test('guest and different account owners retain independent spellbook-two decks and cloud baselines', () => {
  const disk = new BrowserStorage(), store = createHubStorage(disk);
  const guest = { ...snapshot('Guest books'), selectedSpellbookId: SPELLBOOK_2, spellbook2: testingBook(2) };
  const alice = { ...snapshot('Alice books', 'alice-books'), selectedSpellbookId: SPELLBOOK_1, spellbook2: testingBook(4) };
  alice.spellbook2.cloudDecks = testingBook(3).savedDecks;
  alice.spellbook2.drafts.water = setDeckQuantity(alice.spellbook2.drafts.water, 'Water-0', 1);
  const bob = { ...snapshot('Bob books', 'bob-books'), selectedSpellbookId: SPELLBOOK_2, spellbook2: testingBook(7) };
  bob.spellbook2.cloudDecks = structuredClone(bob.spellbook2.savedDecks);
  store.save(guest); store.save(alice); store.save(bob);
  assert.deepEqual(store.readGuest().spellbook2, guest.spellbook2);
  assert.deepEqual(store.readAccount(alice.accountId).spellbook2, alice.spellbook2);
  assert.deepEqual(store.readAccount(bob.accountId).spellbook2, bob.spellbook2);
  assert.equal(store.readAccount('other-account'), null);
  assert.equal(store.load().state.accountId, bob.accountId);
  store.save(store.readGuest());
  const signedOut = createHubStorage(disk).load().state;
  assert.equal(signedOut.accountId, null);
  assert.deepEqual(signedOut.savedDecks, guest.savedDecks);
  assert.deepEqual(signedOut.spellbook2, guest.spellbook2);
  assert.equal(signedOut.selectedSpellbookId, SPELLBOOK_2);
});

test('legacy originals remain archived while active drafts require review; invalid saves cannot overwrite valid decks', () => {
  const disk = new BrowserStorage(), store = createHubStorage(disk);
  const legacy = snapshot('Original collection');
  store.save(legacy);
  const restored = store.load().state;
  assert.deepEqual(restored.savedDecks, legacy.savedDecks);
  assert.equal(restored.selectedSpellbookId, SPELLBOOK_2);
  assert.deepEqual(restored.spellbook2.savedDecks.fire.entries, []);
  assert.match(restored.activeMigrationNotice, /Review/);
  const both = { ...legacy, selectedSpellbookId: SPELLBOOK_2, spellbook2: testingBook() };
  assert.equal(store.save(both), true);
  const before = disk.getItem(HUB_SAVE_KEY);
  for (const change of [
    state => { state.spellbook2.savedDecks.fire.entries = [{ spellId: 'Fire-1', quantity: 1 }]; },
    state => { delete state.spellbook2.savedDecks.fire.spellbookId; },
    state => { state.savedDecks.fire = structuredClone(state.spellbook2.savedDecks.fire); },
  ]) {
    const invalid = structuredClone(both); change(invalid);
    assert.equal(store.save(invalid), false);
    assert.equal(disk.getItem(HUB_SAVE_KEY), before);
  }
});


test('testing-only backups survive cached legacy rewrites without replacing newer original decks or another owner', () => {
  const disk = new BrowserStorage(), store = createHubStorage(disk, { now: () => 100 });
  const guest = { ...snapshot('Both books'), selectedSpellbookId: SPELLBOOK_2, spellbook2: testingBook(6) };
  guest.spellbook2.drafts.water = setDeckQuantity(guest.spellbook2.drafts.water, 'Water-0', 3);
  assert.equal(store.save(guest), true);
  const archive = JSON.parse(disk.getItem(GUEST_BOOK2_SAVE_KEY));
  assert.equal(archive.savedDecks, undefined, 'the supplementary record never carries an old original-book deck');
  assert.equal(archive.profile, undefined);
  const legacyRewrite = { version: 2, savedAt: 900, ...snapshot('Later guest edits') };
  legacyRewrite.savedDecks.fire = alternate('fire'); legacyRewrite.drafts.fire = structuredClone(legacyRewrite.savedDecks.fire);
  disk.setItem(HUB_SAVE_KEY, json(legacyRewrite)); disk.setItem(GUEST_SAVE_KEY, json(legacyRewrite));
  const recovered = createHubStorage(disk).load().state;
  assert.deepEqual(recovered.savedDecks, legacyRewrite.savedDecks);
  assert.deepEqual(recovered.drafts, legacyRewrite.drafts);
  assert.equal(recovered.profile.name, legacyRewrite.profile.name);
  assert.deepEqual(recovered.spellbook2, guest.spellbook2);
  assert.equal(recovered.selectedSpellbookId, SPELLBOOK_2);
  const alice = { ...snapshot('Alice', 'alice-archive'), selectedSpellbookId: SPELLBOOK_2, spellbook2: testingBook(9) };
  alice.spellbook2.cloudDecks = testingBook(7).savedDecks;
  assert.equal(store.save(alice), true);
  const oldAccount = { version: 2, savedAt: 1000, ...snapshot('Alice legacy edit', alice.accountId) };
  oldAccount.savedDecks.water = alternate('water'); oldAccount.drafts.water = structuredClone(oldAccount.savedDecks.water);
  disk.setItem(HUB_SAVE_KEY, json(oldAccount)); disk.setItem(`wizzy.hub.account.v2.${alice.accountId}`, json(oldAccount));
  const account = createHubStorage(disk).load().state;
  assert.equal(account.accountId, alice.accountId);
  assert.deepEqual(account.savedDecks, oldAccount.savedDecks);
  assert.deepEqual(account.spellbook2, alice.spellbook2);
  assert.deepEqual(store.readGuest().spellbook2, guest.spellbook2);
  assert.equal(store.readAccount('different-owner'), null);
  store.save(store.readGuest());
  assert.equal(createHubStorage(disk).load().state.accountId, null, 'a newer account-only backup never chooses the active owner');
});


test('named collection restores Fire-5 as Charred Blade without losing original deck backups', () => {
  const original = snapshot('Before naming');
  original.spellbook2 = { savedDecks: {
    fire: { element: 'fire', spellbookId: SPELLBOOK_2, entries: [{ spellId: 'Fire-5', quantity: 3 }, { spellId: 'FAT-001', quantity: 2 }] },
    water: { element: 'water', spellbookId: SPELLBOOK_2, entries: [{ spellId: 'Water-0', quantity: 3 }] },
  }, drafts: {}, cloudDecks: null };
  original.spellbook2.drafts = structuredClone(original.spellbook2.savedDecks);
  const raw = json(original), disk = new BrowserStorage([[HUB_SAVE_KEY, raw]]);
  const restored = createHubStorage(disk).load().state;
  assert.equal(restored.selectedSpellbookId, SPELLBOOK_2);
  assert.deepEqual(restored.savedDecks, original.savedDecks);
  assert.deepEqual(restored.spellbook2.savedDecks.fire.entries, [{ spellId: 'FAT-001', quantity: 2 }, { spellId: 'Fire-6', quantity: 3 }]);
  assert.match(restored.activeMigrationNotice, /Charred Blade/);
  assert.equal(disk.getItem(`wizzy.archive.named-spellbook.v1.${encodeURIComponent(HUB_SAVE_KEY)}`), raw);
  assert.equal(createHubStorage(disk).save(restored), true);
  assert.deepEqual(createHubStorage(disk).load().state.spellbook2.savedDecks, restored.spellbook2.savedDecks);
});

test('eligible legacy deck promotion preserves quantities while existing active empty slots win', () => {
  const original = snapshot('Eligible legacy');
  original.savedDecks.fire = { element: 'fire', entries: [{ spellId: 'Fire-11', quantity: 30 }] };
  original.drafts.fire = structuredClone(original.savedDecks.fire);
  const disk = new BrowserStorage([[HUB_SAVE_KEY, json(original)]]);
  const loaded = createHubStorage(disk).load().state;
  assert.deepEqual(loaded.spellbook2.savedDecks.fire.entries, original.savedDecks.fire.entries);
  const active = { ...original, spellbook2: { savedDecks: { fire: createStarterDeck('fire', SPELLBOOK_2), water: createStarterDeck('water', SPELLBOOK_2) }, drafts: { fire: createStarterDeck('fire', SPELLBOOK_2), water: createStarterDeck('water', SPELLBOOK_2) }, cloudDecks: null } };
  disk.setItem(HUB_SAVE_KEY, json(active));
  assert.deepEqual(createHubStorage(disk).load().state.spellbook2.savedDecks.fire.entries, []);
});


test('named-generation backups survive a newer cached two-book rewrite of every known legacy key', () => {
  const disk = new BrowserStorage(), store = createHubStorage(disk, { now: () => 100 });
  for (const owner of [null, 'named-alice']) {
    const named = { ...snapshot(owner ? 'Alice named' : 'Guest named', owner), selectedSpellbookId: SPELLBOOK_2, spellbook2: testingBook(3) };
    named.spellbook2.savedDecks.fire = { element: 'fire', spellbookId: SPELLBOOK_2, entries: [{ spellId: 'Fire-6', quantity: 3 }] };
    named.spellbook2.drafts.fire = structuredClone(named.spellbook2.savedDecks.fire);
    assert.equal(store.save(named), true);
    const latest = structuredClone(named);
    latest.spellbook2.savedDecks.fire.entries[0].quantity = 5;
    latest.spellbook2.drafts.fire.entries[0].quantity = 6;
    assert.equal(store.save(latest), true);
    const namedKey = owner ? `wizzy.named-spellbook.v1.account.${encodeURIComponent(owner)}` : GUEST_NAMED_SAVE_KEY;
    const protectedRaw = disk.getItem(namedKey), protectedRecord = JSON.parse(protectedRaw);
    assert.equal(protectedRecord.activeCatalogVersion, 'named-spellbook-v1');
    assert.equal(protectedRecord.profile, undefined);
    assert.equal(protectedRecord.savedDecks, undefined);
    const cached = { version: 2, savedAt: 9000, ...snapshot(owner ? 'Alice newer profile' : 'Guest newer profile', owner), spellbook2: { savedDecks: { fire: createStarterDeck('fire', SPELLBOOK_2), water: createStarterDeck('water', SPELLBOOK_2) }, drafts: { fire: createStarterDeck('fire', SPELLBOOK_2), water: createStarterDeck('water', SPELLBOOK_2) }, cloudDecks: null } };
    cached.savedDecks.fire = alternate('fire'); cached.drafts.fire = structuredClone(cached.savedDecks.fire);
    disk.setItem(HUB_SAVE_KEY, json(cached));
    disk.setItem(owner ? `wizzy.hub.account.v2.${encodeURIComponent(owner)}` : GUEST_SAVE_KEY, json(cached));
    disk.setItem(owner ? `wizzy.hub.account.spellbook2.v2.${encodeURIComponent(owner)}` : GUEST_BOOK2_SAVE_KEY, json({ version: 2, savedAt: 9000, accountId: owner, spellbook2: cached.spellbook2 }));
    const recovered = createHubStorage(disk).load().state;
    assert.equal(recovered.accountId, owner);
    assert.equal(recovered.profile.name, cached.profile.name);
    assert.deepEqual(recovered.savedDecks, cached.savedDecks);
    assert.deepEqual(recovered.spellbook2.savedDecks, latest.spellbook2.savedDecks);
    assert.deepEqual(recovered.spellbook2.drafts, latest.spellbook2.drafts);
    assert.equal(disk.getItem(namedKey), protectedRaw);
    assert.equal(store.readAccount('other-owner'), null);
  }
  const guest = store.readGuest();
  assert.equal(guest.accountId, null);
  assert.deepEqual(guest.spellbook2.savedDecks.fire.entries, [{ spellId: 'Fire-6', quantity: 5 }]);
});

test('pre-Earth guest and account records gain empty slots while preserving both books and unsaved drafts', () => {
  const disk = new BrowserStorage();
  const prior = { version: 2, activeMigrationVersion: 1, activeCatalogVersion: 'named-spellbook-v1', savedAt: 40,
    ...snapshot('Before Earth'), spellbook2: testingBook(7) };
  prior.drafts.fire = setDeckQuantity(prior.drafts.fire, prior.drafts.fire.entries[0].spellId, 1);
  prior.spellbook2.drafts.water = setDeckQuantity(prior.spellbook2.drafts.water, 'FAT-001', 9);
  for (const book of [prior, prior.spellbook2]) for (const field of ['savedDecks', 'drafts']) delete book[field].earth;
  const original = json(prior);
  disk.setItem(GUEST_SAVE_KEY, original);
  const store = createHubStorage(disk);
  const guest = store.readGuest();
  for (const [book, expected, bookId] of [[guest, prior, SPELLBOOK_1], [guest.spellbook2, prior.spellbook2, SPELLBOOK_2]]) {
    for (const field of ['savedDecks', 'drafts']) {
      for (const element of ['fire', 'water']) assert.deepEqual(book[field][element], expected[field][element]);
      assert.deepEqual(book[field].earth, createStarterDeck('earth', bookId));
    }
  }
  assert.equal(disk.getItem(GUEST_SAVE_KEY), original, 'reading preserves the original record');
  const account = { ...structuredClone(prior), accountId: 'pre-earth-owner', accountUsername: 'pre_earth', cloudDecks: structuredClone(prior.savedDecks) };
  account.spellbook2.cloudDecks = structuredClone(account.spellbook2.savedDecks);
  assert.equal(store.cacheAccount(account.accountId, account), true, 'old complete payloads are accepted for migration');
  const cached = store.readAccount(account.accountId);
  assert.equal(cached.accountId, account.accountId);
  assert.deepEqual(cached.cloudDecks.earth, createStarterDeck('earth'));
  assert.deepEqual(cached.spellbook2.cloudDecks.earth, createStarterDeck('earth', SPELLBOOK_2));
  for (const element of ['fire', 'water']) {
    assert.deepEqual(cached.drafts[element], prior.drafts[element]);
    assert.deepEqual(cached.spellbook2.drafts[element], prior.spellbook2.drafts[element]);
  }
  assert.deepEqual(store.readGuest().drafts, guest.drafts, 'account migration keeps guest drafts separate');
});

test('Earth slots preserve empty, short and full decks and independent unsaved drafts through reload and recovery', () => {
  for (const total of [0, 1, 30]) {
    const disk = new BrowserStorage(), store = createHubStorage(disk);
    const guest = { ...snapshot(`Earth ${total}`), profile: { name: `Earth ${total}`, element: 'earth' }, spellbook2: testingBook() };
    for (const [book, bookId] of [[guest, SPELLBOOK_1], [guest.spellbook2, SPELLBOOK_2]]) {
      book.savedDecks.earth = total ? setDeckQuantity(createStarterDeck('earth', bookId), 'Earth-1', total) : createStarterDeck('earth', bookId);
      book.drafts.earth = setDeckQuantity(createStarterDeck('earth', bookId), 'Earth-5', 29);
    }
    assert.equal(store.save(guest), true);
    disk.removeItem(HUB_SAVE_KEY);
    const restored = createHubStorage(disk).load().state;
    assert.equal(restored.profile.element, 'earth');
    assert.deepEqual(restored.savedDecks, guest.savedDecks);
    assert.deepEqual(restored.drafts, guest.drafts);
    assert.deepEqual(restored.spellbook2, guest.spellbook2);
    assert.equal(validateDeck(restored.spellbook2.savedDecks.earth), total > 0);
    const account = { ...structuredClone(guest), accountId: 'earth-owner', accountUsername: 'earth_owner', cloudDecks: structuredClone(guest.savedDecks) };
    account.spellbook2.cloudDecks = structuredClone(guest.spellbook2.savedDecks);
    assert.equal(store.save(account), true);
    assert.deepEqual(store.readAccount(account.accountId).spellbook2, account.spellbook2);
    assert.deepEqual(store.readGuest().spellbook2, guest.spellbook2);
    const invalid = structuredClone(account);
    invalid.spellbook2.drafts.earth = { element: 'earth', spellbookId: SPELLBOOK_2, entries: [{ spellId: 'Earth-1', quantity: 31 }] };
    const before = disk.getItem(HUB_SAVE_KEY);
    assert.equal(store.save(invalid), false);
    assert.equal(disk.getItem(HUB_SAVE_KEY), before);
  }
});

test('Earth recovery records survive old named-client rewrites without replacing new Fire or Water edits or crossing owners', () => {
  const disk = new BrowserStorage(), store = createHubStorage(disk, { now: () => 100 });
  for (const owner of [null, 'earth-alice']) {
    const current = { ...snapshot(owner ? 'Earth Alice' : 'Earth Guest', owner), spellbook2: testingBook(3) };
    current.savedDecks.earth = setDeckQuantity(createStarterDeck('earth'), 'Earth-2', 5);
    current.drafts.earth = setDeckQuantity(createStarterDeck('earth'), 'FAT-001', 7);
    current.spellbook2.savedDecks.earth = setDeckQuantity(createStarterDeck('earth', SPELLBOOK_2), 'Earth-4', 30);
    current.spellbook2.drafts.earth = setDeckQuantity(createStarterDeck('earth', SPELLBOOK_2), 'Earth-5', 1);
    if (owner) {
      current.cloudDecks = structuredClone(current.savedDecks);
      current.spellbook2.cloudDecks = structuredClone(current.spellbook2.savedDecks);
    }
    assert.equal(store.save(current), true);
    const earthKey = owner ? `wizzy.earth-spellbook.v1.account.${encodeURIComponent(owner)}` : GUEST_EARTH_SAVE_KEY;
    const earthRaw = disk.getItem(earthKey), protectedRecord = JSON.parse(earthRaw);
    assert.equal(protectedRecord.profile, undefined);
    assert.equal(protectedRecord.savedDecks.fire, undefined, 'Earth recovery never carries Fire/Water data');
    const cached = { ...structuredClone(current), version: 2, activeMigrationVersion: 1, activeCatalogVersion: 'named-spellbook-v1', savedAt: 9000 };
    cached.profile = { name: 'Newer cached name', element: 'water' };
    cached.savedDecks.fire = alternate('fire');
    cached.spellbook2.savedDecks.water = setDeckQuantity(createStarterDeck('water', SPELLBOOK_2), 'Water-9', 21);
    cached.spellbook2.drafts.water = setDeckQuantity(createStarterDeck('water', SPELLBOOK_2), 'Water-0', 12);
    for (const book of [cached, cached.spellbook2]) {
      for (const field of ['savedDecks', 'drafts', 'cloudDecks']) if (book[field]) delete book[field].earth;
    }
    for (const key of [HUB_SAVE_KEY, owner ? `wizzy.hub.account.v2.${owner}` : GUEST_SAVE_KEY,
      owner ? `wizzy.hub.account.spellbook2.v2.${owner}` : GUEST_BOOK2_SAVE_KEY,
      owner ? `wizzy.named-spellbook.v1.account.${owner}` : GUEST_NAMED_SAVE_KEY]) disk.setItem(key, json(cached));
    const restored = createHubStorage(disk).load().state;
    assert.equal(restored.accountId, owner);
    assert.equal(restored.profile.name, cached.profile.name);
    for (const [book, expected, earth] of [[restored, cached, current], [restored.spellbook2, cached.spellbook2, current.spellbook2]]) {
      for (const field of ['savedDecks', 'drafts']) {
        assert.deepEqual(book[field].earth, earth[field].earth);
        for (const element of ['fire', 'water']) assert.deepEqual(book[field][element], expected[field][element]);
      }
      if (owner) assert.deepEqual(book.cloudDecks.earth, earth.cloudDecks.earth);
    }
    assert.equal(disk.getItem(earthKey), earthRaw);
    assert.equal(store.readAccount('unrelated-earth-owner'), null);
  }
  assert.deepEqual(store.readGuest().spellbook2.savedDecks.earth.entries, [{ spellId: 'Earth-4', quantity: 30 }]);
});
