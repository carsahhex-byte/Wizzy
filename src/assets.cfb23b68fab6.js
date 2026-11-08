/** Original uploaded artwork. Crop metadata only hides transparent export margins. */
import { OPTIMIZED_ART } from './optimized-art.df806bc36ad2.js';
import { SPELL_CATALOG } from './spells.29cc03f8c6f5.js';
import { COMPACT_SPELL_TEXT, slabRulesMarkup } from './slab-text.a18511f20227.js';

export const ASSET_FILES = Object.freeze({
  titleScene: 'Wizzy Seattle Title.png',
  seattleMap: 'Wizzy Seattle Map.png',
  seattleExpanded: 'Wizzy Seattle Expanded Map.png',
  iconAtlas: 'Wizzy Interface Icons.png',
  appIcon: 'Wizzy App Icon.png',
  storybookIcon: 'Wizzy Storybook Icon.png',
  fireSlabSheet: 'Pixel-Art Fire Card Collection.png',
  fireZeroSlab: 'Wizzy Fire-0 Slab.png',
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
  enhanceButtons: 'Wizzy Enhancement Buttons.png',
  auraButton: 'Wizzy Aura Button.png',
  endTurn: 'End Turn Button.png',
  refresh: 'Hand Refresh Button.png',
  combatLog: 'View Combat Log Button.png',
  fireMage: 'Fire Wizzy Pixel Mage.png',
  waterMage: 'Water Wizzy Pixel Mage.png',
  wizardWalkAtlas: 'Wizzy Wizard Walk Atlas.png',
  wizardSimpleCast: 'Wizzy Simple Cast Sprite Sheet.png',
  wizardLargeCast: 'Wizzy Exaggerated Cast Sprite Sheet.png',
  wizardBasicAttack: 'Wizzy Basic Attack Sprite Sheet.png',
  wizardElementalShield: 'Wizzy Basic Elemental Shield Sprite Sheet.png',
  wizardFirePowerUp: 'Wizzy Basic Fire Power Up Sprite Sheet.png',
  wizardLargeProjectiles: 'Wizzy Large Projectile Effects.png',
  fireCard: 'Pixel-Art Fiery Comet Spell Card 2.png',
  waterCard: 'Pixel Art Cresting Wave Card.png',
  fateCard: 'Purple Galaxy Vortex Card Frame.png',
  neutralCard: 'Neutral card.png',
  stoneSign: 'Mossy Pixel Stone Sign.png',
});

/** Original overworld wizards: fixed logical cells, source PNG left intact. */
export const WIZARD_SPRITES = Object.freeze({
  asset: 'wizardWalkAtlas',
  sourceWidth: 887,
  sourceHeight: 1774,
  columns: 4,
  rows: 8,
  cellWidth: 64,
  cellHeight: 64,
  anchor: Object.freeze({ x: 32, y: 60 }),
  idleFrame: 0,
  walkFrames: Object.freeze([0, 1, 2, 3]),
  directions: Object.freeze({
    fire: Object.freeze({ down: 0, left: 1, right: 2, up: 3 }),
    water: Object.freeze({ down: 4, left: 5, right: 6, up: 7 }),
  }),
});

// Frame anchors use normalized cell coordinates. displayScale converts source
// pixels to battle coordinates, keeping each standing body about 144px high.
// Feet are measured separately in every frame so source-sheet drift stays out
// of the arena. Isolated effects use their core/visible center instead.
function spellAnimationSheet(metadata, anchorPixels) {
  const cellWidth = metadata.sourceWidth / metadata.columns;
  const cellHeight = metadata.sourceHeight / metadata.rows;
  return Object.freeze({
    ...metadata,
    animations: Object.freeze(Object.fromEntries(Object.entries(metadata.animations)
      .map(([name, frames]) => [name, Object.freeze(frames)]))),
    frameAnchors: Object.freeze(anchorPixels.map(([x, y]) => Object.freeze({
      x: x / cellWidth, y: y / cellHeight,
    }))),
  });
}

export const SPELL_ANIMATION_SHEETS = Object.freeze({
  simpleCast: spellAnimationSheet({
    asset: 'wizardSimpleCast', sourceWidth: 2172, sourceHeight: 724, columns: 8, rows: 2,
    sourceBodyHeight: 119, targetBodyHeight: 144, displayScale: 144 / 119,
    animations: { fire: [0,1,2,3,4,5,6,7], water: [8,9,10,11,12,13,14,15] },
  }, [
    [150.5,251], [145.5,251], [145,251], [137.5,251],
    [131.5,251], [129,251], [128,251], [124,251],
    [143.5,249], [143,249], [137,249], [138,249],
    [141.5,249], [133.5,249], [128.5,249], [123.5,249],
  ]),
  largeCast: spellAnimationSheet({
    asset: 'wizardLargeCast', sourceWidth: 1254, sourceHeight: 1254, columns: 4, rows: 4,
    sourceBodyHeight: 161, targetBodyHeight: 144, displayScale: 144 / 161,
    animations: { fire: [0,1,2,3,4,5,6,7], water: [8,9,10,11,12,13,14,15] },
  }, [
    [125,254], [118.5,254], [131.5,254], [124,254],
    [111.5,254.5], [97.5,254.5], [106,254.5], [125.5,254.5],
    [184.5,254], [186.5,254], [172.5,254], [180.5,254],
    [203.5,254.5], [220.5,254.5], [215.5,254.5], [192.5,254.5],
  ]),
  basicAttack: spellAnimationSheet({
    asset: 'wizardBasicAttack', sourceWidth: 1254, sourceHeight: 1254, columns: 4, rows: 4,
    sourceBodyHeight: 199, targetBodyHeight: 144, displayScale: 144 / 199,
    animations: {
      fire: [0,1,2,3], projectile: [4,5,6,7], waterHit: [8,9,10,11], impact: [12,13,14,15],
    },
  }, [
    [156,271], [145,271], [142,271], [144,271],
    [182,164.5], [185.5,164.5], [182,164.5], [180,163.5],
    [169,266], [168.5,266], [149.5,266], [151.5,266],
    [158,157], [158.5,155.5], [143,158.5], [153.5,159.5],
  ]),
  elementalShield: spellAnimationSheet({
    asset: 'wizardElementalShield', sourceWidth: 1254, sourceHeight: 1254, columns: 4, rows: 4,
    sourceBodyHeight: 139, targetBodyHeight: 144, displayScale: 144 / 139,
    animations: { fire: [0,1,2,3,4,5,6,7], water: [8,9,10,11,12,13,14,15] },
  }, [
    [160.5,259], [160.5,259], [146,259], [146.5,256],
    [147,256.5], [151,259.5], [154,259.5], [160.5,259.5],
    [155.5,259], [155,259], [155.5,259], [155,258],
    [156,258.5], [154.5,259.5], [155,259.5], [155,259.5],
  ]),
  firePowerUp: spellAnimationSheet({
    asset: 'wizardFirePowerUp', sourceWidth: 1774, sourceHeight: 887, columns: 4, rows: 2,
    sourceBodyHeight: 279, targetBodyHeight: 144, displayScale: 144 / 279,
    animations: { fire: [0,1,2,3,4,5,6,7] },
  }, [
    [225.5,369], [229,369], [228.5,369], [228.5,369],
    [228.5,369.5], [229,369.5], [228.5,369.5], [225,369.5],
  ]),
  largeProjectiles: spellAnimationSheet({
    asset: 'wizardLargeProjectiles', sourceWidth: 1774, sourceHeight: 887, columns: 4, rows: 2,
    displayScale: 0.6,
    animations: { fire: [0,1,2,3], water: [4,5,6,7] },
  }, [
    // Fire's bright core and Water's leading curl land on the hit point.
    [316,298.5], [320,294.5], [318,291], [327,295.5],
    [79.83,266.1], [79.83,266.1], [79.83,266.1], [79.83,266.1],
  ]),
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

/** Original Nov4 spell slabs plus the matching basic Fire-0 slab. */
export const SPELL_SLABS = Object.freeze(Object.fromEntries([
  ['Fire-0', slab('fireZeroSlab',1103,1426,[4,5,1095,1415],'Fire-0')],
  ...fireSlabCrops.map((crop,index) => [`Fire-${index+1}`, slab('fireSlabSheet',2037,772,crop,`Fire-${index+1}`)]),
  ...waterSlabCrops.map((crop,index) => [`Water-${index+1}`, slab('waterSlabSheet',2037,772,crop,`Water-${index+1}`)]),
  ['FAT-001', slab('fateSlabSheet',2172,724,[153,17,517,687],'Fortune')],
  ['FAT-002', slab('fateSlabSheet',2172,724,[827,17,518,687],'Misfortune')],
  ['FAT-003', slab('fateSlabSheet',2172,724,[1502,17,517,687],'Twist')],
]));

const cropImage = crop => `<img alt="" draggable="false" src="${ASSETS[crop.asset]}" style="position:absolute;display:block;max-width:none;width:${crop.width/crop.w*100}%;height:${crop.height/crop.h*100}%;left:${-crop.x/crop.w*100}%;top:${-crop.y/crop.h*100}%;image-rendering:pixelated;pointer-events:none;user-select:none" />`;

/** Original frame and illustration with readable live rules at the existing size. */
export function spellSlabMarkup(spellId, className = '') {
  const crop = SPELL_SLABS[spellId];
  if (!crop) return '';
  const definition = SPELL_CATALOG[spellId];
  const lines = COMPACT_SPELL_TEXT[spellId] || [];
  const length = lines.reduce((total,line)=>total+line.text.length+(line.threshold?line.threshold.length+1:0),0);
  const density = length>60?'long':length<35&&lines.length<3?'short':'normal';
  return `<span aria-hidden="true" class="spell-slab-art ${className}" data-spell-slab="${spellId}" data-slab-label="${crop.label}" data-copy-density="${density}" data-copy-type="${definition.type}" style="position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;background:#030308">${cropImage(crop)}<span class="slab-live-paper"><strong class="slab-live-title">${definition.name}</strong><span class="slab-live-rules" data-slab-rules="${spellId}">${slabRulesMarkup(spellId)}</span></span></span>`;
}

/** Art-only viewports are available where a smaller illustration is needed. */
export const SPELL_ART = Object.freeze(Object.fromEntries(Object.entries(SPELL_SLABS).map(([id,crop]) => {
  const fate = id.startsWith('FAT-');
  // The standalone Fire-0 is larger than the original sheet tiles.
  const scale = id === 'Fire-0' ? crop.w / 282 : 1;
  return [id,Object.freeze({ ...crop,
    x: crop.x + (fate ? 36 : 13 * scale), y: crop.y + (fate ? 40 : 17 * scale),
    w: crop.w - (fate ? 72 : 26 * scale), h: fate ? 333 : 162 * scale,
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
  // Exclude the atlas gap and near-invisible transparent export residue.
  enhanceFire: { width: 1254, height: 1254, x: 56, y: 177, w: 1142, h: 407 },
  enhanceWater: { width: 1254, height: 1254, x: 56, y: 735, w: 1143, h: 406 },
  auraButton: { width: 2098, height: 749, x: 43, y: 21, w: 2014, h: 715 },
  endTurn: { width: 2172, height: 724, x: 81, y: 51, w: 2008, h: 624 },
  refresh: { width: 2172, height: 724, x: 80, y: 51, w: 2009, h: 624 },
  combatLog: { width: 2172, height: 724, x: 83, y: 151, w: 2006, h: 414 },
  // Ignore near-invisible export residue so the wizard's feet align with Water.
  fireMage: { width: 1218, height: 1292, x: 15, y: 117, w: 1166, h: 954 },
  waterMage: { width: 1218, height: 1292, x: 32, y: 114, w: 1141, h: 976 },
  wizardWalkAtlas: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  wizardSimpleCast: { width: 2172, height: 724, x: 0, y: 0, w: 2172, h: 724 },
  wizardLargeCast: { width: 1254, height: 1254, x: 0, y: 0, w: 1254, h: 1254 },
  wizardBasicAttack: { width: 1254, height: 1254, x: 0, y: 0, w: 1254, h: 1254 },
  wizardElementalShield: { width: 1254, height: 1254, x: 0, y: 0, w: 1254, h: 1254 },
  wizardFirePowerUp: { width: 1774, height: 887, x: 0, y: 0, w: 1774, h: 887 },
  wizardLargeProjectiles: { width: 1774, height: 887, x: 0, y: 0, w: 1774, h: 887 },
  fireCard: { width: 1086, height: 1448, x: 69, y: 72, w: 947, h: 1250 },
  // Faint alpha extends to this export's canvas; align to the visible card border.
  waterCard: { width: 1086, height: 1448, x: 69, y: 72, w: 948, h: 1250 },
  fateCard: { width: 1086, height: 1448, x: 68, y: 69, w: 952, h: 1253 },
  neutralCard: { width: 1086, height: 1448, x: 68, y: 70, w: 952, h: 1252 },
  stoneSign: { width: 1199, height: 1312, x: 61, y: 88, w: 1073, h: 1032 },
});
