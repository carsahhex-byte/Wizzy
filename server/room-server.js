import http from 'node:http';
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  createGame, assertGame, getActingPlayerIndex, selectCard, castSelected,
  castFateSelected, skipFate, rollDice, resolveSpell, endTurn, beginRefresh,
  toggleRefreshCard, confirmRefresh, cancelStagedAction, rollInitiative, OPENING_HAND_SIZE,
  activateEnhancement, rollEnhancement, activateAura, COMBAT_RULES_VERSION,
} from '../src/game.js';
import { normalizeDeck } from '../src/decks.js';
import { SPELLBOOK_VERSION } from '../src/spells.js';
import { SPELLBOOK_1, SPELLBOOK_2, getDeckSpellbook, isSpellbookId } from '../src/spellbooks.js';
import { ELEMENTS, ELEMENT_INFO } from '../src/elements.js';
import { createAccountStore, AccountError } from './account-store.js';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../dist');
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_ORIGINS = ['https://carsahhex-byte.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

class RoomError extends Error {
  constructor(status, code, message, view) { super(message); Object.assign(this, { status, code, view }); }
}

const fail = (status, code, message, view) => { throw new RoomError(status, code, message, view); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const tokenHash = token => createHash('sha256').update(token).digest();
const cleanCode = value => String(value).replace(/[ -]/g, '').toUpperCase();
const secureRoll = () => (randomInt(6) + .5) / 6;
const legacyJoiningElement = room => room.players[room.hostIndex]?.deck.element === 'fire' ? 'water' : 'fire';

function requireCombatRules(body) {
  if (body.combatRulesVersion !== undefined && body.combatRulesVersion !== COMBAT_RULES_VERSION) {
    fail(409, 'combat_rules_mismatch', 'Update Wizzy and restart the game server so both use the same Fire, Water and Earth battle rules.');
  }
}

function playerName(value) {
  if (typeof value !== 'string') fail(400, 'invalid_name', 'Enter a wizard name.');
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 24) fail(400, 'invalid_name', 'Wizard names must contain 1 to 24 characters.');
  return name;
}

function requestedSpellbook(body, account, allowArchivedSpellbook = false) {
  const id = body.spellbookId ?? (account ? (allowArchivedSpellbook ? SPELLBOOK_1 : SPELLBOOK_2) : getDeckSpellbook(body.deck));
  if (!allowArchivedSpellbook && id !== SPELLBOOK_2) fail(400, 'archived_spellbook', 'This collection is archived. Update Wizzy and save a deck from the current spellbook.');
  if (!isSpellbookId(id)) fail(400, 'invalid_spellbook', 'Choose Spellbook 1 or Spellbook 2.');
  return id;
}
function accountDeck(account, element, spellbookId) {
  return spellbookId === SPELLBOOK_2 ? account.spellbook2Decks?.[element] : account.decks[element];
}
function playableDeck(value, element, spellbookId = getDeckSpellbook(value)) {
  try {
    const deck = normalizeDeck(value);
    if (getDeckSpellbook(deck) !== spellbookId) throw new Error('Choose a deck from the selected spellbook.');
    if (deck.element !== element) throw new Error(`Choose a saved ${ELEMENT_INFO[element].name} deck for your selected element.`);
    return deck;
  } catch (error) { fail(400, 'invalid_deck', error.message || 'Choose a legal deck of 1–30 slabs.'); }
}

/** Use the tested rules engine while keeping all random draws on the server. */
function secureMatch(decks) {
  const state = createGame(randomInt(0x100000000), decks);
  for (const player of state.players) {
    const cards = [...player.hand, ...player.deck];
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [cards[index], cards[other]] = [cards[other], cards[index]];
    }
    player.hand = cards.splice(0, OPENING_HAND_SIZE);
    player.deck = cards;
  }
  return state;
}

/** Only this filtered view crosses the network. No client receives a draw order. */
function roomView(room, playerIndex) {
  let state = null;
  if (room.state) {
    state = structuredClone(room.state);
    const acting = state.status === 'playing' && getActingPlayerIndex(state) === playerIndex;
    state.players.forEach((player, index) => {
      player.handCount = player.hand.length;
      player.deckCount = player.deck.length;
      player.deck = [];
      if (index !== playerIndex) { player.hand = []; player.deckDefinition = null; }
    });
    if (!acting) { state.selectedCardId = null; state.selectedFateCardIds = []; state.refreshCardIds = []; }
    if (state.pendingSpell?.casterIndex !== playerIndex) {
      state.pendingCardId = null;
      if (state.pendingSpell) delete state.pendingSpell.cardId;
    }
  }
  return {
    spellbookVersion: SPELLBOOK_VERSION,
    spellbookId: room.spellbookId || SPELLBOOK_1,
    combatRulesVersion: COMBAT_RULES_VERSION,
    code: room.code, playerIndex, element: room.players[playerIndex].deck.element,
    revision: room.revision,
    status: room.state ? room.state.status : 'waiting',
    players: room.players.map(player => ({ name: player?.name || '', element: player?.deck.element ?? null, joined: Boolean(player) })),
    state,
  };
}

async function jsonBody(request) {
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) fail(415, 'json_required', 'Send application/json.');
  if (Number(request.headers['content-length']) > 65536) fail(413, 'body_too_large', 'This request is too large.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) fail(413, 'body_too_large', 'This request is too large.');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'invalid_json', 'The request must contain valid JSON.'); }
  if (!isRecord(body)) fail(400, 'invalid_json', 'The request must contain a JSON object.');
  return body;
}

/**
 * A single-process friends playtest service. Rooms deliberately live in memory:
 * deployments/restarts end matches. Production persistence can be added later.
 */
export function createMultiplayerServer(options = {}) {
  // Constructor-only compatibility for archived regression fixtures; never request-controlled.
  const allowArchivedSpellbook = options.allowArchivedSpellbook === true;
  const staticRoot = path.resolve(options.staticRoot ?? DEFAULT_ROOT);
  const allowedOrigins = new Set(options.allowedOrigins ?? DEFAULT_ORIGINS);
  const now = options.now ?? Date.now;
  const makeMatch = options.createMatch ?? secureMatch;
  const rollRandom = options.rollRandom ?? secureRoll;
  const initiativeRandom = options.initiativeRandom ?? secureRoll;
  const maxRooms = options.maxRooms ?? 500;
  const ttl = options.roomTtlMs ?? 6 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(maxRooms) || maxRooms < 1 || !Number.isFinite(ttl) || ttl <= 0) throw new Error('Invalid room limits.');
  const ownsAccounts = !options.accountStore;
  const accounts = options.accountStore ?? createAccountStore({ dbPath: options.accountDbPath ?? ':memory:', now, ...(options.accountSessionTtlMs !== undefined ? { sessionTtlMs: options.accountSessionTtlMs } : {}) });
  const rooms = new Map();
  const limits = new Map();
  let lastSweep = 0;

  function sweep() {
    const time = now();
    if (time - lastSweep < 30000 && rooms.size < maxRooms) return;
    lastSweep = time;
    for (const [code, room] of rooms) if (time - room.touchedAt >= ttl) rooms.delete(code);
    for (const [key, bucket] of limits) if (bucket.resetAt <= time) limits.delete(key);
  }
  function limit(key, maximum) {
    if (options.rateLimit === false) return;
    const time = now();
    let bucket = limits.get(key);
    if (!bucket || bucket.resetAt <= time) {
      if (limits.size >= 16384) limits.delete(limits.keys().next().value);
      bucket = { count: 0, resetAt: time + 60000 }; limits.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maximum) fail(429, 'rate_limited', 'Too many requests. Please wait a minute and retry.');
  }
  function findRoom(code) {
    const room = rooms.get(cleanCode(code));
    if (!room || now() - room.touchedAt >= ttl) {
      if (room) rooms.delete(room.code);
      fail(404, 'room_not_found', 'This battle room does not exist or has expired.');
    }
    return room;
  }
  function authenticate(request, room) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || '');
    if (!match) fail(401, 'unauthorized', 'Reconnect using this device’s battle session.');
    const digest = tokenHash(match[1]);
    const playerIndex = room.players.findIndex(player => player && timingSafeEqual(player.tokenHash, digest));
    if (playerIndex < 0) fail(401, 'unauthorized', 'This battle session is not valid.');
    room.touchedAt = now();
    return playerIndex;
  }
  function accountToken(request) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || '');
    if (!match) throw new AccountError(401, 'account_unauthorized', 'Log in to your Wizzy account again.');
    return match[1];
  }
  function optionalAccount(request) {
    return request.headers.authorization ? accounts.get(accountToken(request)) : null;
  }
  function newPlayer(name, deck, accountId = null) {
    const token = randomBytes(32).toString('base64url');
    return { token, record: { name, deck, accountId, tokenHash: tokenHash(token), requests: new Map() } };
  }
  function newCode() {
    let code;
    do { code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(code));
    return code;
  }
  function applyAction(room, playerIndex, body) {
    requireCombatRules(body);
    if (!isRecord(body.payload ?? {})) fail(400, 'invalid_action', 'Action details must be an object.');
    if (Object.keys(body).some(key => !['type', 'payload', 'revision', 'requestId', 'combatRulesVersion'].includes(key))) fail(400, 'invalid_action', 'Only battle actions may be submitted.');
    if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9:_-]{8,100}$/.test(body.requestId)) fail(400, 'invalid_request_id', 'Each action needs a unique request ID.');
    const player = room.players[playerIndex];
    const signature = JSON.stringify({ type: body.type, payload: body.payload ?? {}, revision: body.revision });
    const duplicate = player.requests.get(body.requestId);
    if (duplicate !== undefined) {
      if (duplicate !== signature) fail(409, 'request_reused', 'This request ID was already used for a different action.', roomView(room, playerIndex));
      return roomView(room, playerIndex);
    }
    if (!Number.isSafeInteger(body.revision) || body.revision !== room.revision) fail(409, 'stale_revision', 'The battle changed. Your view has been refreshed.', roomView(room, playerIndex));
    if (!room.state) fail(409, 'waiting_for_player', 'Wait for the other wizard to join.');
    if (room.state.status !== 'playing') fail(409, 'duel_finished', 'This duel is complete. Create a new battle to play again.');
    if (room.state.phase === 'initiative') {
      if (body.type !== 'rollInitiative') fail(403, 'opening_roll_required', 'Both wizards must finish the opening roll before playing.');
    } else if (getActingPlayerIndex(room.state) !== playerIndex) fail(403, 'not_your_turn', 'Wait for the other wizard to finish this step.');
    const payload = body.payload ?? {};
    let next;
    switch (body.type) {
      case 'rollInitiative':
        if (Object.keys(payload).length) fail(400, 'invalid_action', 'The server rolls your opening die.');
        next = rollInitiative(room.state, playerIndex, initiativeRandom); break;
      case 'selectCard': next = selectCard(room.state, payload.cardId); break;
      case 'castSpell': next = castSelected(room.state, { emberSpend: payload.emberSpend ?? 0 }); break;
      case 'enhance':
        if (Object.keys(payload).length) fail(400, 'invalid_action', 'The server rolls Enhancement dice; no roll or bonus may be submitted.');
        next = activateEnhancement(room.state); break;
      case 'aura':
        if (Object.keys(payload).length) fail(400, 'invalid_action', 'Aura has a fixed cost, bonus and duration; no details may be submitted.');
        next = activateAura(room.state); break;
      case 'castFate': {
        if (Object.keys(payload).some(key => key !== 'twistDirections')) fail(400, 'invalid_action', 'Only Twist directions may accompany Cast Fate.');
        const directions = payload.twistDirections ?? {};
        if (!isRecord(directions) || Object.entries(directions).some(([id, amount]) => id.length > 160 || ![-2, 2].includes(amount))) fail(400, 'invalid_action', 'Choose +2 or −2 for each selected Twist.');
        const selectedTwists = new Set(room.state.players[playerIndex].hand.filter(card => card.spellId === 'FAT-003' && room.state.selectedFateCardIds.includes(card.id)).map(card => card.id));
        if (Object.keys(directions).some(id => !selectedTwists.has(id))) fail(400, 'invalid_action', 'Twist directions must belong to your selected Twist slabs.');
        next = castFateSelected(room.state, { twistDirections: directions }); break;
      }
      case 'skipFate': next = skipFate(room.state); break;
      case 'endTurn': next = endTurn(room.state); break;
      case 'beginRefresh': next = beginRefresh(room.state); break;
      case 'toggleRefreshCard': next = toggleRefreshCard(room.state, payload.cardId); break;
      case 'confirmRefresh': next = confirmRefresh(room.state); break;
      case 'cancelStagedAction':
        if (Object.keys(payload).length) fail(400, 'invalid_action', 'Cancel only clears your uncommitted selection. No action details may be submitted.');
        next = cancelStagedAction(room.state); break;
      default: fail(400, 'unknown_action', 'That battle action is not supported.');
    }
    if (next === room.state) {
      // An extra background tap is harmless, including a queued tap whose
      // selection was already cleared. Remember its ID without a new revision.
      if (body.type === 'cancelStagedAction') {
        player.requests.set(body.requestId, signature);
        if (player.requests.size > 128) player.requests.delete(player.requests.keys().next().value);
        return roomView(room, playerIndex);
      }
      fail(422, 'invalid_move', 'That action is not allowed in the current battle step.');
    }
    // Spells and Enhancement roll once before the defender sees Fate.
    // Later Fate actions update that same roll; no phone supplies dice.
    if (next.phase === 'rolling') next = rollDice(next, rollRandom);
    if (next.phase === 'enhancing') next = rollEnhancement(next, rollRandom);
    if (next.phase === 'resolving') next = resolveSpell(next);
    assertGame(next);
    room.state = next; room.revision += 1; room.touchedAt = now();
    player.requests.set(body.requestId, signature);
    if (player.requests.size > 128) player.requests.delete(player.requests.keys().next().value);
    return roomView(room, playerIndex);
  }

  async function staticFile(request, response, pathname) {
    if (!['GET', 'HEAD'].includes(request.method)) fail(405, 'method_not_allowed', 'Use GET for application files.');
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { fail(400, 'invalid_path', 'Invalid file path.'); }
    if (decoded.split('/').some(part => part.startsWith('.'))) fail(403, 'forbidden', 'This file is not public.');
    const file = path.resolve(staticRoot, `.${decoded === '/' ? '/index.html' : decoded}`);
    if (!file.startsWith(staticRoot + path.sep)) fail(403, 'forbidden', 'This file is not public.');
    let bytes;
    try {
      const [realRoot, resolved] = await Promise.all([realpath(staticRoot), realpath(file)]);
      if (!resolved.startsWith(realRoot + path.sep) || !(await stat(resolved)).isFile()) fail(403, 'forbidden', 'This file is not public.');
      bytes = await readFile(resolved);
    } catch (error) {
      if (error instanceof RoomError) throw error;
      fail(404, 'file_not_found', 'Application file not found. Build the web edition before serving it.');
    }
    const immutable = /(?:\.[a-f0-9]{12}\.(?:js|css)|-[a-f0-9]{12}\.webp)$/.test(file);
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'Content-Length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  }

  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const origin = request.headers.origin;
      if (origin) {
        let sameHost = false;
        try { const parsed = new URL(origin); sameHost = ['http:', 'https:'].includes(parsed.protocol) && parsed.host === request.headers.host; } catch { /* Deny malformed origins. */ }
        if (!sameHost && !allowedOrigins.has(origin)) fail(403, 'origin_not_allowed', 'This website is not allowed to use this battle server.');
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) { await staticFile(request, response, url.pathname); return; }
      response.setHeader('Cache-Control', 'no-store');
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
        response.end(); return;
      }
      sweep();
      const ip = request.socket.remoteAddress || 'unknown';
      limit(`ip:${ip}`, 6000);
      let result;
      let status = 200;
      if (url.pathname === '/api/health' && request.method === 'GET') {
        result = { ok: true, service: 'wizzy-multiplayer', storage: 'memory', spellbookVersion: SPELLBOOK_VERSION, combatRulesVersion: COMBAT_RULES_VERSION, accounts: { enabled: true, storage: accounts.storage } };
      } else if (url.pathname.startsWith('/api/accounts/')) {
        const operation = url.pathname.slice('/api/accounts/'.length);
        if (operation === 'register' && request.method === 'POST') {
          limit(`register:${ip}`, 6);
          result = await accounts.register(await jsonBody(request)); status = 201;
        } else if (operation === 'login' && request.method === 'POST') {
          limit(`login:${ip}`, 20);
          result = await accounts.login(await jsonBody(request));
        } else if (operation === 'me' && request.method === 'GET') {
          result = { account: accounts.get(accountToken(request)) };
        } else if (operation === 'me' && request.method === 'PUT') {
          limit(`save-account:${ip}`, 120);
          result = { account: accounts.update(accountToken(request), await jsonBody(request)) };
        } else if (operation === 'logout' && request.method === 'POST') {
          accounts.logout(accountToken(request)); result = { ok: true };
        } else fail(405, 'method_not_allowed', 'That account method is not supported.');
      } else if (url.pathname === '/api/rooms' && request.method === 'POST') {
        limit(`create:${ip}`, 10);
        const body = await jsonBody(request);
        requireCombatRules(body);
        if (!ELEMENTS.includes(body.element)) fail(400, 'invalid_element', 'Choose Fire, Water or Earth.');
        const account = optionalAccount(request);
        const name = account ? account.profile.name : playerName(body.name);
        const spellbookId = requestedSpellbook(body, account, allowArchivedSpellbook);
        const deck = playableDeck(account ? accountDeck(account, body.element, spellbookId) : body.deck, body.element, spellbookId);
        if (rooms.size >= maxRooms) fail(503, 'rooms_full', 'The battle server is full. Please try again later.');
        const playerIndex = 0;
        const player = newPlayer(name, deck, account?.id);
        const room = { code: newCode(), spellbookId, hostIndex: playerIndex, revision: 0, players: [null, null], state: null, touchedAt: now() };
        room.players[playerIndex] = player.record; rooms.set(room.code, room);
        result = { ...roomView(room, playerIndex), token: player.token }; status = 201;
      } else {
        const match = /^\/api\/rooms\/([A-Za-z0-9 -]{6,12})(?:\/(info|join|actions))?$/.exec(url.pathname);
        if (!match) fail(404, 'not_found', 'This API endpoint does not exist.');
        const room = findRoom(match[1]);
        const operation = match[2];
        if (operation === 'info' && request.method === 'GET') {
          limit(`info:${ip}`, 120);
          result = { code: room.code, spellbookVersion: SPELLBOOK_VERSION, combatRulesVersion: COMBAT_RULES_VERSION,
            spellbookId: room.spellbookId || SPELLBOOK_1, status: room.state ? room.state.status : 'waiting',
            hostElement: room.players[room.hostIndex].deck.element, availableElements: [...ELEMENTS], joiningElement: legacyJoiningElement(room) };
        } else if (operation === 'join' && request.method === 'POST') {
          limit(`join:${ip}`, 30);
          if (room.state || room.players.every(Boolean)) fail(409, 'room_full', 'Both seats in this battle are already taken.');
          const body = await jsonBody(request);
          requireCombatRules(body);
          const playerIndex = room.players[0] ? 1 : 0;
          const account = optionalAccount(request);
          const element = body.element ?? (account ? legacyJoiningElement(room) : body.deck?.element);
          if (!ELEMENTS.includes(element)) fail(400, 'invalid_element', 'Choose Fire, Water or Earth.');
          const spellbookId = requestedSpellbook(body, account, allowArchivedSpellbook);
          if (spellbookId !== (room.spellbookId || SPELLBOOK_1)) fail(409, 'spellbook_mismatch', 'This room uses a different spellbook. Select its spellbook in Deck before joining.');
          const player = newPlayer(account ? account.profile.name : playerName(body.name), playableDeck(account ? accountDeck(account, element, spellbookId) : body.deck, element, spellbookId), account?.id);
          const nextPlayers = room.players.slice(); nextPlayers[playerIndex] = player.record;
          const state = makeMatch({ players: nextPlayers.map(entry => ({ element: entry.deck.element, deck: entry.deck })) });
          assertGame(state);
          room.players = nextPlayers; room.state = state; room.revision += 1; room.touchedAt = now();
          result = { ...roomView(room, playerIndex), token: player.token };
        } else if (!operation && request.method === 'GET') {
          const playerIndex = authenticate(request, room);
          limit(`read:${room.code}:${playerIndex}`, 180);
          result = roomView(room, playerIndex);
        } else if (operation === 'actions' && request.method === 'POST') {
          const playerIndex = authenticate(request, room);
          limit(`action:${room.code}:${playerIndex}`, 120);
          result = applyAction(room, playerIndex, await jsonBody(request));
        } else fail(405, 'method_not_allowed', 'That method is not supported here.');
      }
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(result));
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      const known = error instanceof RoomError || error instanceof AccountError;
      const status = known ? error.status : 500;
      if (status === 429) response.setHeader('Retry-After', '60');
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: known ? error.message : 'The battle server could not finish this request.', code: known ? error.code : 'server_error', ...(known && error.view ? { view: error.view } : {}), ...(known && error.account ? { account: error.account } : {}) }));
      if (!known) options.onError?.(error);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  if (ownsAccounts) server.on('close', () => accounts.close());
  return server;
}
