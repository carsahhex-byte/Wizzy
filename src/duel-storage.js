import { createGame, migrateSavedGame, getGameSpellbook, SAVE_VERSION, validateSavedGame } from './game.js';
import { createStarterDeck } from './decks.js';
import { SPELLBOOK_1, isSpellbookId } from './spellbooks.js';

export function duelSaveKey(bookId = SPELLBOOK_1) {
  if (!isSpellbookId(bookId)) throw new TypeError('Choose Spellbook 1 or Spellbook 2.');
  return `wizzy.duel.v${SAVE_VERSION}${bookId === SPELLBOOK_1 ? '' : `.${bookId}`}`;
}

/** Keep old duel keys intact; each book resumes only its own cards and progress. */
export function createDuelStorage(storage) {
  function read(key, bookId) {
    try {
      const state = migrateSavedGame(JSON.parse(storage?.getItem(key) || 'null'));
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
    try {
      if (!storage) return false;
      storage.setItem(duelSaveKey(getGameSpellbook(state)), JSON.stringify(state));
      return true;
    } catch { return false; }
  }
  return { load, save };
}
