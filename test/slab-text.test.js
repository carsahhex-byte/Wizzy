import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG } from '../src/spells.js';
import { COMPACT_SPELL_TEXT, slabRulesMarkup, slabRulesText } from '../src/slab-text.js';

test('all current slabs have immutable concise copy with every canonical roll threshold', () => {
  assert.equal(Object.keys(COMPACT_SPELL_TEXT).length, 33);
  assert.deepEqual(Object.keys(COMPACT_SPELL_TEXT).sort(), Object.keys(SPELL_CATALOG).sort());
  for (const [id, spell] of Object.entries(SPELL_CATALOG)) {
    const lines = COMPACT_SPELL_TEXT[id];
    assert.ok(Object.isFrozen(lines));
    assert.ok(lines.length >= 1 && lines.length <= 3);
    assert.ok(lines.every(value => Object.isFrozen(value) && typeof value.text === 'string' && value.text.length));
    const expected = [...spell.effectText.matchAll(/On an? (\d+\+),/g)].map(match => match[1]);
    assert.deepEqual(lines.filter(value => value.threshold).map(value => value.threshold), expected, id);
    assert.ok(lines.every(value => value.text.length <= 45), `${id} has overly long display copy`);
  }
});

test('replacement thresholds remain distinct from extra damage, Shield and healing', () => {
  assert.equal(slabRulesText('Fire-15'), 'Gain 1 Ember and 1 Mana.');
  for (const id of ['Fire-1', 'Fire-2', 'Fire-3', 'Fire-4', 'Fire-6', 'Fire-7', 'Fire-9', 'Fire-11', 'Fire-13', 'Fire-14', 'Water-3']) {
    assert.match(slabRulesText(id), /instead/, id);
  }
  for (const id of ['Fire-8', 'Fire-10', 'Water-1', 'Water-6', 'Water-7', 'Water-8', 'Water-9', 'Water-10', 'Water-13', 'Water-14']) {
    assert.match(slabRulesText(id), /extra/, id);
  }
  assert.match(slabRulesText('Fire-7'), /15 \+ 7 per Ember spent.*9\+ Deal 15 \+ 10 per Ember instead/);
  assert.match(slabRulesText('Fire-14'), /20 \+ 9 per Ember spent.*8\+ Deal 20 \+ 12 per Ember instead/);
  assert.match(slabRulesText('Fire-9'), /Then, if 4\+ Embers: gain 8 Shield/);
});

test('spending choices, shield-removal order and extra Flow timing stay explicit', () => {
  assert.match(slabRulesText('Fire-5'), /May spend 1 Ember for \+8 damage.*9\+ Remove up to 8 Shield first/);
  assert.match(slabRulesText('Fire-12'), /Spend 0–2 Embers: \+8 damage each.*7\+ Remove up to 10 Shield first/);
  for (const id of ['Water-2', 'Water-4', 'Water-9', 'Water-11']) {
    assert.match(slabRulesText(id), /Gain 1 extra Flow after resolution/, id);
  }
  assert.match(slabRulesText('Water-4'), /7\+ Gain \+2 to your next roll.*10\+ Gain 1 extra Flow after resolution/);
  assert.doesNotMatch(slabRulesText('Water-4'), /instead/);
  assert.match(slabRulesText('Water-11'), /Deal 8 \+ Flow damage. Gain \+2 to your next roll. 7\+ Gain 1 extra Flow after resolution/);
});

test('live markup gives each rule a line and each roll threshold semantic bold text', () => {
  for (const [id, lines] of Object.entries(COMPACT_SPELL_TEXT)) {
    const markup = slabRulesMarkup(id);
    assert.equal((markup.match(/class="slab-rule-line"/g) || []).length, lines.length, id);
    assert.equal((markup.match(/<strong class="slab-rule-threshold">/g) || []).length, lines.filter(value => value.threshold).length, id);
    assert.equal(markup.replace(/<[^>]*>/g, '').trim(), slabRulesText(id), id);
  }
  for (const id of ['not-a-spell', '<img src=x>', '__proto__', 'constructor']) {
    assert.equal(slabRulesMarkup(id), '');
    assert.equal(slabRulesText(id), '');
  }
});
