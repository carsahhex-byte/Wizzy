/** Original uploaded artwork. Crop metadata only hides transparent export margins. */
import { OPTIMIZED_ART } from './optimized-art.js';

export const ASSET_FILES = Object.freeze({
  titleScene: 'Wizzy Seattle Title.png',
  seattleMap: 'Wizzy Seattle Map.png',
  seattleExpanded: 'Wizzy Seattle Expanded Map.png',
  iconAtlas: 'Wizzy Interface Icons.png',
  appIcon: 'Wizzy App Icon.png',
  storybookIcon: 'Wizzy Storybook Icon.png',
  fireSlabSheet: 'Pixel-Art Fire Card Collection.png',
  waterSlabSheet: 'Pixel-Art Water Card Collection.png',
  fateSlabSheet: 'Pixel Art Fate Cards_ Fortune, Misfortune, Twist.png',
  forest: 'Forest Background.png',
  fireFrame: 'Fire Stat Frame.png',
  waterFrame: 'Water Frame.png',
  diceFrame: 'Dice Frame.png',
  dicePair: 'Pixel Art Dice Pair 2.png',
  handFrame: 'Your Hand Frame.png',
  round: 'Your Turn.png',
  cast: 'Cast Spell Button.png',
  skipFate: 'Skip Fate.png',
  castFate: 'Cast Fate Button.png',
  endTurn: 'End Turn Button.png',
  refresh: 'Hand Refresh Button.png',
  combatLog: 'View Combat Log Button.png',
  fireMage: 'Fire Wizzy Pixel Mage.png',
  waterMage: 'Water Wizzy Pixel Mage.png',
  fireCard: 'Pixel-Art Fiery Comet Spell Card 2.png',
  waterCard: 'Pixel Art Cresting Wave Card.png',
  fateCard: 'Purple Galaxy Vortex Card Frame.png',
  neutralCard: 'Neutral card.png',
  stoneSign: 'Mossy Pixel Stone Sign.png',
});

// Keep embedded images out of CSS custom-property size limits in standalone
// editions. Object URLs retain the original bytes and are shared by every view.
function embeddedAssetUrl(value) {
  if (typeof document === 'undefined' || !value?.startsWith('data:image/')
    || typeof URL.createObjectURL !== 'function') return value;
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value);
  if (!match) return value;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: match[1] }));
}

// Resolve from the document so both a domain root and a project subpath work.
// Standalone builds provide these same originals once per asset.
export const ASSETS = Object.freeze(Object.fromEntries(
  Object.entries(ASSET_FILES).map(([key, filename]) => {
    const assetPath = OPTIMIZED_ART[key]
      ? `./public/optimized/${OPTIMIZED_ART[key].file}`
      : `./public/graphics/${encodeURIComponent(filename)}`;
    return [key, embeddedAssetUrl(globalThis.WIZZY_ASSET_URLS?.[key]) || (
      typeof document === 'undefined'
        ? assetPath
        : new URL(assetPath, document.baseURI).href
    )];
  }),
));

// Source cards are not evenly spaced: Water's columns have different widths,
// and Fate has large export gutters. Explicit viewports retain every frame and
// printed label while excluding neighboring slabs. No source bitmap is edited.
const fireSlabCrops = [
  [13,11,282,364], [302,11,281,364], [591,11,280,364],
  [879,11,280,364], [1167,11,280,364], [1455,11,280,364], [1743,11,281,364],
  [13,389,282,368], [302,389,281,368], [591,389,280,368],
  [879,389,280,368], [1167,389,280,369], [1455,389,280,368], [1743,389,282,368],
];
const waterSlabCrops = [
  [23,13,296,356], [334,13,284,356], [632,13,282,356],
  [929,13,270,356], [1213,13,267,356], [1494,13,256,356], [1763,13,256,356],
  [23,383,296,366], [334,383,284,366], [632,383,282,365],
  [929,383,271,365], [1214,383,267,365], [1494,383,256,365], [1764,383,255,365],
];
const slab = (asset, width, height, crop, label) => Object.freeze({
  asset, width, height, x: crop[0], y: crop[1], w: crop[2], h: crop[3], label,
});

/** Exact artwork-to-spell mapping for all 31 Nov4 spells. */
export const SPELL_SLABS = Object.freeze(Object.fromEntries([
  ...fireSlabCrops.map((crop,index) => [`Fire-${index+1}`, slab('fireSlabSheet',2037,772,crop,`Fire-${index+1}`)]),
  ...waterSlabCrops.map((crop,index) => [`Water-${index+1}`, slab('waterSlabSheet',2037,772,crop,`Water-${index+1}`)]),
  ['FAT-001', slab('fateSlabSheet',2172,724,[153,17,517,687],'Fortune')],
  ['FAT-002', slab('fateSlabSheet',2172,724,[827,17,518,687],'Misfortune')],
  ['FAT-003', slab('fateSlabSheet',2172,724,[1502,17,517,687],'Twist')],
]));

const cropImage = crop => `<img alt="" draggable="false" src="${ASSETS[crop.asset]}" style="position:absolute;display:block;max-width:none;width:${crop.width/crop.w*100}%;height:${crop.height/crop.h*100}%;left:${-crop.x/crop.w*100}%;top:${-crop.y/crop.h*100}%;image-rendering:pixelated;pointer-events:none;user-select:none" />`;

/** Complete supplied slab, normalized to its existing parent card's dimensions. */
export function spellSlabMarkup(spellId, className = '') {
  const crop = SPELL_SLABS[spellId];
  if (!crop) return '';
  return `<span aria-hidden="true" class="spell-slab-art ${className}" data-spell-slab="${spellId}" data-slab-label="${crop.label}" style="position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;background:#030308">${cropImage(crop)}</span>`;
}

/** Art-only viewports are available where a smaller illustration is needed. */
export const SPELL_ART = Object.freeze(Object.fromEntries(Object.entries(SPELL_SLABS).map(([id,crop]) => {
  const fate = id.startsWith('FAT-');
  return [id,Object.freeze({ ...crop,
    x: crop.x + (fate ? 36 : 13), y: crop.y + (fate ? 40 : 17),
    w: crop.w - (fate ? 72 : 26), h: fate ? 333 : 162,
  })];
})));

export function spellArtMarkup(spellId, className = '') {
  const crop = SPELL_ART[spellId];
  if (!crop) return '';
  return `<span aria-hidden="true" class="spell-illustration ${className}" data-spell-art="${spellId}" style="position:absolute;left:9%;top:15%;width:82%;height:44%;background:#101626;overflow:hidden;pointer-events:none;border-radius:2px">${cropImage(crop)}</span>`;
}

export const ASSET_CROPS = Object.freeze({
  forest: { width: 1024, height: 1536, x: 0, y: 0, w: 1024, h: 1536 },
  fireFrame: { width: 1292, height: 1218, x: 90, y: 37, w: 1112, h: 1067 },
  waterFrame: { width: 1254, height: 1254, x: 28, y: 46, w: 1196, h: 1130 },
  diceFrame: { width: 1536, height: 1024, x: 93, y: 99, w: 1348, h: 762 },
  dicePair: { width: 1774, height: 887, x: 313, y: 191, w: 1148, h: 535 },
  // Individual face viewports share the dicePair bitmap.
  diceLeft: { width: 1774, height: 887, x: 313, y: 191, w: 536, h: 535 },
  diceRight: { width: 1774, height: 887, x: 924, y: 191, w: 537, h: 535 },
  handFrame: { width: 1217, height: 1293, x: 13, y: 121, w: 1191, h: 980 },
  round: { width: 1774, height: 887, x: 48, y: 110, w: 1678, h: 666 },
  cast: { width: 2172, height: 724, x: 83, y: 51, w: 2004, h: 632 },
  skipFate: { width: 2172, height: 724, x: 81, y: 49, w: 2008, h: 633 },
  castFate: { width: 2172, height: 724, x: 82, y: 49, w: 2008, h: 629 },
  endTurn: { width: 2172, height: 724, x: 81, y: 51, w: 2008, h: 624 },
  refresh: { width: 2172, height: 724, x: 80, y: 51, w: 2009, h: 624 },
  combatLog: { width: 2172, height: 724, x: 83, y: 151, w: 2006, h: 414 },
  // Ignore near-invisible export residue so the wizard's feet align with Water.
  fireMage: { width: 1218, height: 1292, x: 15, y: 117, w: 1166, h: 954 },
  waterMage: { width: 1218, height: 1292, x: 32, y: 114, w: 1141, h: 976 },
  fireCard: { width: 1086, height: 1448, x: 69, y: 72, w: 947, h: 1250 },
  // Faint alpha extends to this export's canvas; align to the visible card border.
  waterCard: { width: 1086, height: 1448, x: 69, y: 72, w: 948, h: 1250 },
  fateCard: { width: 1086, height: 1448, x: 68, y: 69, w: 952, h: 1253 },
  neutralCard: { width: 1086, height: 1448, x: 68, y: 70, w: 952, h: 1252 },
  stoneSign: { width: 1199, height: 1312, x: 61, y: 88, w: 1073, h: 1032 },
});
