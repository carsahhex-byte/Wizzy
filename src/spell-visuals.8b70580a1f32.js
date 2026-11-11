import { SPELL_CATALOG, SPELL_NAME_ALIASES } from './spells.dff3d4c0f256.js';
import { getEnhancementBonus, MAX_ENHANCEMENT, ENHANCEMENT_STEP, AURA_COST, AURA_DURATION, AURA_BONUS } from './game.1a0e2f25920f.js';
import { getPlayerSchool } from './elements.f91c53cdab44.js';

// Stable IDs keep presentation independent of printed wording and roll outcomes.
const DAMAGING_SPELLS = new Set([
  'Fire-1', 'Fire-4', 'Fire-5', 'Fire-6', 'Fire-7', 'Fire-8', 'Fire-11', 'Fire-12', 'Fire-13', 'Fire-14',
  'Water-1', 'Water-2', 'Water-4', 'Water-5', 'Water-6', 'Water-7', 'Water-8', 'Water-9', 'Water-11', 'Water-12', 'Water-13', 'Water-14',
  'Earth-1', 'Earth-3', 'Earth-5',
]);
const SHIELD_SPELLS = new Set(['Fire-3', 'Fire-10', 'Water-3', 'Water-10', 'Earth-2']);
const POWER_UP_SPELLS = new Set(['Fire-0', 'Fire-2', 'Fire-9', 'Fire-15', 'Water-0', 'Earth-4']);
const schoolOf = player => getPlayerSchool(player) || '';
const PRIMARY_SPELLS = Object.values(SPELL_CATALOG).filter(spell => spell.category === 'Elemental');
const namesFor = spell => SPELL_NAME_ALIASES[spell.spellId] || [spell.name];
const SPELL_NAMES = new Map(PRIMARY_SPELLS.flatMap(spell => namesFor(spell).map(name => [name, spell.spellId])));
const COMPLETIONS = new Map(PRIMARY_SPELLS.flatMap(spell => namesFor(spell).map(name => [`${name} resolves and moves to discard.`, spell.spellId])));

/** Primary presentation only; the separate Fate collector supplies dice feedback. */
export function getSpellVisual(spellId) {
  if (typeof spellId !== 'string' || !Object.hasOwn(SPELL_CATALOG, spellId)) return null;
  const spell = SPELL_CATALOG[spellId];
  const damaging = DAMAGING_SPELLS.has(spellId);
  const kind = SHIELD_SPELLS.has(spellId) ? 'shield'
    : POWER_UP_SPELLS.has(spellId) ? 'power-up'
      : spellId === 'Earth-5' ? 'large-cast'
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
      || schoolOf(before) !== schoolOf(after)
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
  if (!visual || visual.element.toLowerCase() !== schoolOf(player)) return null;
  // Resumed casts keep their historical payment while using current visuals.
  const previousCosts = { 'Fire-11': [3], 'Water-12': [4], 'Water-14': [8], 'Earth-3': [3], 'Earth-4': [3, 5] }[spellId] ?? [];
  const legacyCost = previousCosts.some(cost => entry.message === `${prefix}${printedName} for ${cost} mana.`);
  return entry.message.startsWith(`${prefix}${printedName} for ${visual.manaCost} mana`) || legacyCost ? spellId : null;
}

function readRoll(entry, player, kind = 'spell') {
  const prefix = `${player.name} rolls `;
  if (entry.type !== 'dice' || !entry.message.startsWith(prefix)) return null;
  const text = entry.message.slice(prefix.length);
  if (kind === 'enhancement') {
    const match = text.match(/^([1-6]) \+ ([1-6]) = (\d+) for Enhancement; the defender has the first Fate response\.$/);
    if (!match || Number(match[1]) + Number(match[2]) !== Number(match[3])) return null;
    return { dice: [Number(match[1]), Number(match[2])], rawTotal: Number(match[3]), total: Number(match[3]) };
  }
  const match = text.match(/^([1-6]) \+ ([1-6]) = (\d+); Loaded ([+-]\d+), attacking Fate ([+-]\d+), defending Fate ([+-]?\d+): total (-?\d+)\.$/);
  if (!match) return null;
  const [, first, second, raw, loaded, attack, defend, total] = match;
  const values = [first, second, raw, loaded, attack, defend, total].map(Number);
  if (!values.every(Number.isSafeInteger) || Number(raw) !== Number(first) + Number(second)
    || Number(loaded) < 0 || Number(total) !== Number(raw) + Number(loaded) + Number(attack) + Number(defend)) return null;
  return { dice: [Number(first), Number(second)], rawTotal: Number(raw), total: Number(total) };
}

/** Only the exact committed-Fate log is feedback, never a response offer/pass. */
function fateCast(entry, player) {
  if (entry.type !== 'fate') return null;
  for (const spellId of ['FAT-001', 'FAT-002', 'FAT-003']) {
    const spell = SPELL_CATALOG[spellId], prefix = `${player.name} casts ${spell.name}: `;
    if (!entry.message.startsWith(prefix)) continue;
    const match = entry.message.slice(prefix.length).match(/^([+-]\d+) to the rolled total\.$/);
    if (!match) return null;
    const modifier = Number(match[1]);
    if (spellId === 'FAT-001' ? modifier !== 4 : spellId === 'FAT-002' ? modifier !== -4 : ![2, -2].includes(modifier)) return null;
    return { spellId, modifier };
  }
  return null;
}

const validFateRole = (play, playerIndex, primaryCasterIndex) => play.spellId === 'FAT-003'
  || (play.spellId === 'FAT-001' ? playerIndex === primaryCasterIndex : playerIndex !== primaryCasterIndex);

function getCastFateVisuals(previous, next, added) {
  const events = [], usedCounts = [new Map(), new Map()];
  const afterLogId = previous.log.at(-1).id;
  let context = null;
  for (const entry of next.log) {
    const playerIndex = next.players.findIndex(player => player.id === entry.playerId);
    if (playerIndex < 0) continue;
    const player = next.players[playerIndex], primaryId = castSpellId(entry, player);
    if (primaryId) context = { kind: 'spell', spellId: primaryId, casterIndex: playerIndex, round: entry.round, commitLogId: entry.id, roll: null };
    else if (entry.type === 'enhancement'
      && entry.message === `${player.name} attempts Enhancement for 0 Mana instead of casting a primary spell.`) {
      context = { kind: 'enhancement', spellId: null, casterIndex: playerIndex, round: entry.round, commitLogId: entry.id, roll: null };
    }
    if (!context || entry.round !== context.round) continue;
    const roll = playerIndex === context.casterIndex ? readRoll(entry, player, context.kind) : null;
    if (roll) { context.roll = roll; continue; }
    const play = fateCast(entry, player);
    if (play && context.roll && validFateRole(play, playerIndex, context.casterIndex)) {
      const previousTotal = context.roll.total;
      context.roll.total += play.modifier;
      if (entry.id <= afterLogId) continue;
      const candidates = added[playerIndex].filter(card => card.spellId === play.spellId);
      const used = usedCounts[playerIndex].get(play.spellId) ?? 0;
      if (used >= candidates.length) continue;
      usedCounts[playerIndex].set(play.spellId, used + 1);
      events.push({
        key: `fate:${entry.id}:${playerIndex}:${play.spellId}`, logId: entry.id, commitLogId: context.commitLogId,
        casterIndex: playerIndex, primaryCasterIndex: context.casterIndex, cardId: candidates.length === 1 ? candidates[0].id : null,
        spellId: play.spellId, kind: 'fate', element: 'Fate', manaCost: 0, damaging: false,
        modifier: play.modifier, previousTotal, modifiedTotal: context.roll.total,
        dice: [...context.roll.dice], rawTotal: context.roll.rawTotal, actionKind: context.kind,
      });
    }
    if (entry.type === 'resolve' && COMPLETIONS.has(entry.message)
      || entry.type === 'enhancement' && entry.message.startsWith(`${player.name} resolves Enhancement at Modified Roll `)) context = null;
  }
  return events;
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
  const golemForms = previous.players.map(player => Boolean(player.golemActive));
  for (const entry of next.log) {
    const casterIndex = next.players.findIndex(player => player.id === entry.playerId);
    if (casterIndex === -1) continue;
    if (entry.id > afterLogId && entry.visual?.casterIndex === casterIndex) {
      if (entry.visual.kind === 'golem-transform') golemForms[casterIndex] = true;
      if (entry.visual.kind === 'golem-revert') golemForms[casterIndex] = false;
    }
    const spellId = castSpellId(entry, next.players[casterIndex]);
    if (spellId) { commits[casterIndex] = { spellId, logId: entry.id, round: entry.round, golem: golemForms[casterIndex], modifiedTotal: null }; continue; }
    const roll = commits[casterIndex]?.round === entry.round ? readRoll(entry, next.players[casterIndex]) : null;
    if (roll) { commits[casterIndex].modifiedTotal = roll.total; continue; }
    const play = fateCast(entry, next.players[casterIndex]);
    if (play) {
      const primary = commits.filter(commit => commit?.round === entry.round && Number.isSafeInteger(commit.modifiedTotal))
        .sort((left, right) => right.logId - left.logId)[0];
      const primaryIndex = commits.indexOf(primary);
      if (primary && validFateRole(play, casterIndex, primaryIndex)) primary.modifiedTotal += play.modifier;
      continue;
    }
    if (entry.type !== 'resolve') continue;
    const resolvedSpellId = COMPLETIONS.get(entry.message), commit = commits[casterIndex];
    if (!resolvedSpellId || !commit || commit.spellId !== resolvedSpellId || commit.round !== entry.round) continue;
    commits[casterIndex] = null;
    if (entry.id <= afterLogId) continue;
    const visual = getSpellVisual(resolvedSpellId);
    if (!visual || visual.element.toLowerCase() !== schoolOf(next.players[casterIndex])) continue;
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
      ...(Number.isSafeInteger(commit.modifiedTotal) ? { modifiedTotal: commit.modifiedTotal } : {}),
      ...(visual.element === 'Earth' ? { golem: commit.golem } : {}),
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
  return { modifiedTotal: total, enhancementBonus: bonus, enhancementGain: gain, enhancementBefore: before, enhancementAfter: after };
}

/**
 * New primary completions, positive tiered Enhancement rewards and Aura starts.
 * The same initial/reconnect/new-duel baseline contract as the primary collector
 * applies. Committed Fate slabs receive separate dice feedback before the next
 * response or primary. Legacy flat rewards, failed rolls and Aura duration logs
 * do not animate. Enhancement results require a same-turn zero-Mana attempt.
 */
export function getResolvedBattleVisuals(previous, next) {
  if (!isAppendOnlyUpdate(previous, next)) return [];
  const added = newDiscards(previous, next);
  if (!added) return [];
  const events = [...getResolvedSpellVisuals(previous, next), ...getCastFateVisuals(previous, next, added)], attempts = [null, null];
  const afterLogId = previous.log.at(-1).id;
  for (const entry of next.log) {
    const effect = entry.visual;
    const taggedGolem = ['golem-transform', 'golem-revert', 'golem-strike'].includes(effect?.kind)
      && [0, 1].includes(effect.casterIndex);
    // Damage entries belong to the player taking damage. The explicit visual
    // records the Golem's owning seat separately from that log ownership.
    const casterIndex = taggedGolem ? effect.casterIndex : next.players.findIndex(player => player.id === entry.playerId);
    if (casterIndex === -1) continue;
    const player = next.players[casterIndex], school = schoolOf(player), element = school.charAt(0).toUpperCase() + school.slice(1);
    if (entry.id > afterLogId && school === 'earth' && effect?.casterIndex === casterIndex
      && ['golem-transform', 'golem-revert', 'golem-strike'].includes(effect.kind)
      && (effect.kind === 'golem-strike' ? effect.targetIndex === 1 - casterIndex && effect.amount === 15
        && entry.playerId === next.players[effect.targetIndex].id : entry.playerId === player.id)) {
      events.push({ key: `${effect.kind}:${entry.id}:${casterIndex}`, logId: entry.id, casterIndex, element,
        kind: effect.kind, spellId: null, manaCost: 0, damaging: effect.kind === 'golem-strike',
        ...(effect.kind === 'golem-strike' ? { targetIndex: effect.targetIndex, amount: effect.amount, golem: true } : {}) });
    }
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
  // Shield gain is logged inside the spell effect. Show its cast and impact
  // before the resulting transformation, even when the transition log comes first.
  const order = event => event.kind === 'golem-transform'
    ? (events.find(primary => primary.spellId && primary.casterIndex === event.casterIndex
      && primary.commitLogId < event.logId && primary.logId > event.logId)?.logId ?? event.logId) + .1
    : event.logId;
  return events.sort((left, right) => order(left) - order(right));
}
