import { createGame, migrateSavedGame, getGameSpellbook, SAVE_VERSION, validateSavedGame } from './game.fc61b4cccab7.js';
import { createStarterDeck } from './decks.e3c667abc473.js';
import { SPELLBOOK_1, SPELLBOOK_2, isSpellbookId } from './spellbooks.7d88afb55ce3.js';

export const RETIRED_DUEL_ARCHIVE_KEY = `wizzy.duel.v${SAVE_VERSION}.${SPELLBOOK_2}.archived-before-named-spellbook`;

function archiveDigest(raw) {
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index++) hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619);
  return `${raw.length}-${(hash >>> 0).toString(16)}`;
}

export function duelSaveKey(bookId = SPELLBOOK_1) {
  if (!isSpellbookId(bookId)) throw new TypeError('Choose Spellbook 1 or Spellbook 2.');
  return `wizzy.duel.v${SAVE_VERSION}${bookId === SPELLBOOK_1 ? '' : `.${bookId}`}`;
}

/** Keep old duel keys intact; each book resumes only its own cards and progress. */
export function createDuelStorage(storage) {
  let notice = '';
  let archiveBlocked = false;
  function read(key, bookId) {
    try {
      const raw = storage?.getItem(key) || 'null';
      const saved = JSON.parse(raw);
      const state = migrateSavedGame(saved);
      if (!state && bookId === SPELLBOOK_2 && getGameSpellbook(saved) === SPELLBOOK_2
        && saved?.players?.some(player => player?.deckDefinition?.entries?.some(entry => entry.spellId === 'Fire-5'))) {
        // Do not reinterpret a paid Fire-5 cast as the newly selected Fire-6.
        // Keep an exact archive before the app saves a fresh active-book duel.
        try {
          let archiveKey = RETIRED_DUEL_ARCHIVE_KEY;
          const original = storage.getItem(archiveKey);
          if (original && original !== raw) {
            const base = `${RETIRED_DUEL_ARCHIVE_KEY}.${archiveDigest(raw)}`;
            archiveKey = base;
            // Never overwrite a distinct snapshot, even in a digest collision.
            for (let suffix = 2, found; (found = storage.getItem(archiveKey)) && found !== raw; suffix++) archiveKey = `${base}.${suffix}`;
          }
          if (storage.getItem(archiveKey) !== raw) storage.setItem(archiveKey, raw);
          archiveBlocked = false;
        } catch {
          archiveBlocked = true;
          notice = 'The previous duel uses Fire-5. Its archive could not be saved, so the old duel will not be overwritten.';
          return null;
        }
        notice = 'Your previous duel used Fire-5 and was archived. Start a new duel with Charred Blade and your updated deck.';
      }
      return state && getGameSpellbook(state) === bookId ? state : null;
    } catch { return null; }
  }
  function load(bookId = SPELLBOOK_1) {
    const current = read(duelSaveKey(bookId), bookId);
    if (current) return current;
    if (bookId === SPELLBOOK_1) for (const version of [13, 12, 11, 10]) {
      const legacy = read(`wizzy.duel.v${version}`, bookId);
      if (legacy) return legacy;
    }
    return createGame(Date.now(), Object.fromEntries(['fire', 'water'].map(element => [element, createStarterDeck(element, bookId)])));
  }
  function save(state) {
    if (!validateSavedGame(state)) return false;
    if (archiveBlocked && getGameSpellbook(state) === SPELLBOOK_2) return false;
    try {
      if (!storage) return false;
      storage.setItem(duelSaveKey(getGameSpellbook(state)), JSON.stringify(state));
      return true;
    } catch { return false; }
  }
  return { load, save, getNotice: () => notice };
}
