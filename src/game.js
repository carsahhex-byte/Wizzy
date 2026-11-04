import { SPELL_CATALOG, DECK_LISTS, DECK_SIZE } from './spells.js';

export { SPELL_CATALOG, DECK_LISTS, DECK_SIZE };

/** Turn phases and card-zone rules. Printed costs/effects are metadata until implemented. */
export const SAVE_VERSION = 3;
export const PHASES = Object.freeze(['main', 'fate', 'resolving', 'end', 'refresh', 'ready-to-pass']);

export const CARD_CATALOG = Object.freeze({
  fire: Object.freeze(DECK_LISTS.fire.map(({ spellId }) => SPELL_CATALOG[spellId])),
  water: Object.freeze(DECK_LISTS.water.map(({ spellId }) => SPELL_CATALOG[spellId])),
});

const LEGACY_DECK_SIZE = 24;
const LEGACY_SPELLS = Object.freeze({
  fire: Object.freeze({ spellId: 'fiery-comet', name: 'Fiery Comet', art: 'comet' }),
  water: Object.freeze({ spellId: 'cresting-wave', name: 'Cresting Wave', art: 'wave' }),
});
const VERSION_ONE_SPELL_IDS = Object.freeze({
  fire: ['spark-shot', 'kindle', 'fortune', 'heatbox', 'mana-shield', 'sunsetter'],
  earth: ['stone-shot', 'rootbound', 'earth-fortune', 'runestone', 'earth-mana-shield', 'mountain-call'],
});

function randomGenerator(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDeckCards(owner) {
  return DECK_LISTS[owner].flatMap(({ spellId, quantity }) => {
    const spell = SPELL_CATALOG[spellId];
    return Array.from({ length: quantity }, (_, copy) => ({
      ...spell, id: `${owner}-${spellId}-${copy}`,
      // Do not charge printed mana or execute spell text before the rules are implemented.
      cost: 0, effectPending: true, description: spell.effectText,
    }));
  });
}

function makeLegacyDeck(owner) {
  const spell = LEGACY_SPELLS[owner];
  return Array.from({ length: LEGACY_DECK_SIZE }, (_, copy) => ({
    ...spell, id: `${owner}-${spell.spellId}-${copy}`,
    cost: 0, effectPending: true, description: 'Spell effect coming soon.',
  }));
}

function makeDeck(owner, random) {
  const deck = makeDeckCards(owner);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return deck;
}

function addLog(state, message, type = 'info', playerId = null) {
  state.log.push({ id: state.log.length + 1, round: state.round, playerId, message, type });
}

function inPhase(state, ...phases) {
  return state.status === 'playing' && phases.includes(state.phase);
}

function drawToFive(player) {
  const drawCount = Math.min(Math.max(0, 5 - player.hand.length), player.deck.length);
  player.hand.push(...player.deck.splice(0, drawCount));
  return drawCount;
}

export function createGame(seed = Date.now()) {
  const random = randomGenerator(seed);
  const players = ['fire', 'water'].map((id) => {
    const deck = makeDeck(id, random);
    return {
      id, name: id === 'fire' ? 'Fire' : 'Water',
      elementName: id === 'fire' ? 'Embers' : 'Flow',
      hp: 30, maxHp: 30, mana: 3, shield: 0, element: 0, loaded: 0,
      turnsStarted: id === 'fire' ? 1 : 0,
      hand: deck.splice(0, 4), deck, discard: [],
    };
  });
  const state = {
    version: SAVE_VERSION, round: 1, activePlayer: 0,
    phase: 'main', selectedCardId: null, pendingCardId: null, refreshCardIds: [],
    status: 'playing', winner: null, players, log: [],
  };
  addLog(state, 'The duel begins. Both wizards receive 30 HP, 3 mana, and 4 spell slabs.');
  addLog(state, 'Fire takes the first turn.', 'turn', 'fire');
  return state;
}

export function selectCard(state, cardId) {
  if (!inPhase(state, 'main')) return state;
  if (!state.players[state.activePlayer].hand.some((card) => card.id === cardId)) return state;
  return { ...state, selectedCardId: state.selectedCardId === cardId ? null : cardId };
}

/** Commit the selected card, keeping it in hand until its fate window resolves. */
export function castSelected(state) {
  if (!inPhase(state, 'main') || !state.selectedCardId) return state;
  const player = state.players[state.activePlayer];
  const card = player.hand.find((entry) => entry.id === state.selectedCardId);
  if (!card || card.cost > player.mana) return state;
  const next = structuredClone(state);
  next.players[next.activePlayer].mana -= card.cost;
  next.pendingCardId = card.id;
  next.selectedCardId = null;
  next.phase = 'fate';
  addLog(next, `${player.name} casts ${card.name}. Waiting for Skip Fate.`, 'cast', player.id);
  return next;
}

export function skipFate(state) {
  if (!inPhase(state, 'fate')) return state;
  const next = structuredClone(state);
  next.phase = 'resolving';
  addLog(next, `${next.players[next.activePlayer].name} skips fate. The spell is resolving.`, 'fate', next.players[next.activePlayer].id);
  return next;
}

/** The UI calls this after its resolution animation; future spell/dice effects belong here. */
export function resolveSpell(state) {
  if (!inPhase(state, 'resolving')) return state;
  const player = state.players[state.activePlayer];
  const index = player.hand.findIndex((card) => card.id === state.pendingCardId);
  if (index < 0) return state;
  const next = structuredClone(state);
  const caster = next.players[next.activePlayer];
  const [card] = caster.hand.splice(index, 1);
  caster.discard.push(card);
  next.pendingCardId = null;
  next.phase = 'main';
  addLog(next, `${card.name} resolves and moves to discard. Its effect and dice rules are pending.`, 'resolve', caster.id);
  return next;
}

/** First click reveals the optional refresh; a later click passes the turn. */
export function endTurn(state) {
  if (!inPhase(state, 'main', 'end', 'ready-to-pass')) return state;
  const next = structuredClone(state);
  next.selectedCardId = null;
  if (next.phase === 'main') {
    next.phase = 'end';
    return next;
  }
  next.phase = 'main';
  next.refreshCardIds = [];
  next.pendingCardId = null;
  next.activePlayer = next.activePlayer === 0 ? 1 : 0;
  if (next.activePlayer === 0) {
    next.round += 1;
    for (const player of next.players) player.mana += 2;
    addLog(next, `Round ${next.round} begins. Both wizards gain 2 mana.`, 'round');
  }
  const player = next.players[next.activePlayer];
  const isOpeningTurn = player.turnsStarted === 0;
  player.turnsStarted += 1;
  if (isOpeningTurn) {
    addLog(next, `${player.name} takes their opening turn with 4 spell slabs.`, 'turn', player.id);
  } else {
    const count = drawToFive(player);
    const emptyNote = player.deck.length === 0 && player.hand.length < 5 ? ' Spell Tower is empty.' : '';
    addLog(next, `${player.name}'s turn. Drew ${count} ${count === 1 ? 'slab' : 'slabs'}; ${player.hand.length} in hand.${emptyNote}`, 'turn', player.id);
  }
  return next;
}

export function beginRefresh(state) {
  if (!inPhase(state, 'end')) return state;
  return { ...state, phase: 'refresh', refreshCardIds: [], selectedCardId: null };
}

export function toggleRefreshCard(state, cardId) {
  if (!inPhase(state, 'refresh')) return state;
  if (!state.players[state.activePlayer].hand.some((card) => card.id === cardId)) return state;
  const refreshCardIds = state.refreshCardIds.includes(cardId)
    ? state.refreshCardIds.filter((id) => id !== cardId)
    : [...state.refreshCardIds, cardId];
  return { ...state, refreshCardIds };
}

export function cancelRefresh(state) {
  if (!inPhase(state, 'refresh')) return state;
  return { ...state, phase: 'end', refreshCardIds: [] };
}

/** Zero through all cards may be selected. Refresh is available at most once per turn. */
export function confirmRefresh(state) {
  if (!inPhase(state, 'refresh')) return state;
  const next = structuredClone(state);
  const player = next.players[next.activePlayer];
  const selected = new Set(next.refreshCardIds);
  const discards = player.hand.filter((card) => selected.has(card.id));
  player.hand = player.hand.filter((card) => !selected.has(card.id));
  player.discard.push(...discards);
  const count = drawToFive(player);
  next.phase = 'ready-to-pass';
  next.refreshCardIds = [];
  const emptyNote = player.deck.length === 0 && player.hand.length < 5 ? ' Spell Tower is empty.' : '';
  addLog(next, `${player.name} refreshes: discarded ${discards.length}, drew ${count}; ${player.hand.length} in hand.${emptyNote}`, 'refresh', player.id);
  return next;
}

/** Future spell effects can use this to enforce shield absorption and victory. */
export function applyDamage(state, targetIndex, amount) {
  if (state.status !== 'playing' || ![0, 1].includes(targetIndex) || !Number.isSafeInteger(amount) || amount <= 0) return state;
  const next = structuredClone(state);
  const target = next.players[targetIndex];
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  const hpDamage = Math.min(target.hp, amount - absorbed);
  target.hp -= hpDamage;
  addLog(next, `${target.name} takes ${hpDamage} damage${absorbed ? ` (${absorbed} absorbed by shield)` : ''}.`, 'damage', target.id);
  if (target.hp === 0) {
    next.status = 'finished';
    next.winner = targetIndex === 0 ? 1 : 0;
    next.selectedCardId = null;
    next.pendingCardId = null;
    next.refreshCardIds = [];
    next.phase = 'main';
    addLog(next, `${next.players[next.winner].name} wins the duel!`, 'victory', next.players[next.winner].id);
  }
  return next;
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`Invalid game: ${message}`);
}

function assertSavedState(state, version, deckSize, expectedDeck) {
  requireValue(state !== null && typeof state === 'object' && state.version === version, 'unsupported save');
  requireValue(Number.isSafeInteger(state.round) && state.round >= 1, 'round');
  requireValue([0, 1].includes(state.activePlayer), 'active player');
  requireValue(['playing', 'finished'].includes(state.status), 'status');
  requireValue(PHASES.includes(state.phase), 'phase');
  requireValue(Array.isArray(state.players) && state.players.length === 2, 'players');
  const allIds = new Set();
  state.players.forEach((player, index) => {
    const expectedId = index === 0 ? 'fire' : 'water';
    requireValue(player && player.id === expectedId, 'player identity');
    requireValue(player.name === (index === 0 ? 'Fire' : 'Water'), 'player name');
    requireValue(player.elementName === (index === 0 ? 'Embers' : 'Flow'), 'element name');
    requireValue(player.maxHp === 30 && Number.isSafeInteger(player.hp) && player.hp >= 0 && player.hp <= player.maxHp, 'HP');
    for (const key of ['mana', 'shield', 'element', 'loaded', 'turnsStarted']) requireValue(Number.isSafeInteger(player[key]) && player[key] >= 0, key);
    for (const zone of ['hand', 'deck', 'discard']) requireValue(Array.isArray(player[zone]), zone);
    requireValue(player.hand.length <= 5, 'hand limit');
    const cards = [...player.hand, ...player.deck, ...player.discard];
    requireValue(cards.length === deckSize, 'card conservation');
    const definitions = new Map(expectedDeck(expectedId).map((card) => [card.id, card]));
    for (const card of cards) {
      requireValue(card && typeof card.id === 'string' && !allIds.has(card.id), 'unique cards');
      allIds.add(card.id);
      const expected = definitions.get(card.id);
      requireValue(expected !== undefined, 'card identity');
      for (const [key, value] of Object.entries(expected)) requireValue(card[key] === value, 'spell definition');
    }
  });
  const hand = state.players[state.activePlayer].hand;
  const isOwnCard = (id) => typeof id === 'string' && hand.some((card) => card.id === id);
  requireValue(state.selectedCardId === null || (state.phase === 'main' && isOwnCard(state.selectedCardId)), 'selected card');
  requireValue(['fate', 'resolving'].includes(state.phase) ? isOwnCard(state.pendingCardId) : state.pendingCardId === null, 'pending card');
  requireValue(Array.isArray(state.refreshCardIds) && new Set(state.refreshCardIds).size === state.refreshCardIds.length, 'refresh selections');
  requireValue(state.phase === 'refresh' ? state.refreshCardIds.every(isOwnCard) : state.refreshCardIds.length === 0, 'refresh cards');
  if (state.status === 'playing') {
    requireValue(state.winner === null && state.players.every((player) => player.hp > 0), 'active duel');
  } else {
    requireValue([0, 1].includes(state.winner) && state.players[1 - state.winner].hp === 0 && state.players[state.winner].hp > 0 && state.selectedCardId === null && state.phase === 'main', 'winner');
  }
  requireValue(Array.isArray(state.log) && state.log.length > 0, 'combat log');
  for (const [index, entry] of state.log.entries()) {
    requireValue(entry && entry.id === index + 1 && Number.isSafeInteger(entry.round) && entry.round > 0 && entry.round <= state.round, 'log entry');
    requireValue(typeof entry.message === 'string' && entry.message.length <= 500, 'log message');
    requireValue(['info', 'turn', 'round', 'cast', 'fate', 'resolve', 'refresh', 'damage', 'victory'].includes(entry.type), 'log type');
    requireValue([null, 'fire', 'water'].includes(entry.playerId), 'log player');
  }
}

/** Validate exact deck quantities and definitions, including in-progress fate/refresh saves. */
export function assertGame(state) {
  assertSavedState(state, SAVE_VERSION, DECK_SIZE, makeDeckCards);
}

export function validateSavedGame(value) {
  try { assertGame(value); return true; } catch { return false; }
}

/** Keep the previous v1 zone-order mapping before upgrading its sample deck. */
function migrateVersionOne(value) {
  requireValue(Array.isArray(value.players) && value.players.length === 2, 'legacy players');
  const oldIds = new Set();
  let selectedCardId = null;
  const players = value.players.map((old, index) => {
    const oldId = index === 0 ? 'fire' : 'earth';
    const id = index === 0 ? 'fire' : 'water';
    requireValue(old && old.id === oldId && old.name === (index === 0 ? 'Fire' : 'Earth'), 'legacy player');
    requireValue(old.elementName === (index === 0 ? 'Embers' : 'Runes'), 'legacy element');
    const validIds = new Set(VERSION_ONE_SPELL_IDS[oldId].flatMap((spellId) =>
      Array.from({ length: 4 }, (_, copy) => `${oldId}-${spellId}-${copy}`)));
    const sampleDeck = makeLegacyDeck(id);
    let copy = 0;
    const zones = {};
    for (const zone of ['hand', 'deck', 'discard']) {
      requireValue(Array.isArray(old[zone]), 'legacy zone');
      zones[zone] = old[zone].map((oldCard) => {
        requireValue(oldCard && validIds.has(oldCard.id) && !oldIds.has(oldCard.id), 'legacy card');
        oldIds.add(oldCard.id);
        const card = sampleDeck[copy++];
        requireValue(card !== undefined, 'legacy card count');
        if (oldCard.id === value.selectedCardId && index === value.activePlayer && zone === 'hand') selectedCardId = card.id;
        return card;
      });
    }
    requireValue(copy === LEGACY_DECK_SIZE, 'legacy card count');
    return {
      id, name: index === 0 ? 'Fire' : 'Water', elementName: index === 0 ? 'Embers' : 'Flow',
      hp: old.hp, maxHp: old.maxHp, mana: old.mana, shield: old.shield, element: old.element,
      loaded: old.loaded, turnsStarted: old.turnsStarted, ...zones,
    };
  });
  requireValue(value.selectedCardId === null || selectedCardId !== null, 'legacy selection');
  requireValue(Array.isArray(value.log), 'legacy log');
  return {
    version: 2, round: value.round, activePlayer: value.activePlayer,
    phase: 'main', selectedCardId, pendingCardId: null, refreshCardIds: [],
    status: value.status, winner: value.winner, players,
    log: value.log.map((entry) => ({
      ...entry, playerId: entry.playerId === 'earth' ? 'water' : entry.playerId,
      message: entry.message.replaceAll('Earth', 'Water').replaceAll('earth', 'water').replaceAll('Runes', 'Flow'),
    })),
  };
}

/** Replace 24-card samples with the 30-slab decklists without changing turn progress. */
export function migrateSavedGame(value) {
  if (validateSavedGame(value)) return value;
  if (!value || ![1, 2].includes(value.version)) return null;
  try {
    const legacy = value.version === 1 ? migrateVersionOne(value) : value;
    assertSavedState(legacy, 2, LEGACY_DECK_SIZE, makeLegacyDeck);
    const replacements = new Map();
    const players = legacy.players.map((player) => {
      const deck = makeDeckCards(player.id);
      makeLegacyDeck(player.id).forEach((card, copy) => replacements.set(card.id, deck[copy]));
      const zones = Object.fromEntries(['hand', 'deck', 'discard'].map((zone) => [
        zone, player[zone].map((card) => replacements.get(card.id)),
      ]));
      zones.deck.push(...deck.slice(LEGACY_DECK_SIZE));
      return { ...player, ...zones };
    });
    const replaceId = (id) => id === null ? null : replacements.get(id).id;
    const migrated = {
      ...legacy, version: SAVE_VERSION, players,
      selectedCardId: replaceId(legacy.selectedCardId),
      pendingCardId: replaceId(legacy.pendingCardId),
      refreshCardIds: legacy.refreshCardIds.map(replaceId),
      log: structuredClone(legacy.log),
    };
    addLog(migrated, 'Sample decks upgraded to the 30-slab Fire and Water decklists. Each Spell Tower received 6 additional slabs; printed spell effects and mana costs are still pending.');
    assertGame(migrated);
    return migrated;
  } catch { return null; }
}
