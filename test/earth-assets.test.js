import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ASSET_FILES, EARTH_ANIMATION_SHEETS, GOLEM_ANIMATION_SHEETS, SPELL_ILLUSTRATIONS, SPELL_ART, SPELL_SLABS, spellSlabMarkup, spellArtMarkup } from '../src/assets.js';
import { SPELL_CATALOG } from '../src/spells.js';

const file = name => new URL(`../${name}`, import.meta.url);
const sourceArt = {
  'Fire-2':'designs/fire-water-art-reimagining/art/fire-2.png',
  'Fire-15':'designs/fire-water-art-reimagining/art/fire-15.png',
  'Fire-6':'designs/fire-water-art-reimagining/art/fire-6.png',
  'Fire-14':'designs/fire-water-art-reimagining/art/fire-14.png',
  'Water-12':'designs/fire-water-art-reimagining/art/water-12.png',
  'Water-9':'designs/fire-water-art-reimagining/art/water-9.png',
  'Water-14':'designs/fire-water-art-reimagining/art/water-14.png',
  ...Object.fromEntries(Array.from({length:5},(_,i)=>[`Earth-${i+1}`,`designs/earth-spell-drafts/art/earth-${i+1}.png`])),
};

test('all fifteen new illustrations share the same registry across cards and previews', () => {
  assert.equal(Object.keys(SPELL_ILLUSTRATIONS).length,15);
  for (const [id,art] of Object.entries(SPELL_ILLUSTRATIONS)) {
    assert.equal(SPELL_ART[id],art,id);
    const slab = spellSlabMarkup(id), preview = spellArtMarkup(id);
    assert.ok(slab.includes(`data-card-illustration="${art.asset}"`),id);
    assert.ok(slab.includes(`>${SPELL_CATALOG[id].name}</strong>`),id);
    assert.ok(slab.includes(`data-slab-rules="${id}"`),id);
    assert.ok(preview.includes(`data-spell-art="${id}"`),id);
    assert.match(slab,/overflow:hidden;clip-path:polygon/);
    const aperture = slab.match(/data-card-illustration="[^"]+" style="position:absolute;left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%/);
    assert.ok(aperture,id);
    const [,left,top,width,height] = aperture.map(Number);
    const earth = id.startsWith('Earth-'), paperTop = earth ? 57.4 : id.startsWith('Fire-') ? 49.5 : 50.5;
    assert.ok(left > 0 && top > 0 && left + width < 100,id);
    assert.ok(top + height < paperTop,`${id} art stays above live paper`);
    if (earth) {
      assert.equal(SPELL_SLABS[id].asset,'earthCard');
      assert.match(slab,/background:transparent/);
    }
  }
});

test('installed illustrations preserve every approved source PNG byte', async () => {
  for (const [id,path] of Object.entries(sourceArt)) {
    const installed = await readFile(file(`public/graphics/${ASSET_FILES[SPELL_ILLUSTRATIONS[id].asset]}`));
    assert.deepEqual(installed,await readFile(file(path)),id);
  }
});

test('Xineoph, Swell and Sea bolt retain the latest approved overrides', async () => {
  const latest = {
    'Fire-11':'dbc4cbf631ef53322eeb62ee68a9523095896254a1c9d5aa5eda4a49c20afcd8',
    'Water-0':'e4eb8cd0eff678fd22377bf03b9c5b99d1e262e6d179920a077f793d01c0644c',
    'Water-2':'1d0d6ae72b37c9314bce16068daa881d02f26481dbbda16fd9d3f2c727984a6a',
  };
  for (const [id,expected] of Object.entries(latest)) {
    const installed = await readFile(file(`public/graphics/${ASSET_FILES[SPELL_ILLUSTRATIONS[id].asset]}`));
    assert.equal(createHash('sha256').update(installed).digest('hex'),expected,id);
  }
});

test('Earth animation metadata retains measured anchors and Golem spill crops', async () => {
  const preview = JSON.parse(await readFile(file('designs/earth-air-previews/manifest.json')));
  const golem = JSON.parse(await readFile(file('designs/earth-air-golem-review/manifest.json')));
  for (const [key,sheet] of Object.entries(EARTH_ANIMATION_SHEETS)) {
    assert.deepEqual(sheet.frameAnchors,preview.sheets[key].frameAnchors,key);
    assert.equal(sheet.displayScale,preview.sheets[key].displayScale,key);
  }
  const poses = GOLEM_ANIMATION_SHEETS.poses, transform = GOLEM_ANIMATION_SHEETS.transform;
  assert.deepEqual(poses.frameRects,golem.sheets.golemPoses.frameRects);
  assert.equal(poses.frameRects[6].w,280,'extended fist is wider than a grid cell');
  assert.equal(poses.frameRects[7].x,800,'next actor does not retain the neighboring fist');
  assert.deepEqual(transform.frameAnchors,golem.sheets.golemTransform.frameAnchors);
  assert.deepEqual(transform.frameScales,golem.sheets.golemTransform.frameScales);
  assert.ok(Object.isFrozen(poses.frameRects[6]));
  assert.ok(Object.isFrozen(transform.frameScales));
});
