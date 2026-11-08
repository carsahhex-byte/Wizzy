import { validateDeckSlot, normalizeDeckSlot } from './decks.js';
import { SPELLBOOK_VERSION } from './spells.js';

const ACCOUNT_STORAGE_KEY = 'wizzy.account.v1';
const accountEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cloneAccount = value => structuredClone(value);

function accountEndpoint(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (!/^https?:\/\//i.test(input)) throw new Error('Use the complete server address beginning with http:// or https://.');
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a server address without a password, query string, or fragment.');
  }
  if (location.protocol === 'https:' && url.protocol !== 'https:') throw new Error('Use an HTTPS account server, or open Wizzy from your local game server.');
  return url.href.replace(/\/+$/, '');
}

function accountData(value) {
  if (value?.spellbookVersion !== undefined && value.spellbookVersion !== SPELLBOOK_VERSION) throw new Error('This account uses an older spellbook. Update the game server before syncing.');
  const profile = value?.profile;
  if (!profile || !['fire', 'water'].includes(profile.element) || typeof profile.name !== 'string') throw new Error('The account profile is incomplete.');
  const name = profile.name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 24) throw new Error('A wizard name must contain 1 to 24 characters.');
  const decks = value?.decks;
  if (!decks || !validateDeckSlot(decks.fire) || !validateDeckSlot(decks.water) || decks.fire.element !== 'fire' || decks.water.element !== 'water') throw new Error('Each saved deck must be empty or contain 30 legal slabs of its element and Fate.');
  return { spellbookVersion: SPELLBOOK_VERSION, profile: { name, element: profile.element }, decks: { fire: normalizeDeckSlot(decks.fire), water: normalizeDeckSlot(decks.water) } };
}

function fullAccount(value) {
  if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 128 || typeof value.username !== 'string' || !/^[a-z0-9_-]{3,24}$/i.test(value.username) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('The server sent an incomplete account response.');
  if (value.spellbookVersion !== SPELLBOOK_VERSION) throw new Error('Update the game server to the new Master Spellbook before signing in.');
  return { id: value.id, username: value.username, revision: value.revision, ...accountData(value),
    ...(typeof value.migrationMessage === 'string' ? { migrationMessage: value.migrationMessage.slice(0, 300) } : {}) };
}

const accountDataSignature = value => JSON.stringify(accountData(value));

/** Private friend accounts with explicit server persistence and conflict handling. */
export function createAccounts({ root, getLocalData, onAccountData = () => {}, onSignedOut = () => {}, onExit = () => {}, onStatus = () => {} }) {
  if (!root || typeof getLocalData !== 'function') throw new Error('Accounts need a screen and local profile/decks.');
  root.classList.add('wz-account-root');
  root.hidden = true;
  let visible = false;
  let session = null;
  let verified = false;
  let endpoint = '';
  let username = '';
  let mode = 'login';
  let busy = false;
  let syncing = false;
  let notice = '';
  let noticeKind = 'info';
  let storageAvailable = true;
  let lastSyncedAt = null;
  let pendingData = null;
  let conflict = false;
  let generation = 0;
  let saveSequence = 0;
  let latestSave = 0;
  let saveQueue = Promise.resolve();
  let queuedSaves = 0;
  let resumePromise = null;

  try {
    if (globalThis.WIZZY_MULTIPLAYER_URL) endpoint = accountEndpoint(globalThis.WIZZY_MULTIPLAYER_URL);
    else {
      const multiplayer = JSON.parse(localStorage.getItem('wizzy.multiplayer.v2') || localStorage.getItem('wizzy.multiplayer.v1') || 'null');
      if (multiplayer?.endpoint) endpoint = accountEndpoint(multiplayer.endpoint);
      else if (['http:', 'https:'].includes(location.protocol) && !location.hostname.endsWith('github.io')) endpoint = location.origin;
    }
    const stored = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || 'null');
    if (stored?.version === 1) {
      if (stored.endpoint) endpoint = accountEndpoint(stored.endpoint);
      if (stored.session && typeof stored.session.token === 'string' && stored.session.token.length >= 24 && stored.session.token.length <= 256 && endpoint) {
        const cached = stored.session.account;
        const previousSpellbook = cached?.spellbookVersion !== SPELLBOOK_VERSION;
        const cachedAccount = previousSpellbook ? { ...cached, spellbookVersion: SPELLBOOK_VERSION,
          decks: { fire: { element: 'fire', entries: [] }, water: { element: 'water', entries: [] } } } : cached;
        session = { token: stored.session.token, endpoint, account: fullAccount(cachedAccount) };
        username = session.account.username;
        if (stored.pendingData && !previousSpellbook) pendingData = accountData(stored.pendingData);
        conflict = Boolean(stored.conflict && pendingData);
        lastSyncedAt = Number.isFinite(stored.lastSyncedAt) ? stored.lastSyncedAt : null;
      }
    }
  } catch {
    session = null; verified = false; pendingData = null; conflict = false;
    notice = 'The saved account could not be read. Sign in again; your local decks remain available.';
    noticeKind = 'error';
  }

  function persistAccount() {
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ version: 1, endpoint: session?.endpoint || endpoint, session, pendingData, conflict, lastSyncedAt }));
      storageAvailable = true;
    } catch { storageAvailable = false; }
  }
  function notifyAccountStatus() {
    onStatus(notice, { kind: noticeKind, signedIn: verified && Boolean(session), busy: busy || syncing, unsynced: Boolean(pendingData), username: session?.account.username || '' });
  }
  function reportAccount(text, kind = 'info') {
    notice = text; noticeKind = kind;
    notifyAccountStatus();
    if (visible) renderAccount();
  }
  function getSession() { return verified && session ? cloneAccount(session) : null; }
  function isSignedIn() { return Boolean(verified && session); }
  function hasSession() { return Boolean(session); }
  function getAuth(value) {
    try { return verified && session && accountEndpoint(value) === session.endpoint ? session.token : null; }
    catch { return null; }
  }
  function applyAccount(account, source) {
    session.account = fullAccount(account);
    verified = true;
    lastSyncedAt = Date.now();
    username = session.account.username;
    persistAccount();
    onAccountData(cloneAccount(session.account), { source, pendingLocalData: pendingData ? cloneAccount(pendingData) : null });
  }
  async function requestAccount(base, pathname, { method = 'GET', body, token } = {}) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(`${base}${pathname}`, { method, credentials: 'omit', cache: 'no-store', signal: abort.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(result?.error || `The account server returned ${response.status}.`);
        error.status = response.status; error.code = result?.code; error.account = result?.account;
        throw error;
      }
      if (!result || typeof result !== 'object') throw new Error('That address did not return a Wizzy account response. Check your server address.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The account server took too long to respond. Your device edits are kept; try Sync now.');
      if (error instanceof TypeError) throw new Error('Cannot reach the account server. Check its address, connection, and allowed website origin.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function clearAccount(reason = 'signed-out') {
    const oldAccount = session?.account;
    generation += 1; saveSequence += 1; latestSave = saveSequence;
    session = null; verified = false; pendingData = null; conflict = false; syncing = false; lastSyncedAt = null;
    persistAccount();
    onSignedOut({ reason, accountId: oldAccount?.id || null });
  }
  async function authenticateAccount(register) {
    if (busy || session) return;
    const form = root.querySelector('.wz-account-form');
    if (!form?.reportValidity()) return;
    const data = new FormData(form);
    let password = String(data.get('password') || '');
    username = String(data.get('username') || '').trim();
    try {
      endpoint = accountEndpoint(String(data.get('endpoint') || ''));
      if (!endpoint) throw new Error('Enter your game server address. The setup guide explains how to run one.');
      if (!/^[a-z0-9_-]{3,24}$/i.test(username)) throw new Error('Use 3 to 24 letters, numbers, underscores, or hyphens for your username.');
      if (password.length < 10 || password.length > 128) throw new Error('Use a password containing 10 to 128 characters.');
      const local = register ? accountData(getLocalData()) : null;
      busy = true; generation += 1; const current = generation;
      persistAccount(); reportAccount(register ? 'Creating your account…' : 'Signing in…');
      const response = await requestAccount(endpoint, register ? '/api/accounts/register' : '/api/accounts/login', { method: 'POST', body: { username, password, ...(register ? local : {}) } });
      password = '';
      if (current !== generation) return;
      if (typeof response.token !== 'string' || response.token.length < 24 || response.token.length > 256) throw new Error('The server did not return a private account session.');
      session = { token: response.token, endpoint, account: fullAccount(response.account) };
      pendingData = null; conflict = false;
      applyAccount(session.account, register ? 'register' : 'login');
      reportAccount(session.account.migrationMessage || (register ? 'Account created. Build and save your Fire and Water decks in the workshop.' : 'Signed in. Your profile and saved decks are loaded.'));
    } catch (error) { reportAccount(error.message || 'Sign-in could not be completed.', 'error'); }
    finally { password = ''; busy = false; notifyAccountStatus(); if (visible) renderAccount(); }
  }

  function save(data) {
    let payload;
    try { payload = accountData(data); }
    catch (error) { reportAccount(error.message, 'error'); return Promise.reject(error); }
    if (!session) {
      const error = new Error('Sign in before saving decks to your account. Your local decks are still saved on this device.');
      reportAccount(error.message, 'error'); return Promise.reject(error);
    }
    if (!verified) {
      pendingData = payload;
      persistAccount();
      const error = new Error('Your account connection has not been verified. These edits are kept on this device; reconnect and use Sync now to save them to your account.');
      reportAccount(error.message, 'error');
      return Promise.reject(error);
    }
    pendingData = payload;
    const id = ++saveSequence; latestSave = id;
    const currentGeneration = generation;
    persistAccount();
    queuedSaves += 1;
    const task = saveQueue.catch(() => null).then(async () => {
      if (generation !== currentGeneration || !session || !verified) return null;
      if (conflict) {
        const error = new Error('Your account changed on another screen. Resolve the saved-deck choice in Account before syncing these edits.');
        reportAccount(error.message, 'error'); throw error;
      }
      syncing = true; reportAccount('Saving your profile and decks to your account…');
      const snapshot = cloneAccount(session);
      try {
        const response = await requestAccount(snapshot.endpoint, '/api/accounts/me', { method: 'PUT', token: snapshot.token, body: { ...payload, revision: snapshot.account.revision } });
        if (generation !== currentGeneration || !session) return null;
        const account = fullAccount(response.account);
        session.account = account; verified = true; lastSyncedAt = Date.now();
        if (id === latestSave) { pendingData = null; conflict = false; applyAccount(account, 'save'); reportAccount('Account saved. Your decks are available on your other devices.'); }
        else persistAccount();
        return cloneAccount(account);
      } catch (error) {
        if (generation !== currentGeneration) return null;
        if (error.status === 401) {
          clearAccount('expired'); reportAccount('Your account session expired. Sign in again to sync your decks.', 'error');
        } else if (error.status === 409 && session) {
          let account = error.account;
          if (!account) account = (await requestAccount(snapshot.endpoint, '/api/accounts/me', { token: snapshot.token })).account;
          conflict = true;
          applyAccount(fullAccount(account), 'conflict');
          reportAccount('This account changed on another screen. The latest saved decks are loaded. Your pending edits are kept below so you can choose which version to save.', 'error');
        } else {
          persistAccount(); reportAccount(`${error.message || 'Account saving failed.'} Your edits remain on this device.`, 'error');
        }
        throw error;
      } finally { syncing = false; notifyAccountStatus(); if (visible) renderAccount(); }
    });
    const completed = task.finally(() => { queuedSaves -= 1; });
    saveQueue = completed;
    return completed;
  }

  function resume() {
    if (!session) return Promise.resolve(null);
    if (resumePromise) return resumePromise;
    if (busy || syncing || queuedSaves) return saveQueue.catch(() => null).then(() => getSession());
    const snapshot = cloneAccount(session);
    const current = generation;
    reportAccount('Checking your saved account…');
    resumePromise = (async () => {
      try {
        const response = await requestAccount(snapshot.endpoint, '/api/accounts/me', { token: snapshot.token });
        if (generation !== current || !session) return null;
        const account = fullAccount(response.account);
        verified = true;
        if (pendingData) {
          if (accountDataSignature(account) === accountDataSignature(pendingData)) { pendingData = null; conflict = false; }
          else if (!conflict && account.revision === snapshot.account.revision) {
            session.account = account;
            await save(pendingData);
            return getSession();
          } else {
            conflict = true; applyAccount(account, 'conflict');
            reportAccount('This account changed on another screen. Latest decks are loaded; choose whether to keep them or save your pending edits.', 'error');
            return getSession();
          }
        }
        applyAccount(account, 'resume');
        reportAccount(session.account.migrationMessage || 'Connected. Your account decks are up to date.');
        return getSession();
      } catch (error) {
        if (generation !== current) return null;
        if (error.status === 401) { clearAccount('expired'); reportAccount('Your account session expired. Sign in again.', 'error'); }
        else reportAccount(`${error.message || 'Your account could not be checked.'} Device edits remain available.`, 'error');
        return null;
      } finally { resumePromise = null; if (visible) renderAccount(); }
    })();
    return resumePromise;
  }
  async function signOut() {
    if (busy) return;
    const snapshot = session ? cloneAccount(session) : null;
    busy = true;
    reportAccount('Signing out…');
    let revoked = true;
    try { if (snapshot) await requestAccount(snapshot.endpoint, '/api/accounts/logout', { method: 'POST', body: {}, token: snapshot.token }); }
    catch { revoked = false; }
    finally {
      clearAccount('signed-out'); busy = false;
      reportAccount(revoked ? 'Signed out. Your decks remain stored in your account.' : 'Signed out on this device. The server could not confirm session revocation.', revoked ? 'info' : 'error');
    }
  }
  async function flush() {
    if (!session || !verified) return null;
    try { await saveQueue; } catch { /* Retry the retained latest edits below. */ }
    if (!session || !verified) throw new Error('Sign in again before starting an account battle.');
    if (conflict) throw new Error('Resolve the saved-deck choice in Account before starting a battle.');
    if (pendingData) await save(cloneAccount(pendingData));
    return getSession();
  }
  function show() {
    visible = true; root.hidden = false; renderAccount(); root.querySelector('h1')?.focus({ preventScroll: true });
    if (session) void resume();
  }
  function hide() { visible = false; root.hidden = true; }
  function renderAccount() {
    const previousScroll = root.querySelector('.wz-account-scroll')?.scrollTop || 0;
    const focus = root.contains(document.activeElement) ? document.activeElement?.dataset.accountFocus : null;
    const active = Boolean(session);
    const account = session?.account;
    root.innerHTML = `<section class="wz-account-phone"><header class="wz-account-header"><button type="button" data-account-action="back" aria-label="Back to Seattle map">‹</button><div><p>YOUR WIZZY · EVERY SCREEN</p><h1 tabindex="-1">Wizard Account</h1></div><span aria-hidden="true">✧</span></header><div class="wz-account-scroll">${active ? `<section class="wz-account-identity"><span class="wz-account-seal" aria-hidden="true">✦</span><p class="wz-account-eyebrow">${verified ? 'SIGNED IN' : 'SAVED SESSION · CHECKING CONNECTION'}</p><h2>${accountEscape(account.username)}</h2><p>${accountEscape(account.profile.name)} · ${account.profile.element === 'water' ? 'Water' : 'Fire'} wizard</p><div class="wz-account-deck-pair"><div><span aria-hidden="true">♨</span><strong>Fire deck</strong><small>${account.decks.fire.entries.length ? '30 slabs saved' : 'Build a deck'}</small></div><div><span aria-hidden="true">≈</span><strong>Water deck</strong><small>${account.decks.water.entries.length ? '30 slabs saved' : 'Build a deck'}</small></div></div><p class="wz-account-copy">Your account uses the same deck editor and battle interface on every device. Build a 30-slab deck using one element and Fate, with no limit on copies of a spell. Save it in the workshop to sync it here.</p><div class="wz-account-sync-meta"><span>${pendingData ? 'DEVICE EDITS WAITING TO SYNC' : verified ? 'ACCOUNT DECKS UP TO DATE' : 'RECONNECT TO VERIFY SAVED DECKS'}</span><small>${lastSyncedAt ? `Last connected ${accountEscape(new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}` : 'No successful sync on this device yet'}</small></div><button class="wz-account-primary" type="button" data-account-action="sync" ${busy || syncing ? 'disabled' : ''}>${syncing ? 'Saving…' : 'Sync now'}</button><button class="wz-account-secondary" type="button" data-account-action="deck" ${busy ? 'disabled' : ''}>Open deck workshop →</button><button class="wz-account-plain" type="button" data-account-action="signout" ${busy ? 'disabled' : ''}>Sign out</button></section>${conflict && pendingData ? `<section class="wz-account-conflict" role="alert"><h2>Choose your saved version</h2><p>The latest server decks are currently loaded. Your pending device edits have been kept so nothing is silently overwritten.</p><button class="wz-account-primary" type="button" data-account-action="keep-latest" ${busy || syncing ? 'disabled' : ''}>Keep latest account decks</button><button class="wz-account-secondary" type="button" data-account-action="save-pending" ${busy || syncing ? 'disabled' : ''}>Save my pending device edits instead</button></section>` : ''}` : `<section class="wz-account-intro"><span aria-hidden="true">✦</span><h2>Your magic travels with you.</h2><p>Sign in on another phone to load your wizard and saved Fire and Water decks.</p></section><div class="wz-account-tabs" role="group" aria-label="Account action"><button type="button" data-account-action="login-mode" aria-pressed="${mode === 'login'}">Sign in</button><button type="button" data-account-action="register-mode" aria-pressed="${mode === 'register'}">Create account</button></div><form class="wz-account-form"><label for="wz-account-endpoint">Game server address</label><input id="wz-account-endpoint" data-account-focus="endpoint" name="endpoint" type="url" inputmode="url" autocomplete="url" value="${accountEscape(endpoint)}" placeholder="https://your-wizzy-server.example" required><p class="wz-account-field-note">Use the same account server on every device.</p><label for="wz-account-username">Username</label><input id="wz-account-username" data-account-focus="username" name="username" value="${accountEscape(username)}" minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]{3,24}" autocapitalize="none" spellcheck="false" autocomplete="username" required><p class="wz-account-field-note">3–24 letters, numbers, underscores, or hyphens.</p><label for="wz-account-password">Password</label><input id="wz-account-password" data-account-focus="password" name="password" type="password" minlength="10" maxlength="128" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required><p class="wz-account-field-note">10–128 characters. Use a password unique to Wizzy.</p>${mode === 'register' ? '<p class="wz-account-register-note">Creating an account saves your wizard profile and any completed decks. Empty deck slots are allowed; incomplete drafts stay on this device until you save them.</p>' : ''}<button class="wz-account-primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Connecting…' : mode === 'register' ? 'Create account →' : 'Sign in →'}</button></form><details class="wz-account-help"><summary>Setting up accounts for your friends</summary><p>The account server stores your profile and saved decks. It needs a persistent database so accounts survive server restarts. Local guest play is still available without signing in.</p><a href="https://github.com/carsahhex-byte/Wizzy/blob/codex/wizzy-hosting/docs/multiplayer.md" target="_blank" rel="noopener noreferrer">Open the account and multiplayer setup guide ↗</a></details>`}<div class="wz-account-status wz-account-status-${noticeKind}" role="status" aria-live="polite">${accountEscape(notice || (session ? 'Checking your account connection…' : endpoint ? 'Ready to connect to your account server.' : 'Enter a running game server address to create an account or sign in.'))}</div></div><footer class="wz-account-footer"><span>${storageAvailable ? 'PASSWORD NOT KEPT IN APP STORAGE' : 'DEVICE SESSION SAVING UNAVAILABLE'}</span><span>PRIVATE FRIENDS PLAYTEST</span></footer></section>`;
    const scroll = root.querySelector('.wz-account-scroll');
    if (scroll) scroll.scrollTop = previousScroll;
    if (focus) root.querySelector(`[data-account-focus="${focus}"]`)?.focus({ preventScroll: true });
  }
  root.addEventListener('submit', event => {
    if (!event.target.matches('.wz-account-form')) return;
    event.preventDefault(); void authenticateAccount(mode === 'register');
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-account-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    switch (button.dataset.accountAction) {
      case 'back': onExit({ screen: 'home' }); break;
      case 'deck': onExit({ screen: 'deck' }); break;
      case 'login-mode': mode = 'login'; renderAccount(); break;
      case 'register-mode': mode = 'register'; renderAccount(); break;
      case 'signout': void signOut(); break;
      case 'sync': void resume(); break;
      case 'keep-latest': pendingData = null; conflict = false; persistAccount(); if (session && verified) onAccountData(cloneAccount(session.account), { source: 'conflict-resolved' }); reportAccount('Latest account decks kept.'); break;
      case 'save-pending': { const pending = pendingData ? cloneAccount(pendingData) : null; conflict = false; persistAccount(); if (pending) void save(pending).catch(() => {}); break; }
    }
  });
  root.addEventListener('input', event => {
    if (event.target.name === 'endpoint') endpoint = event.target.value;
    if (event.target.name === 'username') username = event.target.value;
  });
  root.addEventListener('change', event => {
    if (event.target.name === 'endpoint') {
      try { endpoint = accountEndpoint(event.target.value); persistAccount(); }
      catch (error) { reportAccount(error.message, 'error'); }
    }
  });
  return { show, hide, getSession, getAuth, isSignedIn, hasSession, save, flush, signOut, resume };
}
