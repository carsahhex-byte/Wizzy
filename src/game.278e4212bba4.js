import { SPELL_CATALOG, DECK_LISTS, DECK_SIZE, LEGACY_SPELL_NAMES } from './spells.3798c5f746c7.js';
import { normalizeDeck, validateDeck, normalizeDeckSlot, validateDeckSlot } from './decks.07030483671f.js';
import { SPELLBOOK_1, getDeckSpellbook, isSpellbookId } from './spellbooks.ecb2ff572f97.js';
import { MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS, SPELL_RULES, applySpellEffect, getEmberSpendRange } from './effects.75f2ef5e4e40.js';

export { SPELL_CATALOG, DECK_LISTS, DECK_SIZE, SPELL_RULES, getEmberSpendRange };

/** A committed slab stays in hand through its roll and post-roll Fate responses. */
export const SAVE_VERSION = 14;
// Network rules can change while deck IDs and local save formats stay compatible.
export const COMBAT_RULES_VERSION = 'ember-consumption-v1';
export const MAX_ENHANCEMENT = 30;
export const ENHANCEMENT_STEP = 10;
export const ENHANCEMENT_THRESHOLD = 6;
export const ENHANCEMENT_ROLL_RULE = 'fate-tiered-v1';
export const AURA_COST = 1;
export const AURA_DURATION = 3;
export const AURA_BONUS = 10;
export const HAND_LIMIT = 6;
export const OPENING_HAND_SIZE = 5;
export const PHASES = Object.freeze(['setup', 'initiative', 'main', 'enhancing', 'rolling', 'fate', 'resolving', 'end', 'refresh', 'ready-to-pass']);
const PENDING_PHASES = ['enhancing', 'fate', 'rolling', 'resolving'];
const LOG_TYPES = ['info', 'turn', 'round', 'cast', 'fate', 'resolve', 'refresh', 'damage', 'victory', 'dice', 'resource', 'heal', 'shield', 'loaded', 'enhancement', 'aura'];

export const CARD_CATALOG = Object.freeze({
  fire: Object.freeze(Object.values(SPELL_CATALOG).filter(card => card.element === 'Fire' || card.category === 'Fate')),
  water: Object.freeze(Object.values(SPELL_CATALOG).filter(card => card.element === 'Water' || card.category === 'Fate')),
});

/** Private online views expose only the viewer's deck definition. */
export function getGameSpellbook(state) {
  return getDeckSpellbook(state?.players?.find(player => player?.deckDefinition)?.deckDefinition);
}

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

function applyWaterZeroCastMana(state) {
  const caster = state.players[state.pendingSpell.casterIndex];
  const gained = Math.min(1, Math.max(0, MAX_MANA - caster.mana));
  caster.mana += gained;
  state.pendingSpell.manaOnCastApplied = true;
  addLog(state, `${caster.name} gains ${gained} Mana on cast${caster.mana === MAX_MANA ? ` (maximum ${MAX_MANA})` : ''}.`, 'resource', caster.id);
}

function inPhase(state, ...phases) {
  return state.status === 'playing' && phases.includes(state.phase);
}

function drawToHandLimit(player) {
  const drawCount = Math.min(Math.max(0, HAND_LIMIT - player.hand.length), player.deck.length);
  player.hand.push(...player.deck.splice(0, drawCount));
  return drawCount;
}

export function createGame(seed = Date.now(), deckConfigs = {}) {
  if (!deckConfigs || typeof deckConfigs !== 'object' || Array.isArray(deckConfigs)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(deckConfigs))
    || Object.keys(deckConfigs).some((key) => !['fire', 'water'].includes(key))) {
    throw new Error('Deck configurations must be keyed by fire or water.');
  }
  const spellbookId = getDeckSpellbook(deckConfigs.fire || deckConfigs.water);
  if (!isSpellbookId(spellbookId)) throw new Error('Choose Spellbook 1 or Spellbook 2.');
  const definitions = Object.fromEntries(['fire', 'water'].map(id => {
    const input = deckConfigs[id];
    if (validateDeck(input) && input.element !== id) throw new Error(`The ${id} wizard requires a ${id} deck.`);
    if (input && !isSpellbookId(getDeckSpellbook(input))) throw new Error('Choose Spellbook 1 or Spellbook 2.');
    return [id, validateDeck(input) ? normalizeDeck(input)
      : validateDeckSlot(input) && input.element === id ? normalizeDeckSlot(input)
        : { element: id, entries: [], ...(spellbookId === SPELLBOOK_1 ? {} : { spellbookId }) }];
  }));
  if (getDeckSpellbook(definitions.fire) !== getDeckSpellbook(definitions.water)) {
    throw new Error('Both wizards must use the same spellbook.');
  }
  const ready = ['fire', 'water'].every(id => validateDeck(definitions[id]));
  const random = randomGenerator(seed);
  const players = ['fire', 'water'].map((id) => {
    const deckDefinition = definitions[id];
    const deck = ready ? makeDeck(id, random, deckDefinition) : [];
    return {
      id, name: id === 'fire' ? 'Fire' : 'Water',
      elementName: id === 'fire' ? 'Embers' : 'Flow',
      hp: MAX_HP, maxHp: MAX_HP, mana: 3, shield: 0, element: 0, loaded: 0, loadedPending: 0,
      turnsStarted: 0, enhancement: 0, auraTurns: 0, deckDefinition,
      hand: deck.splice(0, OPENING_HAND_SIZE), deck, discard: [],
    };
  });
  const state = {
    version: SAVE_VERSION, round: 1, activePlayer: 0,
    phase: ready ? 'initiative' : 'setup', primaryUsed: false, primaryAction: null, selectedCardId: null, selectedFateCardIds: [], pendingCardId: null, pendingSpell: null,
    fatePlayer: null, lastRoll: null, refreshCardIds: [],
    startingPlayer: null, secondPlayerOpeningDrawPending: true,
    initiative: { round: 1, rolls: [null, null], history: [], winner: null, legacy: false },
    status: 'playing', winner: null, players, log: [],
  };
  if (ready) {
    addLog(state, `The duel begins. Both wizards receive ${MAX_HP} HP, 3 mana, and up to ${OPENING_HAND_SIZE} spell slabs from their towers.`);
    addLog(state, 'Each wizard rolls one die to decide who starts. Ties are rerolled.');
  } else addLog(state, 'Build and save legal Fire and Water decks of 1–30 slabs to begin. Previous spellbook decks are not used.');
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

function fateModifier(state, card, playerIndex = state.fatePlayer, twistDirection = null, casterIndex = state.pendingSpell?.casterIndex ?? state.activePlayer) {
  if (card.category !== 'Fate') return null;
  const attacking = playerIndex === casterIndex;
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
    if (!Array.isArray(ids) || ids.length !== 1 || new Set(ids).size !== ids.length || !ids.every((id) => canSelectCard(state, id))) return false;
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
      : [cardId];
    return { ...state, selectedFateCardIds, selectedCardId: selectedFateCardIds.at(-1) ?? null };
  }
  return { ...state, selectedCardId: state.selectedCardId === cardId ? null : cardId };
}

/** Pay once; immediate spells resolve now, while rolled spells capture Loaded before Fate. */
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
  next.primaryAction = 'spell';
  const caster = next.players[next.activePlayer];
  caster.mana -= card.manaCost;
  caster.element -= emberSpent;
  next.pendingCardId = card.id;
  next.pendingSpell = {
    kind: 'spell', casterIndex: next.activePlayer, cardId: card.id, spellId: card.spellId, emberSpent,
    loadedBonus: rule.requiresRoll ? caster.loaded : 0,
    attackingFate: 0, defendingFate: 0,
    attackingFateCardIds: [], defendingFateCardIds: [],
    fateStep: null, fatePlays: [], fateHistory: [], fatePasses: 0, legacyFateHistoryLength: 0,
  };
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  next.lastRoll = null;
  addLog(next, `${player.name} casts ${card.name} for ${card.manaCost} mana${emberSpent ? ` and ${emberSpent} Embers` : ''}.`, 'cast', player.id);
  if (card.spellId === 'Water-0') applyWaterZeroCastMana(next);
  if (rule.requiresRoll) {
    caster.loaded = 0;
    next.phase = 'rolling';
    addLog(next, 'Roll the dice, then the defender has the first Fate response.', 'dice', caster.id);
    return next;
  }
  // Immediate spells deliberately skip Fate, dice and animation-only pending states.
  return completeSpell(next, null);
}

/** Commit one Fate link and give the other wizard priority. */
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

function openFateStep(next, playerIndex) {
  next.pendingSpell.fateStep = `response-${next.pendingSpell.fateHistory.length + 1}`;
  next.phase = 'fate';
  next.fatePlayer = playerIndex;
  if (!canPlayFate(next, playerIndex)) {
    addLog(next, `${next.players[playerIndex].name} has no playable Fate and passes automatically.`, 'fate', next.players[playerIndex].id);
    return advanceFate(next, 'auto-skip');
  }
  addLog(next, `${next.players[playerIndex].name} may respond to Modified Roll ${next.lastRoll.total}.`, 'fate', next.players[playerIndex].id);
  return next;
}

function advanceFate(next, action, cardIds = []) {
  const playerIndex = next.fatePlayer;
  next.pendingSpell.fateHistory.push({ step: next.pendingSpell.fateHistory.length + 1, playerIndex, action, cardIds });
  // Each played card records the same numbered link as its history entry.
  if (action === 'cast') {
    for (const play of next.pendingSpell.fatePlays) if (cardIds.includes(play.cardId)) play.step = next.pendingSpell.fateHistory.length;
  }
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  next.pendingSpell.fatePasses = action === 'cast' ? 0 : next.pendingSpell.fatePasses + 1;
  if (action === 'skip') addLog(next, `${next.players[playerIndex].name} passes Fate.`, 'fate', next.players[playerIndex].id);
  if (next.pendingSpell.fatePasses < 2) return openFateStep(next, 1 - playerIndex);
  next.fatePlayer = null;
  next.pendingSpell.fateStep = 'complete';
  next.phase = 'resolving';
  addLog(next, `Both wizards pass. Fate ends at Modified Roll ${next.lastRoll.total}; ${next.pendingSpell.kind === 'enhancement' ? 'Enhancement' : 'the spell'} resolves.`, 'fate');
  return next;
}

export function skipFate(state) {
  if (!inPhase(state, 'fate')) return state;
  return advanceFate(structuredClone(state), 'skip');
}

/** Capture two d6 exactly once, then offer the defender post-roll Fate. */
export function rollDice(state, random = Math.random) {
  if (!inPhase(state, 'rolling') || state.pendingSpell?.kind !== 'spell') return state;
  const samples = [random(), random()];
  if (samples.some((value) => !Number.isFinite(value) || value < 0 || value >= 1)) return state;
  const dice = samples.map((value) => Math.floor(value * 6) + 1);
  const next = structuredClone(state);
  const pending = next.pendingSpell;
  const rawTotal = dice[0] + dice[1];
  next.lastRoll = {
    kind: 'spell', dice, rawTotal, loadedBonus: pending.loadedBonus,
    attackingFate: pending.attackingFate, defendingFate: pending.defendingFate,
    total: rawTotal + pending.loadedBonus + pending.attackingFate + pending.defendingFate,
    spellId: pending.spellId, casterIndex: pending.casterIndex,
  };
  addLog(next, `${next.players[next.activePlayer].name} rolls ${dice.join(' + ')} = ${rawTotal}; Loaded ${pending.loadedBonus >= 0 ? '+' : ''}${pending.loadedBonus}, attacking Fate +${pending.attackingFate}, defending Fate ${pending.defendingFate}: total ${next.lastRoll.total}.`, 'dice', next.players[next.activePlayer].id);
  return openFateStep(next, 1 - next.activePlayer);
}

/** Nominal percentage-point award from the final Modified Roll, before the bank cap. */
export function getEnhancementBonus(total) {
  if (!Number.isSafeInteger(total)) return 0;
  return total >= 12 ? 30 : total >= 9 ? 20 : total >= ENHANCEMENT_THRESHOLD ? 10 : 0;
}

/** The zero-Mana Enhancement attempt uses this turn's primary action. */
export function canEnhance(state, playerIndex = state.activePlayer) {
  return playerIndex === state.activePlayer && inPhase(state, 'main') && !state.primaryUsed
    && state.players[playerIndex]?.enhancement < MAX_ENHANCEMENT;
}

export function activateEnhancement(state) {
  if (!canEnhance(state)) return state;
  const next = structuredClone(state);
  next.primaryUsed = true;
  next.primaryAction = 'enhancement';
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  next.lastRoll = null;
  next.pendingSpell = enhancementPending(next);
  next.phase = 'enhancing';
  addLog(next, `${next.players[next.activePlayer].name} attempts Enhancement for 0 Mana instead of casting a primary spell.`, 'enhancement', next.players[next.activePlayer].id);
  return next;
}

function enhancementPending(state) {
  return {
    kind: 'enhancement', casterIndex: state.activePlayer, cardId: null, spellId: null,
    emberSpent: 0, loadedBonus: 0, enhancementBefore: state.players[state.activePlayer].enhancement,
    enhancementRule: ENHANCEMENT_ROLL_RULE, attackingFate: 0, defendingFate: 0,
    attackingFateCardIds: [], defendingFateCardIds: [], fateStep: null,
    fatePlays: [], fateHistory: [], fatePasses: 0, legacyFateHistoryLength: 0,
  };
}

export function rollEnhancement(state, random = Math.random) {
  if (!inPhase(state, 'enhancing') || state.pendingSpell?.kind !== 'enhancement') return state;
  const samples = [random(), random()];
  if (samples.some(value => !Number.isFinite(value) || value < 0 || value >= 1)) return state;
  const next = structuredClone(state);
  const dice = samples.map(value => Math.floor(value * 6) + 1);
  const rawTotal = dice[0] + dice[1];
  const player = next.players[next.activePlayer];
  next.lastRoll = { kind: 'enhancement', spellId: null, casterIndex: next.activePlayer,
    dice, rawTotal, total: rawTotal, loadedBonus: 0, attackingFate: 0, defendingFate: 0,
    resolved: false, success: null, enhancementBefore: next.pendingSpell.enhancementBefore,
    enhancementAfter: null, enhancementRule: ENHANCEMENT_ROLL_RULE, enhancementBonus: null, enhancementGain: null };
  addLog(next, `${player.name} rolls ${dice.join(' + ')} = ${rawTotal} for Enhancement; the defender has the first Fate response.`, 'dice', player.id);
  return openFateStep(next, 1 - next.activePlayer);
}

function completeEnhancement(next) {
  const pending = next.pendingSpell;
  const player = next.players[pending.casterIndex];
  const roll = next.lastRoll;
  const bonus = getEnhancementBonus(roll.total);
  player.enhancement = Math.min(MAX_ENHANCEMENT, pending.enhancementBefore + bonus);
  Object.assign(roll, {
    resolved: true, success: bonus > 0, enhancementBonus: bonus,
    enhancementAfter: player.enhancement, enhancementGain: player.enhancement - pending.enhancementBefore,
    ...Object.fromEntries(['fatePlays', 'fateHistory', 'fatePasses', 'attackingFateCardIds', 'defendingFateCardIds', 'legacyFateHistoryLength']
      .map(key => [key, structuredClone(pending[key])])),
  });
  clearPending(next);
  next.phase = 'main';
  addLog(next, `${player.name} resolves Enhancement at Modified Roll ${roll.total} (raw ${roll.rawTotal}; attacking Fate ${roll.attackingFate >= 0 ? '+' : ''}${roll.attackingFate}; defending Fate ${roll.defendingFate}): ${roll.success ? `tier +${bonus}%; gains +${roll.enhancementGain}%; ${player.enhancement}% Enh.${roll.enhancementGain < bonus ? ' (maximum 30%)' : ''}` : `no increase; ${player.enhancement}% Enh.`}`, 'enhancement', player.id);
  return next;
}


/** Aura grants a fixed bonus through the next three owner turns after activation. */
export function canActivateAura(state, playerIndex = state.activePlayer) {
  return playerIndex === state.activePlayer && inPhase(state, 'main') && !state.primaryUsed
    && state.players[playerIndex]?.mana >= AURA_COST && state.players[playerIndex]?.auraTurns === 0;
}

export function activateAura(state) {
  if (!canActivateAura(state)) return state;
  const next = structuredClone(state);
  const player = next.players[next.activePlayer];
  player.mana -= AURA_COST;
  player.auraTurns = AURA_DURATION;
  next.primaryUsed = true;
  next.primaryAction = 'aura';
  next.selectedCardId = null;
  next.selectedFateCardIds = [];
  next.lastRoll = null;
  addLog(next, `${player.name} activates Aura for ${AURA_COST} Mana: +${AURA_BONUS}% damage through their next ${AURA_DURATION} turns. The activation turn does not count.`, 'aura', player.id);
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
  if (state.lastRoll?.kind === 'enhancement' && !state.lastRoll.resolved) state.lastRoll = null;
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
  if (state.pendingSpell?.kind === 'enhancement') return completeEnhancement(structuredClone(state));
  if (!state.players[state.activePlayer].hand.some((card) => card.id === state.pendingCardId)) return state;
  return completeSpell(structuredClone(state), state.lastRoll.total);
}

/** Background taps only cancel choices that have not committed an effect or pass. */
export function canCancelStagedAction(state) {
  if (!inPhase(state, 'main', 'fate', 'end', 'refresh')) return false;
  if (state.phase === 'end' || state.phase === 'refresh') return true;
  return state.selectedCardId !== null
    || state.phase === 'fate' && state.selectedFateCardIds.length > 0;
}

export function cancelStagedAction(state) {
  if (!canCancelStagedAction(state)) return state;
  return { ...state,
    phase: state.phase === 'end' || state.phase === 'refresh' ? 'main' : state.phase,
    selectedCardId: null, selectedFateCardIds: [], refreshCardIds: [],
  };
}

/** First click reveals the optional refresh; a later click passes the turn. */
export function endTurn(state) {
  if (!inPhase(state, 'main', 'end', 'refresh', 'ready-to-pass')) return state;
  const next = structuredClone(state);
  next.selectedCardId = null;
  if (next.phase === 'main') {
    next.phase = 'end';
    return next;
  }
  // The first End Turn click only reveals refresh. The activation's existing
  // primary marker also survives refresh, so only subsequent owner passes tick Aura.
  const endingPlayer = next.players[next.activePlayer];
  if (endingPlayer.loaded > 0) addLog(next, `${endingPlayer.name}'s unused Loaded +${endingPlayer.loaded} expires.`, 'loaded', endingPlayer.id);
  endingPlayer.loaded = 0;
  if (endingPlayer.auraTurns > 0 && next.primaryAction !== 'aura') {
    endingPlayer.auraTurns -= 1;
    addLog(next, endingPlayer.auraTurns > 0
      ? `${endingPlayer.name}'s Aura has ${endingPlayer.auraTurns} owner turns remaining.`
      : `${endingPlayer.name}'s Aura expires.`, 'aura', endingPlayer.id);
  }
  next.phase = 'main';
  next.primaryUsed = false;
  next.primaryAction = null;
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
      ? Math.min(1, Math.max(0, HAND_LIMIT - player.hand.length), player.deck.length) : 0;
    if (count) player.hand.push(...player.deck.splice(0, count));
    if (next.activePlayer !== next.startingPlayer) next.secondPlayerOpeningDrawPending = false;
    addLog(next, `${player.name} takes their opening turn${count ? ', draws 1 extra slab for going second' : ''}; ${player.hand.length} spell slabs in hand.`, 'turn', player.id);
  } else {
    const gainedMana = Math.min(2, MAX_MANA - player.mana);
    player.mana += gainedMana;
    const count = drawToHandLimit(player);
    const emptyNote = player.deck.length === 0 && player.hand.length < HAND_LIMIT ? ' Spell Tower is empty.' : '';
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

/** Discard zero through all selected cards, refill to the hand limit and pass. */
export function confirmRefresh(state) {
  if (!inPhase(state, 'refresh')) return state;
  const next = structuredClone(state);
  const player = next.players[next.activePlayer];
  const selected = new Set(next.refreshCardIds);
  const discards = player.hand.filter((card) => selected.has(card.id));
  player.hand = player.hand.filter((card) => !selected.has(card.id));
  player.discard.push(...discards);
  const count = drawToHandLimit(player);
  next.refreshCardIds = [];
  const emptyNote = player.deck.length === 0 && player.hand.length < HAND_LIMIT ? ' Spell Tower is empty.' : '';
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

/** Recheck paid cards, roles, alternating priority and modifier sums, including historical Enhancement chains. */
function assertFateTrace(state, trace, casterIndex) {
  requireValue(Array.isArray(trace.fatePlays) && Array.isArray(trace.fateHistory)
    && trace.fateHistory.length <= 2 * trace.fatePlays.length + 2, 'Fate history');
  requireValue(Number.isInteger(trace.legacyFateHistoryLength) && trace.legacyFateHistoryLength >= 0
    && trace.legacyFateHistoryLength <= trace.fateHistory.length, 'legacy Fate prefix');
  const playedIds = new Set();
  let passes = 0;
  trace.fateHistory.forEach((entry, index) => {
    requireValue(passes < 2, 'closed Fate chain');
    requireValue(entry && entry.step === index + 1 && entry.playerIndex === (index % 2 === 0 ? 1 - casterIndex : casterIndex)
      && ['cast', 'skip', 'auto-skip'].includes(entry.action) && Array.isArray(entry.cardIds)
      && new Set(entry.cardIds).size === entry.cardIds.length, 'Fate response sequence');
    requireValue(entry.action === 'cast' ? entry.cardIds.length === 1 || index < trace.legacyFateHistoryLength && entry.cardIds.length > 0
      : entry.cardIds.length === 0, 'Fate response action');
    passes = entry.action === 'cast' ? 0 : passes + 1;
  });
  requireValue(trace.fatePasses === passes && Number.isInteger(passes), 'Fate pass count');
  for (const play of trace.fatePlays) {
    requireValue(play && [0, 1].includes(play.playerIndex) && !playedIds.has(play.cardId), 'Fate play identity');
    playedIds.add(play.cardId);
    const card = state.players[play.playerIndex].discard.find(entry => entry.id === play.cardId);
    requireValue(card && card.spellId === play.spellId && fateModifier(state, card, play.playerIndex, play.modifier, casterIndex) !== null, 'Fate ownership and role');
    requireValue(play.modifier === fateModifier(state, card, play.playerIndex, card.spellId === 'FAT-003' ? play.modifier : null, casterIndex)
      && (card.spellId !== 'FAT-003' || [2, -2].includes(play.modifier)), 'Fate direction');
    requireValue(trace.fateHistory.some(entry => entry.action === 'cast' && entry.step === play.step
      && entry.playerIndex === play.playerIndex && entry.cardIds.includes(play.cardId)), 'Fate commitment');
  }
  requireValue(trace.fateHistory.flatMap(entry => entry.cardIds).length === trace.fatePlays.length, 'Fate play count');
  for (const [kind, owner] of [['attackingFate', casterIndex], ['defendingFate', 1 - casterIndex]]) {
    const plays = trace.fatePlays.filter(play => play.playerIndex === owner);
    const ids = trace[`${kind}CardIds`];
    requireValue(Array.isArray(ids) && ids.length === plays.length && ids.every((id, index) => id === plays[index].cardId), 'Fate card totals');
    requireValue(trace[kind] === plays.reduce((sum, play) => sum + play.modifier, 0), 'Fate modifier total');
  }
  return passes;
}

/** Validate only the replacement spellbook; previous duels remain archived. */
export function assertGame(state) {
  requireValue(state !== null && typeof state === 'object' && state.version === SAVE_VERSION, 'unsupported save');
  requireValue(Number.isSafeInteger(state.round) && state.round >= 1, 'round');
  requireValue([0, 1].includes(state.activePlayer), 'active player');
  requireValue(['playing', 'finished'].includes(state.status) && PHASES.includes(state.phase), 'status or phase');
  requireValue(typeof state.primaryUsed === 'boolean', 'primary spell used');
  requireValue(state.primaryUsed ? ['spell', 'enhancement', 'aura'].includes(state.primaryAction)
    : state.primaryAction === null, 'primary action');
  requireValue(Array.isArray(state.players) && state.players.length === 2, 'players');
  requireValue(isSpellbookId(getGameSpellbook(state))
    && state.players.every(player => getDeckSpellbook(player?.deckDefinition) === getGameSpellbook(state)), 'battle spellbook');
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
    requireValue(Number.isSafeInteger(player.enhancement) && player.enhancement >= 0 && player.enhancement <= MAX_ENHANCEMENT && player.enhancement % ENHANCEMENT_STEP === 0, 'Enhancement cap');
    requireValue(Number.isSafeInteger(player.auraTurns) && player.auraTurns >= 0 && player.auraTurns <= AURA_DURATION, 'Aura duration');
    requireValue(player.mana <= MAX_MANA && player.shield <= MAX_SHIELD, 'resource cap');
    requireValue(player.element <= (index === 0 ? MAX_EMBERS : MAX_FLOW), 'element cap');
    for (const zone of ['hand', 'deck', 'discard']) requireValue(Array.isArray(player[zone]), zone);
    requireValue(player.hand.length <= HAND_LIMIT, 'hand limit');
    const cards = [...player.hand, ...player.deck, ...player.discard];
    requireValue(player.deckDefinition?.element === id, 'deck element');
    if (setup) {
      requireValue(cards.length === 0 && validateDeckSlot(player.deckDefinition), 'deck setup');
    } else {
      const deckDefinition = normalizeDeck(player.deckDefinition);
      requireValue(cards.length === deckDefinition.entries.reduce((total, entry) => total + entry.quantity, 0), 'card conservation');
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
  requireValue(Array.isArray(state.selectedFateCardIds) && state.selectedFateCardIds.length <= 1 && new Set(state.selectedFateCardIds).size === state.selectedFateCardIds.length, 'Fate selection');
  requireValue(state.phase === 'fate'
    ? state.selectedFateCardIds.every(id => canSelectCard(state, id))
      && (state.selectedFateCardIds.length ? state.selectedFateCardIds.includes(state.selectedCardId) : state.selectedCardId === null)
    : state.selectedFateCardIds.length === 0, 'selected Fate ownership');
  const hand = state.players[state.activePlayer].hand;
  const isOwnCard = id => typeof id === 'string' && hand.some(card => card.id === id);
  if (PENDING_PHASES.includes(state.phase)) {
    const pending = state.pendingSpell;
    requireValue(pending && ['spell', 'enhancement'].includes(pending.kind)
      && pending.casterIndex === state.activePlayer && state.primaryUsed
      && state.primaryAction === pending.kind, 'committed primary action');
    requireValue(pending.kind === 'spell' && pending.spellId === 'Water-0'
      ? pending.manaOnCastApplied === true
      : !Object.hasOwn(pending, 'manaOnCastApplied'), 'on-cast Mana tracking');
    if (pending.kind === 'enhancement') {
      requireValue(state.pendingCardId === null && pending.cardId === null && pending.spellId === null
        && pending.emberSpent === 0 && pending.loadedBonus === 0
        && pending.enhancementBefore === state.players[state.activePlayer].enhancement
        && pending.enhancementBefore < MAX_ENHANCEMENT && pending.enhancementRule === ENHANCEMENT_ROLL_RULE
        && pending.legacyFateHistoryLength === 0 && state.phase !== 'rolling', 'pending Enhancement');
    } else {
      requireValue(isOwnCard(state.pendingCardId) && pending.cardId === state.pendingCardId && state.phase !== 'enhancing', 'pending spell');
      const card = hand.find(entry => entry.id === pending.cardId);
      requireValue(pending.spellId === card.spellId && SPELL_RULES[card.spellId]?.requiresRoll === true, 'rolling spell');
      requireValue(Number.isSafeInteger(pending.emberSpent) && pending.emberSpent >= 0, 'Ember reservation');
      const range = getEmberSpendRange(card.spellId, state.players[state.activePlayer].element + pending.emberSpent);
      requireValue(pending.emberSpent >= range.min && pending.emberSpent <= range.max, 'Ember payment');
      requireValue(Number.isSafeInteger(pending.loadedBonus) && pending.loadedBonus >= 0 && state.players[state.activePlayer].loaded === 0, 'captured Loaded');
    }
    const passes = assertFateTrace(state, pending, state.activePlayer);
    if (['rolling', 'enhancing'].includes(state.phase)) {
      requireValue(state.lastRoll === null && pending.fateStep === null && pending.fateHistory.length === 0
        && pending.fatePlays.length === 0 && passes === 0, 'pre-Fate dice');
    } else {
      requireValue(state.lastRoll !== null && state.lastRoll.kind === pending.kind, 'completed dice');
      for (const key of ['spellId', 'casterIndex', 'loadedBonus', 'attackingFate', 'defendingFate']) requireValue(state.lastRoll[key] === pending[key], 'roll context');
      if (pending.kind === 'enhancement') requireValue(state.lastRoll.enhancementBefore === pending.enhancementBefore
        && state.lastRoll.resolved === false, 'unawarded Enhancement');
      if (state.phase === 'fate') {
        const index = pending.fateHistory.length;
        requireValue(passes < 2 && pending.fateStep === `response-${index + 1}`
          && state.fatePlayer === (index % 2 === 0 ? 1 - state.activePlayer : state.activePlayer)
          && canPlayFate(state, state.fatePlayer), 'current Fate window');
      } else requireValue(pending.fateStep === 'complete' && passes === 2, 'finished Fate sequence');
    }
  } else requireValue(state.pendingCardId === null && state.pendingSpell === null, 'no pending spell');
  if (state.lastRoll !== null) {
    const roll = state.lastRoll;
    requireValue(roll && Array.isArray(roll.dice) && roll.dice.length === 2 && roll.dice.every(die => Number.isInteger(die) && die >= 1 && die <= 6), 'dice');
    requireValue(roll.rawTotal === roll.dice[0] + roll.dice[1], 'raw roll');
    requireValue(Number.isSafeInteger(roll.loadedBonus) && roll.loadedBonus >= 0, 'roll Loaded');
    for (const key of ['attackingFate', 'defendingFate']) requireValue(Number.isSafeInteger(roll[key]) && roll[key] % 2 === 0, 'Fate modifier');
    requireValue(Number.isSafeInteger(roll.total) && roll.total === roll.rawTotal + roll.loadedBonus + roll.attackingFate + roll.defendingFate, 'modified roll');
    requireValue([0, 1].includes(roll.casterIndex), 'roll owner');
    if (roll.kind === 'enhancement') {
      requireValue(roll.spellId === null && roll.loadedBonus === 0, 'Enhancement dice');
      requireValue(Number.isInteger(roll.enhancementBefore) && roll.enhancementBefore >= 0 && roll.enhancementBefore < MAX_ENHANCEMENT
        && roll.enhancementBefore % ENHANCEMENT_STEP === 0, 'Enhancement starting bank');
      if (roll.enhancementRule === ENHANCEMENT_ROLL_RULE) {
        requireValue(typeof roll.resolved === 'boolean', 'Enhancement resolution marker');
        if (!roll.resolved) {
          requireValue(state.pendingSpell?.kind === 'enhancement' && ['fate', 'resolving'].includes(state.phase)
            && ['success', 'enhancementBonus', 'enhancementAfter', 'enhancementGain'].every(key => roll[key] === null)
            && !Object.hasOwn(roll, 'fateHistory') && !Object.hasOwn(roll, 'fatePlays'), 'unresolved Enhancement award');
        } else {
          const bonus = getEnhancementBonus(roll.total);
          requireValue(roll.legacyFateHistoryLength === 0 && assertFateTrace(state, roll, roll.casterIndex) === 2, 'Enhancement Fate completion');
          requireValue(roll.success === (bonus > 0) && roll.enhancementBonus === bonus
            && roll.enhancementAfter === Math.min(MAX_ENHANCEMENT, roll.enhancementBefore + bonus)
            && roll.enhancementGain === roll.enhancementAfter - roll.enhancementBefore, 'tiered Enhancement outcome');
        }
      } else {
        // Only migrated, already-finalized raw-roll records use the earlier rules.
        requireValue(roll.resolved === true && roll.attackingFate === 0 && roll.defendingFate === 0
          && roll.success === (roll.rawTotal >= ENHANCEMENT_THRESHOLD)
          && !Object.hasOwn(roll, 'fateHistory') && !Object.hasOwn(roll, 'fatePlays'), 'legacy Enhancement dice');
        if (roll.enhancementRule === 'tiered-v1') {
          const bonus = getEnhancementBonus(roll.rawTotal);
          requireValue(roll.enhancementBonus === bonus && roll.enhancementAfter === Math.min(MAX_ENHANCEMENT, roll.enhancementBefore + bonus)
            && roll.enhancementGain === roll.enhancementAfter - roll.enhancementBefore, 'legacy tiered Enhancement outcome');
        } else requireValue(roll.enhancementRule === 'legacy-flat-v1' && !Object.hasOwn(roll, 'enhancementBonus')
          && !Object.hasOwn(roll, 'enhancementGain') && roll.enhancementAfter === roll.enhancementBefore
            + (roll.success ? ENHANCEMENT_STEP : 0), 'legacy Enhancement outcome');
      }
    } else requireValue(roll.kind === 'spell' && SPELL_RULES[roll.spellId]?.requiresRoll === true, 'roll spell');
  }
  if (state.phase === 'enhancing') requireValue(state.status === 'playing' && state.primaryUsed && state.primaryAction === 'enhancement' && state.lastRoll === null
    && state.selectedCardId === null && state.players[state.activePlayer].enhancement < MAX_ENHANCEMENT, 'pending Enhancement');
  if (state.primaryAction === 'aura') requireValue(state.players[state.activePlayer].auraTurns === AURA_DURATION, 'activated Aura');
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

// Refresh only exact known previous definitions. Completed outcomes stay paid;
// an already-committed legacy Water-0 receives its new on-cast Mana once.
function refreshCurrentSpellCards(state) {
  const previousText = {
    'Fire-6': ['Deal 22 damage. On a 7+, deal 28 instead. On a 10+, deal 36 instead.'],
    'Fire-9': ['Gain 2 Embers. On a 7+, gain 3 instead. If you have 4 or more Embers after resolution, gain 8 Shield.'],
    'Fire-11': ['Deal 8 damage and gain 2 Embers. On a 7+, gain +2 to your next roll. On a 10+, gain +4 instead.'],
    'Fire-14': [
      'Spend all Embers. Deal 20 damage plus 9 per Ember spent. On an 8+, deal 12 per Ember instead.',
      'Spend all Embers. Deal 20 damage plus 7 per Ember spent. On an 8+, deal 9 per Ember instead.',
    ],
    'Fire-15': ['Gain 1 Ember and 1 Mana.', 'Gain 1 Ember. On a 7+, gain 1 Mana.'],
    'Water-0': ['Gain 1 Mana.', 'On a 7+, gain 1 Mana.'],
  };
  const previousCosts = { 'Fire-11': 3, 'Water-12': 4, 'Water-14': 8 };
  let changed = false;
  const upgradedWaterCards = new Set();
  const upgradedSunsetterCards = new Set();
  for (const player of state.players) for (const zone of ['hand', 'deck', 'discard']) {
    for (const card of player[zone]) {
      if (Object.hasOwn(previousText, card?.spellId)
        && previousText[card.spellId].includes(card.effectText)
        && card.description === card.effectText
        && (card.spellId !== 'Fire-11' || card.manaCost === 3 && card.cost === 3)) {
        if (card.spellId === 'Water-0') upgradedWaterCards.add(card.id);
        if (card.spellId === 'Fire-14') upgradedSunsetterCards.add(card.id);
        if (card.spellId === 'Fire-11') card.manaCost = card.cost = SPELL_CATALOG['Fire-11'].manaCost;
        card.effectText = SPELL_CATALOG[card.spellId].effectText;
        card.description = card.effectText;
        changed = true;
      }
      // Refresh exact prior prices without changing already-paid Mana or logs.
      if (Object.hasOwn(previousCosts, card?.spellId)
        && card.manaCost === previousCosts[card.spellId] && card.cost === card.manaCost
        && card.effectText === SPELL_CATALOG[card.spellId].effectText
        && card.description === card.effectText) {
        card.manaCost = card.cost = SPELL_CATALOG[card.spellId].manaCost;
        changed = true;
      }
      // Names are presentation metadata. Preserve the action history, paid
      // costs and resolution state while upgrading only exact old names.
      if (Object.hasOwn(LEGACY_SPELL_NAMES, card?.spellId)
        && card.name === LEGACY_SPELL_NAMES[card.spellId]
        && card.name !== SPELL_CATALOG[card.spellId].name) {
        card.name = SPELL_CATALOG[card.spellId].name;
        changed = true;
      }
    }
  }
  if (['rolling', 'fate', 'resolving'].includes(state.phase)
    && state.pendingSpell?.spellId === 'Fire-14'
    && upgradedSunsetterCards.has(state.pendingSpell.cardId)) {
    const pending = state.pendingSpell;
    const caster = state.players[pending.casterIndex];
    // Prior Sunsetter casts paid all held Embers before rolling. Restore only
    // that exact reservation so the new damage rule can consume the bank once.
    // Completed outcomes and their historical paid Mana/logs stay untouched.
    if (pending.casterIndex !== 0 || pending.cardId !== state.pendingCardId
      || !caster.hand.some(card => card.id === pending.cardId)
      || caster.element !== 0 || !Number.isSafeInteger(pending.emberSpent)
      || pending.emberSpent < 0 || pending.emberSpent > MAX_EMBERS) throw new Error('Invalid prior Sunsetter reservation');
    caster.element = pending.emberSpent;
    pending.emberSpent = 0;
  }
  if (PENDING_PHASES.includes(state.phase) && state.pendingSpell?.spellId === 'Water-0'
    && upgradedWaterCards.has(state.pendingSpell.cardId)
    && !Object.hasOwn(state.pendingSpell, 'manaOnCastApplied')) {
    applyWaterZeroCastMana(state);
  }
  return changed;
}

/** Upgrade current-catalog duels without re-dealing or replaying paid effects. */
export function migrateSavedGame(value) {
  if (validateSavedGame(value)) return value;
  if (!value || ![10, 11, 12, 13, SAVE_VERSION].includes(value.version)) return null;
  try {
    if (value.version === 10 && (!Array.isArray(value.players) || value.players.some(player => !Array.isArray(player?.hand) || player.hand.length > 5))) return null;
    const next = structuredClone(value);
    const refreshedCards = refreshCurrentSpellCards(next);
    if (value.version === SAVE_VERSION) {
      if (!refreshedCards) return null;
      assertGame(next);
      return next;
    }
    next.version = SAVE_VERSION;
    const beforeEnhancement = value.version < 12;
    if (beforeEnhancement && next.phase === 'enhancing') return null;
    for (const player of next.players) {
      if (value.version < 13) player.auraTurns = 0;
      if (beforeEnhancement) player.enhancement = 0;
    }
    if (value.version < 13) next.primaryAction = next.primaryUsed
      ? next.phase === 'enhancing' || next.lastRoll?.kind === 'enhancement' ? 'enhancement' : 'spell'
      : null;
    if (beforeEnhancement && next.lastRoll) next.lastRoll.kind = 'spell';
    if (next.lastRoll?.kind === 'enhancement') {
      // Older formats never opened Fate or reserved a bonus for Enhancement.
      // Tag their already-paid result; do not recalculate or replay the award.
      const roll = next.lastRoll;
      if (Object.hasOwn(roll, 'resolved') || Object.hasOwn(roll, 'fateHistory') || Object.hasOwn(roll, 'fatePlays')) return null;
      if (Object.hasOwn(roll, 'enhancementRule') && roll.enhancementRule !== 'tiered-v1') return null;
      if (!Object.hasOwn(roll, 'enhancementRule')) roll.enhancementRule = 'legacy-flat-v1';
      roll.resolved = true;
    }
    if (next.pendingSpell) {
      if (next.pendingSpell.kind === 'enhancement') return null;
      next.pendingSpell.kind = 'spell';
    }
    if (next.phase === 'enhancing') {
      if (next.pendingSpell !== null || next.lastRoll !== null) return null;
      next.pendingSpell = enhancementPending(next);
    }
    if (beforeEnhancement && next.pendingSpell) {
      const pending = next.pendingSpell;
      const oldHistory = pending.fateHistory;
      if (!Array.isArray(oldHistory) || oldHistory.length > 3) return null;
      const oldSteps = ['defender-first', 'attacker', 'defender-final'];
      // Validate the previous finite-window protocol before translating it.
      // Its third response existed only when the attacker cast in window two.
      if (oldHistory.length === 3 && oldHistory[1].action !== 'cast') return null;
      if (next.phase === 'fate' && (oldHistory.length >= 3 || pending.fateStep !== oldSteps[oldHistory.length]
        || next.fatePlayer !== (oldHistory.length % 2 === 0 ? 1 - next.activePlayer : next.activePlayer))) return null;
      if (next.phase === 'resolving' && (pending.fateStep !== 'complete'
        || oldHistory.length !== (oldHistory[1]?.action === 'cast' ? 3 : 2))) return null;
      pending.legacyFateHistoryLength = oldHistory.length;
      oldHistory.forEach((entry, index) => {
        if (entry.step !== oldSteps[index]) throw new Error('Invalid old Fate order');
        entry.step = index + 1;
      });
      for (const play of pending.fatePlays) {
        const index = oldSteps.indexOf(play.step);
        if (index >= 0) play.step = index + 1;
      }
      pending.fatePasses = 0;
      for (const entry of oldHistory) pending.fatePasses = entry.action === 'cast' ? 0 : pending.fatePasses + 1;
      next.selectedFateCardIds = next.selectedFateCardIds.slice(-1);
      if (next.phase === 'fate') next.selectedCardId = next.selectedFateCardIds[0] ?? null;
      if (next.phase === 'rolling') pending.fateStep = null;
      else if (pending.fatePasses >= 2) { next.phase = 'resolving'; next.fatePlayer = null; pending.fateStep = 'complete'; }
      else {
        next.selectedCardId = null; next.selectedFateCardIds = [];
        openFateStep(next, oldHistory.length % 2 === 0 ? 1 - next.activePlayer : next.activePlayer);
      }
    }
    assertGame(next);
    if (value.version < 13) addLog(next, 'Aura is available for 1 Mana and lasts three owner turns after activation. Enhancement is consumed after an outgoing damaging spell resolves.');
    return next;
  } catch { return null; }
}
