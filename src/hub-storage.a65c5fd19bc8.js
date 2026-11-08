import { SPELLBOOK_VERSION } from './spells.29cc03f8c6f5.js';
import { createStarterDeck, validateDeckSlot, normalizeDeckSlot, setDeckQuantity } from './decks.c47034088730.js';

// Build hashes, page paths and spellbook labels must never change where a
// compatible deck is saved. The payload still records its originating book.
export const HUB_SAVE_KEY = 'wizzy.hub.v2';
export const GUEST_SAVE_KEY = 'wizzy.hub.guest.v2';
const accountSaveKey = id => `wizzy.hub.account.v2.${encodeURIComponent(id)}`;
const elements = ['fire', 'water'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);

export function restoreHubDraft(candidate, element, fallback = null) {
  if (!record(candidate) || candidate.element !== element || !Array.isArray(candidate.entries)) return fallback ? copy(fallback) : null;
  let draft = { element, entries: [] };
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
  if (key.startsWith('wizzy.hub.guest.') && accountId) return null;
  const candidate = { key, priority, accountId, accountUsername: typeof value.accountUsername === 'string' ? value.accountUsername.slice(0, 24) : '',
    savedAt: Number.isSafeInteger(value.savedAt) && value.savedAt >= 0 ? value.savedAt : 0,
    profile: profileFrom(value.profile), savedDecks: {}, drafts: {}, cloudDecks: {} };
  for (const element of elements) {
    for (const field of ['savedDecks', 'cloudDecks']) {
      const deck = value[field]?.[element];
      if (deck?.element === element && validateDeckSlot(deck)) candidate[field][element] = normalizeDeckSlot(deck);
    }
    const draft = restoreHubDraft(value.drafts?.[element], element);
    if (draft) candidate.drafts[element] = draft;
  }
  return candidate.profile || elements.some(element => candidate.savedDecks[element] || candidate.drafts[element]) ? candidate : null;
}

const newestFirst = (a, b) => b.savedAt - a.savedAt || a.priority - b.priority;
function mergeCandidates(candidates, accountId = null) {
  if (!candidates.length) return null;
  const ordered = candidates.slice().sort(newestFirst);
  const pick = selector => ordered.map(selector).find(value => value !== undefined && value !== null);
  const state = { profile: copy(pick(candidate => candidate.profile) || { name: 'Wizzy', element: 'fire' }), savedDecks: {}, drafts: {}, cloudDecks: null,
    accountId, accountUsername: accountId ? pick(candidate => candidate.accountUsername || null) || '' : '' };
  for (const element of elements) {
    state.savedDecks[element] = copy(pick(candidate => candidate.savedDecks[element]) || createStarterDeck(element));
    state.drafts[element] = copy(pick(candidate => candidate.drafts[element]) || state.savedDecks[element]);
  }
  if (accountId) state.cloudDecks = Object.fromEntries(elements.map(element => [element, copy(pick(candidate => candidate.cloudDecks[element]) || state.savedDecks[element])]));
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
      const candidate = text ? candidateFrom(JSON.parse(text), key, priority) : null;
      if (candidate) lastSavedAt = Math.max(lastSavedAt, candidate.savedAt);
      return candidate;
    }
    catch { return null; }
  }
  function keys() {
    const result = new Set([HUB_SAVE_KEY, GUEST_SAVE_KEY, `wizzy.hub.${SPELLBOOK_VERSION}`, `wizzy.hub.guest.${SPELLBOOK_VERSION}`, 'wizzy.hub.v1']);
    try {
      for (let index = 0; index < (storage?.length || 0); index += 1) {
        const key = storage.key(index);
        if (typeof key === 'string' && key.startsWith('wizzy.hub.')) result.add(key);
      }
    } catch { available = false; }
    return [...result];
  }
  function candidates() {
    return keys().map((key, index) => {
      const candidate = read(key, index);
      // Old account caches had no owner in their payload. They are only read
      // when explicitly restoring that account, never mistaken for a guest.
      return key.startsWith('wizzy.hub.account.') && !candidate?.accountId ? null : candidate;
    }).filter(Boolean);
  }
  function readGuest() { return mergeCandidates(candidates().filter(candidate => !candidate.accountId)); }
  function accountCandidates(id) {
    if (typeof id !== 'string' || !id) return [];
    const stable = accountSaveKey(id);
    const matches = keys().filter(key => key === stable || (key.startsWith('wizzy.hub.account.') && key.endsWith(`.${id}`)));
    return matches.map((key, index) => read(key, index)).filter(candidate => candidate && (!candidate.accountId || candidate.accountId === id));
  }
  function readAccount(id) { return mergeCandidates(accountCandidates(id), id); }
  function load() {
    const all = candidates().sort(newestFirst);
    const selected = all[0];
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
    const normalized = candidateFrom({ ...value, accountId }, HUB_SAVE_KEY, 0);
    if (!normalized || !normalized.profile || !elements.every(element => normalized.savedDecks[element] && normalized.drafts[element])) return null;
    // Two writes can happen in one millisecond, or another tab can save in
    // between them. A strictly increasing stamp keeps the newest backup ahead
    // of an older primary even when that primary can no longer be written.
    for (const key of keys()) read(key);
    const time = now();
    lastSavedAt = Math.max(Number.isSafeInteger(time) && time >= 0 ? time : Date.now(), lastSavedAt + 1);
    return { version: 2, spellbook: SPELLBOOK_VERSION, savedAt: lastSavedAt, ...mergeCandidates([normalized], accountId) };
  }
  function write(key, value) {
    if (!value) return false;
    try { if (!storage) throw new Error('Storage unavailable'); storage.setItem(key, JSON.stringify(value)); available = true; return true; }
    catch { return false; }
  }
  function cacheGuest(value) { const result = write(GUEST_SAVE_KEY, envelope(value)); if (!result) available = false; return result; }
  function cacheAccount(id, value) { return write(accountSaveKey(id), envelope(value, id)); }
  function save(value) {
    const owner = typeof value?.accountId === 'string' && value.accountId ? value.accountId : null;
    const packed = envelope(value, owner);
    if (!packed) return false;
    // Backup first: either complete write can recover the full saved state.
    const backup = write(owner ? accountSaveKey(owner) : GUEST_SAVE_KEY, packed);
    const primary = write(HUB_SAVE_KEY, packed);
    available = backup || primary;
    return available;
  }
  return { load, readGuest, readAccount, save, cacheGuest, cacheAccount, isAvailable: () => available };
}
