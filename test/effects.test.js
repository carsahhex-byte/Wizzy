import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpellEffect, getEmberSpendRange, SPELL_RULES, MAX_FLOW } from '../src/effects.js';
import { SPELL_CATALOG } from '../src/spells.js';

const player = (id, overrides = {}) => ({
  id, name: id === 'fire' ? 'Fire' : 'Water', hp: 30, maxHp: 30,
  mana: 3, shield: 0, element: 0, loaded: 0, loadedPending: 0,
  ...overrides,
});

function resolve(spellId, { caster = {}, opponent = {}, roll = null, spent = 0 } = {}) {
  const casterIndex = spellId.startsWith('WAT') ? 1 : 0;
  const state = { players: [player('fire'), player('water')], phase: 'resolving', pendingCardId: 'slab-1' };
  Object.assign(state.players[casterIndex], caster);
  Object.assign(state.players[1 - casterIndex], opponent);
  const events = applySpellEffect(state, { casterIndex, spellId, rollTotal: roll, emberSpent: spent });
  return { state, caster: state.players[casterIndex], opponent: state.players[1 - casterIndex], events };
}

const cases = [
  ['Spark Shot damages and gains an Ember', 'FIR-001', {}, { element: 1 }, { hp: 29 }],
  ['Kindle gains two Embers', 'FIR-002', {}, { element: 2 }, {}],
  ['Cinder Wall shields, gains an Ember, and queues Loaded', 'FIR-003', {}, { shield: 2, element: 1, loadedPending: 1 }, {}],
  ['Fireblast below eight', 'FIR-004', { roll: 7 }, { element: 1 }, { hp: 27 }],
  ['Fireblast at eight replaces the Ember gain', 'FIR-004', { roll: 8 }, { element: 2 }, { hp: 27 }],
  ['Flameguard below seven', 'FIR-005', { roll: 6 }, { shield: 3, element: 1 }, {}],
  ['Flameguard at seven adds four Shield', 'FIR-005', { roll: 7 }, { shield: 7, element: 1 }, {}],
  ['Burn below ten', 'FIR-006', { roll: 9 }, { hp: 25, element: 2 }, {}],
  ['Burn at ten replaces damage and Ember gain', 'FIR-006', { roll: 10 }, { hp: 23, element: 4 }, {}],
  ['Blast Burn gains Embers and queues Loaded', 'FIR-007', {}, { element: 2, loadedPending: 3 }, {}],
  ['Blazing Rush can spend zero', 'FIR-008', { roll: 8 }, {}, { hp: 28 }],
  ['Blazing Rush spends one before threshold', 'FIR-008', { roll: 8, spent: 1 }, {}, { hp: 25 }],
  ['Blazing Rush threshold adds damage without spending', 'FIR-008', { roll: 9 }, {}, { hp: 24 }],
  ['Blazing Rush spending and threshold both add damage', 'FIR-008', { roll: 9, spent: 1 }, {}, { hp: 21 }],
  ['Wildfire can spend zero', 'FIR-009', {}, {}, { hp: 28 }],
  ['Wildfire scales with all chosen Embers', 'FIR-009', { spent: 3 }, {}, { hp: 22 }],
  ['Heatbox below seven', 'FIR-010', { roll: 6 }, { element: 1 }, { hp: 29 }],
  ['Heatbox at seven', 'FIR-010', { roll: 7 }, { element: 2 }, { hp: 29 }],
  ['Heatbox below ten keeps its seven threshold', 'FIR-010', { roll: 9 }, { element: 2 }, { hp: 29 }],
  ['Heatbox at ten uses only the highest gain', 'FIR-010', { roll: 10 }, { element: 3 }, { hp: 29 }],
  ['Inferno zero spend below six has no bonus', 'FIR-011', { roll: 5 }, { element: 0, loadedPending: 0 }, { hp: 26 }],
  ['Inferno zero spend at six grants its bonuses', 'FIR-011', { roll: 6 }, { element: 1, loadedPending: 3 }, { hp: 26 }],
  ['Inferno one spend forfeits the threshold bonus', 'FIR-011', { roll: 6, spent: 1 }, { element: 0, loadedPending: 0 }, { hp: 24 }],
  ['Inferno two spend forfeits the threshold bonus', 'FIR-011', { roll: 20, spent: 2 }, { element: 0, loadedPending: 0 }, { hp: 22 }],
  ['Sunsetter zero Embers keeps base damage', 'FIR-012', { roll: 8 }, {}, { hp: 27 }],
  ['Sunsetter below nine uses four per Ember', 'FIR-012', { roll: 8, spent: 3 }, {}, { hp: 15 }],
  ['Sunsetter at nine replaces multiplier with five', 'FIR-012', { roll: 9, spent: 3 }, {}, { hp: 12 }],
  ['Sunsetter high roll with zero Embers keeps base damage', 'FIR-012', { roll: 20 }, {}, { hp: 27 }],
  ['Ripple deals damage using existing Flow, then gains one', 'WAT-001', { caster: { element: 3 } }, { element: 4 }, { hp: 26 }],
  ['Pacific below eleven gains two Flow', 'WAT-002', { roll: 10, caster: { element: 3 } }, { element: 5 }, {}],
  ['Pacific at eleven gains three Flow capped at five', 'WAT-002', { roll: 11, caster: { element: 3 } }, { element: 5 }, {}],
  ['Stillwater shields and queues Loaded, then gains Flow', 'WAT-003', {}, { shield: 3, loadedPending: 2, element: 1 }, {}],
  ['Undertow below seven gains default Flow after damage', 'WAT-004', { roll: 6 }, { element: 1 }, { hp: 27 }],
  ['Undertow at seven applies its Flow floor, then default gain', 'WAT-004', { roll: 7 }, { element: 3 }, { hp: 27 }],
  ['Undertow uses one existing Flow before its floor and default gain', 'WAT-004', { roll: 7, caster: { element: 1 } }, { element: 3 }, { hp: 26 }],
  ['Undertow preserves Flow above two before gaining one', 'WAT-004', { roll: 7, caster: { element: 4 } }, { element: 5 }, { hp: 23 }],
  ['Restoration heals nine and gains default Flow', 'WAT-005', { caster: { hp: 17 } }, { hp: 26, element: 1 }, {}],
  ['Restoration stops at maximum HP and still gains Flow', 'WAT-005', { caster: { hp: 27 } }, { hp: 30, element: 1 }, {}],
  ['Water Jet uses existing Flow and queues Loaded before gaining Flow', 'WAT-006', { caster: { element: 3 } }, { element: 4, loadedPending: 2 }, { hp: 25 }],
  ['Sea Surge below seven only attacks', 'WAT-007', { roll: 6, caster: { hp: 17, element: 3 } }, { hp: 17, element: 4, loadedPending: 0 }, { hp: 25 }],
  ['Sea Surge at seven heals and queues Loaded', 'WAT-007', { roll: 7, caster: { hp: 17, element: 3 } }, { hp: 22, element: 4, loadedPending: 1 }, { hp: 25 }],
  ['Sea Surge healing stops at maximum HP', 'WAT-007', { roll: 7, caster: { hp: 29 } }, { hp: 30, loadedPending: 1, element: 1 }, { hp: 28 }],
  ['Riptide below nine uses Flow with no Loaded bonus', 'WAT-008', { roll: 8, caster: { element: 1 } }, { element: 2, loadedPending: 0 }, { hp: 27 }],
  ['Riptide at nine deals eight and queues Loaded', 'WAT-008', { roll: 9, caster: { element: 1 } }, { element: 2, loadedPending: 1 }, { hp: 22 }],
  ['Riptide below nine respects the five-Flow cap', 'WAT-008', { roll: 8, caster: { element: 5 } }, { element: 5, loadedPending: 0 }, { hp: 23 }],
  ['Riptide at nine replaces Flow damage with exactly eight', 'WAT-008', { roll: 9, caster: { element: 5 } }, { element: 5, loadedPending: 1 }, { hp: 22 }],
  ['Tsunami below ten', 'WAT-009', { roll: 9, caster: { element: 2 } }, { element: 3 }, { hp: 26 }],
  ['Tsunami at ten adds nine damage', 'WAT-009', { roll: 10, caster: { element: 2 } }, { element: 3 }, { hp: 17 }],
  ["Poseidon's Rift below eight doubles existing Flow", 'WAT-010', { roll: 7, caster: { element: 3 } }, { element: 4 }, { hp: 24 }],
  ["Poseidon's Rift at eight triples existing Flow", 'WAT-010', { roll: 8, caster: { element: 3 } }, { element: 4 }, { hp: 21 }],
  ["Poseidon's Rift at zero Flow deals no damage before gaining one", 'WAT-010', { roll: 20 }, { element: 1 }, { hp: 30 }],
  ['Ward shields and queues Loaded without rolling', 'NEU-001', {}, { shield: 3, loadedPending: 2 }, {}],
  ['Meditate queues Loaded without rolling', 'NEU-002', {}, { loadedPending: 3 }, {}],
  ['Legacy Shield gains seven Shield', 'NEU-003', {}, { shield: 7 }, {}],
  ['Mana Shield gains Shield and Mana', 'NEU-004', {}, { shield: 5, mana: 4 }, {}],
];

for (const [description, spellId, options, expectedCaster, expectedOpponent] of cases) {
  test(description, () => {
    const result = resolve(spellId, options);
    for (const [field, expected] of Object.entries(expectedCaster)) {
      assert.equal(result.caster[field], expected, `caster ${field}`);
    }
    for (const [field, expected] of Object.entries(expectedOpponent)) {
      assert.equal(result.opponent[field], expected, `opponent ${field}`);
    }
    assert.equal(result.state.phase, 'resolving');
    assert.equal(result.state.pendingCardId, 'slab-1');
    assert.ok(result.events.length > 0);
    assert.ok(result.events.every(event => event.message && event.spellId === spellId));
  });
}

test('every Water spell gains Flow after its other effects, with Pacific replacing the default', () => {
  for (const spell of Object.values(SPELL_CATALOG).filter(spell => spell.element === 'Water')) {
    for (const roll of [2, 12]) {
      const result = resolve(spell.id, { roll, caster: { element: 2, hp: 10 } });
      const gain = spell.id === 'WAT-002' ? (roll >= 11 ? 3 : 2) : 1;
      assert.equal(result.caster.element, 2 + gain, `${spell.name} Flow at roll ${roll}`);
      const final = result.events.at(-1);
      assert.deepEqual([final.type, final.playerId, final.resource, final.amount], ['resource', 'water', 'element', gain]);
      assert.ok(result.events.slice(0, -1).every(event => event.resource !== 'element'));
    }
  }
});

test('Pacific gains two or three instead of stacking either gain with the default', () => {
  for (const [roll, expected] of [[10, 2], [11, 3]]) {
    const result = resolve('WAT-002', { roll });
    assert.equal(result.caster.element, expected);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].amount, expected);
  }
});

test('all Water spells remain at five Flow, including threshold and replacement gains', () => {
  assert.equal(MAX_FLOW, 5);
  for (const spell of Object.values(SPELL_CATALOG).filter(spell => spell.element === 'Water')) {
    for (const roll of [2, 12]) {
      const result = resolve(spell.id, { roll, caster: { element: MAX_FLOW } });
      assert.equal(result.caster.element, MAX_FLOW, `${spell.name} at roll ${roll}`);
      assert.equal(result.events.at(-1).amount, 0);
      assert.match(result.events.at(-1).message, /maximum 5/);
    }
  }
  const nearCap = resolve('WAT-002', { roll: 12, caster: { element: 4 } });
  assert.equal(nearCap.caster.element, 5);
  assert.equal(nearCap.events.at(-1).amount, 1, 'log reports only the Flow actually gained');
});

test('legacy excessive Flow cannot inflate Water damage or survive resolution', () => {
  const result = resolve('WAT-010', { roll: 12, caster: { element: 9 } });
  assert.equal(result.opponent.hp, 15, 'three times the five-Flow maximum');
  assert.equal(result.caster.element, 5);
});

test('Water casting Neutral spells does not gain Flow, and Fire Embers have no Flow cap', () => {
  for (const spellId of ['NEU-001', 'NEU-002', 'NEU-003', 'NEU-004']) {
    const state = { players: [player('fire'), player('water', { element: 4 })] };
    const events = applySpellEffect(state, { casterIndex: 1, spellId });
    assert.equal(state.players[1].element, 4, spellId);
    assert.ok(events.every(event => event.resource !== 'element'));
  }
  assert.equal(resolve('FIR-002', { caster: { element: 5 } }).caster.element, 7);
});

test('incoming damage consumes Shield before HP and reports both amounts', () => {
  const { opponent, events } = resolve('WAT-009', { roll: 10, caster: { element: 2 }, opponent: { shield: 5 } });
  assert.deepEqual([opponent.hp, opponent.shield], [22, 0]);
  assert.deepEqual(events[0], {
    type: 'damage', playerId: 'fire', spellId: 'WAT-009',
    message: 'Fire takes 13 damage (5 absorbed by Shield).',
    amount: 13, absorbed: 5, hpDamage: 8, selfDamage: false,
  });
});

test('Burn self-damage consumes Shield before HP for both thresholds', () => {
  const low = resolve('FIR-006', { roll: 9, caster: { shield: 3 } });
  assert.deepEqual([low.caster.hp, low.caster.shield, low.caster.element], [28, 0, 2]);
  assert.deepEqual([low.events[0].selfDamage, low.events[0].absorbed, low.events[0].hpDamage], [true, 3, 2]);
  const high = resolve('FIR-006', { roll: 10, caster: { shield: 10 } });
  assert.deepEqual([high.caster.hp, high.caster.shield, high.caster.element], [30, 3, 4]);
});

test('Legacy Shield can absorb Burn, and lethal self-damage still grants Embers before engine victory', () => {
  const result = resolve('NEU-003');
  applySpellEffect(result.state, { casterIndex: 0, spellId: 'FIR-006', rollTotal: 10 });
  assert.deepEqual([result.caster.hp, result.caster.shield, result.caster.element], [30, 0, 4]);
  const lethal = resolve('FIR-006', { roll: 10, caster: { hp: 2 } });
  assert.deepEqual([lethal.caster.hp, lethal.caster.element], [0, 4]);
  assert.equal(lethal.state.phase, 'resolving');
  assert.equal(lethal.state.winner, undefined);
});

test('damage and healing clamp HP while Shield gains stack', () => {
  assert.equal(resolve('FIR-012', { roll: 9, spent: 20 }).opponent.hp, 0);
  assert.equal(resolve('WAT-005').caster.hp, 30);
  assert.equal(resolve('NEU-003', { caster: { shield: 8 } }).caster.shield, 15);
});

test('effects mutate the supplied working state and queue bonuses without changing eligible Loaded', () => {
  const result = resolve('FIR-003', { caster: { loaded: 4, loadedPending: 2 } });
  assert.equal(result.caster, result.state.players[0]);
  assert.deepEqual([result.caster.loaded, result.caster.loadedPending], [4, 3]);
  assert.deepEqual([result.caster.mana, result.caster.element], [3, 1]);
});

test('chosen Ember spending has already been deducted by the engine', () => {
  const result = resolve('FIR-009', { caster: { element: 2 }, spent: 3 });
  assert.deepEqual([result.caster.element, result.opponent.hp], [2, 22]);
});

test('all 26 scoped non-Fate spells have rules and every spell has an exercised effect', () => {
  const executable = Object.values(SPELL_CATALOG).filter(spell => spell.category !== 'Fate').map(spell => spell.id).sort();
  assert.deepEqual(Object.keys(SPELL_RULES).sort(), executable);
  assert.deepEqual([...new Set(cases.map(([, spellId]) => spellId))].sort(), executable);
  const rolling = ['FIR-004', 'FIR-005', 'FIR-006', 'FIR-008', 'FIR-010', 'FIR-011', 'FIR-012', 'WAT-002', 'WAT-004', 'WAT-007', 'WAT-008', 'WAT-009', 'WAT-010'];
  assert.deepEqual(Object.keys(SPELL_RULES).filter(id => SPELL_RULES[id].requiresRoll), rolling);
});

test('Ember choices expose optional limits, arbitrary Wildfire spending, and mandatory all', () => {
  assert.deepEqual(getEmberSpendRange('FIR-001', 5), { min: 0, max: 0, mandatory: false });
  assert.deepEqual(getEmberSpendRange('FIR-008', 5), { min: 0, max: 1, mandatory: false });
  assert.deepEqual(getEmberSpendRange('FIR-011', 1), { min: 0, max: 1, mandatory: false });
  assert.deepEqual(getEmberSpendRange('FIR-011', 5), { min: 0, max: 2, mandatory: false });
  assert.deepEqual(getEmberSpendRange('FIR-009', 5), { min: 0, max: 5, mandatory: false });
  assert.deepEqual(getEmberSpendRange('FIR-012', 5), { min: 5, max: 5, mandatory: true });
  assert.deepEqual(getEmberSpendRange('FIR-012', 0), { min: 0, max: 0, mandatory: true });
});

test('invalid resolution contexts are rejected before effects mutate state', () => {
  const state = { players: [player('fire'), player('water')] };
  const before = structuredClone(state);
  const invalid = [
    { spellId: 'FAT-001', casterIndex: 0 },
    { spellId: 'FIR-001', casterIndex: 2 },
    { spellId: 'FIR-004', casterIndex: 0 },
    { spellId: 'FIR-004', casterIndex: 0, rollTotal: NaN },
    { spellId: 'FIR-001', casterIndex: 0, emberSpent: 1 },
    { spellId: 'FIR-008', casterIndex: 0, rollTotal: 9, emberSpent: 2 },
    { spellId: 'FIR-011', casterIndex: 0, rollTotal: 6, emberSpent: 3 },
    { spellId: 'FIR-009', casterIndex: 0, emberSpent: -1 },
    { spellId: 'FIR-009', casterIndex: 0, emberSpent: 0.5 },
  ];
  for (const context of invalid) {
    assert.throws(() => applySpellEffect(state, context));
    assert.deepEqual(state, before);
  }
  assert.throws(() => getEmberSpendRange('FIR-001', -1));
  assert.throws(() => getEmberSpendRange('missing', 0));
});
