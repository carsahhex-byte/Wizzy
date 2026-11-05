import { SPELL_CATALOG } from './spells.js';

export const MAX_HP = 100;
export const MAX_MANA = 10;
export const MAX_SHIELD = 30;
export const MAX_FLOW = 5;
export const MAX_EMBERS = 5;

const rule = (emberSpend = 'none', maxEmbers) => Object.freeze({
  requiresRoll: true, emberSpend,
  ...(maxEmbers === undefined ? {} : { maxEmbers }),
});
/** Every current primary has a Modified Roll threshold. Spending precedes the roll. */
export const SPELL_RULES = Object.freeze(Object.fromEntries(
  Object.values(SPELL_CATALOG).filter(card => card.category !== 'Fate').map(card => [
    card.spellId,
    card.spellId === 'Fire-5' ? rule('optional', 1)
      : card.spellId === 'Fire-12' ? rule('optional', 2)
        : ['Fire-7', 'Fire-14'].includes(card.spellId) ? rule('all') : rule(),
  ]),
));

export function getEmberSpendRange(spellId, availableEmbers) {
  const rules = SPELL_RULES[spellId];
  if (!rules) throw new Error(`No executable spell rules for ${spellId}.`);
  if (!Number.isInteger(availableEmbers) || availableEmbers < 0 || availableEmbers > MAX_EMBERS) {
    throw new Error(`Available Embers must be a whole number from 0 to ${MAX_EMBERS}.`);
  }
  if (rules.emberSpend === 'all') return { min: availableEmbers, max: availableEmbers, mandatory: true };
  return { min: 0, max: rules.emberSpend === 'optional' ? Math.min(availableEmbers, rules.maxEmbers) : 0, mandatory: false };
}

/** Shared damage primitive: self damage goes directly to HP and preserves Shield. */
export function applyDamageToPlayer(player, amount, { selfDamage = false } = {}) {
  if (!player || !Number.isFinite(amount) || amount < 0) throw new Error('Damage must be a nonnegative number.');
  const absorbed = selfDamage ? 0 : Math.min(player.shield, amount);
  const hpDamage = Math.min(player.hp, amount - absorbed);
  player.shield -= absorbed;
  player.hp -= hpDamage;
  return { amount, absorbed, hpDamage, selfDamage };
}

/** Resolve a paid spell using the final Modified Roll; the engine owns Fate timing. */
export function applySpellEffect(state, { casterIndex, spellId, rollTotal = null, emberSpent = 0 }) {
  const definition = SPELL_CATALOG[spellId];
  const rules = SPELL_RULES[spellId];
  if (!definition || !rules) throw new Error(`No executable spell effect for ${spellId}.`);
  if (![0, 1].includes(casterIndex) || !state.players?.[casterIndex] || !state.players[1 - casterIndex]) {
    throw new Error('A spell requires two players and a valid caster.');
  }
  if (!Number.isFinite(rollTotal)) throw new Error(`${definition.name} requires a resolved Modified Roll.`);
  if (!Number.isInteger(emberSpent) || emberSpent < 0 || emberSpent > MAX_EMBERS
    || (rules.emberSpend === 'none' && emberSpent !== 0)
    || (rules.maxEmbers !== undefined && emberSpent > rules.maxEmbers)) {
    throw new Error(`Invalid Ember spending for ${definition.name}.`);
  }
  const caster = state.players[casterIndex];
  const opponent = state.players[1 - casterIndex];
  const waterSpell = definition.element === 'Water';
  const flow = waterSpell ? Math.min(MAX_FLOW, caster.element) : 0;
  caster.element = Math.min(waterSpell ? MAX_FLOW : MAX_EMBERS, caster.element);
  let flowGain = 1;
  const events = [];
  const name = player => player.name ?? player.id ?? 'Wizard';
  const record = (type, player, message, detail = {}) => events.push({ type, playerId: player.id, spellId, message, ...detail });
  const damage = (player, amount) => {
    const detail = applyDamageToPlayer(player, amount, { selfDamage: player === caster });
    record('damage', player, `${name(player)} takes ${amount} damage${detail.absorbed ? ` (${detail.absorbed} absorbed by Shield)` : ''}.`, detail);
  };
  const gainShield = amount => {
    const gained = Math.min(amount, Math.max(0, MAX_SHIELD - caster.shield));
    caster.shield += gained;
    record('shield', caster, `${name(caster)} gains ${gained} Shield${caster.shield === MAX_SHIELD ? ` (maximum ${MAX_SHIELD})` : ''}.`, { amount: gained });
  };
  const removeShield = amount => {
    const removed = Math.min(amount, opponent.shield);
    opponent.shield -= removed;
    record('shield', opponent, `${name(opponent)} loses ${removed} Shield before damage.`, { amount: -removed, removed });
  };
  const gainElement = amount => {
    const maximum = waterSpell ? MAX_FLOW : MAX_EMBERS;
    const gained = Math.min(amount, Math.max(0, maximum - caster.element));
    caster.element += gained;
    const resource = waterSpell ? 'Flow' : 'Ember';
    record('resource', caster, `${name(caster)} gains ${gained} ${resource}${!waterSpell && gained !== 1 ? 's' : ''}${caster.element === maximum ? ` (maximum ${maximum})` : ''}.`, { amount: gained, resource: 'element' });
  };
  const gainLoaded = amount => {
    caster.loadedPending = (caster.loadedPending ?? 0) + amount;
    record('loaded', caster, `${name(caster)} gains +${amount} Loaded for their next turn.`, { amount });
  };
  const heal = amount => {
    const restored = Math.min(amount, Math.max(0, Math.min(MAX_HP, caster.maxHp) - caster.hp));
    caster.hp += restored;
    record('heal', caster, `${name(caster)} heals ${restored} HP.`, { amount: restored });
  };
  switch (spellId) {
    case 'Fire-1':
      damage(opponent, 6);
      if (rollTotal >= 7) gainElement(rollTotal >= 10 ? 2 : 1);
      break;
    case 'Fire-2':
      gainElement(rollTotal >= 10 ? 3 : rollTotal >= 7 ? 2 : 1);
      break;
    case 'Fire-3':
      gainShield(12);
      if (rollTotal >= 7) gainElement(rollTotal >= 10 ? 2 : 1);
      break;
    case 'Fire-4':
      damage(opponent, 5);
      gainElement(1);
      if (rollTotal >= 8) gainLoaded(rollTotal >= 11 ? 4 : 2);
      break;
    case 'Fire-5':
      if (rollTotal >= 9) removeShield(8);
      damage(opponent, 10 + 8 * emberSpent);
      break;
    case 'Fire-6':
      damage(opponent, rollTotal >= 10 ? 36 : rollTotal >= 7 ? 28 : 22);
      break;
    case 'Fire-7':
      damage(opponent, 15 + (rollTotal >= 9 ? 10 : 7) * emberSpent);
      break;
    case 'Fire-8':
      damage(opponent, 10 + (rollTotal >= 8 ? 4 : 0));
      gainElement(1);
      break;
    case 'Fire-9':
      gainElement(rollTotal >= 7 ? 3 : 2);
      if (caster.element >= 4) gainShield(8);
      break;
    case 'Fire-10':
      gainShield(16 + (rollTotal >= 8 ? 8 : 0));
      gainElement(1);
      break;
    case 'Fire-11':
      damage(opponent, 8);
      gainElement(2);
      if (rollTotal >= 7) gainLoaded(rollTotal >= 10 ? 4 : 2);
      break;
    case 'Fire-12':
      if (rollTotal >= 7) removeShield(10);
      damage(opponent, 14 + 8 * emberSpent);
      break;
    case 'Fire-13':
      damage(opponent, rollTotal >= 10 ? 45 : rollTotal >= 7 ? 38 : 30);
      break;
    case 'Fire-14':
      damage(opponent, 20 + (rollTotal >= 8 ? 12 : 9) * emberSpent);
      break;
    case 'Water-1':
      damage(opponent, 6 + (rollTotal >= 7 ? 3 : 0));
      break;
    case 'Water-2':
      damage(opponent, 4 + 2 * flow);
      if (rollTotal >= 8) flowGain += 1;
      break;
    case 'Water-3':
      gainShield(10);
      if (rollTotal >= 7) heal(rollTotal >= 10 ? 10 : 5);
      break;
    case 'Water-4':
      damage(opponent, 5 + flow);
      if (rollTotal >= 7) gainLoaded(2);
      if (rollTotal >= 10) flowGain += 1;
      break;
    case 'Water-5':
      damage(opponent, 8 + 2 * flow);
      if (rollTotal >= 9) heal(flow);
      break;
    case 'Water-6':
      damage(opponent, 15 + 3 * flow + (rollTotal >= 9 ? 8 : 0));
      break;
    case 'Water-7':
      damage(opponent, 12 + 5 * flow + (rollTotal >= 9 ? 10 : 0));
      break;
    case 'Water-8':
      damage(opponent, 9 + flow + (rollTotal >= 7 ? 4 : 0));
      break;
    case 'Water-9':
      damage(opponent, 6 + 2 * flow + (rollTotal >= 10 ? 5 : 0));
      flowGain += 1;
      break;
    case 'Water-10':
      gainShield(14);
      heal(5 + (rollTotal >= 7 ? 2 * flow : 0));
      break;
    case 'Water-11':
      damage(opponent, 8 + flow);
      gainLoaded(2);
      if (rollTotal >= 7) flowGain += 1;
      break;
    case 'Water-12':
      damage(opponent, 12 + 2 * flow);
      if (rollTotal >= 7) heal(2 * flow);
      break;
    case 'Water-13':
      damage(opponent, 20 + 3 * flow + (rollTotal >= 7 ? 10 : 0));
      break;
    case 'Water-14':
      damage(opponent, 15 + 5 * flow + (rollTotal >= 8 ? 12 : 0));
      break;
  }
  if (waterSpell) gainElement(flowGain);
  return events;
}
