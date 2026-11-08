import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeDeckSlot } from '../src/decks.js';
import { SPELLBOOK_VERSION } from '../src/spells.js';

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

function savedData(value) {
  if (value?.spellbookVersion !== undefined && value.spellbookVersion !== SPELLBOOK_VERSION) fail(400, 'spellbook_changed', 'Update Wizzy and build decks from the current spellbook.');
  const profile = value?.profile;
  if (!record(profile) || typeof profile.name !== 'string' || !['fire', 'water'].includes(profile.element)) fail(400, 'invalid_profile', 'Choose a wizard name and Fire or Water element.');
  const name = profile.name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 24) fail(400, 'invalid_profile', 'Wizard names must contain 1 to 24 characters.');
  if (!record(value?.decks)) fail(400, 'invalid_deck', 'Provide Fire and Water deck slots.');
  const decks = {};
  try {
    for (const element of ['fire', 'water']) {
      decks[element] = normalizeDeckSlot(value.decks[element]);
      if (decks[element].element !== element) throw new Error(`The ${element} deck has the wrong main element.`);
    }
  } catch (error) { fail(400, 'invalid_deck', error.message || 'A saved deck slot must be empty or contain 1–30 legal slabs.'); }
  return { profile: { name, element: profile.element }, decks };
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
    const empty = { fire: { element: 'fire', entries: [] }, water: { element: 'water', entries: [] } };
    db.exec('BEGIN IMMEDIATE;');
    try {
      const fresh = db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id);
      if (fresh.spellbook_version !== SPELLBOOK_VERSION) {
        db.prepare('INSERT INTO account_deck_archives (account_id, spellbook_version, decks_json, archived_at) VALUES (?, ?, ?, ?)')
          .run(fresh.id, fresh.spellbook_version || 'legacy', fresh.decks_json, now());
        db.prepare('UPDATE accounts SET decks_json = ?, spellbook_version = ?, revision = revision + 1 WHERE id = ?')
          .run(JSON.stringify(empty), SPELLBOOK_VERSION, fresh.id);
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
    return { id: row.id, username: row.username, profile: { name: row.name, element: row.element }, decks, revision: row.revision,
      spellbookVersion: SPELLBOOK_VERSION,
      ...(archived && Object.values(decks).some(deck => deck.entries.length === 0) ? { migrationMessage: 'The spellbook has changed. Previous decks were archived; build and save new decks of 1–30 slabs.' } : {}) };
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
        db.prepare('INSERT INTO accounts (id, username, password_salt, password_hash, name, element, decks_json, spellbook_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, loginName, salt, hash.toString('hex'), data.profile.name, data.profile.element, JSON.stringify(data.decks), SPELLBOOK_VERSION, now());
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
      const row = rowForToken(token), data = savedData(input);
      if (!Number.isSafeInteger(input?.revision) || input.revision !== row.revision) fail(409, 'account_changed', 'Your saved decks changed on another screen. Load the latest account before saving.', publicAccount(row));
      const result = db.prepare('UPDATE accounts SET name = ?, element = ?, decks_json = ?, revision = revision + 1 WHERE id = ? AND revision = ?')
        .run(data.profile.name, data.profile.element, JSON.stringify(data.decks), row.id, input.revision);
      if (result.changes !== 1) fail(409, 'account_changed', 'Your account changed. Load the latest save before trying again.', publicAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id)));
      secureFiles();
      return publicAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id));
    },
    logout(token) { rowForToken(token); db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(digest(token)); secureFiles(); },
    close() { if (!closed) { closed = true; db.close(); secureFiles(); } },
  };
}
