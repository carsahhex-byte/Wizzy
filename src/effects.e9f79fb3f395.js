import { SPELL_CATALOG } from './spells.60141befac6b.js';

const rule = (requiresRoll = false, emberSpend = 'none', maxEmbers) => Object.freeze({
  requiresRoll,
  emberSpend,
  ...(maxEmbers === undefined ? {} : { maxEmbers }),
});

/** Timing and pre-cast choices. Fate modifies the roll in the combat engine. */
export const SPELL_RULES = Object.freeze({
  'FIR-001': rule(),
  'FIR-002': rule(),
  'FIR-003': rule(),
  'FIR-004': rule(true),
  'FIR-005': rule(true),
  'FIR-006': rule(true),
  'FIR-007': rule(),
  'FIR-008': rule(true, 'optional', 1),
  'FIR-009': rule(false, 'optional'),
  'FIR-010': rule(true),
  'FIR-011': rule(true, 'optional', 2),
  'FIR-012': rule(true, 'all'),
  'WAT-001': rule(),
  'WAT-002': rule(true),
  'WAT-003': rule(),
  'WAT-004': rule(true),
  'WAT-005': rule(),
  'WAT-006': rule(),
  'WAT-007': rule(true),
  'WAT-008': rule(true),
  'WAT-009': rule(true),
  'WAT-010': rule(true),
  'NEU-001': rule(),
  'NEU-002': rule(),
  'NEU-003': rule(),
  'NEU-004': rule(),
});

/** Inclusive range used before the engine commits a slab or spends its Embers. */
export function getEmberSpendRange(spellId, availableEmbers) {
  const rules = SPELL_RULES[spellId];
  if (!rules) throw new Error(`No executable spell rules for ${spellId}.`);
  if (!Number.isInteger(availableEmbers) || availableEmbers < 0) {
    throw new Error('Available Embers must be a nonnegative integer.');
  }
  if (rules.emberSpend === 'all') {
    return { min: availableEmbers, max: availableEmbers, mandatory: true };
  }
  return {
    min: 0,
    max: rules.emberSpend === 'optional'
      ? Math.min(availableEmbers, rules.maxEmbers ?? availableEmbers)
      : 0,
    mandatory: false,
  };
}

/**
 * Resolve one committed spell against the engine's working state.
 * Mana and chosen Embers are paid by the engine before calling this function.
 * New Loaded bonuses are queued for the caster's next own turn; they never
 * modify this spell's roll. The engine owns victory, piles, and phase changes.
 */
export function applySpellEffect(state, {
  casterIndex,
  spellId,
  rollTotal = null,
  emberSpent = 0,
}) {
  const definition = SPELL_CATALOG[spellId];
  const rules = SPELL_RULES[spellId];
  if (!definition || !rules) throw new Error(`No executable spell effect for ${spellId}.`);
  if (casterIndex !== 0 && casterIndex !== 1) throw new Error('Invalid caster index.');
  if (!state.players?.[casterIndex] || !state.players[1 - casterIndex]) {
    throw new Error('A spell requires two players.');
  }
  if (rules.requiresRoll && !Number.isFinite(rollTotal)) {
    throw new Error(`${definition.name} requires a resolved roll total.`);
  }
  if (!Number.isInteger(emberSpent) || emberSpent < 0
    || (rules.emberSpend === 'none' && emberSpent !== 0)
    || (rules.maxEmbers !== undefined && emberSpent > rules.maxEmbers)) {
    throw new Error(`Invalid Ember spending for ${definition.name}.`);
  }

  const caster = state.players[casterIndex];
  const opponent = state.players[1 - casterIndex];
  const events = [];
  const name = player => player.name ?? player.id ?? 'Wizard';
  const record = (type, player, message, detail = {}) => {
    events.push({ type, playerId: player.id, spellId, message, ...detail });
  };
  const damage = (player, amount) => {
    const absorbed = Math.min(player.shield, amount);
    const hpDamage = Math.min(player.hp, amount - absorbed);
    player.shield -= absorbed;
    player.hp -= hpDamage;
    record('damage', player,
      `${name(player)} takes ${amount} damage${absorbed ? ` (${absorbed} absorbed by Shield)` : ''}.`,
      { amount, absorbed, hpDamage, selfDamage: player === caster });
  };
  const gainShield = amount => {
    caster.shield += amount;
    record('shield', caster, `${name(caster)} gains ${amount} Shield.`, { amount });
  };
  const gainElement = amount => {
    caster.element += amount;
    const resource = caster.id === 'fire' || definition.element === 'Fire' ? 'Ember' : 'Flow';
    record('resource', caster,
      `${name(caster)} gains ${amount} ${resource}${resource === 'Ember' && amount !== 1 ? 's' : ''}.`,
      { amount, resource: 'element' });
  };
  const gainLoaded = amount => {
    caster.loadedPending = (caster.loadedPending ?? 0) + amount;
    record('loaded', caster, `${name(caster)} gains +${amount} Loaded for their next turn.`, { amount });
  };
  const heal = amount => {
    const restored = Math.min(amount, Math.max(0, caster.maxHp - caster.hp));
    caster.hp += restored;
    record('heal', caster, `${name(caster)} heals ${restored} HP.`, { amount: restored });
  };

  switch (spellId) {
    case 'FIR-001': // Spark Shot
      damage(opponent, 1);
      gainElement(1);
      break;
    case 'FIR-002': // Kindle
      gainElement(2);
      break;
    case 'FIR-003': // Cinder Wall
      gainShield(2);
      gainElement(1);
      gainLoaded(1);
      break;
    case 'FIR-004': // Fireblast
      damage(opponent, 3);
      gainElement(rollTotal >= 8 ? 2 : 1);
      break;
    case 'FIR-005': // Flameguard
      gainShield(rollTotal >= 7 ? 7 : 3);
      gainElement(1);
      break;
    case 'FIR-006': // Burn; self-damage follows the same Shield rule as attacks.
      damage(caster, rollTotal >= 10 ? 7 : 5);
      gainElement(rollTotal >= 10 ? 4 : 2);
      break;
    case 'FIR-007': // Blast Burn
      gainElement(2);
      gainLoaded(3);
      break;
    case 'FIR-008': // Blazing Rush; spending and threshold are independent additions.
      damage(opponent, 2 + 3 * emberSpent + (rollTotal >= 9 ? 4 : 0));
      break;
    case 'FIR-009': // Wildfire
      damage(opponent, 2 + 2 * emberSpent);
      break;
    case 'FIR-010': // Heatbox; the highest threshold replaces lower Ember gains.
      damage(opponent, 1);
      gainElement(rollTotal >= 10 ? 3 : rollTotal >= 7 ? 2 : 1);
      break;
    case 'FIR-011': // Inferno
      damage(opponent, 4 + 2 * emberSpent);
      if (rollTotal >= 6 && emberSpent === 0) {
        gainLoaded(3);
        gainElement(1);
      }
      break;
    case 'FIR-012': // Sunsetter; zero Embers still deals its base damage.
      damage(opponent, 3 + (rollTotal >= 9 ? 5 : 4) * emberSpent);
      break;
    case 'WAT-001': // Ripple
      damage(opponent, 1 + caster.element);
      break;
    case 'WAT-002': // Pacific
      gainElement(rollTotal >= 11 ? 3 : 2);
      break;
    case 'WAT-003': // Stillwater
      gainShield(3);
      gainLoaded(2);
      break;
    case 'WAT-004': // Undertow uses existing Flow for damage, then raises the floor.
      damage(opponent, 3 + caster.element);
      if (rollTotal >= 7 && caster.element < 2) gainElement(2 - caster.element);
      break;
    case 'WAT-005': // Restoration
      heal(9);
      break;
    case 'WAT-006': // Water Jet
      damage(opponent, 2 + caster.element);
      gainLoaded(2);
      break;
    case 'WAT-007': // Sea Surge
      damage(opponent, 2 + caster.element);
      if (rollTotal >= 7) {
        heal(5);
        gainLoaded(1);
      }
      break;
    case 'WAT-008': // Riptide replaces total damage, including with high Flow.
      damage(opponent, rollTotal >= 9 ? 8 : 2 + caster.element);
      if (rollTotal >= 9) gainLoaded(1);
      break;
    case 'WAT-009': // Tsunami
      damage(opponent, 2 + caster.element + (rollTotal >= 10 ? 9 : 0));
      break;
    case 'WAT-010': // Poseidon's Rift
      damage(opponent, (rollTotal >= 8 ? 3 : 2) * caster.element);
      break;
    case 'NEU-001': // Ward
      gainShield(3);
      gainLoaded(2);
      break;
    case 'NEU-002': // Meditate
      gainLoaded(3);
      break;
    case 'NEU-003': // Legacy Shield
      gainShield(7);
      break;
    case 'NEU-004': // Mana Shield
      gainShield(5);
      caster.mana += 1;
      record('resource', caster, `${name(caster)} gains 1 Mana.`, { amount: 1, resource: 'mana' });
      break;
  }
  return events;
}
