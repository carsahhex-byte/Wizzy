import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG } from '../src/spells.js';
import { COMPACT_SPELL_TEXT, slabRulesMarkup, slabRulesText } from '../src/slab-text.js';

test('all 34 immutable display definitions retain their canonical roll thresholds', () => {
  assert.equal(Object.keys(COMPACT_SPELL_TEXT).length, 34);
  assert.deepEqual(Object.keys(COMPACT_SPELL_TEXT).sort(), Object.keys(SPELL_CATALOG).sort());
  for (const [id, spell] of Object.entries(SPELL_CATALOG)) {
    const lines = COMPACT_SPELL_TEXT[id];
    assert.ok(Object.isFrozen(lines) && lines.length >= 1 && lines.length <= 3);
    assert.ok(lines.every(value => Object.isFrozen(value) && value.text.length > 0 && value.text.length <= 40));
    assert.deepEqual(lines.filter(value => value.threshold).map(value => value.threshold),
      [...spell.effectText.matchAll(/On an? (\d+\+),/g)].map(match => match[1]), id);
  }
});

test('compact resource and damage math distinguishes gains, replacements and extra effects', () => {
  assert.equal(slabRulesText('Fire-0'), '+1 Ember');
  assert.equal(slabRulesText('Fire-15'), '+1 Ember 6+ +1 Mana');
  assert.equal(slabRulesText('Water-0'), '+1 Mana on cast 7+ +1 extra Flow');
  for (const id of ['Fire-1', 'Fire-2', 'Fire-3', 'Fire-4', 'Fire-6', 'Fire-7', 'Fire-9', 'Fire-13', 'Fire-14', 'Water-3']) assert.match(slabRulesText(id), /instead/, id);
  for (const id of ['Fire-8', 'Fire-10', 'Water-1', 'Water-6', 'Water-7', 'Water-8', 'Water-9', 'Water-10', 'Water-13', 'Water-14']) assert.match(slabRulesText(id), /extra/, id);
  assert.match(slabRulesText('Fire-7'), /Spend all Embers.*15 \+ 7×Ember spent.*9\+ 15 \+ 10×Ember instead/);
  assert.equal(slabRulesText('Fire-6'), 'Deal 20 7+ Deal 30 instead, +2 Embers');
  assert.equal(slabRulesText('Fire-14'), 'Deal 55 8+ Deal 65 instead');
  assert.equal(COMPACT_SPELL_TEXT['Fire-9'][2].threshold, undefined, 'the Mana check is independent of the roll tier');
  assert.equal(COMPACT_SPELL_TEXT['Fire-9'][2].text, 'Then 4+ Embers: +1 Mana');
});

test('Water-0 separates its unconditional on-cast Mana from extra Flow at the rolled threshold', () => {
  assert.deepEqual(COMPACT_SPELL_TEXT['Water-0'], [
    { text: '+1 Mana on cast' }, { threshold: '7+', text: '+1 extra Flow' },
  ]);
  assert.equal(SPELL_CATALOG['Water-0'].effectText,
    'Gain 1 Mana on cast. On a 7+, gain 1 additional Flow after resolution.');
  const markup = slabRulesMarkup('Water-0');
  assert.equal((markup.match(/class="slab-rule-threshold"/g) || []).length, 1);
  assert.ok(markup.indexOf('on cast') < markup.indexOf('slab-rule-threshold'));
  assert.match(markup, /data-rule-word="Mana"/);
  assert.match(markup, /data-rule-word="Flow"/);
  assert.equal(slabRulesText('Fire-15'), '+1 Ember 6+ +1 Mana', 'Fire-15 keeps its separate conditional Mana rule');
});

test('Fire-9 and Fire-11 display the new Mana rewards with no former Shield or Loaded reward', () => {
  assert.equal(slabRulesText('Fire-9'), '+2 Embers 7+ +3 instead Then 4+ Embers: +1 Mana');
  assert.doesNotMatch(slabRulesText('Fire-9'), /Shield|roll|10\+/);
  assert.deepEqual(COMPACT_SPELL_TEXT['Fire-11'], [
    { text: 'Deal 10, +2 Embers' }, { threshold: '7+', text: '+1 Mana' },
  ]);
  assert.equal(SPELL_CATALOG['Fire-11'].manaCost, 2);
  assert.equal(SPELL_CATALOG['Fire-11'].effectText, 'Deal 10 damage and gain 2 Embers. On a 7+, gain 1 Mana.');
  assert.doesNotMatch(slabRulesText('Fire-11'), /Next|roll|10\+|instead/);
  for (const id of ['Fire-9', 'Fire-11']) {
    const markup = slabRulesMarkup(id);
    assert.equal((markup.match(/data-rule-word="Mana"/g) || []).length, 1, id);
    assert.doesNotMatch(markup, /data-rule-word="Shield"|data-rule-word="roll"/, id);
  }
});

test('optional spending, Shield removal order, Loaded and extra Flow timing remain explicit', () => {
  assert.match(slabRulesText('Fire-5'), /May spend 1 Ember: \+8 damage.*9\+ Cut ≤8 Shield first/);
  assert.match(slabRulesText('Fire-12'), /Spend 0–2 Embers: \+8 damage each.*7\+ Cut ≤10 Shield first/);
  for (const id of ['Water-2', 'Water-4', 'Water-9', 'Water-11']) assert.match(slabRulesText(id), /After spell: \+1 extra Flow/, id);
  assert.match(slabRulesText('Water-4'), /7\+ Next roll \+2.*10\+ After spell: \+1 extra Flow/);
  assert.doesNotMatch(slabRulesText('Water-4'), /instead/);
  assert.equal(COMPACT_SPELL_TEXT['Water-9'][1].threshold, undefined, 'extra Flow is unconditional');
  assert.equal(COMPACT_SPELL_TEXT['Water-11'][1].text, 'Next roll +2', 'Loaded is unconditional');
  assert.equal(COMPACT_SPELL_TEXT['Water-10'][1].text, 'Heal +2×Flow extra');
});

test('Fate faces show only their roll change while the canonical roles remain available', () => {
  for (const [id, text, role] of [['FAT-001', '+4 to roll', 'attacking'], ['FAT-002', '−4 to roll', 'defending'], ['FAT-003', '+2/−2 to roll', 'Choose']]) {
    assert.equal(slabRulesText(id), text);
    const markup = slabRulesMarkup(id);
    assert.equal((markup.match(/data-pixel-icon="die"/g) || []).length, 1);
    assert.equal(COMPACT_SPELL_TEXT[id].length, 1);
    assert.ok(SPELL_CATALOG[id].effectText.includes(role));
  }
});

test('icons replace complete semantic words and keep their exact accessible text', () => {
  const kinds = { Deal: 'sword', damage: 'sword', Heal: 'heart', Ember: 'fire', Embers: 'fire', Flow: 'water', Shield: 'shield', Mana: 'mana', roll: 'die' };
  const canonical = JSON.stringify(SPELL_CATALOG);
  for (const [id, lines] of Object.entries(COMPACT_SPELL_TEXT)) {
    const markup = slabRulesMarkup(id), text = slabRulesText(id);
    assert.equal(markup.replace(/<[^>]*>/g, '').trim(), text, id);
    const tokens = [...markup.matchAll(/<span class="slab-symbol(?: slab-resource-token)?" data-rule-word="([^"]+)"[^>]*>([\s\S]*?)<span class="sr-only">([^<]+)<\/span><\/span>/g)];
    assert.deepEqual(tokens.map(match => match[1]), [...text.matchAll(/\b(?:Deal|damage|Heal|Embers?|Flow|Shield|Mana|roll)\b/g)].map(match => match[0]), id);
    for (const [, word, sprite, spoken] of tokens) {
      assert.equal(spoken, word);
      assert.match(sprite, new RegExp(`data-pixel-icon="${kinds[word]}"`));
      assert.match(sprite, /aria-hidden="true"/);
      assert.match(sprite, /alt=""/);
    }
    assert.equal((markup.match(/class="slab-rule-line"/g) || []).length, lines.length);
    assert.deepEqual([...markup.matchAll(/<strong class="slab-rule-threshold">([^<]+)<\/strong>/g)].map(match => match[1]), lines.filter(value => value.threshold).map(value => value.threshold));
  }
  assert.equal(JSON.stringify(SPELL_CATALOG), canonical, 'display generation does not change spell rules');
  for (const id of ['unknown', '<img src=x>', '__proto__', 'constructor']) {
    assert.equal(slabRulesMarkup(id), ''); assert.equal(slabRulesText(id), '');
  }
});
