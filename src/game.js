import { SPELL_CATALOG, DECK_LISTS, DECK_SIZE } from './spells.js';
import { MAX_FLOW, SPELL_RULES, applySpellEffect, getEmberSpendRange } from './effects.js';

export { SPELL_CATALOG, DECK_LISTS, DECK_SIZE, SPELL_RULES, getEmberSpendRange };

/** A committed rolling spell stays in hand until both Fate windows and its roll finish. */
export const SAVE_VERSION = 6;
export const PHASES = Object.freeze(['main', 'fate', 'rolling', 'resolving', 'end', 'refresh', 'ready-to-pass']);
const PREVIEW_PHASES = PHASES.filter((phase) => phase !== 'rolling');
const PENDING_PHASES = ['fate', 'rolling', 'resolving'];
const LOG_TYPES = ['info', 'turn', 'round', 'cast', 'fate', 'resolve', 'refresh', 'damage', 'victory', 'dice', 'resource', 'heal', 'shield', 'loaded'];

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

function makeDeckCards(owner, preview = false) {
  return DECK_LISTS[owner].flatMap(({ spellId, quantity }) => {
    const spell = SPELL_CATALOG[spellId];
    return Array.from({ length: quantity }, (_, copy) => ({
      ...spell, id: `${owner}-${spellId}-${copy}`,
      cost: preview ? 0 : spell.manaCost, effectPending: preview, description: spell.effectText,
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
      hp: 30, maxHp: 30, mana: 3, shield: 0, element: 0, loaded: 0, loadedPending: 0,
      turnsStarted: id === 'fire' ? 1 : 0,
      hand: deck.splice(0, 4), deck, discard: [],
    };
  });
  const state = {
    version: SAVE_VERSION, round: 1, activePlayer: 0,
    phase: 'main', primaryUsed: false, selectedCardId: null, selectedFateCardIds: [], pendingCardId: null, pendingSpell: null,
    fatePlayer: null, lastRoll: null, refreshCardIds: [],
    status: 'playing', winner: null, players, log: [],
  };
  addLog(state, 'The duel begins. Both wizards receive 30 HP, 3 mana, and 4 spell slabs.');
  addLog(state, 'Fire takes the first turn.', 'turn', 'fire');
  return state;
}

export function getActingPlayerIndex(state) {
  return state.phase === 'fate' ? state.fatePlayer : state.activePlayer;
}

function fateModifier(state, card) {
  if (card.category !== 'Fate') return null;
  const attacking = state.fatePlayer === state.activePlayer;
  if (card.spellId === 'FAT-001') return attacking ? 4 : null;
  if (card.spellId === 'FAT-002') return attacking ? null : -4;
  if (card.spellId === 'FAT-003') return attacking ? 2 : -2;
  return null;
}

/** An unaffordable spell may still be selected for reading, but cannot be committed. */
export function canSelectCard(state, cardId) {
  if (!inPhase(state, 'main', 'fate')) return false;
  const player = state.players[getActingPlayerIndex(state)];
  const card = player?.hand.find((entry) => entry.id === cardId);
  if (!card) return false;
  return state.phase === 'main' ? card.category !== 'Fate' : fateModifier(state, card) !== null;
}

export function canCastSelected(state) {
  if (state.phase === 'fate') {
    const ids = state.selectedFateCardIds;
    if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length || !ids.every((id) => canSelectCard(state, id))) return false;
    const player = state.players[getActingPlayerIndex(state)];
    return player.mana >= ids.reduce((total, id) => total + player.hand.find((card) => card.id === id).manaCost, 0);
  }
  if (state.primaryUsed) return false;
  if (!state.selectedCardId || !canSelectCard(state, state.selectedCardId)) return false;
  const player = state.players[getActingPlayerIndex(state)];
  const card = player.hand.find((entry) => entry.id === state.selectedCardId);
  return player.mana >= card.manaCost;
}

export function selectCard(state, cardId) {
  if (!canSelectCard(state, cardId)) return state;
  if (state.phase === 'fate') {
    const selectedFateCardIds = state.selectedFateCardIds.includes(cardId)
      ? state.selectedFateCardIds.filter((id) => id !== cardId)
      : [...state.selectedFateCardIds, cardId];
    return { ...state, selectedFateCardIds, selectedCardId: selectedFateCardIds.at(-1) ?? null };
  }
  return { ...state, selectedCardId: state.selectedCardId === cardId ? null : cardId };
}

/** Pay resources now; only threshold spells open the two successive Fate windows. */
export function castSelected(state, { emberSpend = 0 } = {}) {
  if (!inPhase(state, 'main') || !canCastSelected(state)) return state;
  const player = state.players[state.activePlayer];
  const card = player.hand.find((entry) => entry.id === state.selectedCardId);
  const rule = SPELL_RULES[card.spellId];
  if (!rule) return state;
  const range = getEmberSpendRange(card.spellId, player.element);
  const emberSpent = range.mandatory ? range.max : emberSpend;
  if (!Number.isSafeInteger(emberSpent) || emberSpent < range.min || emberSpent > range.max) return state;
  const next = structuredClone(state);
  next.primaryUsed = true;
  const caster = next.players[next.activePlayer];
  caster.mana -= card.manaCost;
  caster.element -= emberSpent;
  next.pendingCardId = card.id;
  next.pendingSpell = {
    casterIndex: next.activePlayer, cardId: card.id, spellId: card.spellId, emberSpent,
    loadedBonus: rule.requiresRoll ? caster.loaded : 0,
    attackingFate: 0, defendingFate: 0,
    attackingFateCardIds: [], defendingFateCardIds: [],
  };
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  addLog(next, `${player.name} casts ${card.name} for ${card.manaCost} mana${emberSpent ? ` and ${emberSpent} Embers` : ''}.`, 'cast', player.id);
  if (rule.requiresRoll) {
    caster.loaded = 0;
    next.lastRoll = null;
    next.phase = 'fate';
    next.fatePlayer = next.activePlayer;
    addLog(next, `${caster.name} may play attacking Fate before the defender responds.`, 'fate', caster.id);
    return next;
  }
  // Immediate spells deliberately skip Fate, dice and animation-only pending states.
  return completeSpell(next, null);
}

/** Cast every selected Fate slab together, then advance to the next response or roll. */
export function castFateSelected(state) {
  if (!inPhase(state, 'fate') || !canCastSelected(state)) return state;
  const next = structuredClone(state);
  const player = next.players[next.fatePlayer];
  const attacking = next.fatePlayer === next.activePlayer;
  for (const id of next.selectedFateCardIds) {
    const index = player.hand.findIndex((card) => card.id === id);
    const [card] = player.hand.splice(index, 1);
    const modifier = fateModifier(next, card);
    player.mana -= card.manaCost;
    player.discard.push(card);
    next.pendingSpell[attacking ? 'attackingFate' : 'defendingFate'] += modifier;
    next.pendingSpell[attacking ? 'attackingFateCardIds' : 'defendingFateCardIds'].push(card.id);
    addLog(next, `${player.name} casts ${card.name}: ${modifier > 0 ? '+' : ''}${modifier} to the pending roll.`, 'fate', player.id);
  }
  return advanceFate(next, false);
}

function advanceFate(next, skipped) {
  const player = next.players[next.fatePlayer];
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  const action = skipped ? 'skips Fate' : 'finishes Fate';
  if (next.fatePlayer === next.activePlayer) {
    next.fatePlayer = 1 - next.activePlayer;
    addLog(next, `${player.name} ${action}. ${next.players[next.fatePlayer].name} may play defending Fate.`, 'fate', player.id);
  } else {
    next.fatePlayer = null;
    next.phase = 'rolling';
    addLog(next, `${player.name} ${action}. Roll the dice.`, 'fate', player.id);
  }
  return next;
}

export function skipFate(state) {
  if (!inPhase(state, 'fate')) return state;
  return advanceFate(structuredClone(state), true);
}

/** Capture two genuine d6 results exactly once, after both players finish Fate. */
export function rollDice(state, random = Math.random) {
  if (!inPhase(state, 'rolling')) return state;
  const samples = [random(), random()];
  if (samples.some((value) => !Number.isFinite(value) || value < 0 || value >= 1)) return state;
  const dice = samples.map((value) => Math.floor(value * 6) + 1);
  const next = structuredClone(state);
  const pending = next.pendingSpell;
  const rawTotal = dice[0] + dice[1];
  next.lastRoll = {
    dice, rawTotal, loadedBonus: pending.loadedBonus,
    attackingFate: pending.attackingFate, defendingFate: pending.defendingFate,
    total: rawTotal + pending.loadedBonus + pending.attackingFate + pending.defendingFate,
    spellId: pending.spellId, casterIndex: pending.casterIndex,
  };
  next.phase = 'resolving';
  addLog(next, `${next.players[next.activePlayer].name} rolls ${dice.join(' + ')} = ${rawTotal}; Loaded ${pending.loadedBonus >= 0 ? '+' : ''}${pending.loadedBonus}, attacking Fate +${pending.attackingFate}, defending Fate ${pending.defendingFate}: total ${next.lastRoll.total}.`, 'dice', next.players[next.activePlayer].id);
  return next;
}

function clearPending(state) {
  state.pendingCardId = null;
  state.pendingSpell = null;
  state.fatePlayer = null;
  state.selectedCardId = null;
  state.selectedFateCardIds = [];
}

function discardCommittedCard(state) {
  if (!state.pendingSpell) return;
  const caster = state.players[state.pendingSpell.casterIndex];
  const index = caster.hand.findIndex((card) => card.id === state.pendingCardId);
  if (index >= 0) caster.discard.push(...caster.hand.splice(index, 1));
}

function finishDuel(state, casterIndex = state.activePlayer) {
  const loser = state.players[casterIndex].hp === 0 ? casterIndex
    : state.players[1 - casterIndex].hp === 0 ? 1 - casterIndex : null;
  if (loser === null) return;
  discardCommittedCard(state);
  state.status = 'finished';
  state.winner = 1 - loser;
  clearPending(state);
  state.refreshCardIds = [];
  state.phase = 'main';
  addLog(state, `${state.players[state.winner].name} wins the duel!`, 'victory', state.players[state.winner].id);
}

function completeSpell(next, rollTotal) {
  const pending = next.pendingSpell;
  const caster = next.players[pending.casterIndex];
  const card = caster.hand.find((entry) => entry.id === pending.cardId);
  // Discard before effects so even a self-lethal spell always leaves hand exactly once.
  discardCommittedCard(next);
  const events = applySpellEffect(next, {
    casterIndex: pending.casterIndex, spellId: pending.spellId,
    rollTotal, emberSpent: pending.emberSpent,
  });
  for (const event of events) addLog(next, event.message, event.type ?? 'resolve', event.playerId ?? null);
  clearPending(next);
  next.phase = 'main';
  addLog(next, `${card.name} resolves and moves to discard.`, 'resolve', caster.id);
  finishDuel(next, pending.casterIndex);
  return next;
}

export function resolveSpell(state) {
  if (!inPhase(state, 'resolving')) return state;
  if (!state.players[state.activePlayer].hand.some((card) => card.id === state.pendingCardId)) return state;
  return completeSpell(structuredClone(state), state.lastRoll.total);
}

/** First click reveals the optional refresh; a later click passes the turn. */
export function endTurn(state) {
  if (!inPhase(state, 'main', 'end', 'refresh', 'ready-to-pass')) return state;
  const next = structuredClone(state);
  next.selectedCardId = null;
  if (next.phase === 'main') {
    const player = next.players[next.activePlayer];
    if (player.loaded > 0) addLog(next, `${player.name}'s unused Loaded +${player.loaded} expires.`, 'loaded', player.id);
    player.loaded = 0;
    next.phase = 'end';
    return next;
  }
  next.phase = 'main';
  next.primaryUsed = false;
  next.refreshCardIds = [];
  clearPending(next);
  next.activePlayer = next.activePlayer === 0 ? 1 : 0;
  if (next.activePlayer === 0) {
    next.round += 1;
    addLog(next, `Round ${next.round} begins.`, 'round');
  }
  const player = next.players[next.activePlayer];
  const isOpeningTurn = player.turnsStarted === 0;
  player.turnsStarted += 1;
  player.loaded = player.loadedPending;
  player.loadedPending = 0;
  if (isOpeningTurn) {
    addLog(next, `${player.name} takes their opening turn with ${player.hand.length} spell slabs.`, 'turn', player.id);
  } else {
    player.mana += 2;
    const count = drawToFive(player);
    const emptyNote = player.deck.length === 0 && player.hand.length < 5 ? ' Spell Tower is empty.' : '';
    addLog(next, `${player.name}'s turn. Gained 2 mana and drew ${count} ${count === 1 ? 'slab' : 'slabs'}; ${player.hand.length} in hand.${emptyNote}`, 'turn', player.id);
  }
  if (player.loaded > 0) addLog(next, `${player.name}'s queued Loaded +${player.loaded} is available until their turn ends or their first roll uses it.`, 'loaded', player.id);
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

/** Discard zero through all selected cards, refill to five and immediately pass. */
export function confirmRefresh(state) {
  if (!inPhase(state, 'refresh')) return state;
  const next = structuredClone(state);
  const player = next.players[next.activePlayer];
  const selected = new Set(next.refreshCardIds);
  const discards = player.hand.filter((card) => selected.has(card.id));
  player.hand = player.hand.filter((card) => !selected.has(card.id));
  player.discard.push(...discards);
  const count = drawToFive(player);
  next.refreshCardIds = [];
  const emptyNote = player.deck.length === 0 && player.hand.length < 5 ? ' Spell Tower is empty.' : '';
  addLog(next, `${player.name} refreshes: discarded ${discards.length}, drew ${count}; ${player.hand.length} in hand.${emptyNote}`, 'refresh', player.id);
  return endTurn(next);
}

/** Shield absorbs self-damage and opposing damage by the same rule. */
export function applyDamage(state, targetIndex, amount) {
  if (state.status !== 'playing' || ![0, 1].includes(targetIndex) || !Number.isSafeInteger(amount) || amount <= 0) return state;
  const next = structuredClone(state);
  const target = next.players[targetIndex];
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  const hpDamage = Math.min(target.hp, amount - absorbed);
  target.hp -= hpDamage;
  addLog(next, `${target.name} takes ${hpDamage} damage${absorbed ? ` (${absorbed} absorbed by shield)` : ''}.`, 'damage', target.id);
  finishDuel(next);
  return next;
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`Invalid game: ${message}`);
}

function assertSavedState(state, version, deckSize, expectedDeck) {
  const current = version === SAVE_VERSION;
  const realRules = version >= 4;
  const primaryRules = version >= 5;
  requireValue(state !== null && typeof state === 'object' && state.version === version, 'unsupported save');
  requireValue(Number.isSafeInteger(state.round) && state.round >= 1, 'round');
  requireValue([0, 1].includes(state.activePlayer), 'active player');
  requireValue(['playing', 'finished'].includes(state.status), 'status');
  requireValue((realRules ? PHASES : PREVIEW_PHASES).includes(state.phase), 'phase');
  if (primaryRules) requireValue(typeof state.primaryUsed === 'boolean', 'primary spell used');
  requireValue(Array.isArray(state.players) && state.players.length === 2, 'players');
  const allIds = new Set();
  state.players.forEach((player, index) => {
    const expectedId = index === 0 ? 'fire' : 'water';
    requireValue(player && player.id === expectedId, 'player identity');
    requireValue(player.name === (index === 0 ? 'Fire' : 'Water'), 'player name');
    requireValue(player.elementName === (index === 0 ? 'Embers' : 'Flow'), 'element name');
    requireValue(player.maxHp === 30 && Number.isSafeInteger(player.hp) && player.hp >= 0 && player.hp <= player.maxHp, 'HP');
    for (const key of ['mana', 'shield', 'element', 'loaded', 'turnsStarted', ...(realRules ? ['loadedPending'] : [])]) requireValue(Number.isSafeInteger(player[key]) && player[key] >= 0, key);
    if (current && player.id === 'water') requireValue(player.element <= MAX_FLOW, 'Flow cap');
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
  if (realRules) {
    requireValue(state.phase === 'fate' ? [0, 1].includes(state.fatePlayer) : state.fatePlayer === null, 'Fate player');
    requireValue(state.selectedCardId === null || canSelectCard(state, state.selectedCardId), 'selected card');
    if (primaryRules) {
      const ids = state.selectedFateCardIds;
      requireValue(Array.isArray(ids) && new Set(ids).size === ids.length, 'selected Fate slabs');
      requireValue(state.phase === 'fate'
        ? ids.every((id) => canSelectCard(state, id)) && (ids.length ? ids.includes(state.selectedCardId) : state.selectedCardId === null)
        : ids.length === 0, 'selected Fate ownership and role');
    }
    if (PENDING_PHASES.includes(state.phase)) {
      if (primaryRules) requireValue(state.primaryUsed === true, 'committed primary spell');
      const pending = state.pendingSpell;
      requireValue(pending && isOwnCard(state.pendingCardId) && pending.cardId === state.pendingCardId && pending.casterIndex === state.activePlayer, 'pending spell');
      const card = hand.find((entry) => entry.id === pending.cardId);
      requireValue(pending.spellId === card.spellId && SPELL_RULES[card.spellId]?.requiresRoll === true, 'rolling spell');
      requireValue(Number.isSafeInteger(pending.emberSpent) && pending.emberSpent >= 0, 'reserved Embers');
      const range = getEmberSpendRange(card.spellId, state.players[state.activePlayer].element + pending.emberSpent);
      requireValue(pending.emberSpent >= range.min && pending.emberSpent <= range.max, 'Ember payment');
      requireValue(Number.isSafeInteger(pending.loadedBonus) && pending.loadedBonus >= 0, 'captured Loaded');
      requireValue(state.players[state.activePlayer].loaded === 0, 'Loaded consumed once');
      for (const [kind, playerIndex, allowed] of [
        ['attackingFate', state.activePlayer, { 'FAT-001': 4, 'FAT-003': 2 }],
        ['defendingFate', 1 - state.activePlayer, { 'FAT-002': -4, 'FAT-003': -2 }],
      ]) {
        const ids = pending[`${kind}CardIds`];
        requireValue(Array.isArray(ids) && new Set(ids).size === ids.length, 'Fate slabs');
        let total = 0;
        for (const id of ids) {
          const fate = state.players[playerIndex].discard.find((entry) => entry.id === id);
          requireValue(fate && allowed[fate.spellId] !== undefined, 'Fate ownership and role');
          total += allowed[fate.spellId];
        }
        requireValue(pending[kind] === total, 'Fate total');
      }
      if (state.phase === 'fate' && state.fatePlayer === state.activePlayer) requireValue(pending.defendingFateCardIds.length === 0, 'Fate order');
      if (state.phase === 'resolving') {
        requireValue(state.lastRoll !== null, 'completed roll');
        for (const key of ['spellId', 'casterIndex', 'loadedBonus', 'attackingFate', 'defendingFate']) requireValue(state.lastRoll[key] === pending[key], 'roll context');
      } else requireValue(state.lastRoll === null, 'roll not yet taken');
    } else requireValue(state.pendingCardId === null && state.pendingSpell === null, 'no pending spell');
    if (state.lastRoll !== null) {
      const roll = state.lastRoll;
      requireValue(roll && Array.isArray(roll.dice) && roll.dice.length === 2 && roll.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6), 'dice');
      requireValue(roll.rawTotal === roll.dice[0] + roll.dice[1], 'raw roll');
      requireValue(Number.isSafeInteger(roll.loadedBonus) && roll.loadedBonus >= 0, 'roll Loaded');
      requireValue(Number.isSafeInteger(roll.attackingFate) && roll.attackingFate >= 0 && roll.attackingFate % 2 === 0, 'attacking modifier');
      requireValue(Number.isSafeInteger(roll.defendingFate) && roll.defendingFate <= 0 && roll.defendingFate % 2 === 0, 'defending modifier');
      requireValue(Number.isSafeInteger(roll.total) && roll.total === roll.rawTotal + roll.loadedBonus + roll.attackingFate + roll.defendingFate, 'modified roll');
      requireValue([0, 1].includes(roll.casterIndex) && SPELL_RULES[roll.spellId]?.requiresRoll === true, 'roll spell');
    }
  } else {
    requireValue(state.selectedCardId === null || (state.phase === 'main' && isOwnCard(state.selectedCardId)), 'selected card');
    requireValue(['fate', 'resolving'].includes(state.phase) ? isOwnCard(state.pendingCardId) : state.pendingCardId === null, 'pending card');
  }
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
    requireValue((realRules ? LOG_TYPES : LOG_TYPES.slice(0, 9)).includes(entry.type), 'log type');
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

/** Preserve the established 24-to-30 zone mapping before enabling real spell rules. */
function upgradeSampleDeck(legacy) {
  assertSavedState(legacy, 2, LEGACY_DECK_SIZE, makeLegacyDeck);
  const replacements = new Map();
  const players = legacy.players.map((player) => {
    const deck = makeDeckCards(player.id, true);
    makeLegacyDeck(player.id).forEach((card, copy) => replacements.set(card.id, deck[copy]));
    const zones = Object.fromEntries(['hand', 'deck', 'discard'].map((zone) => [
      zone, player[zone].map((card) => replacements.get(card.id)),
    ]));
    zones.deck.push(...deck.slice(LEGACY_DECK_SIZE));
    return { ...player, ...zones };
  });
  const replaceId = (id) => id === null ? null : replacements.get(id).id;
  const migrated = {
    ...legacy, version: 3, players,
    selectedCardId: replaceId(legacy.selectedCardId),
    pendingCardId: replaceId(legacy.pendingCardId),
    refreshCardIds: legacy.refreshCardIds.map(replaceId),
    log: structuredClone(legacy.log),
  };
  addLog(migrated, 'Sample decks upgraded to the 30-slab Fire and Water decklists. Each Spell Tower received 6 additional slabs.');
  return migrated;
}

/** Old previews never paid costs or applied effects: cancel their pending spell safely. */
function upgradePreviewRules(preview) {
  assertSavedState(preview, 3, DECK_SIZE, (owner) => makeDeckCards(owner, true));
  const next = structuredClone(preview);
  next.version = SAVE_VERSION;
  const wasPending = ['fate', 'resolving'].includes(next.phase);
  if (wasPending) next.phase = 'main';
  next.players.forEach((player, index) => {
    const eligibleNow = index === next.activePlayer && next.phase === 'main';
    player.loadedPending = eligibleNow ? 0 : player.loaded;
    if (!eligibleNow) player.loaded = 0;
    const definitions = new Map(makeDeckCards(player.id).map((card) => [card.id, card]));
    for (const zone of ['hand', 'deck', 'discard']) player[zone] = player[zone].map((card) => definitions.get(card.id));
  });
  next.pendingSpell = null;
  next.pendingCardId = null;
  next.fatePlayer = null;
  next.lastRoll = null;
  next.primaryUsed = false;
  next.selectedFateCardIds = [];
  if (wasPending || (next.selectedCardId && !canSelectCard(next, next.selectedCardId))) next.selectedCardId = null;
  applyFlowUpgrade(next);
  addLog(next, 'Spell effects, printed mana costs and two-player Fate are now active. Existing Loaded is available on the current turn or queued for its owner’s next turn.');
  if (wasPending) addLog(next, 'The unfinished preview spell was cancelled without charging mana, spending Embers, discarding it or applying effects.');
  assertGame(next);
  return next;
}

/** A v4 cast log records payment even when its rolling spell is still pending. */
function upgradePrimaryTurns(previous) {
  assertSavedState(previous, 4, DECK_SIZE, makeDeckCards);
  const next = structuredClone(previous);
  next.version = 5;
  const turnStart = next.log.findLastIndex((entry) => entry.type === 'turn');
  const active = next.players[next.activePlayer];
  next.primaryUsed = next.pendingSpell !== null || next.log.slice(turnStart + 1)
    .some((entry) => entry.type === 'cast' && entry.playerId === active.id
      && entry.message.startsWith(`${active.name} casts `)
      && / for \d+ mana(?: and \d+ Embers)?\.$/.test(entry.message));
  next.selectedFateCardIds = next.phase === 'fate' && next.selectedCardId ? [next.selectedCardId] : [];
  addLog(next, 'One primary spell per turn is now active. Select all desired Fate slabs before casting them together; casting advances to the next response or roll.');
  return upgradeFlowRules(next);
}

function applyFlowUpgrade(next) {
  const water = next.players[1];
  const previousFlow = water.element;
  water.element = Math.min(previousFlow, MAX_FLOW);
  addLog(next, `Water spells now gain Flow after resolving: printed gains replace the default +1, and Flow is capped at 5.${previousFlow > 5 ? ` Water's saved Flow was capped from ${previousFlow} to 5.` : ''}`);
}

/** Preserve published v5 progress while enforcing the newly clarified Flow cap. */
function upgradeFlowRules(previous) {
  assertSavedState(previous, 5, DECK_SIZE, makeDeckCards);
  const next = structuredClone(previous);
  next.version = SAVE_VERSION;
  applyFlowUpgrade(next);
  assertGame(next);
  return next;
}

export function migrateSavedGame(value) {
  if (validateSavedGame(value)) return value;
  if (!value || ![1, 2, 3, 4, 5].includes(value.version)) return null;
  try {
    if (value.version === 5) return upgradeFlowRules(value);
    if (value.version === 4) return upgradePrimaryTurns(value);
    const source = value.version === 1 ? migrateVersionOne(value) : value;
    const preview = source.version === 2 ? upgradeSampleDeck(source) : source;
    return upgradePreviewRules(preview);
  } catch { return null; }
}
