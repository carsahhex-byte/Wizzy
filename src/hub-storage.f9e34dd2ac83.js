import { SPELLBOOK_VERSION } from './spells.116e6e94e9df.js';
import { createStarterDeck, validateDeckSlot, normalizeDeckSlot, setDeckQuantity, migrateToActiveDeck } from './decks.1fed6bf0f1db.js';
import { SPELLBOOK_1, SPELLBOOK_2, getDeckSpellbook } from './spellbooks.dc9c46f0173c.js';
import { ELEMENTS } from './elements.f91c53cdab44.js';

// Build hashes, page paths and spellbook labels must never change where a
// compatible deck is saved. The payload still records its originating book.
export const HUB_SAVE_KEY = 'wizzy.hub.v2';
export const GUEST_SAVE_KEY = 'wizzy.hub.guest.v2';
// Old cached clients rewrite the legacy envelopes. Keep testing decks in an
// additional scoped record that contains no original-book data to overwrite.
export const GUEST_BOOK2_SAVE_KEY = 'wizzy.hub.guest.spellbook2.v2';
const ACTIVE_CATALOG_VERSION = 'named-spellbook-v1';
// Kept outside the old hub-key namespace so cached two-book clients cannot
// discover, select, or rewrite the named collection's recovery records.
export const GUEST_NAMED_SAVE_KEY = 'wizzy.named-spellbook.v1.guest';
const namedAccountSaveKey = id => `wizzy.named-spellbook.v1.account.${encodeURIComponent(id)}`;
// Named-collection clients know the records above and can rewrite them without
// Earth. Keep Earth slots in a separate recovery record they cannot discover.
export const GUEST_EARTH_SAVE_KEY = 'wizzy.earth-spellbook.v1.guest';
const earthAccountSaveKey = id => `wizzy.earth-spellbook.v1.account.${encodeURIComponent(id)}`;
const accountBook2SaveKey = id => `wizzy.hub.account.spellbook2.v2.${encodeURIComponent(id)}`;
const accountSaveKey = id => `wizzy.hub.account.v2.${encodeURIComponent(id)}`;
const elements = ELEMENTS;
const isAccountKey = key => key.startsWith('wizzy.hub.account.') || key.startsWith('wizzy.named-spellbook.v1.account.') || key.startsWith('wizzy.earth-spellbook.v1.account.');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);

export function restoreHubDraft(candidate, element, fallback = null, spellbookId = SPELLBOOK_1) {
  if (!record(candidate) || candidate.element !== element || getDeckSpellbook(candidate) !== spellbookId || !Array.isArray(candidate.entries)) return fallback ? copy(fallback) : null;
  if (spellbookId === SPELLBOOK_2) {
    try { return migrateToActiveDeck(candidate).deck; } catch { return fallback ? copy(fallback) : null; }
  }
  let draft = createStarterDeck(element, spellbookId);
  const seen = new Set();
  try {
    for (const entry of candidate.entries) {
      if (!record(entry) || seen.has(entry.spellId) || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1) throw new Error('Invalid draft');
      seen.add(entry.spellId);
      draft = setDeckQuantity(draft, entry.spellId, entry.quantity);
    }
    return draft;
  } catch { return fallback ? copy(fallback) : null; }
}

function profileFrom(value) {
  if (!record(value) || !elements.includes(value.element) || typeof value.name !== 'string') return null;
  const name = value.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
  return name ? { name, element: value.element } : null;
}

function candidateFrom(value, key, priority) {
  if (!record(value) || (value.version !== undefined && ![1, 2].includes(value.version))) return null;
  if (value.accountId !== undefined && value.accountId !== null && (typeof value.accountId !== 'string' || !value.accountId || value.accountId.length > 128)) return null;
  const accountId = value.accountId || null;
  if ((key.startsWith('wizzy.hub.guest.') || key === GUEST_NAMED_SAVE_KEY || key === GUEST_EARTH_SAVE_KEY) && accountId) return null;
  const candidate = { key, priority, accountId, book2Only: key === GUEST_BOOK2_SAVE_KEY || key.startsWith('wizzy.hub.account.spellbook2.v2.') || key === GUEST_NAMED_SAVE_KEY || key.startsWith('wizzy.named-spellbook.v1.account.') || key === GUEST_EARTH_SAVE_KEY || key.startsWith('wizzy.earth-spellbook.v1.account.'),
    activeCatalogVersion: value.activeCatalogVersion, accountUsername: typeof value.accountUsername === 'string' ? value.accountUsername.slice(0, 24) : '',
    savedAt: Number.isSafeInteger(value.savedAt) && value.savedAt >= 0 ? value.savedAt : 0,
    profile: profileFrom(value.profile), savedDecks: {}, drafts: {}, cloudDecks: {},
    selectedSpellbookId: SPELLBOOK_2, activeMigrationNotice: typeof value.activeMigrationNotice === 'string' ? value.activeMigrationNotice : '' };
  for (const element of elements) {
    for (const field of ['savedDecks', 'cloudDecks']) {
      const deck = value[field]?.[element];
      if (deck?.element === element && getDeckSpellbook(deck) === SPELLBOOK_1 && validateDeckSlot(deck)) candidate[field][element] = normalizeDeckSlot(deck);
    }
    const draft = restoreHubDraft(value.drafts?.[element], element);
    if (draft) candidate.drafts[element] = draft;
  }
  if (record(value.spellbook2)) {
    candidate.spellbook2 = { savedDecks: {}, drafts: {}, cloudDecks: {} };
    for (const element of elements) {
      for (const field of ['savedDecks', 'cloudDecks']) {
        const deck = value.spellbook2[field]?.[element];
        if (deck?.element === element && getDeckSpellbook(deck) === SPELLBOOK_2) {
          try {
            const migrated = migrateToActiveDeck(deck);
            candidate.spellbook2[field][element] = migrated.removed.length > 0 ? createStarterDeck(element, SPELLBOOK_2) : migrated.deck;
            if (migrated.removed.length > 0) candidate.spellbook2.drafts[element] = migrated.deck;
            if (migrated.replacements.length) candidate.activeMigrationNotice = 'Fire-5 was replaced with Charred Blade in your saved deck; its quantity was kept. Review its 5-Mana cost before battling.';
            if (migrated.removed.length > 0) candidate.activeMigrationNotice = 'Your original deck was backed up. Review the available cards and save a new deck; retired cards were not silently removed from a saved battle deck.';
          } catch {}
        }
      }
      const draft = restoreHubDraft(value.spellbook2.drafts?.[element], element, null, SPELLBOOK_2);
      if (draft) candidate.spellbook2.drafts[element] = draft;
    }
  }
  return candidate.profile || elements.some(element => candidate.savedDecks[element] || candidate.drafts[element] || candidate.spellbook2?.savedDecks[element] || candidate.spellbook2?.drafts[element]) ? candidate : null;
}

const newestFirst = (a, b) => b.savedAt - a.savedAt || a.priority - b.priority;
function mergeCandidates(candidates, accountId = null) {
  if (!candidates.length) return null;
  const ordered = candidates.slice().sort(newestFirst);
  const pick = selector => ordered.map(selector).find(value => value !== undefined && value !== null);
  const activeOrdered = [...ordered.filter(candidate => candidate.activeCatalogVersion === ACTIVE_CATALOG_VERSION), ...ordered.filter(candidate => candidate.activeCatalogVersion !== ACTIVE_CATALOG_VERSION)];
  const pickActive = selector => activeOrdered.map(selector).find(value => value !== undefined && value !== null);
  const state = { profile: copy(pick(candidate => candidate.profile) || { name: 'Wizzy', element: 'fire' }), savedDecks: {}, drafts: {}, cloudDecks: null,
    accountId, accountUsername: accountId ? pick(candidate => candidate.accountUsername || null) || '' : '' };
  for (const element of elements) {
    state.savedDecks[element] = copy(pick(candidate => candidate.savedDecks[element]) || createStarterDeck(element));
    state.drafts[element] = copy(pick(candidate => candidate.drafts[element]) || state.savedDecks[element]);
  }
  if (accountId) state.cloudDecks = Object.fromEntries(elements.map(element => [element, copy(pick(candidate => candidate.cloudDecks[element]) || state.savedDecks[element])]));
  const notices = new Set(ordered.map(candidate => candidate.activeMigrationNotice).filter(Boolean));
  const selected = SPELLBOOK_2;
  if (selected) state.selectedSpellbookId = selected;
  if (selected === SPELLBOOK_2 || candidates.some(candidate => candidate.spellbook2)) {
    state.spellbook2 = { savedDecks: {}, drafts: {}, cloudDecks: null };
    for (const element of elements) {
      const existing = pickActive(candidate => candidate.spellbook2?.savedDecks[element]);
      let promoted = null, promotedDraft = null;
      if (!existing) {
        try {
          const result = migrateToActiveDeck(state.savedDecks[element]);
          promoted = result.removed.length > 0 ? createStarterDeck(element, SPELLBOOK_2) : result.deck;
          promotedDraft = migrateToActiveDeck(state.drafts[element]).deck;
          if (result.removed.length > 0) notices.add('Your original decks were backed up. Review the available-card drafts and save new decks; retired cards remain in the backup.');
          if (result.replacements.length) notices.add('Fire-5 was replaced with Charred Blade; its quantity was kept. Review its 5-Mana cost before battling.');
        } catch {}
      }
      state.spellbook2.savedDecks[element] = copy(existing || promoted || createStarterDeck(element, SPELLBOOK_2));
      state.spellbook2.drafts[element] = copy(pickActive(candidate => candidate.spellbook2?.drafts[element]) || promotedDraft || state.spellbook2.savedDecks[element]);
    }
    if (accountId) state.spellbook2.cloudDecks = Object.fromEntries(elements.map(element => [element, copy(pickActive(candidate => candidate.spellbook2?.cloudDecks[element]) || state.spellbook2.savedDecks[element])]));
  }
  if (notices.size) state.activeMigrationNotice = [...notices].join(' ');
  return state;
}

/** Synchronous mirrored browser saves, with compatible legacy recovery. */
export function createHubStorage(storage, { now = Date.now } = {}) {
  let available = Boolean(storage);
  let lastSavedAt = 0;
  function read(key, priority = 0) {
    let text;
    try {
      text = storage?.getItem(key);
    } catch { available = false; return null; }
    try {
      const raw = text ? JSON.parse(text) : null;
      const candidate = raw ? candidateFrom(raw, key, priority) : null;
      if (candidate && raw.activeMigrationVersion !== 1) {
        const archive = `wizzy.archive.named-spellbook.v1.${encodeURIComponent(key)}`;
        try { if (storage?.getItem(archive) === null) storage.setItem(archive, text); } catch {}
      }
      if (candidate) lastSavedAt = Math.max(lastSavedAt, candidate.savedAt);
      return candidate;
    }
    catch { return null; }
  }
  function keys() {
    const result = new Set([HUB_SAVE_KEY, GUEST_SAVE_KEY, GUEST_BOOK2_SAVE_KEY, GUEST_NAMED_SAVE_KEY, GUEST_EARTH_SAVE_KEY, `wizzy.hub.${SPELLBOOK_VERSION}`, `wizzy.hub.guest.${SPELLBOOK_VERSION}`, 'wizzy.hub.v1']);
    try {
      for (let index = 0; index < (storage?.length || 0); index += 1) {
        const key = storage.key(index);
        if (typeof key === 'string' && (key.startsWith('wizzy.hub.') || isAccountKey(key))) result.add(key);
      }
    } catch { available = false; }
    return [...result];
  }
  function candidates() {
    return keys().map((key, index) => {
      const candidate = read(key, index);
      // Old account caches had no owner in their payload. They are only read
      // when explicitly restoring that account, never mistaken for a guest.
      return isAccountKey(key) && !candidate?.accountId ? null : candidate;
    }).filter(Boolean);
  }
  function readGuest() { return mergeCandidates(candidates().filter(candidate => !candidate.accountId)); }
  function accountCandidates(id) {
    if (typeof id !== 'string' || !id) return [];
    const stable = accountSaveKey(id);
    const matches = keys().filter(key => key === stable || key === accountBook2SaveKey(id) || key === namedAccountSaveKey(id) || key === earthAccountSaveKey(id) || (key.startsWith('wizzy.hub.account.') && key.endsWith(`.${id}`)));
    return matches.map((key, index) => read(key, index)).filter(candidate => candidate && (!candidate.accountId || candidate.accountId === id));
  }
  function readAccount(id) { return mergeCandidates(accountCandidates(id), id); }
  function load() {
    const all = candidates().sort(newestFirst);
    const selected = all.find(candidate => !candidate.book2Only) || all.find(candidate => !candidate.accountId);
    const guestSnapshot = readGuest();
    if (!selected) return { state: null, guestSnapshot, available, recovered: false };
    const matching = selected.accountId ? [...all.filter(candidate => candidate.accountId === selected.accountId)] : all.filter(candidate => !candidate.accountId);
    // Preserve each backup's timestamp: a primary write can fail after the
    // newer complete account backup has already been saved successfully.
    if (selected.accountId) matching.push(...accountCandidates(selected.accountId));
    const state = mergeCandidates(matching.filter(Boolean), selected.accountId);
    const newest = matching.slice().sort(newestFirst)[0];
    const recovered = newest.key !== HUB_SAVE_KEY || elements.some(element => !selected.savedDecks[element] && matching.some(candidate => candidate.savedDecks[element]));
    return { state, guestSnapshot, available, recovered };
  }
  function envelope(value, accountId = null) {
    // An old complete Fire/Water payload is a valid migration input. Omission
    // creates an empty Earth slot; a supplied invalid Earth slot is rejected.
    if (!record(value)) return null;
    try { value = copy(value); } catch { return null; }
    for (const [book, bookId] of [[value, SPELLBOOK_1], [value?.spellbook2, SPELLBOOK_2]]) {
      if (!record(book)) continue;
      for (const field of ['savedDecks', 'drafts', 'cloudDecks']) {
        if (record(book[field]) && book[field].earth === undefined) book[field].earth = createStarterDeck('earth', bookId);
      }
    }
    if (value?.spellbook2 !== undefined && !elements.every(element => ['savedDecks', 'drafts'].every(field => {
      const deck = value.spellbook2?.[field]?.[element];
      return deck?.element === element && getDeckSpellbook(deck) === SPELLBOOK_2 && validateDeckSlot(deck);
    }))) return null;
    const normalized = candidateFrom({ ...value, accountId }, HUB_SAVE_KEY, 0);
    if (!normalized || !normalized.profile || !elements.every(element => normalized.savedDecks[element] && normalized.drafts[element])) return null;
    if (value.spellbook2 !== undefined && (!record(value.spellbook2) || !elements.every(element => normalized.spellbook2?.savedDecks[element] && normalized.spellbook2?.drafts[element]))) return null;
    // Two writes can happen in one millisecond, or another tab can save in
    // between them. A strictly increasing stamp keeps the newest backup ahead
    // of an older primary even when that primary can no longer be written.
    for (const key of keys()) read(key);
    const time = now();
    lastSavedAt = Math.max(Number.isSafeInteger(time) && time >= 0 ? time : Date.now(), lastSavedAt + 1);
    return { version: 2, spellbook: SPELLBOOK_VERSION, activeMigrationVersion: 1, activeCatalogVersion: ACTIVE_CATALOG_VERSION, savedAt: lastSavedAt, ...mergeCandidates([normalized], accountId) };
  }
  function write(key, value) {
    if (!value) return false;
    try { if (!storage) throw new Error('Storage unavailable'); storage.setItem(key, JSON.stringify(value)); available = true; return true; }
    catch { return false; }
  }
  function writeBook2Backup(packed) {
    if (!packed?.spellbook2) return;
    const { version, spellbook, activeCatalogVersion, savedAt, accountId, accountUsername, selectedSpellbookId, spellbook2 } = packed;
    write(accountId ? accountBook2SaveKey(accountId) : GUEST_BOOK2_SAVE_KEY,
      { version, spellbook, activeCatalogVersion, savedAt, accountId, accountUsername, selectedSpellbookId, spellbook2 });
    write(accountId ? namedAccountSaveKey(accountId) : GUEST_NAMED_SAVE_KEY,
      { version, spellbook, activeMigrationVersion: 1, activeCatalogVersion, savedAt, accountId, accountUsername, selectedSpellbookId, spellbook2 });
    const earthSlots = book => Object.fromEntries(['savedDecks', 'drafts', 'cloudDecks'].map(field =>
      [field, book[field]?.earth ? { earth: book[field].earth } : null]));
    write(accountId ? earthAccountSaveKey(accountId) : GUEST_EARTH_SAVE_KEY,
      { version, spellbook, activeMigrationVersion: 1, activeCatalogVersion, savedAt, accountId, accountUsername,
        ...earthSlots(packed), spellbook2: earthSlots(spellbook2) });
  }
  function cacheGuest(value) { const packed = envelope(value); writeBook2Backup(packed); const result = write(GUEST_SAVE_KEY, packed); if (!result) available = false; return result; }
  function cacheAccount(id, value) { const packed = envelope(value, id); writeBook2Backup(packed); return write(accountSaveKey(id), packed); }
  function save(value) {
    const owner = typeof value?.accountId === 'string' && value.accountId ? value.accountId : null;
    const packed = envelope(value, owner);
    if (!packed) return false;
    // The testing-only backup survives old clients that drop unknown fields.
    writeBook2Backup(packed);
    // Backup first: either complete write can recover the full saved state.
    const backup = write(owner ? accountSaveKey(owner) : GUEST_SAVE_KEY, packed);
    const primary = write(HUB_SAVE_KEY, packed);
    available = backup || primary;
    return available;
  }
  return { load, readGuest, readAccount, save, cacheGuest, cacheAccount, isAvailable: () => available };
}
