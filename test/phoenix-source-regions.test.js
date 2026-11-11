import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {ASSET_FILES, CREATURE_ANIMATION_SHEETS} from '../src/assets.js';

const sourceFile = new URL('../designs/sprite-library-extras/fire/phoenix-clean-effects.png', import.meta.url);
const expectedCleanSha = '484165abca6b69afca6336e4b993905238990b54b290f70e2985e489729d0eca';
const expectedCasterSha = 'd881fc9cf0aacc7dcde438d603f4c13d7bdeada72b3226319554bf65ca639e70';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assetFile = asset => {
  assert.ok(ASSET_FILES[asset], `registered source PNG for ${asset}`);
  return new URL(`../public/graphics/${encodeURIComponent(ASSET_FILES[asset])}`, import.meta.url);
};

// Decode the actual RGBA PNG source without an optional image-library dependency.
// This prevents a metadata-only test from overlooking opaque actor pixels in FX.
function decodeRgbaPng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.deepEqual([...bytes.subarray(24, 29)], [8, 6, 0, 0, 0], '8-bit, noninterlaced RGBA source');
  const parts = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const data = inflateSync(Buffer.concat(parts)), stride = width * 4;
  assert.equal(data.length, height * (stride + 1));
  const pixels = Buffer.alloc(width * height * 4);
  function paeth(left, up, upperLeft) {
    const prediction = left + up - upperLeft;
    const a = Math.abs(prediction - left), b = Math.abs(prediction - up), c = Math.abs(prediction - upperLeft);
    return a <= b && a <= c ? left : b <= c ? up : upperLeft;
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * stride, raw = y * (stride + 1), filter = data[raw];
    assert.ok(filter <= 4, 'known PNG row filter');
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[row + x - 4] : 0;
      const up = y > 0 ? pixels[row + x - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[row + x - stride - 4] : 0;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      pixels[row + x] = (data[raw + 1 + x] + prediction) & 255;
    }
  }
  return {width, height, pixels, alpha: (x, y) => pixels[(y * width + x) * 4 + 3]};
}

test('the clean phoenix effects PNG is installed unchanged while its deep-red caster stays intact', async () => {
  const sheets = CREATURE_ANIMATION_SHEETS.xineoph;
  assert.equal(sheets.actor.asset, 'phoenixFireAnimation');
  assert.equal(sheets.charge.asset, sheets.actor.asset);
  assert.equal(sheets.projectile.asset, 'phoenixCleanEffects');
  assert.equal(sheets.impact.asset, sheets.projectile.asset);
  const [installed, approved, caster] = await Promise.all([
    readFile(assetFile(sheets.projectile.asset)), readFile(sourceFile), readFile(assetFile(sheets.actor.asset)),
  ]);
  assert.equal(hash(approved), expectedCleanSha, 'approved effects source has not been repainted');
  assert.deepEqual(installed, approved, 'production copies the approved PNG byte for byte');
  assert.equal(hash(caster), expectedCasterSha, 'the existing deep-red actor/charge sheet is unchanged');
});

test('every selected phoenix flight crop contains the bird but no opaque caster in the old hat footprint', async () => {
  const sheet = CREATURE_ANIMATION_SHEETS.xineoph.projectile;
  const image = decodeRgbaPng(await readFile(assetFile(sheet.asset)));
  assert.deepEqual([image.width, image.height], [sheet.sourceWidth, sheet.sourceHeight]);
  assert.deepEqual(sheet.animations.fire, [15, 16, 17, 18, 19]);
  for (const frame of sheet.animations.fire) {
    const rect = sheet.frameRects[frame];
    const cellX = frame % sheet.columns * image.width / sheet.columns;
    const cellY = Math.floor(frame / sheet.columns) * image.height / sheet.rows;
    let visibleBird = 0;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) visibleBird += Number(image.alpha(x, y) >= 128);
    }
    assert.ok(visibleBird > 2000, `frame ${frame}: the complete creature effect remains visible`);
    // The faulty frame 15 drew 1,141 visible hat pixels in this lower-left
    // source patch. Every approved flight texture has alpha <= 6 here.
    assert.ok(rect.x <= cellX + 34 && rect.x + rect.w >= cellX + 80
      && rect.y <= cellY + 150 && rect.y + rect.h >= cellY + 176,
    `frame ${frame}: the test patch is inside the actual flight crop`);
    let opaqueCasterPixels = 0;
    for (let y = cellY + 150; y < cellY + 176; y += 1) {
      for (let x = cellX + 34; x < cellX + 80; x += 1) opaqueCasterPixels += Number(image.alpha(x, y) >= 128);
    }
    assert.equal(opaqueCasterPixels, 0, `frame ${frame}: no hat/caster pixels may travel with the projectile`);
  }
});
