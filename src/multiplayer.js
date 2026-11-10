import { SPELLBOOK_VERSION } from './spells.js';
import { SAVE_VERSION, COMBAT_RULES_VERSION } from './game.js';
import { SPELLBOOK_1, ACTIVE_SPELLBOOK_ID, getDeckSpellbook, getSpellbook, isSpellbookId } from './spellbooks.js';

const ONLINE_STORAGE_KEY = 'wizzy.multiplayer.v2';
const ONLINE_STATUSES = new Set(['waiting', 'playing', 'finished']);
const onlineEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const onlineClone = value => structuredClone(value);
const onlineElementName = element => element === 'water' ? 'Water' : 'Fire';

function normalizeOnlineEndpoint(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (!/^https?:\/\//i.test(input)) throw new Error('Use the complete server address beginning with http:// or https://.');
  const endpoint = new URL(input);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Use a server address beginning with http:// or https://, without a password or query string.');
  }
  if (location.protocol === 'https:' && endpoint.protocol !== 'https:') {
    throw new Error('Use an HTTPS server from this page, or open Wizzy from your local game server.');
  }
  return endpoint.href.replace(/\/+$/, '');
}

/** Two-screen lobby and transport. All game decisions remain on the server. */
export function createMultiplayer({ root, getSavedDecks, getSelectedSpellbookId = () => ACTIVE_SPELLBOOK_ID, getProfile = () => ({ name: 'Wizzy', element: 'fire' }), getAccountSession = () => null, prepareAccountBattle = async () => {}, onEnterMatch = () => {}, onMatchUpdate = () => {}, onExit = () => {}, onStatus = () => {} }) {
  if (!root || typeof getSavedDecks !== 'function') throw new Error('Multiplayer needs a lobby root and saved decks.');
  root.classList.add('wz-online-root');
  root.hidden = true;
  let visible = false;
  let session = null;
  let entered = false;
  let endpoint = '';
  let name = String(getProfile()?.name || 'Wizzy').slice(0, 24);
  let element = getProfile()?.element === 'water' ? 'water' : 'fire';
  let roomInput = '';
  let notice = '';
  let noticeKind = 'info';
  let busy = false;
  let actionBusy = false;
  let actionQueue = Promise.resolve();
  let storageAvailable = true;
  let pollTimer;
  let pollInFlight = false;
  let generation = 0;
  let failures = 0;
  let connection = 'idle';

  const defaultEndpoint = () => {
    try {
      if (getAccountSession()?.endpoint) return normalizeOnlineEndpoint(getAccountSession().endpoint);
      if (globalThis.WIZZY_MULTIPLAYER_URL) return normalizeOnlineEndpoint(globalThis.WIZZY_MULTIPLAYER_URL);
      if (['http:', 'https:'].includes(location.protocol) && !location.hostname.endsWith('github.io') && !location.hostname.endsWith('.netlify.app')) return location.origin;
    } catch { /* The configuration field remains available for correction. */ }
    return '';
  };
  endpoint = defaultEndpoint();
  try {
    const saved = JSON.parse(localStorage.getItem(ONLINE_STORAGE_KEY) || 'null');
    const previousSettings = saved || JSON.parse(localStorage.getItem('wizzy.multiplayer.v1') || 'null');
    if(typeof previousSettings?.endpoint==='string'&&previousSettings.endpoint.trim())endpoint=normalizeOnlineEndpoint(previousSettings.endpoint);
    if (saved?.version === 2 && saved.spellbookVersion === SPELLBOOK_VERSION) {
      if (typeof saved.endpoint === 'string' && saved.endpoint.trim()) endpoint = normalizeOnlineEndpoint(saved.endpoint);
      const previous = saved.session;
      if (previous && /^[A-Z0-9]{8}$/.test(previous.code) && typeof previous.token === 'string' && previous.token.length >= 24 && previous.token.length <= 256
        && [0, 1].includes(previous.playerIndex) && ['fire', 'water'].includes(previous.element) && ONLINE_STATUSES.has(previous.status)
        && Number.isSafeInteger(previous.revision) && previous.revision >= 0 && endpoint) {
        const spellbookId = previous.spellbookId === undefined ? SPELLBOOK_1 : previous.spellbookId;
        if (spellbookId === ACTIVE_SPELLBOOK_ID) session = { code: previous.code, token: previous.token, playerIndex: previous.playerIndex, element: previous.element, revision: previous.revision, status: previous.status, spellbookId, state: null, endpoint, players: [] };
      }
    }
  } catch { storageAvailable = false; }

  function persistOnline() {
    try {
      const storedSession = session ? { code: session.code, token: session.token, playerIndex: session.playerIndex, element: session.element, revision: session.revision, status: session.status, spellbookId: session.spellbookId } : null;
      localStorage.setItem(ONLINE_STORAGE_KEY, JSON.stringify({ version: 2, spellbookVersion: SPELLBOOK_VERSION, endpoint: session?.endpoint || endpoint, session: storedSession }));
      storageAvailable = true;
    } catch { storageAvailable = false; }
  }
  function reportOnline(text, kind = 'info', notify = true) {
    notice = text;
    noticeKind = kind;
    if (notify) onStatus(text, { kind, connection, busy: busy || actionBusy });
    if (visible) renderOnline();
  }
  function stopPolling() { clearTimeout(pollTimer); pollTimer = undefined; }
  function schedulePoll(delay) {
    stopPolling();
    if (!session) return;
    pollTimer = setTimeout(() => refreshOnline(), delay ?? Math.min(10000, (document.hidden ? 3000 : 1000) * Math.max(1, failures)));
  }
  function requireEndpoint() {
    const normalized = normalizeOnlineEndpoint(endpoint);
    if (!normalized) throw new Error('Enter your game server address first. The setup guide explains how to run one.');
    return normalized;
  }
  async function requestOnline(base, pathname, { method = 'GET', body, token } = {}) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(`${base}${pathname}`, {
        method, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal: abort.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(data?.error || `The server returned ${response.status}.`);
        error.status = response.status;
        error.view = data?.view;
        error.code = data?.code;
        throw error;
      }
      if (!data || typeof data !== 'object') throw new Error('That address did not return a Wizzy game response. Check the server address.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The game server took too long to respond. Your room is kept; try reconnecting.');
      if (error instanceof TypeError) throw new Error('Cannot reach the game server. Check its address, internet connection, and allowed website origin.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function validView(view) {
    return view && /^[A-Z0-9]{8}$/.test(view.code) && [0, 1].includes(view.playerIndex) && ['fire', 'water'].includes(view.element)
      && isSpellbookId(view.spellbookId === undefined ? SPELLBOOK_1 : view.spellbookId)
      && Number.isSafeInteger(view.revision) && view.revision >= 0 && ONLINE_STATUSES.has(view.status)
      && (view.status === 'waiting' || (view.state && Array.isArray(view.state.players) && view.state.players.length === 2));
  }
  function applyOnlineView(view, { first = false, deliver = true } = {}) {
    if(view?.spellbookVersion!==SPELLBOOK_VERSION||view.combatRulesVersion!==COMBAT_RULES_VERSION||(view.state&&view.state.version!==SAVE_VERSION))throw new Error('Update and restart the game server for the persistent 5%-per-Ember damage rules before starting or joining a room.');
    if (!validView(view)) throw new Error('The server sent an incomplete battle response.');
    const spellbookId = view.spellbookId === undefined ? SPELLBOOK_1 : view.spellbookId;
    if (spellbookId !== ACTIVE_SPELLBOOK_ID) throw new Error('This room uses an archived collection. Start a new room with your current deck.');
    const ownDeck = view.state?.players?.[view.playerIndex]?.deckDefinition;
    if (ownDeck && getDeckSpellbook(ownDeck) !== spellbookId) throw new Error('The room and saved deck use different spellbooks.');
    if (!first && session && session.code === view.code && session.spellbookId !== spellbookId) throw new Error('The room changed spellbooks. Reconnect before continuing.');
    view = { ...view, spellbookId };
    if (!first && session && (view.code !== session.code || view.revision < session.revision)) return null;
    const previousRevision = session?.revision;
    const previousStatus = session?.status;
    const previousConnection = connection;
    const changed = first || previousRevision !== view.revision || previousStatus !== view.status || !session?.state !== !view.state || connection !== 'online';
    const hadError = noticeKind === 'error';
    const token = first ? view.token : session?.token;
    if (typeof token !== 'string' || token.length < 24) throw new Error('The server did not provide a private player session.');
    session = { ...onlineClone(view), token, endpoint: first ? endpoint : session.endpoint };
    connection = 'online';
    failures = 0;
    if (changed) persistOnline();
    if (noticeKind === 'error') { notice = ''; noticeKind = 'info'; }
    if (visible && (changed || hadError)) renderOnline();
    if (hadError || previousConnection === 'reconnecting') onStatus('Connected · your private hand is up to date.', { kind: 'info', connection, busy: busy || actionBusy });
    if (deliver && session.state && ['playing', 'finished'].includes(session.status)) {
      const snapshot = getSession();
      if (!entered && visible) { entered = true; onEnterMatch(snapshot); }
      else if (entered && (first || previousRevision !== session.revision || previousStatus !== session.status)) onMatchUpdate(snapshot);
    }
    return getSession();
  }
  function expireOnline(message) {
    const wasEntered = entered;
    stopPolling(); generation += 1; session = null; entered = false; connection = 'idle'; failures = 0;
    persistOnline(); reportOnline(message, 'error');
    if (wasEntered) onExit({ reason: 'expired', message });
  }
  async function refreshOnline({ deliver = true } = {}) {
    if (!session || pollInFlight || busy || actionBusy) { if (session) schedulePoll(); return null; }
    const currentGeneration = generation;
    const current = getSession();
    pollInFlight = true;
    try {
      const view = await requestOnline(current.endpoint, `/api/rooms/${current.code}`, { token: current.token });
      if (generation !== currentGeneration) return null;
      return applyOnlineView(view, { deliver });
    } catch (error) {
      if (generation !== currentGeneration) return null;
      if ([401, 404].includes(error.status)) expireOnline(error.status === 404 ? 'This room has expired or the server restarted. Create a new battle to play again.' : 'This player session is no longer valid. Create or join the room again.');
      else {
        failures += 1; connection = 'reconnecting';
        reportOnline(`${error.message} Reconnecting…`, 'error', failures === 1);
      }
      return null;
    } finally {
      pollInFlight = false;
      if (generation === currentGeneration && session) schedulePoll();
    }
  }
  function cleanName() { return String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Wizzy'; }
  async function prepareAccountRoom() {
    await prepareAccountBattle();
    const account = getAccountSession();
    if (!account?.token) return undefined;
    if (normalizeOnlineEndpoint(account.endpoint) !== endpoint) throw new Error('Use your account’s game server for this battle, or sign out to play as a guest elsewhere.');
    return getAccountSession()?.token;
  }
  async function createOnlineRoom() {
    if (busy || session) return;
    busy = true; stopPolling(); notice = ''; renderOnline();
    const currentGeneration = ++generation;
    try {
      endpoint = requireEndpoint();
      const spellbookId = getSelectedSpellbookId();
      getSpellbook(spellbookId);
      const accountToken = await prepareAccountRoom();
      if (generation !== currentGeneration) return;
      const deck = getSavedDecks(spellbookId)[element];
      const view = await requestOnline(endpoint, '/api/rooms', { method: 'POST', token: accountToken, body: { name: cleanName(), element, deck, spellbookId } });
      if (generation !== currentGeneration) return;
      entered = false;
      applyOnlineView(view, { first: true });
      reportOnline('Room created. Share the room code with the other wizard.');
    } catch (error) { if (generation === currentGeneration) reportOnline(error.message, 'error'); }
    finally { busy = false; if (visible) renderOnline(); if (session) schedulePoll(); }
  }
  async function joinOnlineRoom() {
    if (busy || session) return;
    busy = true; stopPolling(); notice = ''; renderOnline();
    const currentGeneration = ++generation;
    try {
      endpoint = requireEndpoint();
      const accountToken = await prepareAccountRoom();
      if (generation !== currentGeneration) return;
      const code = roomInput.replace(/[\s-]/g, '').toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(code)) throw new Error('Enter the eight-character room code shared by your friend.');
      roomInput = code;
      const info = await requestOnline(endpoint, `/api/rooms/${code}/info`);
      const spellbookId = info.spellbookId === undefined ? SPELLBOOK_1 : info.spellbookId;
      getSpellbook(spellbookId);
      if (spellbookId !== ACTIVE_SPELLBOOK_ID) throw new Error('This room uses an archived collection. Start a new room with your current deck.');
      if (spellbookId !== getSelectedSpellbookId()) throw new Error(`This room uses ${getSpellbook(spellbookId).label}. Choose it in the Deck builder before joining.`);
      const assignedElement = info.joiningElement;
      if (!['fire', 'water'].includes(assignedElement)) throw new Error('This room is no longer available to join.');
      const view = await requestOnline(endpoint, `/api/rooms/${code}/join`, { method: 'POST', token: accountToken, body: { name: cleanName(), deck: getSavedDecks(spellbookId)[assignedElement], spellbookId } });
      if (generation !== currentGeneration) return;
      entered = false;
      applyOnlineView(view, { first: true });
      if (visible) reportOnline(`Joined as the ${onlineElementName(assignedElement)} wizard.`);
    } catch (error) { if (generation === currentGeneration) reportOnline(error.message, 'error'); }
    finally { busy = false; if (visible) renderOnline(); if (session) schedulePoll(); }
  }
  async function performOnlineAction(type, payload = {}) {
    if (!isActive() || actionBusy || busy) return null;
    const current = getSession();
    const currentGeneration = generation;
    actionBusy = true; stopPolling();
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    try {
      const view = await requestOnline(current.endpoint, `/api/rooms/${current.code}/actions`, { method: 'POST', token: current.token, body: { type, payload, revision: current.revision, requestId } });
      if (generation !== currentGeneration) return null;
      return applyOnlineView(view);
    } catch (error) {
      if (generation !== currentGeneration) return null;
      if (error.status === 409) {
        if (error.view) applyOnlineView(error.view);
        reportOnline('The battle changed before that move arrived. Your screen is updated; choose your move again.', 'info');
      } else if ([401, 404].includes(error.status)) expireOnline(error.status === 404 ? 'This room has expired or the server restarted.' : 'Your player session is no longer valid.');
      else reportOnline(error.message, 'error');
      return null;
    } finally { actionBusy = false; if (visible) renderOnline(); if (generation === currentGeneration && session) schedulePoll(); }
  }
  function action(type, payload = {}) {
    const queuedGeneration = generation;
    const run = () => generation === queuedGeneration ? performOnlineAction(type, payload) : null;
    const next = actionQueue.then(run, run);
    actionQueue = next.catch(() => null);
    return next;
  }
  function getSession() { return session ? onlineClone(session) : null; }
  function isActive() { return Boolean(session?.state && ['playing', 'finished'].includes(session.status)); }
  function hide() { visible = false; root.hidden = true; }
  function show() {
    if (!session) {
      const account = getAccountSession();
      if (account?.endpoint) {
        endpoint = normalizeOnlineEndpoint(account.endpoint);
        name = String(account.account?.profile?.name || getProfile()?.name || 'Wizzy').slice(0, 24);
        element = account.account?.profile?.element === 'water' ? 'water' : 'fire';
      }
    }
    visible = true; root.hidden = false; renderOnline();
    root.querySelector('h1')?.focus({ preventScroll: true });
    if (session) refreshOnline();
  }
  async function resume() {
    if (!session) { show(); return null; }
    if (session.state) { entered = true; const snapshot = getSession(); onEnterMatch(snapshot); schedulePoll(); return snapshot; }
    return refreshOnline();
  }
  function leave() {
    generation += 1; stopPolling(); session = null; entered = false; connection = 'idle'; failures = 0; busy = false; actionBusy = false;
    persistOnline(); notice = 'This device left the battle. You can create or join another room.'; noticeKind = 'info';
    if (visible) renderOnline();
  }
  function renderOnline() {
    const focus = root.contains(document.activeElement) ? document.activeElement?.dataset.onlineFocus : null;
    const position = document.activeElement?.tagName === 'INPUT' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const active = Boolean(session);
    const bookLabel = getSpellbook(session?.spellbookId || getSelectedSpellbookId()).label;
    const phase = session?.status === 'waiting' ? 'WAITING FOR A WIZARD' : session?.status === 'finished' ? 'DUEL COMPLETE' : 'CONNECTED BATTLE';
    root.innerHTML = `<section class="wz-online-phone"><header class="wz-online-header"><button type="button" data-online-action="back" aria-label="Back to Seattle map">‹</button><div><p>${onlineEscape(bookLabel)} · TWO SCREENS</p><h1 tabindex="-1">Battle Portal</h1></div><span class="wz-online-sigil" aria-hidden="true">✦</span></header><div class="wz-online-scroll">${active ? `<section class="wz-online-room"><p class="wz-online-eyebrow">${phase}</p><h2>${session.status === 'waiting' ? 'Your room is ready.' : 'Your duel is saved.'}</h2><p>Share this code with your friend:</p><code class="wz-online-code" aria-label="Room code">${onlineEscape(session.code)}</code><button class="wz-online-secondary" data-online-action="copy">Copy room code</button><div class="wz-online-seats"><span class="wz-online-seat wz-online-${session.element}"><i aria-hidden="true">${session.element === 'fire' ? '♨' : '≈'}</i><strong>${onlineElementName(session.element)}</strong><small>Your saved deck</small></span><span class="wz-online-versus">VS</span><span class="wz-online-seat wz-online-${session.element === 'fire' ? 'water' : 'fire'}"><i aria-hidden="true">${session.element === 'fire' ? '≈' : '♨'}</i><strong>${onlineElementName(session.element === 'fire' ? 'water' : 'fire')}</strong><small>${session.status === 'waiting' ? 'Waiting for friend' : 'Friend connected'}</small></span></div><p class="wz-online-room-hint">${session.status === 'waiting' ? 'The other phone opens Battle Portal, enters the same server address, then joins with this code. The battle begins when both players are ready.' : 'Resume on this phone to see your own hand and continue the battle.'}</p>${session.state ? '<button class="wz-online-primary" data-online-action="resume">Resume battle →</button>' : '<button class="wz-online-secondary" data-online-action="refresh">Check connection</button>'}<button class="wz-online-plain" data-online-action="leave">Leave this session</button><p class="wz-online-small">Room progress is kept while this server is running. Keep this tab or return on the same browser to reconnect.</p></section>` : `<section class="wz-online-intro"><span aria-hidden="true">✧</span><h2>A little friendly rivalry.</h2><p>Create a room and share its code. Each wizard plays on their own screen with a private hand.</p></section><div class="wz-online-connection"><label for="wz-online-endpoint">Game server address</label><input id="wz-online-endpoint" data-online-field="endpoint" data-online-focus="endpoint" type="url" inputmode="url" autocomplete="url" spellcheck="false" value="${onlineEscape(endpoint)}" placeholder="https://your-wizzy-server.example"><p>Use the same server address on both phones.</p><label for="wz-online-name">Your wizard name</label><input id="wz-online-name" data-online-field="name" data-online-focus="name" maxlength="24" autocomplete="nickname" value="${onlineEscape(name)}"></div><section class="wz-online-panel"><p class="wz-online-eyebrow">HOST A DUEL</p><h2>Create a battle</h2><div class="wz-online-elements" role="group" aria-label="Choose your battle element">${['fire', 'water'].map(id => `<button type="button" class="wz-online-element wz-online-${id}" data-online-action="element" data-online-element="${id}" aria-pressed="${element === id}">${id === 'fire' ? '♨' : '≈'} ${onlineElementName(id)}</button>`).join('')}</div><p>Your saved ${onlineEscape(bookLabel)} ${onlineElementName(element)} deck will be used. Your friend joins as ${onlineElementName(element === 'fire' ? 'water' : 'fire')}.</p><button class="wz-online-primary" data-online-action="create" ${busy ? 'disabled' : ''}>${busy ? 'Connecting…' : 'Create battle →'}</button></section><section class="wz-online-panel"><p class="wz-online-eyebrow">JOIN A FRIEND</p><h2>Join a battle</h2><form class="wz-online-join-form"><label class="wz-online-label" for="wz-online-room-code">Room code</label><div class="wz-online-join-row"><input id="wz-online-room-code" data-online-field="code" data-online-focus="code" maxlength="8" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="8-CHAR CODE" value="${onlineEscape(roomInput)}" required pattern="[A-Za-z0-9]{8}"><button class="wz-online-primary" type="submit" ${busy ? 'disabled' : ''}>Join →</button></div></form><p>Joining uses the matching ${onlineEscape(bookLabel)} deck. Build and save your deck in the Deck builder before joining.</p></section><details class="wz-online-help"><summary>Setting up the first two-phone test</summary><p>A game server connects both screens. For a nearby test, open Wizzy from your Mac’s multiplayer server on the same Wi-Fi. For remote play, use a hosted HTTPS server.</p><a href="https://github.com/carsahhex-byte/Wizzy/blob/codex/wizzy-hosting/docs/multiplayer.md" target="_blank" rel="noopener noreferrer">Open the multiplayer setup guide ↗</a></details>`}<div class="wz-online-status wz-online-status-${noticeKind}" role="status" aria-live="polite">${onlineEscape(notice || (connection === 'reconnecting' ? 'Reconnecting to the game server…' : active ? (connection === 'online' ? 'Connected · each player keeps a private hand.' : 'Checking your saved session…') : endpoint ? 'Ready to connect to your game server.' : 'Enter a server address to connect two phones.'))}</div></div><footer class="wz-online-footer"><span>${active ? `ROOM ${onlineEscape(session.code)}` : 'FIRE VS WATER · TWO-PLAYER TEST'}</span><span>${storageAvailable ? 'PRIVATE SESSION ON THIS DEVICE' : 'KEEP THIS TAB OPEN · SAVING UNAVAILABLE'}</span></footer></section>`;
    if (focus) {
      const target = [...root.querySelectorAll('[data-online-focus]')].find(node => node.dataset.onlineFocus === focus);
      target?.focus({ preventScroll: true });
      if (position && target?.setSelectionRange) { try { target.setSelectionRange(...position); } catch { /* URL inputs need no selection restoration. */ } }
    }
  }
  root.addEventListener('input', event => {
    const field = event.target.dataset.onlineField;
    if (field === 'endpoint') endpoint = event.target.value;
    else if (field === 'name') name = event.target.value;
    else if (field === 'code') roomInput = event.target.value.toUpperCase();
  });
  root.addEventListener('submit', event => {
    if (!event.target.matches('.wz-online-join-form')) return;
    event.preventDefault(); joinOnlineRoom();
  });
  root.addEventListener('change', event => {
    if (event.target.dataset.onlineField !== 'endpoint') return;
    try { endpoint = normalizeOnlineEndpoint(event.target.value); persistOnline(); }
    catch { /* Connection actions show the complete address error when needed. */ }
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-online-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    switch (button.dataset.onlineAction) {
      case 'back': hide(); onExit({ reason: 'back' }); break;
      case 'element': element = button.dataset.onlineElement; renderOnline(); break;
      case 'create': await createOnlineRoom(); break;
      case 'resume': await resume(); break;
      case 'refresh': await refreshOnline(); break;
      case 'leave': leave(); break;
      case 'copy':
        try { await navigator.clipboard.writeText(session.code); reportOnline('Room code copied. Share it with the other wizard.'); }
        catch {
          const code = root.querySelector('.wz-online-code');
          const selection = window.getSelection();
          if (code && selection) { const range = document.createRange(); range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range); }
          reportOnline(`Room code: ${session?.code || ''}. Hold the code to copy it.`);
        }
        break;
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session) schedulePoll(0); });
  window.addEventListener('online', () => { if (session) schedulePoll(0); });
  return { show, hide, getSession, isActive, action, leave, resume };
}
