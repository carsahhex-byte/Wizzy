import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeDeckSlot, migrateToActiveDeck } from '../src/decks.js';
import { SPELLBOOK_VERSION } from '../src/spells.js';
import { SPELLBOOK_1, SPELLBOOK_2, getDeckSpellbook } from '../src/spellbooks.js';
import { ELEMENTS } from '../src/elements.js';

const derive = promisify(scrypt);
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const digest = token => createHash('sha256').update(token).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const DAY = 24 * 60 * 60 * 1000;

export class AccountError extends Error {
  constructor(status, code, message, account) { super(message); Object.assign(this, { status, code, account }); }
}
const fail = (status, code, message, account) => { throw new AccountError(status, code, message, account); };

function username(value, login = false) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{3,24}$/.test(value)) {
    fail(login ? 401 : 400, login ? 'invalid_credentials' : 'invalid_username', login ? 'Incorrect username or password.' : 'Use 3 to 24 letters, numbers, underscores, or hyphens for your username.');
  }
  return value.toLowerCase();
}

function password(value, login = false) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128 || value.trim().length < 10) {
    fail(login ? 401 : 400, login ? 'invalid_credentials' : 'invalid_password', login ? 'Incorrect username or password.' : 'Use a password of 10 to 128 characters.');
  }
  return value;
}

const emptyDeckSlot = (element, spellbookId) => ({ element, ...(spellbookId === SPELLBOOK_2 ? { spellbookId } : {}), entries: [] });
const emptySpellbookTwoDecks = () => Object.fromEntries(ELEMENTS.map(element => [element, emptyDeckSlot(element, SPELLBOOK_2)]));
function savedDeckSlots(value, spellbookId, existing) {
  if (!record(value)) throw new Error('Provide Fire, Water and Earth deck slots.');
  return Object.fromEntries(ELEMENTS.map(element => {
    // Older clients know only Fire and Water. An omitted Earth slot cannot erase
    // a deck saved by a newer client, even when the older client has reloaded.
    const source = element === 'earth' && !Object.hasOwn(value, element)
      ? existing?.[element] ?? emptyDeckSlot(element, spellbookId) : value[element];
    const deck = normalizeDeckSlot(source);
    if (deck.element !== element || getDeckSpellbook(deck) !== spellbookId) throw new Error(`The ${element} deck must belong to ${spellbookId === SPELLBOOK_2 ? 'Spellbook 2' : 'Spellbook 1'}.`);
    return [element, deck];
  }));
}

function savedData(value, existing) {
  if (value?.spellbookVersion !== undefined && value.spellbookVersion !== SPELLBOOK_VERSION) fail(400, 'spellbook_changed', 'Update Wizzy and build decks from the current spellbook.');
  const profile = value?.profile;
  if (!record(profile) || typeof profile.name !== 'string' || !ELEMENTS.includes(profile.element)) fail(400, 'invalid_profile', 'Choose a wizard name and Fire, Water or Earth element.');
  const name = profile.name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 24) fail(400, 'invalid_profile', 'Wizard names must contain 1 to 24 characters.');
  if (!record(value?.decks)) fail(400, 'invalid_deck', 'Provide Fire, Water and Earth deck slots.');
  let decks, spellbook2Decks;
  try {
    decks = savedDeckSlots(value.decks, SPELLBOOK_1, existing?.decks);
    if (value.spellbook2Decks !== undefined) spellbook2Decks = savedDeckSlots(value.spellbook2Decks, SPELLBOOK_2, existing?.spellbook2Decks);
  } catch (error) { fail(400, 'invalid_deck', error.message || 'A saved deck slot must be empty or contain 1–30 legal slabs.'); }
  return { profile: { name, element: profile.element }, decks, ...(spellbook2Decks ? { spellbook2Decks } : {}) };
}

/** Durable private-friends account storage. Never stores passwords or raw tokens. */
export function createAccountStore({ dbPath = ':memory:', now = Date.now, sessionTtlMs = 30 * DAY } = {}) {
  if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs <= 0) throw new Error('Invalid account session lifetime.');
  const memory = dbPath === ':memory:';
  const filename = memory ? ':memory:' : path.resolve(dbPath);
  if (!memory) mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  let closed = false;
  const secureFiles = () => {
    if (!memory) for (const file of [filename, `${filename}-wal`, `${filename}-shm`]) if (existsSync(file)) chmodSync(file, 0o600);
  };
  secureFiles();
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (!memory) db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      element TEXT NOT NULL,
      decks_json TEXT NOT NULL,
      spellbook_version TEXT NOT NULL DEFAULT '',
      spellbook2_decks_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
  `);
  if (!db.prepare('PRAGMA table_info(accounts)').all().some(column => column.name === 'spellbook_version')) {
    db.exec("ALTER TABLE accounts ADD COLUMN spellbook_version TEXT NOT NULL DEFAULT '';");
  }
  if (!db.prepare('PRAGMA table_info(accounts)').all().some(column => column.name === 'spellbook2_decks_json')) {
    db.exec("ALTER TABLE accounts ADD COLUMN spellbook2_decks_json TEXT NOT NULL DEFAULT '{}';");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS account_deck_archives (
    id INTEGER PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    spellbook_version TEXT NOT NULL,
    decks_json TEXT NOT NULL,
    archived_at INTEGER NOT NULL
  );`);
  secureFiles();
  const dummySalt = randomBytes(16).toString('hex');
  const dummyHash = scryptSync(randomBytes(32).toString('hex'), dummySalt, 64);

  function currentAccount(row) {
    if (row.spellbook_version === SPELLBOOK_VERSION) return row;
    const empty = Object.fromEntries(ELEMENTS.map(element => [element, emptyDeckSlot(element, SPELLBOOK_1)]));
    db.exec('BEGIN IMMEDIATE;');
    try {
      const fresh = db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id);
      if (fresh.spellbook_version !== SPELLBOOK_VERSION) {
        db.prepare('INSERT INTO account_deck_archives (account_id, spellbook_version, decks_json, archived_at) VALUES (?, ?, ?, ?)')
          .run(fresh.id, fresh.spellbook_version || 'legacy', fresh.decks_json, now());
        db.prepare('UPDATE accounts SET decks_json = ?, spellbook_version = ?, spellbook2_decks_json = ?, revision = revision + 1 WHERE id = ?')
          .run(JSON.stringify(empty), SPELLBOOK_VERSION, JSON.stringify(emptySpellbookTwoDecks()), fresh.id);
      }
      db.exec('COMMIT;');
    } catch (error) { db.exec('ROLLBACK;'); throw error; }
    secureFiles();
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id);
  }
  function publicAccount(value) {
    const row = currentAccount(value);
    const archived = db.prepare('SELECT 1 FROM account_deck_archives WHERE account_id = ? LIMIT 1').get(row.id);
    const decks = JSON.parse(row.decks_json);
    if (!Object.hasOwn(decks, 'earth')) decks.earth = emptyDeckSlot('earth', SPELLBOOK_1);
    const second = JSON.parse(row.spellbook2_decks_json || '{}');
    const hasSecond = Object.keys(second).length > 0;
    const messages = new Set();
    const spellbook2Decks = Object.fromEntries(ELEMENTS.map(element => {
      const source = hasSecond ? second[element] : decks[element];
      try {
        const result = migrateToActiveDeck(source);
        if (result.removed.length) {
          messages.add('Your original decks remain backed up. Build and save current decks; retired cards have not been silently removed from a saved deck.');
          return [element, emptySpellbookTwoDecks()[element]];
        }
        if (result.replacements.length) messages.add('Fire-5 was replaced with Charred Blade; its quantity was kept. Review its 5-Mana cost before battling.');
        return [element, result.deck];
      } catch { return [element, emptySpellbookTwoDecks()[element]]; }
    }));
    const activeMigrationNotice = [...messages].join(' ');
    return { id: row.id, username: row.username, profile: { name: row.name, element: row.element }, decks, spellbook2Decks, revision: row.revision,
      spellbookVersion: SPELLBOOK_VERSION, activeCatalogVersion: 'named-spellbook-v1',
      ...(activeMigrationNotice ? { activeMigrationNotice, migrationMessage: activeMigrationNotice }
        : archived && Object.values(decks).some(deck => deck.entries.length === 0) ? { migrationMessage: 'The spellbook has changed. Previous decks were archived; build and save new decks of 1–30 slabs.' } : {}) };
  }
  function rowForToken(token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) fail(401, 'account_unauthorized', 'Log in to your Wizzy account again.');
    db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now());
    const row = db.prepare('SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?').get(digest(token), now());
    if (!row) fail(401, 'account_unauthorized', 'Your account session expired. Log in again.');
    return currentAccount(row);
  }
  function sessionFor(row) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now());
    db.prepare('INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').run(digest(token), row.id, now() + sessionTtlMs);
    secureFiles();
    return { token, account: publicAccount(row) };
  }
  return {
    storage: memory ? 'memory' : 'sqlite',
    async register(input) {
      const loginName = username(input?.username), secret = password(input?.password), data = savedData(input);
      if (db.prepare('SELECT id FROM accounts WHERE username = ?').get(loginName)) fail(409, 'username_taken', 'That username is already taken.');
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(secret, salt, 64);
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO accounts (id, username, password_salt, password_hash, name, element, decks_json, spellbook_version, spellbook2_decks_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, loginName, salt, hash.toString('hex'), data.profile.name, data.profile.element, JSON.stringify(data.decks), SPELLBOOK_VERSION, JSON.stringify(data.spellbook2Decks || Object.fromEntries(ELEMENTS.map(element => {
            const promoted = migrateToActiveDeck(data.decks[element]);
            return [element, promoted.removed.length ? emptySpellbookTwoDecks()[element] : promoted.deck];
          }))), now());
      } catch (error) {
        if (db.prepare('SELECT id FROM accounts WHERE username = ?').get(loginName)) fail(409, 'username_taken', 'That username is already taken.');
        throw error;
      }
      return sessionFor(db.prepare('SELECT * FROM accounts WHERE id = ?').get(id));
    },
    async login(input) {
      const loginName = username(input?.username, true), secret = password(input?.password, true);
      const row = db.prepare('SELECT * FROM accounts WHERE username = ?').get(loginName);
      const hash = await derive(secret, row?.password_salt || dummySalt, 64);
      const expected = row ? Buffer.from(row.password_hash, 'hex') : dummyHash;
      const matches = timingSafeEqual(hash, expected);
      if (!row || !matches) fail(401, 'invalid_credentials', 'Incorrect username or password.');
      return sessionFor(row);
    },
    get(token) { return publicAccount(rowForToken(token)); },
    update(token, input) {
      const row = rowForToken(token);
      if (!Number.isSafeInteger(input?.revision) || input.revision !== row.revision) fail(409, 'account_changed', 'Your saved decks changed on another screen. Load the latest account before saving.', publicAccount(row));
      const data = savedData(input, publicAccount(row));
      if (data.spellbook2Decks && input.activeCatalogVersion !== 'named-spellbook-v1') {
        const current = publicAccount(row);
        if (Object.values(current.spellbook2Decks).some(deck => deck.entries.length)
          && JSON.stringify(data.spellbook2Decks) !== JSON.stringify(current.spellbook2Decks)) {
          fail(409, 'catalog_update_required', 'Update Wizzy before replacing current spellbook decks. Your named decks have been preserved.', current);
        }
      }
      if (data.spellbook2Decks && row.spellbook2_decks_json !== JSON.stringify(data.spellbook2Decks)) {
        const prior = JSON.parse(row.spellbook2_decks_json || '{}');
        if (Object.values(prior).some(deck => deck?.entries?.some(entry => entry.spellId === 'Fire-5'))) {
          db.prepare('INSERT INTO account_deck_archives (account_id, spellbook_version, decks_json, archived_at) VALUES (?, ?, ?, ?)').run(row.id, 'named-spellbook-v1:original', JSON.stringify({ decks: JSON.parse(row.decks_json), spellbook2Decks: prior }), now());
        }
      }
      const result = db.prepare('UPDATE accounts SET name = ?, element = ?, decks_json = ?, spellbook2_decks_json = ?, revision = revision + 1 WHERE id = ? AND revision = ?')
        .run(data.profile.name, data.profile.element, JSON.stringify(data.decks), data.spellbook2Decks ? JSON.stringify(data.spellbook2Decks) : row.spellbook2_decks_json, row.id, input.revision);
      if (result.changes !== 1) fail(409, 'account_changed', 'Your account changed. Load the latest save before trying again.', publicAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id)));
      secureFiles();
      return publicAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id));
    },
    logout(token) { rowForToken(token); db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(digest(token)); secureFiles(); },
    close() { if (!closed) { closed = true; db.close(); secureFiles(); } },
  };
}
