import { SPELL_CATALOG } from './spells.js';
import { getEnhancementBonus, MAX_ENHANCEMENT, ENHANCEMENT_STEP, AURA_COST, AURA_DURATION, AURA_BONUS } from './game.js';

// Stable IDs keep presentation independent of printed wording and roll outcomes.
const DAMAGING_SPELLS = new Set([
  'Fire-1', 'Fire-4', 'Fire-5', 'Fire-6', 'Fire-7', 'Fire-8', 'Fire-11', 'Fire-12', 'Fire-13', 'Fire-14',
  'Water-1', 'Water-2', 'Water-4', 'Water-5', 'Water-6', 'Water-7', 'Water-8', 'Water-9', 'Water-11', 'Water-12', 'Water-13', 'Water-14',
]);
const SHIELD_SPELLS = new Set(['Fire-3', 'Fire-10', 'Water-3', 'Water-10']);
const POWER_UP_SPELLS = new Set(['Fire-0', 'Fire-2', 'Fire-9', 'Fire-15', 'Water-0']);
const PRIMARY_SPELLS = Object.values(SPELL_CATALOG).filter(spell => spell.category === 'Elemental');
const SPELL_NAMES = new Map(PRIMARY_SPELLS.map(spell => [spell.name, spell.spellId]));
const COMPLETIONS = new Map(PRIMARY_SPELLS.map(spell => [`${spell.name} resolves and moves to discard.`, spell.spellId]));

/** Presentation only: Fate and unknown IDs deliberately have no animation. */
export function getSpellVisual(spellId) {
  if (typeof spellId !== 'string' || !Object.hasOwn(SPELL_CATALOG, spellId)) return null;
  const spell = SPELL_CATALOG[spellId];
  const damaging = DAMAGING_SPELLS.has(spellId);
  const kind = SHIELD_SPELLS.has(spellId) ? 'shield'
    : POWER_UP_SPELLS.has(spellId) ? 'power-up'
      : damaging ? spell.manaCost <= 3 ? 'basic-attack' : spell.manaCost <= 5 ? 'simple-cast' : 'large-cast'
        : null;
  return kind === null ? null : { kind, element: spell.element, manaCost: spell.manaCost, damaging };
}

const sameEntry = (left, right) => ['id', 'round', 'playerId', 'type', 'message'].every(key => left?.[key] === right?.[key]);
const sameCard = (left, right) => left?.id === right?.id && left?.spellId === right?.spellId;
const validLog = log => Array.isArray(log) && log.length > 0 && log.every((entry, index) => entry
  && entry.id === index + 1 && Number.isSafeInteger(entry.round) && entry.round >= 1
  && typeof entry.message === 'string' && typeof entry.type === 'string');

function isAppendOnlyUpdate(previous, next) {
  return Boolean(previous && next && previous.version === next.version && previous.status !== 'finished'
    && validLog(previous.log) && validLog(next.log) && next.log.length > previous.log.length
    && previous.log.every((entry, index) => sameEntry(entry, next.log[index]))
    && Number.isSafeInteger(previous.round) && Number.isSafeInteger(next.round) && next.round >= previous.round
    && (previous.startingPlayer === null || next.startingPlayer === previous.startingPlayer));
}

function newDiscards(previous, next) {
  if (!Array.isArray(previous.players) || !Array.isArray(next.players)
    || previous.players.length !== 2 || next.players.length !== 2) return null;
  const added = [];
  for (let index = 0; index < 2; index += 1) {
    const before = previous.players[index], after = next.players[index];
    if (!before || !after || before.id !== after.id || before.name !== after.name
      || before.id !== (index === 0 ? 'fire' : 'water')
      || !Array.isArray(before.discard) || !Array.isArray(after.discard)
      || after.discard.length < before.discard.length
      || !before.discard.every((card, position) => sameCard(card, after.discard[position]))) return null;
    const ids = new Set();
    if (!after.discard.every(card => {
      if (!card || typeof card.id !== 'string' || ids.has(card.id)) return false;
      ids.add(card.id);
      return true;
    })) return null;
    added.push(after.discard.slice(before.discard.length));
  }
  return added;
}

function castSpellId(entry, player) {
  if (entry.type !== 'cast') return null;
  const prefix = `${player.name} casts `;
  if (!entry.message.startsWith(prefix)) return null;
  const separator = entry.message.indexOf(' for ', prefix.length);
  if (separator === -1) return null;
  const printedName = entry.message.slice(prefix.length, separator);
  const spellId = SPELL_NAMES.get(printedName);
  const visual = getSpellVisual(spellId);
  if (!visual || visual.element.toLowerCase() !== player.id) return null;
  return entry.message.startsWith(`${prefix}${printedName} for ${visual.manaCost} mana`) ? spellId : null;
}

/**
 * Collect only newly completed primaries between two snapshots of the same duel.
 *
 * Pass null as previous on initial load/reconnect or when changing duels: game
 * snapshots have no unique duel ID. Existing log entries must be an unchanged
 * prefix and discard piles must only append; resets and history replacements
 * establish a new baseline instead of replaying animations.
 *
 * Keys use the resolution and primary commitment log IDs, never private hands.
 * A physical cardId is supplied only when it is unambiguous. Batched refreshes
 * may discard another copy before a later cast, so the commitLogId is the stable
 * identity even when cardId is null. Prefix keys with the UI's duel identity.
 */
export function getResolvedSpellVisuals(previous, next) {
  if (!isAppendOnlyUpdate(previous, next)) return [];
  const added = newDiscards(previous, next);
  if (!added) return [];
  const commits = [null, null], usedCounts = [new Map(), new Map()], events = [];
  const afterLogId = previous.log.at(-1).id;
  for (const entry of next.log) {
    const casterIndex = next.players.findIndex(player => player.id === entry.playerId);
    if (casterIndex === -1) continue;
    const spellId = castSpellId(entry, next.players[casterIndex]);
    if (spellId) { commits[casterIndex] = { spellId, logId: entry.id, round: entry.round }; continue; }
    if (entry.type !== 'resolve') continue;
    const resolvedSpellId = COMPLETIONS.get(entry.message), commit = commits[casterIndex];
    if (!resolvedSpellId || !commit || commit.spellId !== resolvedSpellId || commit.round !== entry.round) continue;
    commits[casterIndex] = null;
    if (entry.id <= afterLogId) continue;
    const visual = getSpellVisual(resolvedSpellId);
    if (!visual || visual.element.toLowerCase() !== next.players[casterIndex].id) continue;
    const candidates = added[casterIndex].filter(card => card.spellId === resolvedSpellId);
    const used = usedCounts[casterIndex].get(resolvedSpellId) ?? 0;
    if (used >= candidates.length) continue;
    usedCounts[casterIndex].set(resolvedSpellId, used + 1);
    const pending = previous.pendingSpell;
    const pendingCardId = commit.logId <= afterLogId && pending?.casterIndex === casterIndex
      && pending.spellId === resolvedSpellId ? pending.cardId ?? previous.pendingCardId : null;
    const cardId = candidates.some(card => card.id === pendingCardId) ? pendingCardId
      : candidates.length === 1 ? candidates[0].id : null;
    events.push({
      key: `${entry.id}:${commit.logId}:${casterIndex}:${resolvedSpellId}`,
      logId: entry.id, commitLogId: commit.logId, cardId, casterIndex, spellId: resolvedSpellId, ...visual,
    });
  }
  return events;
}


function enhancementResult(message, player) {
  const finalPrefix = `${player.name} resolves Enhancement at Modified Roll `;
  const legacyPrefix = `${player.name} rolls `;
  let total, nominal, actual, bank, capped;
  if (message.startsWith(finalPrefix)) {
    const match = message.slice(finalPrefix.length).match(/^(-?\d+) \(raw (\d+); attacking Fate ([+-]\d+); defending Fate ([+-]?\d+)\): tier \+(10|20|30)%; gains \+(10|20|30)%; (10|20|30)% Enh\.( \(maximum 30%\))?$/);
    if (!match) return null;
    const [, modified, raw, attack, defend, tier, gained, stored, cap] = match;
    total = Number(modified);
    if (!Number.isSafeInteger(total) || Number(raw) < 2 || Number(raw) > 12
      || !Number.isSafeInteger(Number(attack)) || !Number.isSafeInteger(Number(defend))
      || total !== Number(raw) + Number(attack) + Number(defend)) return null;
    [nominal, actual, bank, capped] = [tier, gained, stored, cap];
  } else if (message.startsWith(legacyPrefix)) {
    const match = message.slice(legacyPrefix.length).match(/^([1-6]) \+ ([1-6]) = (\d+) for Enhancement: tier \+(10|20|30)%; gains \+(10|20|30)%; (10|20|30)% Enh\.( \(maximum 30%\))?$/);
    if (!match) return null;
    const [, first, second, raw, tier, gained, stored, cap] = match;
    total = Number(raw);
    if (total !== Number(first) + Number(second)) return null;
    [nominal, actual, bank, capped] = [tier, gained, stored, cap];
  } else return null;
  const bonus = Number(nominal), gain = Number(actual), after = Number(bank), before = after - gain;
  if (bonus !== getEnhancementBonus(total)
    || before < 0 || before >= MAX_ENHANCEMENT || before % ENHANCEMENT_STEP !== 0
    || after !== Math.min(MAX_ENHANCEMENT, before + bonus) || Boolean(capped) !== (gain < bonus)) return null;
  return { enhancementBonus: bonus, enhancementGain: gain, enhancementBefore: before, enhancementAfter: after };
}

/**
 * New primary completions, positive tiered Enhancement rewards and Aura starts.
 * The same initial/reconnect/new-duel baseline contract as the primary collector
 * applies. Legacy flat-reward logs, failed rolls, Fate and Aura duration logs do
 * not animate. Each Enhancement result must match a same-turn zero-Mana attempt.
 */
export function getResolvedBattleVisuals(previous, next) {
  if (!isAppendOnlyUpdate(previous, next) || !newDiscards(previous, next)) return [];
  const events = getResolvedSpellVisuals(previous, next), attempts = [null, null];
  const afterLogId = previous.log.at(-1).id;
  for (const entry of next.log) {
    const casterIndex = next.players.findIndex(player => player.id === entry.playerId);
    if (casterIndex === -1) continue;
    const player = next.players[casterIndex], element = casterIndex === 0 ? 'Fire' : 'Water';
    if (entry.type === 'enhancement') {
      if (entry.message === `${player.name} attempts Enhancement for 0 Mana instead of casting a primary spell.`) {
        attempts[casterIndex] = { logId: entry.id, round: entry.round };
        continue;
      }
      const isResult = entry.message.startsWith(`${player.name} resolves Enhancement at Modified Roll `)
        || entry.message.startsWith(`${player.name} rolls `) && entry.message.includes(' for Enhancement');
      if (!isResult) continue;
      const attempt = attempts[casterIndex];
      attempts[casterIndex] = null;
      const reward = enhancementResult(entry.message, player);
      if (entry.id <= afterLogId || !reward || !attempt || attempt.round !== entry.round) continue;
      events.push({ key: `enhancement:${entry.id}:${casterIndex}`, logId: entry.id, commitLogId: attempt.logId,
        casterIndex, element, kind: 'enhancement', spellId: null, manaCost: 0, damaging: false, ...reward });
    } else if (entry.id > afterLogId && entry.type === 'aura'
      && entry.message === `${player.name} activates Aura for ${AURA_COST} Mana: +${AURA_BONUS}% damage through their next ${AURA_DURATION} turns. The activation turn does not count.`) {
      events.push({ key: `aura:${entry.id}:${casterIndex}`, logId: entry.id, casterIndex, element,
        kind: 'aura', spellId: null, manaCost: AURA_COST, damaging: false });
    }
  }
  return events.sort((left, right) => left.logId - right.logId);
}
