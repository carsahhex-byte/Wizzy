import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpellEffect, applyDamageToPlayer, getEmberSpendRange, SPELL_RULES, MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS } from '../src/effects.js';
import { SPELL_CATALOG, SPELLBOOK_VERSION, DECK_LISTS } from '../src/spells.js';

const player = (id, overrides = {}) => ({
  id, name: id === 'fire' ? 'Fire' : 'Water', hp: 100, maxHp: 100,
  mana: 3, shield: 0, element: 0, loaded: 0, loadedPending: 0, ...overrides,
});
function resolve(spellId, { caster = {}, opponent = {}, roll = 2, spent = 0 } = {}) {
  const casterIndex = spellId.startsWith('Water-') ? 1 : 0;
  const state = { players: [player('fire'), player('water')], phase: 'resolving', pendingCardId: 'slab-1' };
  Object.assign(state.players[casterIndex], caster);
  Object.assign(state.players[1 - casterIndex], opponent);
  const events = applySpellEffect(state, { casterIndex, spellId, rollTotal: roll, emberSpent: spent });
  return { state, caster: state.players[casterIndex], opponent: state.players[1 - casterIndex], events };
}
const cases = [
  ['Fire-1 base attack has no automatic Ember', 'Fire-1', { roll: 6 }, { element: 0 }, { hp: 94 }],
  ['Fire-1 seven gains one Ember', 'Fire-1', { roll: 7 }, { element: 1 }, { hp: 94 }],
  ['Fire-1 ten replaces the lower Ember gain', 'Fire-1', { roll: 10 }, { element: 2 }, { hp: 94 }],
  ['Fire-2 base gain', 'Fire-2', { roll: 6 }, { element: 1 }, {}],
  ['Fire-2 seven replaces the base gain', 'Fire-2', { roll: 7 }, { element: 2 }, {}],
  ['Fire-2 ten replaces both lower gains', 'Fire-2', { roll: 10 }, { element: 3 }, {}],
  ['Fire-3 base Shield', 'Fire-3', { roll: 6 }, { shield: 12, element: 0 }, {}],
  ['Fire-3 seven gains one Ember', 'Fire-3', { roll: 7 }, { shield: 12, element: 1 }, {}],
  ['Fire-3 ten gains two Embers', 'Fire-3', { roll: 10 }, { shield: 12, element: 2 }, {}],
  ['Fire-4 base damage and Ember', 'Fire-4', { roll: 7 }, { element: 1, loadedPending: 0 }, { hp: 95 }],
  ['Fire-4 eight queues two Loaded', 'Fire-4', { roll: 8 }, { element: 1, loadedPending: 2 }, { hp: 95 }],
  ['Fire-4 eleven replaces two Loaded with four', 'Fire-4', { roll: 11 }, { element: 1, loadedPending: 4 }, { hp: 95 }],
  ['Fire-5 zero spend retains base damage', 'Fire-5', { roll: 8 }, {}, { hp: 90 }],
  ['Fire-5 optional one Ember adds eight damage', 'Fire-5', { roll: 8, spent: 1 }, {}, { hp: 82 }],
  ['Fire-5 nine strips Shield before attack', 'Fire-5', { roll: 9, opponent: { shield: 12 } }, {}, { hp: 94, shield: 0 }],
  ['Fire-6 base heavy damage', 'Fire-6', { roll: 6 }, {}, { hp: 78 }],
  ['Fire-6 seven replaces base damage', 'Fire-6', { roll: 7 }, {}, { hp: 72 }],
  ['Fire-6 ten replaces seven damage', 'Fire-6', { roll: 10 }, {}, { hp: 64 }],
  ['Fire-7 base scaling per paid Ember', 'Fire-7', { roll: 8, spent: 3 }, {}, { hp: 64 }],
  ['Fire-7 nine replaces multiplier and retains base fifteen', 'Fire-7', { roll: 9, spent: 3 }, {}, { hp: 55 }],
  ['Fire-7 zero paid Embers still deals fifteen', 'Fire-7', { roll: 12 }, {}, { hp: 85 }],
  ['Fire-8 base damage and Ember', 'Fire-8', { roll: 7 }, { element: 1 }, { hp: 90 }],
  ['Fire-8 eight adds four damage', 'Fire-8', { roll: 8 }, { element: 1 }, { hp: 86 }],
  ['Fire-9 below seven gains two', 'Fire-9', { roll: 6 }, { element: 2, shield: 0 }, {}],
  ['Fire-9 checks total after its gain', 'Fire-9', { roll: 7, caster: { element: 1 } }, { element: 4, shield: 8 }, {}],
  ['Fire-9 base gain can also enable Shield', 'Fire-9', { roll: 6, caster: { element: 2 } }, { element: 4, shield: 8 }, {}],
  ['Fire-9 cap does not prevent its Shield condition', 'Fire-9', { roll: 7, caster: { element: 4 } }, { element: 5, shield: 8 }, {}],
  ['Fire-10 base Shield and Ember', 'Fire-10', { roll: 7 }, { shield: 16, element: 1 }, {}],
  ['Fire-10 eight adds eight Shield', 'Fire-10', { roll: 8 }, { shield: 24, element: 1 }, {}],
  ['Fire-11 base damage and two Embers', 'Fire-11', { roll: 6 }, { element: 2, loadedPending: 0 }, { hp: 92 }],
  ['Fire-11 seven queues two Loaded', 'Fire-11', { roll: 7 }, { element: 2, loadedPending: 2 }, { hp: 92 }],
  ['Fire-11 ten replaces two Loaded with four', 'Fire-11', { roll: 10 }, { element: 2, loadedPending: 4 }, { hp: 92 }],
  ['Fire-12 two Embers add sixteen damage', 'Fire-12', { roll: 6, spent: 2 }, {}, { hp: 70 }],
  ['Fire-12 Shield strip and paid damage both apply', 'Fire-12', { roll: 7, spent: 2, opponent: { shield: 20 } }, {}, { hp: 80, shield: 0 }],
  ['Fire-13 base damage', 'Fire-13', { roll: 6 }, {}, { hp: 70 }],
  ['Fire-13 seven damage', 'Fire-13', { roll: 7 }, {}, { hp: 62 }],
  ['Fire-13 ten replaces seven damage', 'Fire-13', { roll: 10 }, {}, { hp: 55 }],
  ['Fire-14 base nine-per-Ember scaling', 'Fire-14', { roll: 7, spent: 3 }, {}, { hp: 53 }],
  ['Fire-14 eight replaces multiplier and retains twenty base', 'Fire-14', { roll: 8, spent: 3 }, {}, { hp: 44 }],
  ['Fire-14 zero paid Embers still deals twenty', 'Fire-14', { roll: 12 }, {}, { hp: 80 }],
  ['Water-1 base damage', 'Water-1', { roll: 6 }, { element: 1 }, { hp: 94 }],
  ['Water-1 seven adds three damage', 'Water-1', { roll: 7 }, { element: 1 }, { hp: 91 }],
  ['Water-2 damage uses old Flow', 'Water-2', { roll: 7, caster: { element: 3 } }, { element: 4 }, { hp: 90 }],
  ['Water-2 eight gains additional Flow after the same damage', 'Water-2', { roll: 8, caster: { element: 3 } }, { element: 5 }, { hp: 90 }],
  ['Water-3 base Shield without healing', 'Water-3', { roll: 6, caster: { hp: 70 } }, { hp: 70, shield: 10, element: 1 }, {}],
  ['Water-3 seven heals five', 'Water-3', { roll: 7, caster: { hp: 70 } }, { hp: 75, shield: 10, element: 1 }, {}],
  ['Water-3 ten replaces healing with ten', 'Water-3', { roll: 10, caster: { hp: 70 } }, { hp: 80, shield: 10, element: 1 }, {}],
  ['Water-4 base damage', 'Water-4', { roll: 6, caster: { element: 3 } }, { element: 4, loadedPending: 0 }, { hp: 92 }],
  ['Water-4 seven queues two Loaded', 'Water-4', { roll: 7, caster: { element: 3 } }, { element: 4, loadedPending: 2 }, { hp: 92 }],
  ['Water-4 ten adds Flow and keeps separate Loaded effect', 'Water-4', { roll: 10, caster: { element: 3 } }, { element: 5, loadedPending: 2 }, { hp: 92 }],
  ['Water-5 base damage', 'Water-5', { roll: 8, caster: { hp: 70, element: 3 } }, { hp: 70, element: 4 }, { hp: 86 }],
  ['Water-5 nine heals old Flow', 'Water-5', { roll: 9, caster: { hp: 70, element: 3 } }, { hp: 73, element: 4 }, { hp: 86 }],
  ['Water-6 base damage', 'Water-6', { roll: 8, caster: { element: 3 } }, { element: 4 }, { hp: 76 }],
  ['Water-6 nine adds eight damage', 'Water-6', { roll: 9, caster: { element: 3 } }, { element: 4 }, { hp: 68 }],
  ['Water-7 base damage', 'Water-7', { roll: 8, caster: { element: 3 } }, { element: 4 }, { hp: 73 }],
  ['Water-7 nine adds ten damage', 'Water-7', { roll: 9, caster: { element: 3 } }, { element: 4 }, { hp: 63 }],
  ['Water-8 base damage', 'Water-8', { roll: 6, caster: { element: 3 } }, { element: 4 }, { hp: 88 }],
  ['Water-8 seven adds four damage', 'Water-8', { roll: 7, caster: { element: 3 } }, { element: 4 }, { hp: 84 }],
  ['Water-9 unconditional additional Flow', 'Water-9', { roll: 9, caster: { element: 3 } }, { element: 5 }, { hp: 88 }],
  ['Water-9 ten adds five damage', 'Water-9', { roll: 10, caster: { element: 3 } }, { element: 5 }, { hp: 83 }],
  ['Water-10 base Shield and healing', 'Water-10', { roll: 6, caster: { hp: 70, element: 3 } }, { hp: 75, shield: 14, element: 4 }, {}],
  ['Water-10 seven adds two healing per old Flow', 'Water-10', { roll: 7, caster: { hp: 70, element: 3 } }, { hp: 81, shield: 14, element: 4 }, {}],
  ['Water-11 unconditional Loaded', 'Water-11', { roll: 6, caster: { element: 3 } }, { element: 4, loadedPending: 2 }, { hp: 89 }],
  ['Water-11 seven adds Flow', 'Water-11', { roll: 7, caster: { element: 3 } }, { element: 5, loadedPending: 2 }, { hp: 89 }],
  ['Water-12 below seven does not heal', 'Water-12', { roll: 6, caster: { hp: 70, element: 3 } }, { hp: 70, element: 4 }, { hp: 82 }],
  ['Water-12 seven heals two per old Flow', 'Water-12', { roll: 7, caster: { hp: 70, element: 3 } }, { hp: 76, element: 4 }, { hp: 82 }],
  ['Water-13 base damage', 'Water-13', { roll: 6, caster: { element: 3 } }, { element: 4 }, { hp: 71 }],
  ['Water-13 seven adds ten damage', 'Water-13', { roll: 7, caster: { element: 3 } }, { element: 4 }, { hp: 61 }],
  ['Water-14 base damage', 'Water-14', { roll: 7, caster: { element: 3 } }, { element: 4 }, { hp: 70 }],
  ['Water-14 eight adds twelve damage', 'Water-14', { roll: 8, caster: { element: 3 } }, { element: 4 }, { hp: 58 }],
];
for (const [description, spellId, options, expectedCaster, expectedOpponent] of cases) {
  test(description, () => {
    const result = resolve(spellId, options);
    for (const [field, expected] of Object.entries(expectedCaster)) assert.equal(result.caster[field], expected, `caster ${field}`);
    for (const [field, expected] of Object.entries(expectedOpponent)) assert.equal(result.opponent[field], expected, `opponent ${field}`);
    assert.equal(result.state.phase, 'resolving');
    assert.equal(result.state.pendingCardId, 'slab-1');
    assert.ok(result.events.length > 0);
    assert.ok(result.events.every(event => event.message && event.spellId === spellId));
  });
}

test('the current collection completely replaces old IDs and has no starter composition', () => {
  assert.equal(SPELLBOOK_VERSION, 'nov4-v2.1');
  assert.equal(Object.keys(SPELL_CATALOG).length, 31);
  assert.equal(Object.keys(SPELL_RULES).length, 28);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Fire').length, 14);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Water').length, 14);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Fate').length, 3);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Neutral').length, 0);
  assert.ok(Object.keys(SPELL_CATALOG).every(id => !/^(FIR|WAT|NEU)-/.test(id)));
  assert.deepEqual(DECK_LISTS, { fire: [], water: [] });
  for (const spell of Object.values(SPELL_CATALOG).filter(s => s.category !== 'Fate')) {
    assert.equal(SPELL_RULES[spell.id].requiresRoll, true);
    assert.ok(cases.some(entry => entry[1] === spell.id), `${spell.id} has independent numerical checks`);
  }
  assert.deepEqual([MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS], [100, 10, 30, 5, 5]);
  assert.deepEqual(Object.values(SPELL_CATALOG).filter(s => s.element === 'Fire').map(s => s.manaCost), [1,1,2,2,3,5,7,2,2,3,3,4,6,8]);
  assert.deepEqual(Object.values(SPELL_CATALOG).filter(s => s.element === 'Water').map(s => s.manaCost), [1,1,2,2,3,5,7,2,2,3,3,4,6,8]);
});

test('every Water spell gains Flow last and additional means an extra gain', () => {
  for (const spell of Object.values(SPELL_CATALOG).filter(s => s.element === 'Water')) {
    for (const roll of [2, 12]) {
      const result = resolve(spell.id, { roll, caster: { element: 2, hp: 50 } });
      const additional = spell.id === 'Water-9' || (roll === 12 && ['Water-2','Water-4','Water-11'].includes(spell.id));
      assert.equal(result.caster.element, 3 + Number(additional), `${spell.id} roll ${roll}`);
      assert.deepEqual([result.events.at(-1).type, result.events.at(-1).resource], ['resource', 'element']);
      assert.ok(result.events.slice(0,-1).every(e => e.resource !== 'element'));
    }
  }
});

test('Flow is capped at five before damage/healing and after its final gain', () => {
  const excessive = resolve('Water-14', { roll: 12, caster: { element: 9 } });
  assert.equal(excessive.opponent.hp, 48);
  assert.equal(excessive.caster.element, 5);
  for (const card of Object.values(SPELL_CATALOG).filter(s => s.element === 'Water')) {
    const result = resolve(card.id, { roll: 12, caster: { element: 5 } });
    assert.equal(result.caster.element, 5);
    assert.equal(result.events.at(-1).amount, 0);
  }
});

test('Fire Ember gains stop at five and combat logs report the actual gain', () => {
  const result = resolve('Fire-2', { roll: 12, caster: { element: 4 } });
  assert.equal(result.caster.element, 5);
  assert.equal(result.events[0].amount, 1);
  assert.match(result.events[0].message, /maximum 5/);
});

test('Shield gain caps at thirty and the logged gain is the amount added', () => {
  for (const spellId of ['Fire-3', 'Fire-10', 'Water-3', 'Water-10']) {
    const result = resolve(spellId, { roll: 12, caster: { shield: 28 } });
    assert.equal(result.caster.shield, 30);
    assert.equal(result.events.find(e => e.type === 'shield').amount, 2);
  }
});

test('Shield removal happens before damage and removes only existing Shield', () => {
  const result = resolve('Fire-5', { roll: 9, opponent: { shield: 12 } });
  assert.deepEqual(result.events.map(e => [e.type, e.amount, e.absorbed]), [['shield', -8, undefined], ['damage', 10, 4]]);
  const small = resolve('Fire-12', { roll: 7, opponent: { shield: 3 } });
  assert.equal(small.events[0].removed, 3);
  assert.equal(small.opponent.hp, 86);
  assert.equal(small.opponent.shield, 0);
});

test('healing stops at one hundred HP, uses old Flow, and does not consume Shield', () => {
  const result = resolve('Water-10', { roll: 12, caster: { hp: 99, element: 5, shield: 10 } });
  assert.equal(result.caster.hp, 100);
  assert.equal(result.caster.shield, 24);
  assert.equal(result.events.find(e => e.type === 'heal').amount, 1);
  const zero = resolve('Water-12', { roll: 12, caster: { hp: 50, element: 0 } });
  assert.equal(zero.caster.hp, 50);
  assert.equal(zero.caster.element, 1);
});

test('Loaded rewards queue for the next own turn and leave the current bonus unchanged', () => {
  const result = resolve('Fire-4', { roll: 11, caster: { loaded: 3, loadedPending: 2 } });
  assert.equal(result.caster.loaded, 3);
  assert.equal(result.caster.loadedPending, 6);
});

test('self damage bypasses Shield while opponent damage consumes Shield first', () => {
  const own = player('fire', { hp: 10, shield: 30 });
  assert.deepEqual(applyDamageToPlayer(own, 7, { selfDamage: true }), { amount: 7, absorbed: 0, hpDamage: 7, selfDamage: true });
  assert.deepEqual([own.hp, own.shield], [3, 30]);
  applyDamageToPlayer(own, 99, { selfDamage: true });
  assert.deepEqual([own.hp, own.shield], [0, 30]);
  const other = player('water', { shield: 12 });
  assert.deepEqual(applyDamageToPlayer(other, 15), { amount: 15, absorbed: 12, hpDamage: 3, selfDamage: false });
  assert.deepEqual([other.hp, other.shield], [97, 0]);
});

test('Ember choices are limited to the two optional spend cards and two all-spend cards', () => {
  assert.deepEqual(getEmberSpendRange('Fire-5', 5), { min: 0, max: 1, mandatory: false });
  assert.deepEqual(getEmberSpendRange('Fire-12', 5), { min: 0, max: 2, mandatory: false });
  for (const id of ['Fire-7','Fire-14']) {
    assert.deepEqual(getEmberSpendRange(id, 5), { min: 5, max: 5, mandatory: true });
    assert.deepEqual(getEmberSpendRange(id, 0), { min: 0, max: 0, mandatory: true });
  }
  assert.deepEqual(getEmberSpendRange('Fire-1', 5), { min: 0, max: 0, mandatory: false });
  for (const bad of [-1, 6, 1.5, NaN, '2']) assert.throws(() => getEmberSpendRange('Fire-5', bad));
  assert.throws(() => getEmberSpendRange('FAT-001', 2));
});

test('invalid spending, missing roll and old spell IDs cannot execute', () => {
  for (const amount of [-1, 2, 1.5]) assert.throws(() => resolve('Fire-5', { spent: amount }));
  assert.throws(() => resolve('Fire-12', { spent: 3 }));
  assert.throws(() => resolve('Fire-7', { spent: 6 }));
  assert.throws(() => resolve('Fire-1', { spent: 1 }));
  assert.throws(() => resolve('Water-1', { roll: null }));
  assert.throws(() => resolve('FIR-001'));
  assert.throws(() => resolve('WAT-001'));
  assert.throws(() => resolve('NEU-001'));
  assert.throws(() => resolve('FAT-001'));
});
