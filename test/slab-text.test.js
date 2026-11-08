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

const resourceTokens = markup => [...markup.matchAll(/<span class="slab-resource-token" data-resource="(fire|water)">([\s\S]*?)<span class="sr-only">(Embers?|Flow)<\/span><\/span>/g)];
const iconReading = markup => markup.replace(/<span class="slab-resource-token" data-resource="(fire|water)">[\s\S]*?<span class="sr-only">(?:Embers?|Flow)<\/span><\/span>/g, (_, kind) => `[${kind === 'fire' ? 'flame' : 'drop'}]`).replace(/<[^>]*>/g, '').trim();

test('resource icons replace only complete Ember, Embers and Flow tokens while retaining their accessible words', () => {
  const canonicalBefore = JSON.stringify(SPELL_CATALOG), compactBefore = JSON.stringify(COMPACT_SPELL_TEXT);
  for (const id of Object.keys(SPELL_CATALOG)) {
    const text = slabRulesText(id), markup = slabRulesMarkup(id), tokens = resourceTokens(markup);
    const words = [...text.matchAll(/\b(?:Embers?|Flow)\b/g)].map(match => match[0]);
    assert.deepEqual(tokens.map(match => match[3]), words, id);
    assert.equal((markup.match(/class="slab-resource-token"/g) || []).length, words.length, id);
    for (const [, kind, sprite, word] of tokens) {
      assert.equal(kind, word === 'Flow' ? 'water' : 'fire', `${id}: ${word}`);
      assert.match(sprite, /aria-hidden="true"/, `${id}: the icon is decorative`);
      assert.match(sprite, /\bslab-resource-icon\b/, id);
    }
    assert.equal(markup.replace(/<[^>]*>/g, '').trim(), text, `${id}: complete semantic plain text stays available`);
    assert.doesNotMatch(markup.replace(/<span class="sr-only">(?:Embers?|Flow)<\/span>/g, '').replace(/<[^>]*>/g, ''), /\b(?:Embers?|Flow)\b/, `${id}: resource words are hidden only in visual copy`);
  }
  assert.equal(JSON.stringify(SPELL_CATALOG), canonicalBefore, 'canonical spell effects and labels are unchanged');
  assert.equal(JSON.stringify(COMPACT_SPELL_TEXT), compactBefore, 'compact wording remains immutable and fully worded');
});

test('Flow symbols preserve damage formulas, gains, healing multipliers and resolution timing', () => {
  assert.equal(iconReading(slabRulesMarkup('Water-2')), 'Deal 4 + 2 × [drop] damage. 8+ Gain 1 extra [drop] after resolution.');
  assert.equal(iconReading(slabRulesMarkup('Water-4')), 'Deal 5 + [drop] damage. 7+ Gain +2 to your next roll. 10+ Gain 1 extra [drop] after resolution.');
  assert.equal(iconReading(slabRulesMarkup('Water-11')), 'Deal 8 + [drop] damage. Gain +2 to your next roll. 7+ Gain 1 extra [drop] after resolution.');
  assert.equal(iconReading(slabRulesMarkup('Water-10')), 'Gain 14 Shield. Heal 5 HP. 7+ Heal 2 extra HP per [drop].');
  for (const id of Object.keys(SPELL_CATALOG).filter(id => id.startsWith('Water-'))) {
    const text = slabRulesText(id), reading = iconReading(slabRulesMarkup(id));
    assert.deepEqual(reading.match(/\bdamage\b/g) || [], text.match(/\bdamage\b/g) || [], `${id}: damage remains explicit`);
    assert.deepEqual(reading.match(/\d+/g), text.match(/\d+/g), `${id}: no number or multiplier changes`);
  }
});

test('Ember symbols preserve optional and all spending, per-Ember scaling and unrelated Mana text', () => {
  assert.equal(iconReading(slabRulesMarkup('Fire-0')), 'Gain 1 [flame].');
  assert.equal(iconReading(slabRulesMarkup('Fire-15')), 'Gain 1 [flame] and 1 Mana.');
  assert.equal(iconReading(slabRulesMarkup('Fire-5')), 'Deal 10 damage. May spend 1 [flame] for +8 damage. 9+ Remove up to 8 Shield first.');
  assert.equal(iconReading(slabRulesMarkup('Fire-12')), 'Deal 14 damage. Spend 0–2 [flame]: +8 damage each. 7+ Remove up to 10 Shield first.');
  assert.equal(iconReading(slabRulesMarkup('Fire-7')), 'Spend all [flame]. Deal 15 + 7 per [flame] spent. 9+ Deal 15 + 10 per [flame] instead.');
  assert.equal(iconReading(slabRulesMarkup('Fire-14')), 'Spend all [flame]. Deal 20 + 9 per [flame] spent. 8+ Deal 20 + 12 per [flame] instead.');
  assert.equal(iconReading(slabRulesMarkup('Fire-9')), 'Gain 2 [flame]. 7+ Gain 3 instead. Then, if 4+ [flame]: gain 8 Shield.');
});

test('non-resource words and Fate rules keep their original display and all numeric thresholds remain bold', () => {
  for (const id of ['Fire-6', 'Fire-13', 'Water-1', 'FAT-001', 'FAT-002', 'FAT-003']) {
    assert.equal(resourceTokens(slabRulesMarkup(id)).length, 0, id);
    assert.equal(iconReading(slabRulesMarkup(id)), slabRulesText(id), id);
  }
  for (const [id, lines] of Object.entries(COMPACT_SPELL_TEXT)) {
    const markup = slabRulesMarkup(id);
    assert.deepEqual([...markup.matchAll(/<strong class="slab-rule-threshold">([^<]+)<\/strong>/g)].map(match => match[1]), lines.filter(line => line.threshold).map(line => line.threshold), id);
    assert.deepEqual(iconReading(markup).match(/\d+/g), slabRulesText(id).match(/\d+/g), id);
  }
});
