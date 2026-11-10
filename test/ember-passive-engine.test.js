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
    [22, [22, 23, 24, 25, 26, 28]],
    [28, [28, 29, 31, 32, 34, 35]],
    [36, [36, 38, 40, 41, 43, 45]],
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

test('Xineoph uses the pre-reward Ember bank and keeps growing persistent power between attacks', () => {
  const state = duel({ element: 1 });
  for (const [expectedDamage, expectedEmbers, expectedPercent] of [[11, 3, 5], [12, 5, 15], [13, 5, 25]]) {
    const events = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-11', rollTotal: 6 });
    const damage = events[0];
    assert.equal(damage.amount, expectedDamage);
    assert.equal(damage.emberBonus, expectedPercent);
    assert.match(damage.message, new RegExp(`\\+ ${expectedPercent}% Embers = ${expectedDamage} damage`));
    assert.equal(state.players[0].element, expectedEmbers);
    assert.equal(state.players[0].mana, 3);
    assert.equal(events[1].type, 'resource');
  }
  assert.equal(state.players[1].hp, 64);
});

test('Charred Blade applies each final roll tier using held Embers before Shield, then consumes only Enhancement', () => {
  for (const [rollTotal, baseDamage, totalDamage] of [[6, 22, 36], [7, 28, 46], [10, 36, 59]]) {
    const state = duel({ element: 5, enhancement: 30, auraTurns: 2 }, { shield: 30 });
    const events = applySpellEffect(state, { casterIndex: 0, spellId: 'Fire-6', rollTotal });
    assert.deepEqual([events[0].baseDamage, events[0].totalDamage, events[0].combinedPercent], [baseDamage, totalDamage, 65]);
    assert.deepEqual([state.players[1].shield, state.players[1].hp], [0, 130 - totalDamage]);
    assert.deepEqual([state.players[0].element, state.players[0].enhancement, state.players[0].auraTurns], [5, 0, 2]);
    assert.equal(events.filter(event => event.type === 'enhancement').length, 1);
  }
  const capped = duel({ element: 9 });
  const [damage] = applySpellEffect(capped, { casterIndex: 0, spellId: 'Fire-6', rollTotal: 7 });
  assert.equal(damage.amount, 35); assert.equal(capped.players[0].element, 5);
});

test('all archived non-finisher Fire attacks use the same passive while old zero-bonus event shapes stay compatible', () => {
  for (const spellId of ['Fire-1', 'Fire-4', 'Fire-5', 'Fire-6', 'Fire-8', 'Fire-11', 'Fire-12', 'Fire-13']) {
    const plain = applySpellEffect(duel(), { casterIndex: 0, spellId, rollTotal: 10 }).find(event => event.type === 'damage');
    const boosted = applySpellEffect(duel({ element: 3 }), { casterIndex: 0, spellId, rollTotal: 10 }).find(event => event.type === 'damage');
    assert.equal(Object.hasOwn(plain, 'emberBonus'), false, spellId);
    assert.equal(boosted.emberBonus, 15, spellId);
    assert.equal(boosted.amount, Math.round(plain.baseDamage * 1.15), spellId);
  }
});

test('paid finisher resources do not receive a second passive bonus and resource gains stay printed', () => {
  for (const [spellId, rollTotal, expected] of [['Fire-7', 9, 91], ['Fire-14', 7, 77], ['Fire-14', 8, 91]]) {
    // Commit has already spent all five Embers; the pending spell records five spent.
    const state = duel({ element: 0, enhancement: 30, auraTurns: 2 });
    const [damage] = applySpellEffect(state, { casterIndex: 0, spellId, rollTotal, emberSpent: 5 });
    assert.equal(damage.amount, expected);
    assert.equal(damage.emberBonus ?? 0, 0);
    assert.equal(state.players[0].element, 0);
  }
  for (const [spellId, expectedElement, expectedMana, expectedShield] of [
    ['Fire-2', 5, 3, 0], ['Fire-15', 5, 4, 0], ['Fire-3', 5, 3, 12],
  ]) {
    const state = duel({ element: 4, enhancement: 30, auraTurns: 2 });
    const events = applySpellEffect(state, { casterIndex: 0, spellId, rollTotal: 7 });
    assert.deepEqual([state.players[0].element, state.players[0].mana, state.players[0].shield], [expectedElement, expectedMana, expectedShield]);
    assert.deepEqual([state.players[0].enhancement, state.players[0].auraTurns], [30, 2]);
    assert.equal(events.some(event => event.type === 'damage'), false);
    assert.equal(state.players[1].hp, 100);
  }
});

test('Water damage and healing and shield-bypassing self damage never use Ember percentages', () => {
  const state = duel({ element: 5 }, { hp: 60, element: 5, enhancement: 30, auraTurns: 2 });
  const events = applySpellEffect(state, { casterIndex: 1, spellId: 'Water-12', rollTotal: 7 });
  assert.deepEqual([events[0].baseDamage, events[0].amount, events[0].combinedPercent], [22, 31, 40]);
  assert.equal(Object.hasOwn(events[0], 'emberBonus'), false);
  assert.equal(state.players[1].hp, 70);
  const fire = wizard('fire', { element: 5, shield: 30, enhancement: 30, auraTurns: 2 });
  assert.deepEqual(applyDamageToPlayer(fire, 10, { selfDamage: true }), { amount: 10, absorbed: 0, hpDamage: 10, selfDamage: true });
  assert.deepEqual([fire.hp, fire.shield, fire.element, fire.enhancement, fire.auraTurns], [90, 30, 5, 30, 2]);
});
