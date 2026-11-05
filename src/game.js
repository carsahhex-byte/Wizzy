import { SPELL_CATALOG, DECK_LISTS, DECK_SIZE } from './spells.js';
import { normalizeDeck, validateDeck } from './decks.js';
import { MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS, SPELL_RULES, applySpellEffect, getEmberSpendRange } from './effects.js';

export { SPELL_CATALOG, DECK_LISTS, DECK_SIZE, SPELL_RULES, getEmberSpendRange };

/** A committed slab stays in hand through its roll and post-roll Fate responses. */
export const SAVE_VERSION = 10;
export const PHASES = Object.freeze(['setup', 'initiative', 'main', 'rolling', 'fate', 'resolving', 'end', 'refresh', 'ready-to-pass']);
const PENDING_PHASES = ['fate', 'rolling', 'resolving'];
const LOG_TYPES = ['info', 'turn', 'round', 'cast', 'fate', 'resolve', 'refresh', 'damage', 'victory', 'dice', 'resource', 'heal', 'shield', 'loaded'];

export const CARD_CATALOG = Object.freeze({
  fire: Object.freeze(Object.values(SPELL_CATALOG).filter(card => card.element === 'Fire' || card.category === 'Fate')),
  water: Object.freeze(Object.values(SPELL_CATALOG).filter(card => card.element === 'Water' || card.category === 'Fate')),
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

function makeDeckCards(owner, deckDefinition) {
  return deckDefinition.entries.flatMap(({ spellId, quantity }) => {
    const spell = SPELL_CATALOG[spellId];
    return Array.from({ length: quantity }, (_, copy) => ({
      ...spell, id: `${owner}-${spellId}-${copy}`,
      cost: spell.manaCost, effectPending: false, description: spell.effectText,
    }));
  });
}

function makeDeck(owner, random, deckDefinition) {
  const deck = makeDeckCards(owner, deckDefinition);
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

export function createGame(seed = Date.now(), deckConfigs = {}) {
  if (!deckConfigs || typeof deckConfigs !== 'object' || Array.isArray(deckConfigs)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(deckConfigs))
    || Object.keys(deckConfigs).some((key) => !['fire', 'water'].includes(key))) {
    throw new Error('Deck configurations must be keyed by fire or water.');
  }
  const definitions = Object.fromEntries(['fire', 'water'].map(id => {
    const input = deckConfigs[id];
    if (validateDeck(input) && input.element !== id) throw new Error(`The ${id} wizard requires a ${id} deck.`);
    return [id, validateDeck(input) ? normalizeDeck(input) : { element: id, entries: [] }];
  }));
  const ready = ['fire', 'water'].every(id => validateDeck(definitions[id]));
  const random = randomGenerator(seed);
  const players = ['fire', 'water'].map((id) => {
    const deckDefinition = definitions[id];
    const deck = ready ? makeDeck(id, random, deckDefinition) : [];
    return {
      id, name: id === 'fire' ? 'Fire' : 'Water',
      elementName: id === 'fire' ? 'Embers' : 'Flow',
      hp: MAX_HP, maxHp: MAX_HP, mana: 3, shield: 0, element: 0, loaded: 0, loadedPending: 0,
      turnsStarted: 0, deckDefinition,
      hand: deck.splice(0, 4), deck, discard: [],
    };
  });
  const state = {
    version: SAVE_VERSION, round: 1, activePlayer: 0,
    phase: ready ? 'initiative' : 'setup', primaryUsed: false, selectedCardId: null, selectedFateCardIds: [], pendingCardId: null, pendingSpell: null,
    fatePlayer: null, lastRoll: null, refreshCardIds: [],
    startingPlayer: null, secondPlayerOpeningDrawPending: true,
    initiative: { round: 1, rolls: [null, null], history: [], winner: null, legacy: false },
    status: 'playing', winner: null, players, log: [],
  };
  if (ready) {
    addLog(state, `The duel begins. Both wizards receive ${MAX_HP} HP, 3 mana, and 4 spell slabs.`);
    addLog(state, 'Each wizard rolls one die to decide who starts. Ties are rerolled.');
  } else addLog(state, 'Build and save a legal 30-slab Fire deck and Water deck to begin. Previous spellbook decks are not used.');
  return state;
}

/** Opening dice are independent of spell rolls, Fate and Loaded bonuses. */
export function rollInitiative(state, playerIndex, random = Math.random) {
  if (!inPhase(state, 'initiative') || ![0, 1].includes(playerIndex)
    || state.initiative.rolls[playerIndex] !== null) return state;
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) return state;
  const next = structuredClone(state);
  const value = Math.floor(sample * 6) + 1;
  next.initiative.rolls[playerIndex] = value;
  const player = next.players[playerIndex];
  addLog(next, `${player.name} rolls ${value} for the opening turn.`, 'dice', player.id);
  const [fire, water] = next.initiative.rolls;
  if (fire === null || water === null) return next;
  if (fire === water) {
    next.initiative.history.push({ round: next.initiative.round, rolls: [fire, water] });
    next.initiative.round += 1;
    next.initiative.rolls = [null, null];
    addLog(next, `Opening dice tie at ${fire}. Both wizards roll again.`, 'dice');
    return next;
  }
  const winner = fire > water ? 0 : 1;
  next.startingPlayer = winner;
  next.activePlayer = winner;
  next.initiative.winner = winner;
  next.players[winner].turnsStarted = 1;
  next.phase = 'main';
  addLog(next, `${next.players[winner].name} wins the opening roll and takes the first turn.`, 'turn', next.players[winner].id);
  return next;
}

export function getActingPlayerIndex(state) {
  return state.phase === 'fate' ? state.fatePlayer : state.activePlayer;
}

function fateModifier(state, card, playerIndex = state.fatePlayer, twistDirection = null) {
  if (card.category !== 'Fate') return null;
  const attacking = playerIndex === state.activePlayer;
  if (card.spellId === 'FAT-001') return attacking ? 4 : null;
  if (card.spellId === 'FAT-002') return attacking ? null : -4;
  if (card.spellId === 'FAT-003') return twistDirection ?? (attacking ? 2 : -2);
  return null;
}

/** Whether a player can afford a role-eligible Fate slab for this spell. */
export function canPlayFate(state, playerIndex) {
  if (![0, 1].includes(playerIndex) || !state.pendingSpell) return false;
  const player = state.players[playerIndex];
  return player.hand.some(card => fateModifier(state, card, playerIndex) !== null && player.mana >= card.manaCost);
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

/** Pay once and capture Loaded before the dice roll. Fate follows the result. */
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
    fateStep: null, fatePlays: [], fateHistory: [],
  };
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  addLog(next, `${player.name} casts ${card.name} for ${card.manaCost} mana${emberSpent ? ` and ${emberSpent} Embers` : ''}.`, 'cast', player.id);
  if (rule.requiresRoll) {
    caster.loaded = 0;
    next.lastRoll = null;
    next.phase = 'rolling';
    addLog(next, 'Roll the dice, then the defender has the first Fate response.', 'dice', caster.id);
    return next;
  }
  // Immediate spells deliberately skip Fate, dice and animation-only pending states.
  return completeSpell(next, null);
}

/** Commit a selected Fate batch; each Twist may choose either sign. */
export function castFateSelected(state, { twistDirections = {} } = {}) {
  if (!inPhase(state, 'fate') || !canCastSelected(state)) return state;
  if (!twistDirections || typeof twistDirections !== 'object' || Array.isArray(twistDirections)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(twistDirections))) return state;
  const selected = state.players[state.fatePlayer].hand.filter(card => state.selectedFateCardIds.includes(card.id));
  if (Object.entries(twistDirections).some(([id, direction]) => !selected.some(card => card.id === id && card.spellId === 'FAT-003') || ![2, -2].includes(direction))) return state;
  const next = structuredClone(state);
  const player = next.players[next.fatePlayer];
  const attacking = next.fatePlayer === next.activePlayer;
  const playedIds = [...next.selectedFateCardIds];
  for (const id of next.selectedFateCardIds) {
    const index = player.hand.findIndex((card) => card.id === id);
    const [card] = player.hand.splice(index, 1);
    const modifier = fateModifier(next, card, next.fatePlayer, twistDirections[id]);
    player.mana -= card.manaCost;
    player.discard.push(card);
    next.pendingSpell[attacking ? 'attackingFate' : 'defendingFate'] += modifier;
    next.pendingSpell[attacking ? 'attackingFateCardIds' : 'defendingFateCardIds'].push(card.id);
    next.pendingSpell.fatePlays.push({ cardId: card.id, spellId: card.spellId, playerIndex: next.fatePlayer, modifier, step: next.pendingSpell.fateStep });
    addLog(next, `${player.name} casts ${card.name}: ${modifier > 0 ? '+' : ''}${modifier} to the rolled total.`, 'fate', player.id);
  }
  updateModifiedRoll(next);
  return advanceFate(next, 'cast', playedIds);
}

function updateModifiedRoll(next) {
  const pending = next.pendingSpell;
  next.lastRoll.attackingFate = pending.attackingFate;
  next.lastRoll.defendingFate = pending.defendingFate;
  next.lastRoll.total = next.lastRoll.rawTotal + pending.loadedBonus + pending.attackingFate + pending.defendingFate;
}

function openFateStep(next, step) {
  next.pendingSpell.fateStep = step;
  next.phase = 'fate';
  next.fatePlayer = step === 'attacker' ? next.activePlayer : 1 - next.activePlayer;
  if (!canPlayFate(next, next.fatePlayer)) {
    addLog(next, `${next.players[next.fatePlayer].name} has no playable Fate; this response is skipped.`, 'fate', next.players[next.fatePlayer].id);
    return advanceFate(next, 'auto-skip');
  }
  addLog(next, `${next.players[next.fatePlayer].name} may respond with ${step === 'attacker' ? 'attacking' : 'defending'} Fate to the rolled total ${next.lastRoll.total}.`, 'fate', next.players[next.fatePlayer].id);
  return next;
}

function advanceFate(next, action, cardIds = []) {
  const player = next.players[next.fatePlayer];
  const step = next.pendingSpell.fateStep;
  next.pendingSpell.fateHistory.push({ step, playerIndex: next.fatePlayer, action, cardIds });
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  if (action === 'skip') addLog(next, `${player.name} skips Fate.`, 'fate', player.id);
  if (step === 'defender-first') return openFateStep(next, 'attacker');
  if (step === 'attacker' && action === 'cast') return openFateStep(next, 'defender-final');
  next.fatePlayer = null;
  next.pendingSpell.fateStep = 'complete';
  next.phase = 'resolving';
  addLog(next, `Fate responses finish at Modified Roll ${next.lastRoll.total}. The spell resolves.`, 'fate');
  return next;
}

export function skipFate(state) {
  if (!inPhase(state, 'fate')) return state;
  return advanceFate(structuredClone(state), 'skip');
}

/** Capture two d6 exactly once, then offer the defender post-roll Fate. */
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
  addLog(next, `${next.players[next.activePlayer].name} rolls ${dice.join(' + ')} = ${rawTotal}; Loaded ${pending.loadedBonus >= 0 ? '+' : ''}${pending.loadedBonus}, attacking Fate +${pending.attackingFate}, defending Fate ${pending.defendingFate}: total ${next.lastRoll.total}.`, 'dice', next.players[next.activePlayer].id);
  return openFateStep(next, 'defender-first');
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
  if (next.activePlayer === next.startingPlayer) {
    next.round += 1;
    addLog(next, `Round ${next.round} begins.`, 'round');
  }
  const player = next.players[next.activePlayer];
  const isOpeningTurn = player.turnsStarted === 0;
  player.turnsStarted += 1;
  player.loaded = player.loadedPending;
  player.loadedPending = 0;
  if (isOpeningTurn) {
    const count = next.secondPlayerOpeningDrawPending && next.activePlayer !== next.startingPlayer
      ? Math.min(1, Math.max(0, 5 - player.hand.length), player.deck.length) : 0;
    if (count) player.hand.push(...player.deck.splice(0, count));
    if (next.activePlayer !== next.startingPlayer) next.secondPlayerOpeningDrawPending = false;
    addLog(next, `${player.name} takes their opening turn${count ? ', draws 1 extra slab for going second' : ''}; ${player.hand.length} spell slabs in hand.`, 'turn', player.id);
  } else {
    const gainedMana = Math.min(2, MAX_MANA - player.mana);
    player.mana += gainedMana;
    const count = drawToFive(player);
    const emptyNote = player.deck.length === 0 && player.hand.length < 5 ? ' Spell Tower is empty.' : '';
    addLog(next, `${player.name}'s turn. Gained ${gainedMana} mana and drew ${count} ${count === 1 ? 'slab' : 'slabs'}; ${player.hand.length} in hand.${emptyNote}`, 'turn', player.id);
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

/** Self-damage from an owner's spell bypasses Shield. */
export function applyDamage(state, targetIndex, amount, { selfDamage = false } = {}) {
  if (state.status !== 'playing' || ['setup', 'initiative'].includes(state.phase) || ![0, 1].includes(targetIndex) || !Number.isSafeInteger(amount) || amount <= 0) return state;
  const next = structuredClone(state);
  const target = next.players[targetIndex];
  const absorbed = selfDamage ? 0 : Math.min(target.shield, amount);
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

/** Validate only the replacement spellbook; previous duels remain archived. */
export function assertGame(state) {
  requireValue(state !== null && typeof state === 'object' && state.version === SAVE_VERSION, 'unsupported save');
  requireValue(Number.isSafeInteger(state.round) && state.round >= 1, 'round');
  requireValue([0, 1].includes(state.activePlayer), 'active player');
  requireValue(['playing', 'finished'].includes(state.status) && PHASES.includes(state.phase), 'status or phase');
  requireValue(typeof state.primaryUsed === 'boolean', 'primary spell used');
  requireValue(Array.isArray(state.players) && state.players.length === 2, 'players');
  const setup = state.phase === 'setup';
  const allIds = new Set();
  state.players.forEach((player, index) => {
    const id = index === 0 ? 'fire' : 'water';
    requireValue(player && player.id === id && player.name === (index === 0 ? 'Fire' : 'Water'), 'player identity');
    requireValue(player.elementName === (index === 0 ? 'Embers' : 'Flow'), 'element name');
    requireValue(player.maxHp === MAX_HP && Number.isSafeInteger(player.hp) && player.hp >= 0 && player.hp <= MAX_HP, 'HP');
    for (const key of ['mana', 'shield', 'element', 'loaded', 'loadedPending', 'turnsStarted']) {
      requireValue(Number.isSafeInteger(player[key]) && player[key] >= 0, key);
    }
    requireValue(player.mana <= MAX_MANA && player.shield <= MAX_SHIELD, 'resource cap');
    requireValue(player.element <= (index === 0 ? MAX_EMBERS : MAX_FLOW), 'element cap');
    for (const zone of ['hand', 'deck', 'discard']) requireValue(Array.isArray(player[zone]), zone);
    requireValue(player.hand.length <= 5, 'hand limit');
    const cards = [...player.hand, ...player.deck, ...player.discard];
    requireValue(player.deckDefinition?.element === id, 'deck element');
    if (setup) {
      requireValue(cards.length === 0 && (validateDeck(player.deckDefinition)
        || Array.isArray(player.deckDefinition.entries) && player.deckDefinition.entries.length === 0), 'deck setup');
    } else {
      const deckDefinition = normalizeDeck(player.deckDefinition);
      requireValue(cards.length === DECK_SIZE, 'card conservation');
      const definitions = new Map(makeDeckCards(id, deckDefinition).map(card => [card.id, card]));
      for (const card of cards) {
        requireValue(card && typeof card.id === 'string' && !allIds.has(card.id), 'unique cards');
        allIds.add(card.id);
        const expected = definitions.get(card.id);
        requireValue(expected !== undefined, 'card identity');
        for (const [key, value] of Object.entries(expected)) requireValue(card[key] === value, 'spell definition');
      }
    }
  });
  const initiative = state.initiative;
  requireValue(initiative && initiative.legacy === false && typeof state.secondPlayerOpeningDrawPending === 'boolean', 'opening tracking');
  requireValue(Array.isArray(initiative.rolls) && initiative.rolls.length === 2 && initiative.rolls.every(roll => roll === null
    || Number.isInteger(roll) && roll >= 1 && roll <= 6), 'opening dice');
  requireValue(Array.isArray(initiative.history) && Number.isSafeInteger(initiative.round) && initiative.round >= 1
    && initiative.history.length === initiative.round - 1, 'opening tie history');
  initiative.history.forEach((entry, index) => requireValue(entry && entry.round === index + 1
    && Array.isArray(entry.rolls) && entry.rolls.length === 2 && entry.rolls[0] === entry.rolls[1]
    && Number.isInteger(entry.rolls[0]) && entry.rolls[0] >= 1 && entry.rolls[0] <= 6, 'opening tie'));
  if (setup || state.phase === 'initiative') {
    requireValue(state.status === 'playing' && state.round === 1 && state.activePlayer === 0
      && state.startingPlayer === null && initiative.winner === null && initiative.rolls.includes(null)
      && state.secondPlayerOpeningDrawPending && !state.primaryUsed && state.players.every(player => player.turnsStarted === 0), 'pending opening');
    if (setup) requireValue(state.players.some(player => !validateDeck(player.deckDefinition))
      && initiative.round === 1 && initiative.rolls.every(roll => roll === null), 'missing battle decks');
  } else {
    const [fire, water] = initiative.rolls;
    requireValue(fire !== null && water !== null && fire !== water && initiative.winner === (fire > water ? 0 : 1)
      && state.startingPlayer === initiative.winner && state.players[state.startingPlayer].turnsStarted >= 1, 'opening winner');
    requireValue(state.secondPlayerOpeningDrawPending === (state.players[1 - state.startingPlayer].turnsStarted === 0), 'second opening draw');
  }
  requireValue(state.phase === 'fate' ? [0, 1].includes(state.fatePlayer) : state.fatePlayer === null, 'Fate player');
  requireValue(state.selectedCardId === null || canSelectCard(state, state.selectedCardId), 'selected card');
  requireValue(Array.isArray(state.selectedFateCardIds) && new Set(state.selectedFateCardIds).size === state.selectedFateCardIds.length, 'Fate selection');
  requireValue(state.phase === 'fate'
    ? state.selectedFateCardIds.every(id => canSelectCard(state, id))
      && (state.selectedFateCardIds.length ? state.selectedFateCardIds.includes(state.selectedCardId) : state.selectedCardId === null)
    : state.selectedFateCardIds.length === 0, 'selected Fate ownership');
  const hand = state.players[state.activePlayer].hand;
  const isOwnCard = id => typeof id === 'string' && hand.some(card => card.id === id);
  if (PENDING_PHASES.includes(state.phase)) {
    requireValue(state.primaryUsed === true, 'committed primary spell');
    const pending = state.pendingSpell;
    requireValue(pending && isOwnCard(state.pendingCardId) && pending.cardId === state.pendingCardId
      && pending.casterIndex === state.activePlayer, 'pending spell');
    const card = hand.find(entry => entry.id === pending.cardId);
    requireValue(pending.spellId === card.spellId && SPELL_RULES[card.spellId]?.requiresRoll === true, 'rolling spell');
    requireValue(Number.isSafeInteger(pending.emberSpent) && pending.emberSpent >= 0, 'Ember reservation');
    const range = getEmberSpendRange(card.spellId, state.players[state.activePlayer].element + pending.emberSpent);
    requireValue(pending.emberSpent >= range.min && pending.emberSpent <= range.max, 'Ember payment');
    requireValue(Number.isSafeInteger(pending.loadedBonus) && pending.loadedBonus >= 0 && state.players[state.activePlayer].loaded === 0, 'captured Loaded');
    requireValue(Array.isArray(pending.fatePlays) && Array.isArray(pending.fateHistory) && pending.fateHistory.length <= 3, 'Fate history');
    const steps = ['defender-first', 'attacker', 'defender-final'];
    const owners = [1 - state.activePlayer, state.activePlayer, 1 - state.activePlayer];
    const playedIds = new Set();
    pending.fateHistory.forEach((entry, index) => {
      requireValue(entry && entry.step === steps[index] && entry.playerIndex === owners[index]
        && ['cast', 'skip', 'auto-skip'].includes(entry.action) && Array.isArray(entry.cardIds)
        && new Set(entry.cardIds).size === entry.cardIds.length, 'Fate response sequence');
      requireValue(entry.action === 'cast' ? entry.cardIds.length > 0 : entry.cardIds.length === 0, 'Fate response action');
      if (index === 2) requireValue(pending.fateHistory[1].action === 'cast', 'final defender trigger');
    });
    for (const play of pending.fatePlays) {
      requireValue(play && [0, 1].includes(play.playerIndex) && !playedIds.has(play.cardId), 'Fate play identity');
      playedIds.add(play.cardId);
      const fate = state.players[play.playerIndex].discard.find(entry => entry.id === play.cardId);
      requireValue(fate && fate.spellId === play.spellId && fateModifier(state, fate, play.playerIndex, play.modifier) !== null, 'Fate ownership and role');
      requireValue(play.modifier === fateModifier(state, fate, play.playerIndex, fate.spellId === 'FAT-003' ? play.modifier : null)
        && (fate.spellId !== 'FAT-003' || [2, -2].includes(play.modifier)), 'Fate direction');
      requireValue(pending.fateHistory.some(entry => entry.action === 'cast' && entry.step === play.step
        && entry.playerIndex === play.playerIndex && entry.cardIds.includes(play.cardId)), 'Fate commitment');
    }
    requireValue(pending.fateHistory.flatMap(entry => entry.cardIds).length === pending.fatePlays.length, 'Fate play count');
    for (const [kind, owner] of [['attackingFate', state.activePlayer], ['defendingFate', 1 - state.activePlayer]]) {
      const plays = pending.fatePlays.filter(play => play.playerIndex === owner);
      const ids = pending[`${kind}CardIds`];
      requireValue(Array.isArray(ids) && ids.length === plays.length && ids.every((id, index) => id === plays[index].cardId), 'Fate card totals');
      requireValue(pending[kind] === plays.reduce((sum, play) => sum + play.modifier, 0), 'Fate modifier total');
    }
    if (state.phase === 'rolling') {
      requireValue(state.lastRoll === null && pending.fateStep === null && pending.fateHistory.length === 0 && pending.fatePlays.length === 0, 'pre-Fate dice');
    } else {
      requireValue(state.lastRoll !== null, 'completed dice');
      for (const key of ['spellId', 'casterIndex', 'loadedBonus', 'attackingFate', 'defendingFate']) requireValue(state.lastRoll[key] === pending[key], 'roll context');
      if (state.phase === 'fate') {
        const index = pending.fateHistory.length;
        requireValue(index < steps.length && pending.fateStep === steps[index] && state.fatePlayer === owners[index]
          && canPlayFate(state, state.fatePlayer), 'current Fate window');
        if (index === 2) requireValue(pending.fateHistory[1].action === 'cast', 'final defender response');
      } else requireValue(pending.fateStep === 'complete' && pending.fateHistory.length >= 2
        && pending.fateHistory.length === (pending.fateHistory[1].action === 'cast' ? 3 : 2), 'finished Fate sequence');
    }
  } else requireValue(state.pendingCardId === null && state.pendingSpell === null, 'no pending spell');
  if (state.lastRoll !== null) {
    const roll = state.lastRoll;
    requireValue(roll && Array.isArray(roll.dice) && roll.dice.length === 2 && roll.dice.every(die => Number.isInteger(die) && die >= 1 && die <= 6), 'dice');
    requireValue(roll.rawTotal === roll.dice[0] + roll.dice[1], 'raw roll');
    requireValue(Number.isSafeInteger(roll.loadedBonus) && roll.loadedBonus >= 0, 'roll Loaded');
    for (const key of ['attackingFate', 'defendingFate']) requireValue(Number.isSafeInteger(roll[key]) && roll[key] % 2 === 0, 'Fate modifier');
    requireValue(Number.isSafeInteger(roll.total) && roll.total === roll.rawTotal + roll.loadedBonus + roll.attackingFate + roll.defendingFate, 'modified roll');
    requireValue([0, 1].includes(roll.casterIndex) && SPELL_RULES[roll.spellId]?.requiresRoll === true, 'roll spell');
  }
  requireValue(Array.isArray(state.refreshCardIds) && new Set(state.refreshCardIds).size === state.refreshCardIds.length, 'refresh selection');
  requireValue(state.phase === 'refresh' ? state.refreshCardIds.every(isOwnCard) : state.refreshCardIds.length === 0, 'refresh cards');
  if (state.status === 'playing') requireValue(state.winner === null && state.players.every(player => player.hp > 0), 'active duel');
  else requireValue([0, 1].includes(state.winner) && state.players[1 - state.winner].hp === 0 && state.players[state.winner].hp > 0
    && state.selectedCardId === null && state.phase === 'main', 'winner');
  requireValue(Array.isArray(state.log) && state.log.length > 0, 'combat log');
  state.log.forEach((entry, index) => {
    requireValue(entry && entry.id === index + 1 && Number.isSafeInteger(entry.round) && entry.round > 0 && entry.round <= state.round, 'log entry');
    requireValue(typeof entry.message === 'string' && entry.message.length <= 500 && LOG_TYPES.includes(entry.type)
      && [null, 'fire', 'water'].includes(entry.playerId), 'log content');
  });
}

export function validateSavedGame(value) {
  try { assertGame(value); return true; } catch { return false; }
}

/** Old spell IDs cannot be mapped to the replacement catalog without inventing decks. */
export function migrateSavedGame(value) {
  return validateSavedGame(value) ? value : null;
}
