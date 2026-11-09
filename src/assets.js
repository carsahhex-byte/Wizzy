/** Original uploaded artwork. Crop metadata only hides transparent export margins. */
import { resolveAssetUrl } from './asset-url.js';
import { SPELL_CATALOG } from './spells.js';
import { COMPACT_SPELL_TEXT, slabRulesMarkup } from './slab-text.js';
import { PIXEL_ICON_FILE, PIXEL_ICON_CROPS } from './pixel-icons.js';

export const ASSET_FILES = Object.freeze({
  titleScene: 'Wizzy Seattle Title.png',
  seattleMap: 'Wizzy Seattle Map.png',
  seattleExpanded: 'Wizzy Seattle Expanded Map.png',
  iconAtlas: 'Wizzy Interface Icons.png',
  appIcon: 'Wizzy App Icon.png',
  storybookIcon: 'Wizzy Storybook Icon.png',
  storybookPaper: 'Wizzy Storybook Pixel Paper.png',
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
  combatV2BasicAttack: 'Wizzy Combat V2 Basic Attack.png',
  combatV2SimpleCast: 'Wizzy Combat V2 Simple Cast.png',
  combatV2LargeCast: 'Wizzy Combat V2 Large Cast.png',
  combatV2Shield: 'Wizzy Combat V2 Shield.png',
  combatV2PowerUp: 'Wizzy Combat V2 Power Up.png',
  combatV2Enhancement: 'Wizzy Combat V2 Enhancement.png',
  combatV2Aura: 'Wizzy Combat V2 Aura.png',
  combatV2BasicProjectiles: 'Wizzy Combat V2 Basic Projectiles.png',
  combatV2LargeProjectiles: 'Wizzy Combat V2 Large Projectiles.png',
  combatV2HitReaction: 'Wizzy Combat V2 Hit Reaction.png',
  fireCard: 'Pixel-Art Fiery Comet Spell Card 2.png',
  waterCard: 'Pixel Art Cresting Wave Card.png',
  fateCard: 'Purple Galaxy Vortex Card Frame.png',
  neutralCard: 'Neutral card.png',
  stoneSign: 'Mossy Pixel Stone Sign.png',
  battlePixelIcons: PIXEL_ICON_FILE,
  battleSwordIcon: 'Wizzy Pixel Sword Icon.png',
  mapUIConcept: 'Wizzy Rough Map UI Concept.png',
  mapControls: 'Wizzy Rough Map Controls.png',
  mapTitle: 'Wizzy Map Title Banner.png',
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

/** Approved v2 combat sheets: eight 125ms particle frames linger for one second.
 * Anchors are normalized cell coordinates; displayScale maps source to battle px.
 * Enhancement retains lift/hover; landing frames finish at the measured feet.
 */
export const COMBAT_ANIMATION_SHEETS = Object.freeze({
  basicAttack: spellAnimationSheet({
    asset: 'combatV2BasicAttack', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    sourceBodyHeight: 178, targetBodyHeight: 144,
    displayScale: 144 / 178, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [109.5,200], [110.25,200], [110,200], [110.25,200],
    [109.5,200.25], [110.25,200.25], [110,200.25], [110.25,200.25],
    [109.5,200.5], [110.25,200.5], [109.5,200.5], [110.25,200.5],
    [110,200.75], [109.75,199.75], [111,200.75], [110.75,199.75],
    [112.5,201], [112.75,201], [113,201], [113.25,201],
    [113,201.25], [113.25,201.25], [113,201.25], [113.25,201.25],
    [113.5,201.5], [112.25,201.5], [113.5,201.5], [113.75,201.5],
    [113,201.75], [112.75,201.75], [113.5,201.75], [113.25,201.75],
  ]),
  simpleCast: spellAnimationSheet({
    asset: 'combatV2SimpleCast', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    sourceBodyHeight: 133, targetBodyHeight: 144,
    displayScale: 144 / 133, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [115.5,205], [117.75,205], [116,205], [115.75,205],
    [116,203.25], [115.75,203.25], [117,203.25], [117.25,203.25],
    [115.5,203.5], [115.75,203.5], [117,203.5], [115.75,203.5],
    [115.5,204.75], [115.75,204.75], [116,204.75], [116.25,204.75],
    [120,206], [120.75,206], [122.5,206], [121.75,206],
    [122,205.25], [121.75,205.25], [121.5,205.25], [121.75,205.25],
    [123,204.5], [121.75,204.5], [122,204.5], [122.25,204.5],
    [123,205.75], [122.25,205.75], [122,205.75], [122.25,205.75],
  ]),
  largeCast: spellAnimationSheet({
    asset: 'combatV2LargeCast', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    sourceBodyHeight: 129, targetBodyHeight: 144,
    displayScale: 144 / 129, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [111,219], [102.25,216], [98,217], [88.25,217],
    [95.5,215.25], [92.75,215.25], [90.5,215.25], [88.25,215.25],
    [96,215.5], [92.75,214.5], [91,215.5], [90.25,214.5],
    [95,213.75], [82.25,211.75], [81.5,211.75], [93.75,214.75],
    [112,208], [117.75,208], [105,208], [130.25,208],
    [138,206.25], [137.25,206.25], [136,206.25], [135.75,206.25],
    [138.5,205.5], [137.25,205.5], [137,205.5], [134.75,205.5],
    [143.5,205.75], [139.75,202.75], [118,205.75], [107.25,205.75],
  ]),
  shield: spellAnimationSheet({
    asset: 'combatV2Shield', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    sourceBodyHeight: 148, targetBodyHeight: 144,
    displayScale: 144 / 148, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [109,205], [109.75,204], [109.5,205], [108.75,205],
    [108,204.25], [108.75,204.25], [109.5,204.25], [109.25,204.25],
    [108,204.5], [108.75,204.5], [109,204.5], [109.25,204.5],
    [108,203.75], [108.75,203.75], [110.5,203.75], [110.75,203.75],
    [113.5,203], [111.75,203], [113,203], [113.25,203],
    [112.5,202.25], [111.75,202.25], [112.5,202.25], [112.75,202.25],
    [112,202.5], [111.25,202.5], [112,202.5], [112.75,202.5],
    [112.5,201.75], [111.75,202.75], [113.5,201.75], [113.25,201.75],
  ]),
  powerUp: spellAnimationSheet({
    asset: 'combatV2PowerUp', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    sourceBodyHeight: 158, targetBodyHeight: 144,
    displayScale: 144 / 158, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [113.5,210], [116.25,210], [116.5,210], [117.25,210],
    [116,211.25], [117.25,211.25], [116.5,211.25], [117.75,211.25],
    [116,210.5], [117.25,210.5], [116.5,210.5], [117.25,210.5],
    [116,208.75], [116.25,208.75], [116.5,208.75], [114.25,208.75],
    [110.5,209], [107.25,209], [110.5,209], [110.75,209],
    [111,208.25], [111.75,208.25], [111.5,208.25], [112.25,208.25],
    [110.5,208.5], [110.75,208.5], [110.5,208.5], [111.75,208.5],
    [110.5,208.75], [110.75,208.75], [111.5,208.75], [111.75,208.75],
  ]),
  enhancement: spellAnimationSheet({
    asset: 'combatV2Enhancement', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    sourceBodyHeight: 126, targetBodyHeight: 144,
    displayScale: 144 / 126, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [111.5,203], [111.25,203], [110.5,205], [110.75,203],
    [112,192.25], [113.25,192.25], [112.5,192.25], [112.25,192.25],
    [112,191.5], [112.75,191.5], [112,191.5], [111.75,191.5],
    [113,180.75], [110.75,185.75], [111.5,195.75], [113.25,195.75],
    [109.5,199], [110.75,198], [111.5,198], [112.25,200],
    [111.5,205.25], [112.25,205.25], [111.5,205.25], [111.25,205.25],
    [112.5,188.5], [113.75,188.5], [112,188.5], [111.75,188.5],
    [112,185.75], [111.75,191.75], [111.5,194.75], [110.75,194.75],
  ]),
  aura: spellAnimationSheet({
    asset: 'combatV2Aura', sourceWidth: 1254, sourceHeight: 1254, columns: 4, rows: 4,
    displayScale: 0.5, frameMs: 125, lingerMs: 1000,
    animations: { aura: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] },
  }, [
    [156.75,194], [156.75,194], [156.75,194], [156.75,194],
    [152.5,194.5], [157,197], [156.5,194], [156.5,194],
    [157,185], [157,185], [156.5,185], [156.5,185],
    [156.75,194], [156.75,194], [156.75,194], [156.75,194],
  ]),
  basicProjectiles: spellAnimationSheet({
    asset: 'combatV2BasicProjectiles', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    displayScale: 0.5, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [115,113.5], [120.25,113], [125,111.5], [131.25,112],
    [140,110.25], [142.25,110.25], [143,110.25], [143.75,109.75],
    [143.5,110], [142.25,110], [143.5,110], [143.75,110],
    [115.5,107.75], [115.75,105.25], [118,111.75], [112.75,110.25],
    [112.5,111.5], [107.25,110.5], [88.5,111], [81.25,110.5],
    [82,109.25], [80.25,108.75], [81,109.25], [80.25,109.75],
    [83,110], [80.75,110.5], [81,110], [81.75,110],
    [112.5,106.75], [114.75,103.25], [115,112.25], [113.25,112.25],
  ]),
  largeProjectiles: spellAnimationSheet({
    asset: 'combatV2LargeProjectiles', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    displayScale: 1.2, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [134.5,152], [136.75,156.5], [130,155.5], [131.25,156.5],
    [149.5,147.75], [148.75,148.75], [139,150.25], [136.25,147.75],
    [153,140], [151.25,142.5], [140.5,143], [139.75,141.5],
    [138.5,114.25], [117.75,115.75], [106.5,116.25], [106.75,104.25],
    [81.4,138.95], [71.25,136.95], [59.3,137.35], [53.95,132.15],
    [60.2,131.3], [59.45,131.3], [52.7,131.3], [51.15,131.3],
    [62,128.55], [59.65,128.9], [52.9,129.2], [52.75,128.55],
    [63.4,128.15], [112.25,108.25], [95.5,103.75], [104.75,106.75],
  ]),
  hitReaction: spellAnimationSheet({
    asset: 'combatV2HitReaction', sourceWidth: 887, sourceHeight: 1774, columns: 4, rows: 8,
    sourceBodyHeight: 169, targetBodyHeight: 144,
    displayScale: 144 / 169, frameMs: 125, lingerMs: 1000,
    animations: { fire: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], water: [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
  }, [
    [113,200], [112.25,200], [113.5,200], [113.75,200],
    [112.5,199.25], [112.75,199.25], [112,199.25], [113.75,199.25],
    [112.5,199.5], [112.75,199.5], [113.5,199.5], [113.25,199.5],
    [113,200.75], [113.25,200.75], [113.5,200.75], [114.75,200.75],
    [111.5,200], [110.25,200], [104.5,200], [108.75,200],
    [110,199.25], [109.25,199.25], [110.5,199.25], [111.25,198.25],
    [111.5,200.5], [110.25,200.5], [110.5,200.5], [111.25,200.5],
    [111,199.75], [110.75,199.75], [110.5,199.75], [111.25,199.75],
  ]),
});

// Resolve from the document so both a domain root and a project subpath work.
// Standalone builds provide these same originals once per asset.
export const ASSETS = Object.freeze(Object.fromEntries(
  Object.entries(ASSET_FILES).map(([key, filename]) => [key,resolveAssetUrl(key,filename)]),
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

/** Original Nov4 slabs plus resource spells with live titles and rules. */
export const SPELL_SLABS = Object.freeze(Object.fromEntries([
  ['Fire-0', slab('fireZeroSlab',1103,1426,[4,5,1095,1415],'Fire-0')],
  ['Fire-15', slab('fireZeroSlab',1103,1426,[4,5,1095,1415],'Fire-15')],
  ...fireSlabCrops.map((crop,index) => [`Fire-${index+1}`, slab('fireSlabSheet',2037,772,crop,`Fire-${index+1}`)]),
  ['Water-0', slab('waterSlabSheet',2037,772,waterSlabCrops[9],'Water-0')],
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
  // The standalone resource slab is larger than the original sheet tiles.
  const scale = crop.asset === 'fireZeroSlab' ? crop.w / 282 : 1;
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
  combatV2BasicAttack: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2SimpleCast: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2LargeCast: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2Shield: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2PowerUp: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2Enhancement: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2Aura: { width: 1254, height: 1254, x: 0, y: 0, w: 1254, h: 1254 },
  combatV2BasicProjectiles: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2LargeProjectiles: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  combatV2HitReaction: { width: 887, height: 1774, x: 0, y: 0, w: 887, h: 1774 },
  fireCard: { width: 1086, height: 1448, x: 69, y: 72, w: 947, h: 1250 },
  // Faint alpha extends to this export's canvas; align to the visible card border.
  waterCard: { width: 1086, height: 1448, x: 69, y: 72, w: 948, h: 1250 },
  fateCard: { width: 1086, height: 1448, x: 68, y: 69, w: 952, h: 1253 },
  neutralCard: { width: 1086, height: 1448, x: 68, y: 70, w: 952, h: 1252 },
  stoneSign: { width: 1199, height: 1312, x: 61, y: 88, w: 1073, h: 1032 },
  battlePixelIcons: { width: 1536, height: 1024, x: 0, y: 0, w: 1536, h: 1024 },
  // Square viewports keep inline resource symbols proportional in a 1em box.
  iconFire: PIXEL_ICON_CROPS.fire,
  iconWater: PIXEL_ICON_CROPS.water,
  iconHeart: PIXEL_ICON_CROPS.heart,
  iconMana: PIXEL_ICON_CROPS.mana,
  iconShield: PIXEL_ICON_CROPS.shield,
  iconDie: PIXEL_ICON_CROPS.die,
  mapUIConcept: { width: 948, height: 1659, x: 0, y: 0, w: 948, h: 1659 },
  mapControls: { width: 1536, height: 1024, x: 0, y: 0, w: 1536, h: 1024 },
  mapTitle: { width: 2126, height: 740, x: 28, y: 135, w: 2070, h: 481 },
});

/** Original approved UI pixels. Keep the live Seattle map as a separate image. */
export const MAP_UI_CROPS = Object.freeze({
  mapStorybook: { asset: 'mapControls', width: 1536, height: 1024, x: 93, y: 27, w: 645, h: 187 },
  mapCharacter: { asset: 'mapControls', width: 1536, height: 1024, x: 799, y: 27, w: 644, h: 187 },
  mapBattle: { asset: 'mapControls', width: 1536, height: 1024, x: 93, y: 232, w: 644, h: 183 },
  mapFriends: { asset: 'mapControls', width: 1536, height: 1024, x: 799, y: 232, w: 644, h: 183 },
  mapDeck: { asset: 'mapControls', width: 1536, height: 1024, x: 94, y: 433, w: 644, h: 180 },
  mapFit: { asset: 'mapControls', width: 1536, height: 1024, x: 799, y: 433, w: 644, h: 180 },
  mapZoomOut: { asset: 'mapControls', width: 1536, height: 1024, x: 94, y: 633, w: 643, h: 171 },
  mapZoomIn: { asset: 'mapControls', width: 1536, height: 1024, x: 799, y: 633, w: 644, h: 170 },
  mapBack: { asset: 'mapControls', width: 1536, height: 1024, x: 94, y: 822, w: 643, h: 177 },
  mapCompass: { asset: 'mapControls', width: 1536, height: 1024, x: 799, y: 822, w: 644, h: 177 },
  mapBanner: { asset: 'mapTitle', width: 2126, height: 740, x: 28, y: 135, w: 2070, h: 481 },
  mapTopBack: { asset: 'mapUIConcept', width: 948, height: 1659, x: 18, y: 16, w: 104, h: 110 },
  mapToolbarFit: { asset: 'mapUIConcept', width: 948, height: 1659, x: 214, y: 151, w: 145, h: 94 },
  mapToolbarZoomOut: { asset: 'mapUIConcept', width: 948, height: 1659, x: 374, y: 157, w: 105, h: 90 },
  mapToolbarZoomIn: { asset: 'mapUIConcept', width: 948, height: 1659, x: 491, y: 157, w: 104, h: 90 },
  mapToolbarCompass: { asset: 'mapUIConcept', width: 948, height: 1659, x: 604, y: 153, w: 126, h: 96 },
  mapStoneTexture: { asset: 'mapUIConcept', width: 948, height: 1659, x: 480, y: 1240, w: 36, h: 36 },
  mapFrameTop: { asset: 'mapUIConcept', width: 948, height: 1659, x: 80, y: 252, w: 788, h: 27 },
  mapFrameBottom: { asset: 'mapUIConcept', width: 948, height: 1659, x: 80, y: 1168, w: 788, h: 26 },
  mapFrameLeft: { asset: 'mapUIConcept', width: 948, height: 1659, x: 7, y: 318, w: 27, h: 810 },
  mapFrameRight: { asset: 'mapUIConcept', width: 948, height: 1659, x: 917, y: 318, w: 27, h: 810 },
  // The L-shaped masks remove every baked-map pixel inside the four corners.
  mapFrameNW: { asset: 'mapUIConcept', width: 948, height: 1659, x: 7, y: 245, w: 72, h: 72, clipPath: 'polygon(0 0,100% 0,100% 47.2222%,37.5% 47.2222%,37.5% 100%,0 100%)' },
  mapFrameNE: { asset: 'mapUIConcept', width: 948, height: 1659, x: 869, y: 245, w: 72, h: 72, clipPath: 'polygon(0 0,100% 0,100% 100%,66.6667% 100%,66.6667% 47.2222%,0 47.2222%)' },
  mapFrameSW: { asset: 'mapUIConcept', width: 948, height: 1659, x: 7, y: 1129, w: 72, h: 72, clipPath: 'polygon(0 0,37.5% 0,37.5% 54.1667%,100% 54.1667%,100% 100%,0 100%)' },
  mapFrameSE: { asset: 'mapUIConcept', width: 948, height: 1659, x: 869, y: 1129, w: 72, h: 72, clipPath: 'polygon(66.6667% 0,100% 0,100% 100%,0 100%,0 54.1667%,66.6667% 54.1667%)' },
});
