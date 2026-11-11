import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../src/hub.js';
import { accountData } from '../src/accounts.js';
import { createStarterDeck, serializeDeck, setDeckQuantity } from '../src/decks.js';
import { createHubStorage } from '../src/hub-storage.js';
import { ELEMENTS } from '../src/elements.js';
import { SPELLBOOK_1, SPELLBOOK_2 } from '../src/spellbooks.js';

class BrowserStorage {
  items = new Map();
  get length() { return this.items.size; }
  key(index) { return [...this.items.keys()][index] ?? null; }
  getItem(key) { return this.items.get(key) ?? null; }
  setItem(key, value) { this.items.set(key, String(value)); }
}

// The event boundary is sufficient here: rendering and click handlers remain
// real, while browser layout and artwork are covered by visual checks.
class HubRoot {
  classList = { add() {} };
  style = { setProperty() {} };
  dataset = {};
  listeners = new Map();
  innerHTML = '';
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains(node) { return Boolean(node); }
  click(action, data = {}) {
    const target = { dataset: { wzAction: action, ...data }, disabled: false, closest() { return this; } };
    this.listeners.get('click')({ target, detail: 0 });
  }
}

const book = bookId => ({ savedDecks: Object.fromEntries(ELEMENTS.map(element => [element, createStarterDeck(element, bookId)])), drafts: null, cloudDecks: null });
function setupHub(t, { profileElement = 'earth', ready = ['earth'] } = {}) {
  const storage = new BrowserStorage();
  const mockGlobal = (name, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  };
  const legacy = book(SPELLBOOK_1), active = book(SPELLBOOK_2);
  for (const element of ready) active.savedDecks[element] = setDeckQuantity(active.savedDecks[element], ({ earth: 'Earth-1', fire: 'Fire-11', water: 'Water-1' })[element], 3);
  legacy.drafts = structuredClone(legacy.savedDecks);
  active.drafts = structuredClone(active.savedDecks);
  createHubStorage(storage).save({ profile: { name: 'Test wizard', element: profileElement }, ...legacy, spellbook2: active });
  const location = { hash: '#home' };
  mockGlobal('localStorage', storage);
  mockGlobal('location', location);
  mockGlobal('history', { pushState(_state, _title, hash) { location.hash = hash; } });
  mockGlobal('document', { activeElement: null, querySelector() { return null; } });
  mockGlobal('window', { addEventListener() {} });
  t.mock.method(globalThis, 'setTimeout', () => 0);
  const root = new HubRoot(), battles = [];
  const hub = createHub({ root, onBattle: details => battles.push(details) });
  return { root, hub, battles, storage };
}
const pressed = (root, seat, element) => new RegExp(`data-wz-seat="${seat}" data-wz-element="${element}"[^>]*aria-pressed="true"`).test(root.innerHTML);

test('shared-screen chooser starts Earth mirrors while unused Fire and Water slots are empty', t => {
  const { root, hub, battles } = setupHub(t);
  hub.showBattleChooser();
  assert.equal(root.dataset.wzScreen, 'battle-setup');
  assert.match(root.innerHTML, /Player 1/);
  assert.match(root.innerHTML, /Player 2/);
  assert.equal(pressed(root, 0, 'earth'), true);
  root.click('battle-element', { wzSeat: '1', wzElement: 'earth' });
  root.click('start-local-battle');
  assert.equal(battles.length, 1);
  assert.deepEqual(battles[0].selectedElements, ['earth', 'earth']);
  assert.equal(battles[0].forceNew, true);
  assert.deepEqual(battles[0].decks.fire.entries, []);
  assert.deepEqual(battles[0].decks.water.entries, []);
});

test('chooser blocks only an empty selected deck and permits changing that player independently', t => {
  const { root, hub, battles } = setupHub(t);
  hub.showBattleChooser();
  root.click('battle-element', { wzSeat: '1', wzElement: 'water' });
  assert.equal(pressed(root, 0, 'earth'), true);
  assert.equal(pressed(root, 1, 'water'), true);
  assert.match(root.innerHTML, /Water deck needs 1–30 legal slabs/);
  assert.match(root.innerHTML, /data-wz-action="start-local-battle" disabled/);
  root.click('start-local-battle');
  assert.equal(battles.length, 0, 'the handler also guards invalid selected decks');
  root.click('battle-element', { wzSeat: '1', wzElement: 'earth' });
  assert.doesNotMatch(root.innerHTML, /data-wz-action="start-local-battle" disabled/);
  root.click('start-local-battle');
  assert.equal(battles.length, 1);
});

test('Save & Battle preselects the edited school and ordinary Battle keeps the profile school', t => {
  const { root, hub, battles } = setupHub(t, { profileElement: 'fire', ready: ['earth', 'fire'] });
  hub.show('deck');
  root.click('deck-element', { wzElement: 'earth' });
  assert.match(root.innerHTML, /data-wz-filter="Earth"/);
  root.click('test-deck');
  assert.equal(root.dataset.wzScreen, 'battle-setup');
  assert.equal(pressed(root, 0, 'earth'), true);
  assert.equal(battles.length, 0, 'saving does not bypass visible match selection');
  hub.show('home');
  root.click('battle');
  assert.equal(battles.at(-1).element, 'fire');
  assert.equal(battles.at(-1).selectedElements, undefined, 'ordinary Battle can offer resume before starting a new match');
  hub.showBattleChooser();
  assert.equal(pressed(root, 0, 'fire'), true);
});

test('Earth character uses Golem status and supports the Earth profile accent', t => {
  const { root, hub } = setupHub(t);
  hub.show('character');
  assert.match(root.innerHTML, /wz-character-stage wz-earth/);
  assert.match(root.innerHTML, /GOLEM<\/span><strong>Inactive/);
  assert.doesNotMatch(root.innerHTML, /Runes/i);
});

test('Earth import and export keep an unsaved draft separate until saved, then reload its exact composition', async t => {
  const { root, hub, storage } = setupHub(t, { ready: ['earth', 'fire'] });
  const savedBefore = hub.getSavedDecks();
  const imported = setDeckQuantity(setDeckQuantity(createStarterDeck('earth', SPELLBOOK_2), 'Earth-5', 29), 'FAT-001', 1);
  const encoded = serializeDeck(imported);
  hub.show('deck');
  root.listeners.get('change')({ target: { matches: selector => selector === '[data-wz-deck-upload]', files: [{ size: encoded.length, text: async () => encoded }] } });
  await Promise.resolve();
  assert.match(root.innerHTML, /Earth deck imported for review/);
  assert.match(root.innerHTML, /data-testid="builder-deck-total">30/);
  assert.deepEqual(hub.getSavedDecks(), savedBefore, 'import keeps every saved deck unchanged');
  let exported;
  t.mock.method(URL, 'createObjectURL', blob => { exported = blob; return 'blob:earth-deck'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  document.createElement = () => ({ click() {}, remove() {} });
  document.body = { append() {} };
  root.click('download-deck');
  assert.equal(await exported.text(), encoded);
  root.click('save-deck');
  assert.deepEqual(hub.getSavedDecks().earth, imported);
  assert.deepEqual(hub.getSavedDecks().fire, savedBefore.fire);
  assert.deepEqual(hub.getSavedDecks().water, savedBefore.water);
  const restored = createHubStorage(storage).load().state;
  assert.deepEqual(restored.spellbook2.savedDecks.earth, imported);
  assert.deepEqual(restored.spellbook2.drafts.earth, imported);
});

test('account switching keeps guest Earth drafts and account Earth drafts in their own slots', t => {
  const { root, hub, storage } = setupHub(t);
  hub.show('deck');
  root.click('quantity', { wzSpell: 'Earth-1', wzDelta: '1' });
  const account = { id: 'alice-earth', username: 'alice', profile: { name: 'Alice', element: 'earth' },
    decks: book(SPELLBOOK_1).savedDecks, spellbook2Decks: book(SPELLBOOK_2).savedDecks };
  account.spellbook2Decks.earth = setDeckQuantity(account.spellbook2Decks.earth, 'Earth-2', 5);
  hub.applyAccountData(account);
  root.click('quantity', { wzSpell: 'Earth-2', wzDelta: '1' });
  hub.applyAccountData(account);
  let cached = createHubStorage(storage).readAccount(account.id);
  assert.deepEqual(cached.spellbook2.savedDecks.earth, account.spellbook2Decks.earth);
  assert.deepEqual(cached.spellbook2.drafts.earth.entries, [{ spellId: 'Earth-2', quantity: 6 }]);
  hub.clearAccountData();
  assert.equal(hub.getProfile().name, 'Test wizard');
  const guest = createHubStorage(storage).readGuest();
  assert.deepEqual(guest.spellbook2.savedDecks.earth.entries, [{ spellId: 'Earth-1', quantity: 3 }]);
  assert.deepEqual(guest.spellbook2.drafts.earth.entries, [{ spellId: 'Earth-1', quantity: 4 }]);
  hub.applyAccountData(account);
  cached = createHubStorage(storage).load().state;
  assert.equal(cached.accountId, account.id);
  assert.deepEqual(cached.spellbook2.drafts.earth.entries, [{ spellId: 'Earth-2', quantity: 6 }]);
});

test('account payload migrates absent Earth slots without changing Fire, Water, or its input', () => {
  const decks = { fire: setDeckQuantity(createStarterDeck('fire'), 'Fire-1', 4), water: createStarterDeck('water') };
  const spellbook2Decks = { fire: setDeckQuantity(createStarterDeck('fire', SPELLBOOK_2), 'Fire-11', 4), water: createStarterDeck('water', SPELLBOOK_2) };
  const input = { profile: { name: 'Returning wizard', element: 'water' }, decks, spellbook2Decks };
  const before = structuredClone(input), normalized = accountData(input);
  assert.deepEqual(input, before);
  for (const element of ['fire', 'water']) {
    assert.deepEqual(normalized.decks[element], input.decks[element]);
    assert.deepEqual(normalized.spellbook2Decks[element], input.spellbook2Decks[element]);
  }
  assert.deepEqual(normalized.decks.earth, createStarterDeck('earth'));
  assert.deepEqual(normalized.spellbook2Decks.earth, createStarterDeck('earth', SPELLBOOK_2));
});

test('Earth account payload allows unlimited copies within 30 slabs and rejects illegal Earth slots', () => {
  const decks = book(SPELLBOOK_1).savedDecks, spellbook2Decks = book(SPELLBOOK_2).savedDecks;
  decks.earth = setDeckQuantity(decks.earth, 'Earth-1', 30);
  spellbook2Decks.earth = setDeckQuantity(spellbook2Decks.earth, 'Earth-1', 30);
  const input = { profile: { name: 'Earth wizard', element: 'earth' }, decks, spellbook2Decks };
  const normalized = accountData(input);
  assert.equal(normalized.spellbook2Decks.earth.entries[0].quantity, 30);
  for (const earth of [null, { element: 'earth', entries: [{ spellId: 'Fire-1', quantity: 1 }] }, { element: 'earth', entries: [{ spellId: 'Earth-1', quantity: 31 }] }]) {
    assert.throws(() => accountData({ ...input, decks: { ...decks, earth } }));
  }
});
