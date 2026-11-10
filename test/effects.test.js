import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpellEffect, applyDamageToPlayer, calculateEnhancedDamage, getEmberSpendRange, SPELL_RULES, MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS } from '../src/effects.js';
import { SPELL_CATALOG, SPELLBOOK_VERSION, DECK_LISTS, SOURCE_INFO } from '../src/spells.js';

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
  ['Water-0 below seven resolves the ordinary Flow without awarding on-cast Mana again', 'Water-0', { roll: 6, caster: { mana: 1 } }, { mana: 1, element: 1 }, {}],
  ['Water-0 seven resolves two total Flow without another Mana award', 'Water-0', { roll: 7, caster: { mana: 1 } }, { mana: 1, element: 2 }, {}],
  ['Fire-15 below seven gains one Ember but no Mana', 'Fire-15', { roll: 6, caster: { mana: 0 } }, { element: 1, mana: 0 }, {}],
  ['Fire-15 seven gains one Ember and one Mana', 'Fire-15', { roll: 7, caster: { mana: 0 } }, { element: 1, mana: 1 }, {}],
  ['Fire-0 gains one Ember without a roll', 'Fire-0', { roll: null }, { element: 1 }, {}],
  ['Fire-0 has no roll threshold or enhanced resource gain', 'Fire-0', { roll: 12, caster: { enhancement: 30 } }, { element: 1 }, {}],
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
  ['Fire-9 checks total after its gain for Mana', 'Fire-9', { roll: 7, caster: { element: 1 } }, { element: 4, mana: 4, shield: 0 }, {}],
  ['Fire-9 base gain can also enable Mana', 'Fire-9', { roll: 6, caster: { element: 2 } }, { element: 4, mana: 4, shield: 0 }, {}],
  ['Fire-9 cap does not prevent its Mana condition', 'Fire-9', { roll: 7, caster: { element: 4 } }, { element: 5, mana: 4, shield: 0 }, {}],
  ['Fire-10 base Shield and Ember', 'Fire-10', { roll: 7 }, { shield: 16, element: 1 }, {}],
  ['Fire-10 eight adds eight Shield', 'Fire-10', { roll: 8 }, { shield: 24, element: 1 }, {}],
  ['Fire-11 base damage and two Embers', 'Fire-11', { roll: 6 }, { element: 2, mana: 3, loadedPending: 0 }, { hp: 90 }],
  ['Fire-11 seven grants one Mana without Loaded', 'Fire-11', { roll: 7 }, { element: 2, mana: 4, loadedPending: 0 }, { hp: 90 }],
  ['Fire-11 ten still grants only one Mana without Loaded', 'Fire-11', { roll: 10 }, { element: 2, mana: 4, loadedPending: 0 }, { hp: 90 }],
  ['Fire-12 two Embers add sixteen damage', 'Fire-12', { roll: 6, spent: 2 }, {}, { hp: 70 }],
  ['Fire-12 Shield strip and paid damage both apply', 'Fire-12', { roll: 7, spent: 2, opponent: { shield: 20 } }, {}, { hp: 80, shield: 0 }],
  ['Fire-13 base damage', 'Fire-13', { roll: 6 }, {}, { hp: 70 }],
  ['Fire-13 seven damage', 'Fire-13', { roll: 7 }, {}, { hp: 62 }],
  ['Fire-13 ten replaces seven damage', 'Fire-13', { roll: 10 }, {}, { hp: 55 }],
  ['Fire-14 base seven-per-Ember scaling', 'Fire-14', { roll: 7, spent: 3 }, {}, { hp: 59 }],
  ['Fire-14 eight replaces seven per Ember with nine and retains twenty base', 'Fire-14', { roll: 8, spent: 3 }, {}, { hp: 53 }],
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
  assert.equal(Object.keys(SPELL_CATALOG).length, 34);
  assert.equal(Object.keys(SPELL_RULES).length, 31);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Fire').length, 16);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Water').length, 15);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Fate').length, 3);
  assert.equal(Object.values(SPELL_CATALOG).filter(s => s.type === 'Neutral').length, 0);
  assert.ok(Object.keys(SPELL_CATALOG).every(id => !/^(FIR|WAT|NEU)-/.test(id)));
  assert.deepEqual(DECK_LISTS, { fire: [], water: [] });
  for (const spell of Object.values(SPELL_CATALOG).filter(s => s.category !== 'Fate')) {
    assert.equal(SPELL_RULES[spell.id].requiresRoll, spell.id !== 'Fire-0');
    assert.ok(cases.some(entry => entry[1] === spell.id), `${spell.id} has independent numerical checks`);
  }
  assert.deepEqual([MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS], [100, 10, 30, 5, 5]);
  assert.deepEqual(Object.values(SPELL_CATALOG).filter(s => s.element === 'Fire').map(s => s.manaCost), [0,1,1,2,2,3,5,7,2,2,3,2,4,6,8,0]);
  assert.deepEqual(Object.values(SPELL_CATALOG).filter(s => s.element === 'Water').map(s => s.manaCost), [0,1,1,2,2,3,5,7,2,2,3,3,3,6,8]);
  assert.equal(SOURCE_INFO.playableSpellCount, 13);
  assert.deepEqual(SOURCE_INFO.additionalSpells, ['Fire-0', 'Fire-15', 'Water-0']);
  assert.deepEqual([SOURCE_INFO.spellbook.librarySpellCount, SOURCE_INFO.spellbook.importedSpellCount], [31, 31]);
});

test('every Water spell gains Flow last and additional means an extra gain', () => {
  for (const spell of Object.values(SPELL_CATALOG).filter(s => s.element === 'Water')) {
    for (const roll of [2, 12]) {
      const result = resolve(spell.id, { roll, caster: { element: 2, hp: 50 } });
      const additional = spell.id === 'Water-9' || (roll === 12 && ['Water-0','Water-2','Water-4','Water-11'].includes(spell.id));
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

test('Enhancement rounds completed damage once to the nearest whole number, with halves upward', () => {
  for (const [base, percent, total] of [
    [0, 30, 0], [6, 0, 6], [6, 10, 7], [6, 20, 7], [6, 30, 8],
    [5, 10, 6], [15, 10, 17], [25, 10, 28], [35, 10, 39],
    [20, 30, 26], [28, 30, 36], [36, 30, 47], [45, 30, 59],
  ]) {
    assert.deepEqual(calculateEnhancedDamage(base, percent), {
      baseDamage: base, enhancement: percent, aura: 0, combinedPercent: percent, bonusDamage: total - base, totalDamage: total,
    });
  }
  assert.equal(calculateEnhancedDamage(10).totalDamage, 10);
});

test('Enhancement calculation rejects fractional, negative, over-cap and unsafe inputs', () => {
  for (const damage of [-1, 1.5, '6', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => calculateEnhancedDamage(damage, 10));
  }
  for (const percent of [-10, 5, 40, 100, '10', null, NaN]) {
    assert.throws(() => calculateEnhancedDamage(10, percent));
  }
  for (const aura of [-10, 5, 20, '10', null, NaN]) {
    assert.throws(() => calculateEnhancedDamage(10, 30, aura));
  }
});

test('Enhancement multiplies threshold damage before Shield and logs base, bonus and actual HP damage', () => {
  const result = resolve('Fire-6', { roll: 7, caster: { enhancement: 30 }, opponent: { shield: 5 } });
  assert.deepEqual([result.opponent.hp, result.opponent.shield], [69, 0]);
  const event = result.events.find(entry => entry.type === 'damage');
  assert.deepEqual({ baseDamage: event.baseDamage, enhancement: event.enhancement, bonusDamage: event.bonusDamage,
    totalDamage: event.totalDamage, amount: event.amount, absorbed: event.absorbed, hpDamage: event.hpDamage },
  { baseDamage: 28, enhancement: 30, bonusDamage: 8, totalDamage: 36, amount: 36, absorbed: 5, hpDamage: 31 });
  assert.match(event.message, /Base 28 \+ 30% Enhancement \+ 0% Aura = 36 damage/);
  assert.match(event.message, /5 absorbed by Shield/);
  assert.match(event.message, /31 HP damage/);
  assert.equal(result.caster.enhancement, 0);
  assert.match(result.events.at(-1).message, /uses 30% Enhancement.*returns to 0%/);
});

test('Shield removal remains its printed amount before enhanced damage', () => {
  const result = resolve('Fire-5', { roll: 9, spent: 1, caster: { enhancement: 20 }, opponent: { shield: 12 } });
  assert.deepEqual(result.events.map(entry => [entry.type, entry.amount, entry.absorbed]), [
    ['shield', -8, undefined], ['damage', 22, 4], ['enhancement', -20, undefined],
  ]);
  assert.deepEqual([result.opponent.hp, result.opponent.shield], [82, 0]);
});

test('Ember contributions are combined before one Enhancement multiplication and rounding', () => {
  const result = resolve('Fire-12', { roll: 6, spent: 2, caster: { enhancement: 20 } });
  assert.equal(result.opponent.hp, 64);
  assert.equal(result.events[0].baseDamage, 30);
  assert.equal(result.events[0].totalDamage, 36);
  const signature = resolve('Fire-7', { roll: 9, spent: 3, caster: { enhancement: 10 } });
  assert.equal(signature.opponent.hp, 50);
  assert.equal(signature.events[0].baseDamage, 45);
});

test('Flow contributes before Enhancement while healing and Flow gain retain printed values', () => {
  const result = resolve('Water-12', { roll: 7, caster: { hp: 70, element: 3, enhancement: 30 } });
  assert.deepEqual([result.opponent.hp, result.caster.hp, result.caster.element], [77, 76, 4]);
  assert.deepEqual(result.events.map(entry => [entry.type, entry.amount]), [['damage', 23], ['heal', 6], ['enhancement', -30], ['resource', 1]]);
});

test('Enhancement does not increase Shield grants, Ember gains or Mana rewards', () => {
  const shield = resolve('Fire-10', { roll: 8, caster: { enhancement: 30 } });
  assert.deepEqual([shield.caster.shield, shield.caster.element], [24, 1]);
  assert.equal(shield.caster.enhancement, 30);
  const preparation = resolve('Fire-11', { roll: 10, caster: { enhancement: 30 } });
  assert.deepEqual([preparation.opponent.hp, preparation.caster.element, preparation.caster.mana, preparation.caster.loadedPending], [87, 2, 4, 0]);
  assert.equal(preparation.caster.enhancement, 0);
});

test('the target Enhancement cannot modify incoming damage and self-damage stays unboosted', () => {
  const incoming = resolve('Fire-1', { opponent: { enhancement: 30 } });
  assert.equal(incoming.opponent.hp, 94);
  assert.equal(incoming.events[0].enhancement, 0);
  const own = player('fire', { shield: 30, enhancement: 30, auraTurns: 3 });
  assert.deepEqual(applyDamageToPlayer(own, 15, { selfDamage: true }), {
    amount: 15, absorbed: 0, hpDamage: 15, selfDamage: true,
  });
  assert.deepEqual([own.hp, own.shield], [85, 30]);
  assert.deepEqual([own.enhancement, own.auraTurns], [30, 3]);
});

test('zero Enhancement preserves the previous numerical outcomes and records a transparent formula', () => {
  const result = resolve('Water-14', { roll: 8, caster: { element: 3, enhancement: 0 }, opponent: { shield: 5 } });
  assert.deepEqual([result.opponent.hp, result.opponent.shield], [63, 0]);
  const event = result.events.find(entry => entry.type === 'damage');
  assert.deepEqual([event.baseDamage, event.enhancement, event.bonusDamage, event.totalDamage], [42, 0, 0, 42]);
  assert.match(event.message, /Base 42 \+ 0% Enhancement \+ 0% Aura = 42 damage/);
});

test('Aura and Enhancement add before a single rounding step, capped at a combined forty percent', () => {
  for (const [base, enhancement, aura, total] of [
    [15, 10, 10, 18], [28, 30, 10, 39], [45, 30, 10, 63],
    [6, 0, 10, 7], [5, 0, 10, 6], [0, 30, 10, 0],
  ]) {
    assert.deepEqual(calculateEnhancedDamage(base, enhancement, aura), {
      baseDamage: base, enhancement, aura, combinedPercent: enhancement + aura,
      bonusDamage: total - base, totalDamage: total,
    });
  }
  const result = resolve('Fire-6', { roll: 7, caster: { enhancement: 30, auraTurns: 3 } });
  assert.deepEqual([result.opponent.hp, result.caster.enhancement, result.caster.auraTurns], [61, 0, 3]);
  assert.match(result.events[0].message, /Base 28 \+ 30% Enhancement \+ 10% Aura = 39 damage/);
  assert.deepEqual([result.events[0].enhancement, result.events[0].aura, result.events[0].combinedPercent], [30, 10, 40]);
});

test('an active Aura boosts later attacks after the first attack consumes Enhancement', () => {
  const state = { players: [player('fire', { enhancement: 30, auraTurns: 2 }), player('water')] };
  const first = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-6', rollTotal: 7 });
  const second = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-6', rollTotal: 7 });
  assert.deepEqual([first[0].amount, second[0].amount], [39, 31]);
  assert.deepEqual([state.players[0].enhancement, state.players[0].auraTurns], [0, 2]);
  assert.equal(first.filter(event => event.type === 'enhancement').length, 1);
  assert.equal(second.filter(event => event.type === 'enhancement').length, 0);
});

test('combined bonuses include paid Embers before Shield removal and absorption without boosting either', () => {
  const result = resolve('Fire-12', {
    roll: 7, spent: 2, caster: { enhancement: 30, auraTurns: 1 }, opponent: { shield: 15 },
  });
  const damage = result.events.find(event => event.type === 'damage');
  assert.deepEqual([result.opponent.hp, result.opponent.shield, result.caster.enhancement, result.caster.auraTurns], [63, 0, 0, 1]);
  assert.deepEqual([result.events[0].type, result.events[0].amount], ['shield', -10]);
  assert.deepEqual([damage.baseDamage, damage.amount, damage.absorbed, damage.hpDamage], [30, 42, 5, 37]);
});

test('combined bonuses use Flow before resolution and leave healing, Loaded and Flow gains unchanged', () => {
  const result = resolve('Water-12', {
    roll: 7, caster: { hp: 70, element: 3, enhancement: 30, auraTurns: 3 }, opponent: { shield: 5 },
  });
  const damage = result.events[0];
  assert.deepEqual([damage.baseDamage, damage.totalDamage, damage.absorbed, damage.hpDamage], [18, 25, 5, 20]);
  assert.deepEqual([result.opponent.hp, result.caster.hp, result.caster.element, result.caster.auraTurns], [80, 76, 4, 3]);
  const preparation = resolve('Water-11', { roll: 7, caster: { element: 3, enhancement: 30, auraTurns: 2 } });
  assert.deepEqual([preparation.opponent.hp, preparation.caster.loadedPending, preparation.caster.element], [85, 2, 5]);
});

test('fully absorbed outgoing damage still consumes Enhancement while preserving Aura', () => {
  const result = resolve('Fire-1', { caster: { enhancement: 30, auraTurns: 3 }, opponent: { shield: 30 } });
  assert.deepEqual([result.opponent.hp, result.opponent.shield], [100, 22]);
  assert.deepEqual([result.caster.enhancement, result.caster.auraTurns], [0, 3]);
  assert.deepEqual([result.events[0].amount, result.events[0].absorbed, result.events[0].hpDamage], [8, 8, 0]);
  const consumption = result.events.find(event => event.type === 'enhancement');
  assert.deepEqual([consumption.amount, consumption.enhancementBefore, consumption.enhancementAfter], [-30, 30, 0]);
});

test('resource, healing and Shield spells preserve both bonuses without boosting their effects', () => {
  for (const [spellId, expected] of [
    ['Fire-2', { hp: 60, shield: 0, element: 3 }],
    ['Fire-3', { hp: 60, shield: 12, element: 2 }],
    ['Fire-9', { hp: 60, shield: 0, element: 5, mana: 4 }],
    ['Water-3', { hp: 70, shield: 10, element: 4 }],
    ['Water-10', { hp: 71, shield: 14, element: 4 }],
  ]) {
    const result = resolve(spellId, { roll: 10, caster: { hp: 60, element: spellId === 'Fire-9' ? 2 : spellId.startsWith('Water-') ? 3 : 0, enhancement: 30, auraTurns: 2 } });
    for (const [field, value] of Object.entries(expected)) assert.equal(result.caster[field], value, `${spellId}: ${field}`);
    assert.deepEqual([result.caster.enhancement, result.caster.auraTurns], [30, 2]);
    assert.equal(result.events.some(event => event.type === 'enhancement'), false);
  }
});

test('an expired or opposing Aura cannot increase outgoing damage', () => {
  const result = resolve('Fire-1', { caster: { auraTurns: 0 }, opponent: { enhancement: 30, auraTurns: 3 } });
  assert.equal(result.opponent.hp, 94);
  assert.deepEqual([result.events[0].enhancement, result.events[0].aura], [0, 0]);
  assert.deepEqual([result.opponent.enhancement, result.opponent.auraTurns], [30, 3]);
});

test('Fire-0 has exact printed text and adds only one capped Ember without dice or Enhancement scaling', () => {
  assert.equal(SPELL_CATALOG['Fire-0'].name, 'Fire-0');
  assert.equal(SPELL_CATALOG['Fire-0'].manaCost, 0);
  assert.equal(SPELL_CATALOG['Fire-0'].effectText, 'Gain 1 Ember.');
  assert.deepEqual(SPELL_RULES['Fire-0'], { requiresRoll: false, emberSpend: 'none' });
  for (const element of [0, 4, 5]) {
    const state = { players: [player('fire', { element, enhancement: 30, auraTurns: 3, mana: 0, loaded: 4, loadedPending: 2 }), player('water', { shield: 12 })] };
    const opponent = structuredClone(state.players[1]);
    const events = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-0' });
    assert.deepEqual([state.players[0].element, state.players[0].mana, state.players[0].loaded, state.players[0].loadedPending], [Math.min(5, element + 1), 0, 4, 2]);
    assert.deepEqual(state.players[1], opponent);
    assert.deepEqual([state.players[0].enhancement, state.players[0].auraTurns], [30, 3]);
    assert.equal(events.length, 1); assert.equal(events[0].type, 'resource'); assert.equal(events[0].amount, element < 5 ? 1 : 0);
    assert.deepEqual(getEmberSpendRange('Fire-0', element), { min: 0, max: 0, mandatory: false });
  }
  assert.throws(() => resolve('Fire-0', { roll: null, spent: 1 }), /Invalid Ember spending/);
});

test('Fire-15 always grants one capped Ember and grants capped Mana only on a final seven or higher', () => {
  assert.deepEqual(SPELL_RULES['Fire-15'], { requiresRoll: true, emberSpend: 'none' });
  assert.deepEqual([SPELL_CATALOG['Fire-15'].name, SPELL_CATALOG['Fire-15'].manaCost, SPELL_CATALOG['Fire-15'].effectText],
    ['Blaze', 0, 'Gain 1 Ember. On a 7+, gain 1 Mana.']);
  for (const rollTotal of [-2, 6, 7, 12]) for (const element of [0, 4, 5]) for (const mana of [0, 9, 10]) {
    const state = { players: [player('fire', { element, mana, hp: 60, shield: 12, loaded: 4, loadedPending: 2, enhancement: 30, auraTurns: 2 }), player('water', { shield: 12 })] };
    const before = structuredClone(state), events = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-15', rollTotal });
    const gain = rollTotal >= 7 ? Math.min(1, 10 - mana) : 0;
    assert.deepEqual(state.players[0], { ...before.players[0], element: Math.min(5, element + 1), mana: mana + gain });
    assert.deepEqual(state.players[1], before.players[1]);
    assert.deepEqual(events.map(event => [event.type, event.resource, event.amount]), [
      ['resource', 'element', element < 5 ? 1 : 0], ...(rollTotal >= 7 ? [['resource', 'mana', gain]] : []),
    ]);
    assert.deepEqual(getEmberSpendRange('Fire-15', element), { min: 0, max: 0, mandatory: false });
  }
  assert.throws(() => resolve('Fire-15', { roll: null }), /requires a resolved Modified Roll/);
  assert.throws(() => resolve('Fire-15', { roll: 7, spent: 1 }), /Invalid Ember spending/);
  const original = resolve('Fire-0', { roll: null, caster: { mana: 0 } });
  assert.deepEqual([original.caster.element, original.caster.mana], [1, 0], 'Fire-0 stays immediate and gains only one Ember');
});

test('Water-0 resolution adds ordinary plus conditional Flow, capped at five, without repeating on-cast Mana', () => {
  const spell = SPELL_CATALOG['Water-0'];
  assert.deepEqual([spell.name, spell.element, spell.category, spell.manaCost, spell.effectText, spell.art, spell.purpose],
    ['Swell', 'Water', 'Elemental', 0, 'Gain 1 Mana on cast. On a 7+, gain 1 additional Flow after resolution.', 'waterCard', 'Resource preparation']);
  assert.deepEqual(SPELL_RULES['Water-0'], { requiresRoll: true, emberSpend: 'none' });
  for (const rollTotal of [-2, 6, 7, 12]) for (const mana of [0, 1, 9, 10]) for (const element of [0, 3, 4, 5]) {
    const state = { players: [player('fire', { mana: 5, shield: 12 }),
      player('water', { mana, element, hp: 72, shield: 15, loaded: 4, loadedPending: 2, enhancement: 30, auraTurns: 2 })] };
    const before = structuredClone(state), events = applySpellEffect(state, { casterIndex: 1, spellId: 'Water-0', rollTotal });
    const flowGain = rollTotal >= 7 ? 2 : 1;
    assert.deepEqual(state.players[1], { ...before.players[1], element: Math.min(5, element + flowGain) });
    assert.deepEqual(state.players[0], before.players[0]);
    assert.deepEqual(events.map(event => [event.type, event.resource, event.amount]), [
      ['resource', 'element', Math.min(flowGain, 5 - element)],
    ]);
    assert.equal(events.length, 1, 'resolution never awards Mana or consumes damage bonuses');
    assert.equal(events.at(-1).resource, 'element', 'both Flow contributions happen together at resolution');
    assert.deepEqual(getEmberSpendRange('Water-0', element), { min: 0, max: 0, mandatory: false });
  }
  assert.throws(() => resolve('Water-0', { roll: null }), /requires a resolved Modified Roll/);
  assert.throws(() => resolve('Water-0', { roll: 7, spent: 1 }), /Invalid Ember spending/);
});

test('Fire-14 seven/nine scaling matches golden damage values across all Ember banks, bonuses and Shield', () => {
  assert.equal(SPELL_CATALOG['Fire-14'].manaCost, 8);
  assert.equal(SPELL_CATALOG['Fire-14'].effectText,
    'Spend all Embers. Deal 20 damage plus 7 per Ember spent. On an 8+, deal 9 per Ember instead.');
  assert.deepEqual(SPELL_RULES['Fire-14'], { requiresRoll: true, emberSpend: 'all' });
  // Independent golden values include fractions that round down and exact halves
  // that round up. The separate drawing prototype's ceiling rule does not apply.
  const golden = [
    { roll: 7, amounts: {
      '0:0': [20, 27, 34, 41, 48, 55], '0:10': [22, 30, 37, 45, 53, 61],
      '30:0': [26, 35, 44, 53, 62, 72], '30:10': [28, 38, 48, 57, 67, 77],
    } },
    { roll: 8, amounts: {
      '0:0': [20, 29, 38, 47, 56, 65], '0:10': [22, 32, 42, 52, 62, 72],
      '30:0': [26, 38, 49, 61, 73, 85], '30:10': [28, 41, 53, 66, 78, 91],
    } },
  ];
  for (const row of golden) for (const [key, amounts] of Object.entries(row.amounts)) {
    const [enhancement, aura] = key.split(':').map(Number);
    for (let spent = 0; spent <= 5; spent++) for (const shield of [0, 30]) {
      const result = resolve('Fire-14', { roll: row.roll, spent,
        caster: { element: 0, enhancement, auraTurns: aura ? 2 : 0, loadedPending: 2 }, opponent: { shield } });
      const damage = result.events.find(event => event.type === 'damage');
      const total = amounts[spent], absorbed = Math.min(shield, total), base = row.amounts['0:0'][spent];
      assert.deepEqual([damage.baseDamage, damage.enhancement, damage.aura, damage.totalDamage, damage.absorbed, damage.hpDamage],
        [base, enhancement, aura, total, absorbed, total - absorbed], `${row.roll}/${spent}/${key}/Shield${shield}`);
      assert.deepEqual([result.opponent.shield, result.opponent.hp], [shield - absorbed, 100 - total + absorbed]);
      assert.deepEqual([result.caster.element, result.caster.enhancement, result.caster.auraTurns, result.caster.loadedPending], [0, 0, aura ? 2 : 0, 2]);
      assert.equal(result.events.filter(event => event.type === 'enhancement').length, enhancement ? 1 : 0,
        'a damaging cast consumes the stored bank once, even when Shield absorbs all damage');
      assert.equal(result.events.some(event => event.type === 'shield'), false, 'Fire-14 does not strip Shield');
      assert.deepEqual(getEmberSpendRange('Fire-14', spent), { min: spent, max: spent, mandatory: true });
    }
  }
  assert.throws(() => resolve('Fire-14', { spent: 6, roll: 8 }), /Invalid Ember spending/);
  assert.equal(resolve('Fire-7', { spent: 5, roll: 8 }).events[0].amount, 50, 'Fire-7 stays at seven/ten per Ember');
  assert.equal(resolve('Fire-7', { spent: 5, roll: 9 }).events[0].amount, 65);
  assert.equal(resolve('Water-14', { roll: 7, caster: { element: 5 } }).events[0].amount, 40, 'Water-14 stays unchanged');
  assert.equal(resolve('Water-14', { roll: 8, caster: { element: 5 } }).events[0].amount, 52);
});

test('Fire-9 grants one capped Mana only when the capped post-gain Ember total is at least four', () => {
  assert.equal(SPELL_CATALOG['Fire-9'].manaCost, 2);
  assert.equal(SPELL_CATALOG['Fire-9'].effectText,
    'Gain 2 Embers. On a 7+, gain 3 instead. If you have 4 or more Embers after resolution, gain 1 Mana.');
  assert.deepEqual(SPELL_RULES['Fire-9'], { requiresRoll: true, emberSpend: 'none' });
  for (let element = 0; element <= 5; element++) for (const roll of [6, 7, 10]) for (const mana of [0, 9, 10]) {
    const caster = { element, mana, hp: 72, shield: 12, loaded: 4, loadedPending: 2, enhancement: 30, auraTurns: 2 };
    const result = resolve('Fire-9', { roll, caster, opponent: { shield: 20 } });
    const afterEmbers = Math.min(5, element + (roll >= 7 ? 3 : 2));
    const qualifies = afterEmbers >= 4, manaGain = qualifies ? Math.min(1, 10 - mana) : 0;
    assert.deepEqual(result.caster, player('fire', { ...caster, element: afterEmbers, mana: mana + manaGain }),
      `Embers ${element}, final roll ${roll}, Mana ${mana}`);
    assert.deepEqual(result.opponent, player('water', { shield: 20 }));
    assert.deepEqual(result.events.map(event => [event.type, event.resource, event.amount]), [
      ['resource', 'element', afterEmbers - element], ...(qualifies ? [['resource', 'mana', manaGain]] : []),
    ], 'the Ember gain precedes the independent Mana check; Shield and Loaded are never granted');
  }
});

test('Fire-11 costs two Mana and resolves damage, capped Embers and one conditional Mana without granting Loaded', () => {
  assert.equal(SPELL_CATALOG['Fire-11'].manaCost, 2);
  assert.equal(SPELL_CATALOG['Fire-11'].effectText,
    'Deal 10 damage and gain 2 Embers. On a 7+, gain 1 Mana.');
  assert.deepEqual(SPELL_RULES['Fire-11'], { requiresRoll: true, emberSpend: 'none' });
  const bonuses = [
    { enhancement: 0, auraTurns: 0, total: 10 }, { enhancement: 30, auraTurns: 0, total: 13 },
    { enhancement: 0, auraTurns: 2, total: 11 }, { enhancement: 30, auraTurns: 2, total: 14 },
  ];
  for (const roll of [6, 7, 10]) for (const mana of [0, 9, 10]) for (let element = 0; element <= 5; element++) {
    for (const { enhancement, auraTurns, total } of bonuses) for (const shield of [0, 30]) {
      const caster = { element, mana, hp: 72, shield: 12, loaded: 4, loadedPending: 2, enhancement, auraTurns };
      const result = resolve('Fire-11', { roll, caster, opponent: { shield } });
      const afterEmbers = Math.min(5, element + 2), manaGain = roll >= 7 ? Math.min(1, 10 - mana) : 0;
      const absorbed = Math.min(shield, total);
      assert.deepEqual(result.caster, player('fire', { ...caster, element: afterEmbers, mana: mana + manaGain, enhancement: 0 }),
        `final roll ${roll}, Mana ${mana}, Embers ${element}, Enhancement ${enhancement}, Aura ${auraTurns}, Shield ${shield}`);
      assert.deepEqual(result.opponent, player('water', { shield: shield - absorbed, hp: 100 - total + absorbed }));
      const damage = result.events[0];
      assert.deepEqual([damage.type, damage.baseDamage, damage.amount, damage.absorbed, damage.hpDamage],
        ['damage', 10, total, absorbed, total - absorbed]);
      assert.deepEqual(result.events.slice(1).map(event => [event.type, event.resource, event.amount]), [
        ['resource', 'element', afterEmbers - element],
        ...(roll >= 7 ? [['resource', 'mana', manaGain]] : []),
        ...(enhancement ? [['enhancement', undefined, -enhancement]] : []),
      ], 'a final ten has the same one-Mana reward as seven, and no threshold adds or clears Loaded');
    }
  }
});
