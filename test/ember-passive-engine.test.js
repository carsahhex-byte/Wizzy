import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpellEffect, calculateEnhancedDamage, applyDamageToPlayer, EMBER_DAMAGE_PER_POINT } from '../src/effects.js';

const wizard = (id, values = {}) => ({ id, name: id === 'fire' ? 'Fire' : 'Water', hp: 100, maxHp: 100,
  mana: 3, shield: 0, element: 0, loaded: 0, loadedPending: 0, enhancement: 0, auraTurns: 0, ...values });
const duel = (fire = {}, water = {}) => ({ players: [wizard('fire', fire), wizard('water', water)] });

test('held Ember percentages add once to damage bonuses, with golden rounding and valid bounds', () => {
  assert.equal(EMBER_DAMAGE_PER_POINT, 5);
  for (const [base, expected] of [
    [10, [10, 11, 11, 12, 12, 13]],
    [20, [20, 21, 22, 23, 24, 25]],
    [30, [30, 32, 33, 35, 36, 38]],
    [55, [55, 58, 61, 63, 66, 69]],
    [65, [65, 68, 72, 75, 78, 81]],
  ]) for (let embers = 0; embers <= 5; embers++) {
    const detail = calculateEnhancedDamage(base, 0, 0, embers * 5);
    assert.equal(detail.totalDamage, expected[embers], `${base} with ${embers} Embers`);
    assert.equal(detail.combinedPercent, embers * 5);
    assert.equal(detail.emberBonus ?? 0, embers * 5);
  }
  assert.deepEqual(calculateEnhancedDamage(20, 30, 10, 25), {
    baseDamage: 20, enhancement: 30, aura: 10, emberBonus: 25,
    combinedPercent: 65, bonusDamage: 13, totalDamage: 33,
  });
  assert.equal(calculateEnhancedDamage(10, 30, 10, 25).totalDamage, 17, '16.5 rounds up once');
  assert.equal(calculateEnhancedDamage(36, 30, 10, 25).totalDamage, 59);
  for (const invalid of [-5, 1, 4, 30, 100, '5', null, NaN, Infinity]) {
    assert.throws(() => calculateEnhancedDamage(10, 0, 0, invalid), /Ember bonus/);
  }
});

test('Xineoph consumes the pre-reward bank, retaining only its new Embers for later attacks', () => {
  const state = duel({ element: 1 });
  for (const [expectedDamage, expectedEmbers, expectedPercent] of [[11, 2, 5], [11, 2, 10], [11, 2, 10]]) {
    const held = state.players[0].element;
    const events = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-11', rollTotal: 6 });
    const damage = events[0];
    assert.equal(damage.amount, expectedDamage);
    assert.equal(damage.emberBonus, expectedPercent);
    assert.match(damage.message, new RegExp(`\\+ ${expectedPercent}% Embers = ${expectedDamage} damage`));
    assert.equal(state.players[0].element, expectedEmbers);
    assert.equal(state.players[0].mana, 3);
    assert.deepEqual(events.slice(1).map(event => [event.type, event.resource, event.amount]), [
      ['resource', 'element', -held], ['resource', 'element', 2],
    ], 'consumption is logged before the new printed reward');
    assert.match(events[1].message, /Embers return to 0/);
  }
  assert.equal(state.players[1].hp, 67);
});

test('Charred Blade uses its two final roll tiers and banks only the new threshold reward', () => {
  for (const [rollTotal, baseDamage, expected] of [
    [6, 20, [28, 29, 30, 31, 32, 33]],
    [7, 30, [42, 44, 45, 47, 48, 50]],
    [10, 30, [42, 44, 45, 47, 48, 50]],
  ]) for (let element = 0; element <= 5; element++) {
    const totalDamage = expected[element];
    const state = duel({ element, enhancement: 30, auraTurns: 2 }, { shield: 30 });
    const events = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-6', rollTotal });
    const absorbed = Math.min(30, totalDamage);
    assert.deepEqual([events[0].baseDamage, events[0].totalDamage, events[0].combinedPercent], [baseDamage, totalDamage, 40 + element * 5]);
    assert.deepEqual([state.players[1].shield, state.players[1].hp], [30 - absorbed, 100 - totalDamage + absorbed]);
    assert.deepEqual([state.players[0].element, state.players[0].enhancement, state.players[0].auraTurns], [rollTotal >= 7 ? 2 : 0, 0, 2]);
    assert.equal(events.filter(event => event.type === 'enhancement').length, 1);
    assert.deepEqual(events.filter(event => event.resource === 'element').map(event => event.amount), [
      ...(element ? [-element] : []), ...(rollTotal >= 7 ? [2] : []),
    ]);
  }
  const capped = duel({ element: 9 });
  const [damage] = applySpellEffect(capped, { casterIndex: 0, spellId: 'Fire-6', rollTotal: 7 });
  assert.equal(damage.amount, 38); assert.equal(capped.players[0].element, 2);
});

test('archived Fire attacks consume held Embers before rewards while zero-bonus damage events stay compatible', () => {
  for (const [spellId, reward] of [['Fire-1', 2], ['Fire-4', 1], ['Fire-5', 0], ['Fire-6', 2],
    ['Fire-8', 1], ['Fire-11', 2], ['Fire-12', 0], ['Fire-13', 0]]) {
    const plain = applySpellEffect(duel(), { casterIndex: 0, spellId, rollTotal: 10 }).find(event => event.type === 'damage');
    const state = duel({ element: 3 });
    const events = applySpellEffect(state, { casterIndex: 0, spellId, rollTotal: 10 });
    const boosted = events.find(event => event.type === 'damage');
    assert.equal(Object.hasOwn(plain, 'emberBonus'), false, spellId);
    assert.equal(boosted.emberBonus, 15, spellId);
    assert.equal(boosted.amount, Math.round(plain.baseDamage * 1.15), spellId);
    assert.equal(state.players[0].element, reward, spellId);
    assert.equal(events.filter(event => event.resource === 'element' && event.amount < 0).length, 1, spellId);
  }
});

test('the archived paid Fire-7 finisher keeps its formula and non-damaging resource gains preserve the bank', () => {
  for (const [spellId, rollTotal, expected] of [['Fire-7', 8, 70], ['Fire-7', 9, 91]]) {
    // Commit has already spent all five Embers; the pending spell records five spent.
    const state = duel({ element: 0, enhancement: 30, auraTurns: 2 });
    const [damage] = applySpellEffect(state, { casterIndex: 0, spellId, rollTotal, emberSpent: 5 });
    assert.equal(damage.amount, expected);
    assert.equal(damage.emberBonus ?? 0, 0);
    assert.equal(state.players[0].element, 0);
  }
  assert.throws(() => applySpellEffect(duel(), { casterIndex: 0, spellId: 'Fire-14', rollTotal: 8, emberSpent: 1 }),
    /Invalid Ember spending/, 'Sunsetter no longer has a prepaid Ember cost');
  for (const [spellId, expectedElement, expectedMana, expectedShield] of [
    ['Fire-2', 5, 3, 0], ['Fire-15', 5, 4, 0], ['Fire-3', 5, 3, 12],
  ]) {
    const state = duel({ element: 4, enhancement: 30, auraTurns: 2 });
    const events = applySpellEffect(state, { casterIndex: 0, spellId, rollTotal: 6 + Number(spellId === 'Fire-3') });
    assert.deepEqual([state.players[0].element, state.players[0].mana, state.players[0].shield], [expectedElement, expectedMana, expectedShield]);
    assert.deepEqual([state.players[0].enhancement, state.players[0].auraTurns], [30, 2]);
    assert.equal(events.some(event => event.type === 'damage'), false);
    assert.equal(state.players[1].hp, 100);
  }
});

test('fully absorbed outgoing Fire damage still consumes the bank and a later attack cannot reuse it', () => {
  for (let element = 0; element <= 5; element++) {
    const state = duel({ element }, { shield: 30 });
    const first = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-1', rollTotal: 6 });
    assert.equal(first[0].hpDamage, 0);
    assert.equal(state.players[0].element, 0);
    assert.equal(first.filter(event => event.resource === 'element').length, element ? 1 : 0);
    const second = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-1', rollTotal: 6 });
    assert.equal(second[0].amount, 6);
    assert.equal(Object.hasOwn(second[0], 'emberBonus'), false);
    assert.equal(second.some(event => event.resource === 'element'), false);
  }
});

test('Water damage and healing and shield-bypassing self damage never use Ember percentages', () => {
  const state = duel({ element: 5 }, { hp: 60, element: 5, enhancement: 30, auraTurns: 2 });
  const events = applySpellEffect(state, { casterIndex: 1, spellId: 'Water-12', rollTotal: 7 });
  assert.deepEqual([events[0].baseDamage, events[0].amount, events[0].combinedPercent], [22, 31, 40]);
  assert.equal(Object.hasOwn(events[0], 'emberBonus'), false);
  assert.equal(state.players[1].hp, 70);
  assert.equal(state.players[0].element, 5, 'incoming Water damage preserves Fire\'s bank');
  const fire = wizard('fire', { element: 5, shield: 30, enhancement: 30, auraTurns: 2 });
  assert.deepEqual(applyDamageToPlayer(fire, 10, { selfDamage: true }), { amount: 10, absorbed: 0, hpDamage: 10, selfDamage: true });
  assert.deepEqual([fire.hp, fire.shield, fire.element, fire.enhancement, fire.auraTurns], [90, 30, 5, 30, 2]);
});
