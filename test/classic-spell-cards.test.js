import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ASSET_FILES, SPELL_SLABS, SPELL_ILLUSTRATIONS, spellSlabMarkup } from '../src/assets.js';
import { COMPACT_SPELL_TEXT, slabRulesMarkup } from '../src/slab-text.js';

const specs = [
  { id: 'Fire-16', frame: 'fireCard', art: 'antiFurnaceArt', name: 'Anti-Furnace', source: 'anti-furnace/anti-furnace-illustration-v2.png' },
  { id: 'Earth-6', frame: 'earthCard', art: 'metamorphicArt', name: 'Metamorphic', source: 'metamorphic/metamorphic-illustration-v2.png' },
];

test('new spell cards preserve approved art bytes and the exact classic frame apertures', async () => {
  for (const { id, frame, art, name, source } of specs) {
    const crop = SPELL_SLABS[id];
    assert.deepEqual([crop.width, crop.height, crop.x, crop.y, crop.w, crop.h], [1086, 1448, 68, 70, 951, 1254]);
    assert.equal(crop.asset, frame);
    assert.equal(SPELL_ILLUSTRATIONS[id].asset, art);
    const installed = await readFile(new URL(`../public/graphics/${ASSET_FILES[art]}`, import.meta.url));
    const approved = await readFile(new URL(`../designs/new-spells-review/${source}`, import.meta.url));
    assert.deepEqual(installed, approved, `${name} uses the approved illustration unchanged`);
    const markup = spellSlabMarkup(id);
    assert.match(markup, /data-card-template="classic"/);
    assert.ok(markup.includes(`>${name}</strong>`));
    assert.match(markup, /top:57\.4%;left:8\.1%;right:8\.1%;bottom:7\.5%/);
    assert.match(markup, /object-fit:cover;image-rendering:pixelated/);
    const aperture = markup.match(/data-card-illustration="[^"]+" style="position:absolute;left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%/).slice(1).map(Number);
    assert.deepEqual(aperture, [79 / 951 * 100, 86 / 1254 * 100, 793 / 951 * 100, 617 / 1254 * 100]);
  }
  assert.doesNotMatch(spellSlabMarkup('Fire-15'), /data-card-template/);
  assert.doesNotMatch(spellSlabMarkup('Earth-5'), /data-card-template/);
});

test('new compact copy keeps the approved thresholds and Shield-damage icon pair', () => {
  assert.deepEqual(COMPACT_SPELL_TEXT['Fire-16'], [
    { text: 'Deal 10' }, { threshold: '7+', text: '15 Deal Shield' }, { text: 'if 0 Deal Shield then +2 Ember' },
  ]);
  assert.deepEqual(COMPACT_SPELL_TEXT['Earth-6'], [
    { threshold: '5+', text: '50% Shield = ½ Deal' }, { text: 'from opponent’s' }, { text: 'previous turn' },
  ]);
  const anti = slabRulesMarkup('Fire-16');
  assert.equal((anti.match(/data-pixel-icon="sword"/g) || []).length, 3);
  assert.equal((anti.match(/data-pixel-icon="shield"/g) || []).length, 2);
  assert.equal((anti.match(/data-pixel-icon="fire"/g) || []).length, 1);
  assert.match(anti, /if 0 .*data-rule-word="Deal".*data-rule-word="Shield".*then \+2 .*data-rule-word="Ember"/);
  assert.match(slabRulesMarkup('Earth-6'), /slab-rule-threshold">5\+</);
});
