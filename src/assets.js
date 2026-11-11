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
  charredBladeSword: 'Wizzy Charred Blade Sword.png',
  xineophCardArt: 'Wizzy Xineoph Phoenix Card.png',
  xineophAnimation: 'Wizzy Xineoph Phoenix Animation.png',
  xineophCharge: 'Wizzy Xineoph Charge Pulse.png',
  phoenixFireAnimation: 'Wizzy Phoenix Fire Animation.png',
  phoenixCleanEffects: 'Wizzy Phoenix Clean Effects.png',
  wizardIdleClean: 'Wizzy Idle Fire Water Clean.png',
  earthIdleClean: 'Wizzy Idle Earth Clean.png',
  pacificDolphinAnimation: 'Wizzy Pacific Dolphin Animation.png',
  earthWalk: "Wizzy Earth Walk.png",
  earthIdle: "Wizzy Earth Idle.png",
  earthBasicAttack: "Wizzy Earth Basic Attack.png",
  earthSimpleCast: "Wizzy Earth Simple Cast.png",
  earthLargeCast: "Wizzy Earth Large Cast.png",
  earthShield: "Wizzy Earth Shield.png",
  earthPowerUp: "Wizzy Earth Power Up.png",
  earthEnhancement: "Wizzy Earth Enhancement.png",
  earthBasicProjectiles: "Wizzy Earth Basic Projectiles.png",
  earthLargeProjectiles: "Wizzy Earth Large Projectiles.png",
  earthAura: "Wizzy Earth Aura.png",
  golemPoses: "Wizzy Golem Poses.png",
  golemTransform: "Wizzy Golem Transform.png",
  earthIcons: "Wizzy Earth Air Icons.png",
  earthFrame: 'Earth Stat Frame.png',
  airFrame: 'Wizzy Air Stat Frame Simple.png',
  battlePileProps: 'Wizzy Spell Tower Discard Props.png',
  roughNavButtons: 'Wizzy Rough Navigation Buttons.png',
  roughDeckScreen: 'Wizzy Rough Deck Screen.png',
  roughCharacterScreen: 'Wizzy Rough Character Screen.png',
  roughFriendsScreen: 'Wizzy Rough Friends Screen.png',
  roughBattleScreen: 'Wizzy Rough Battle Screen.png',
  spellHeatboxFx: 'Wizzy Heatbox Spell FX.png',
  spellBlazeFx: 'Wizzy Blaze Spell FX.png',
  spellCharredBladeFx: 'Wizzy Charred Blade Spell FX.png',
  spellSunsetterFx: 'Wizzy Sunsetter Spell FX.png',
  spellSeaBoltFx: 'Wizzy Sea Bolt Spell FX.png',
  spellSwellFx: 'Wizzy Swell Spell FX.png',
  spellCarbonateFx: 'Wizzy Carbonate Spell FX.png',
  spellPoseidonRiftFx: 'Wizzy Poseidons Rift Spell FX.png',
  spellOffoDefoFx: 'Wizzy OffoDefo Spell FX.png',
  spellBengalShieldFx: 'Wizzy Bengal Shield Spell FX.png',
  spellEarthboundFx: 'Wizzy Earthbound Spell FX.png',
  spellMercifulFx: 'Wizzy Merciful Spell FX.png',
  spellTectonicFx: 'Wizzy Tectonic Spell FX.png',
  fateFeedbackFx: 'Wizzy Fate Feedback FX.png',
  enhanceEarth: "Wizzy Earth Air Enhancement Buttons.png",
  earthHeavyBoulder: "Wizzy Earth Heavy Boulder.png",
  earthMage: "Wizzy Earth Idle.png",
  iconEarth: "Wizzy Earth Air Icons.png",
  iconEarthenShield: "Wizzy Earth Air Icons.png",
  iconGolemHead: "Wizzy Earth Air Icons.png",
  earthCard: "Earth Green Card Frame.png",
  heatboxArt: "Wizzy Fire-2 Illustration.png",
  blazeArt: "Wizzy Fire-15 Illustration.png",
  charredBladeArt: "Wizzy Fire-6 Illustration.png",
  xineophReimaginedArt: "Wizzy Fire-11 Illustration.png",
  sunsetterArt: "Wizzy Fire-14 Illustration.png",
  seaBoltArt: "Wizzy Water-2 Illustration.png",
  swellArt: "Wizzy Water-0 Illustration.png",
  coralCrashArt: "Wizzy Water-12 Illustration.png",
  pacificArt: "Wizzy Water-9 Illustration.png",
  poseidonRiftArt: "Wizzy Water-14 Illustration.png",
  earth1Art: "Wizzy Earth-1 Illustration.png",
  earth2Art: "Wizzy Earth-2 Illustration.png",
  earth3Art: "Wizzy Earth-3 Illustration.png",
  earth4Art: "Wizzy Earth-4 Illustration.png",
  earth5Art: "Wizzy Earth-5 Illustration.png",

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

/** Isolated viewports into the approved Xineoph storyboard, without repainting
 * its source pixels. Frame clips remove the neighboring standing characters;
 * anchors are local to each cropped viewport rather than the whole atlas cell.
 */
const xineophScale = 144 / 112;
function xineophSheet({ animations, regions, anchors, clips = {}, asset = 'xineophAnimation',
  sourceWidth = 1536, sourceHeight = 1024, columns = 4, rows = 4, displayScale = xineophScale, ...metadata }) {
  const cellWidth = sourceWidth / columns, cellHeight = sourceHeight / rows;
  const frameRects = Array.from({ length: columns * rows }, (_, frame) => {
    const [x, y, w, h] = regions[frame] || regions.default;
    return Object.freeze({ x: frame % columns * cellWidth + x, y: Math.floor(frame / columns) * cellHeight + y, w, h });
  });
  const frameAnchors = frameRects.map((rect, frame) => {
    const [x, y] = anchors[frame] || anchors.default;
    const localX = rect.x - frame % columns * cellWidth, localY = rect.y - Math.floor(frame / columns) * cellHeight;
    return Object.freeze({ x: (x - localX) / rect.w, y: (y - localY) / rect.h });
  });
  const frameClips = frameRects.map((rect, frame) => {
    if (!clips[frame]) return null;
    const localX = rect.x - frame % columns * cellWidth, localY = rect.y - Math.floor(frame / columns) * cellHeight;
    return `polygon(${clips[frame].map(([x, y]) => `${(x-localX)/rect.w*100}% ${(y-localY)/rect.h*100}%`).join(', ')})`;
  });
  return Object.freeze({
    asset, sourceWidth, sourceHeight, columns, rows, displayScale, ...metadata,
    animations: Object.freeze(Object.fromEntries(Object.entries(animations).map(([key, frames]) => [key, Object.freeze(frames)]))),
    frameRects: Object.freeze(frameRects), frameAnchors: Object.freeze(frameAnchors), frameClips: Object.freeze(frameClips),
  });
}

export const LEGACY_XINEOPH_ANIMATION_SHEETS = Object.freeze({
  // Measured charging feet stay fixed while eight distinct orb/spark poses pulse.
  // The 178px hat-to-sole body maps to the same 144px battle wizard as the actor.
  charge: xineophSheet({
    asset: 'xineophCharge', columns: 4, rows: 2,
    sourceBodyHeight: 178, targetBodyHeight: 144, displayScale: 144 / 178,
    animations: { fire: [0,1,2,3,4,5,6,7] },
    regions: { default: [40,85,320,355] },
    anchors: { default: [119.5,430], 4: [120,430], 5: [120,430], 6: [120,430], 7: [120,430] },
  }),
  actor: xineophSheet({
    sourceBodyHeight: 112, targetBodyHeight: 144,
    animations: { fire: [0,1,2,3,4,5,6] },
    regions: { default: [0,0,256,256] },
    anchors: { default: [87.5,238], 3: [88,238], 4: [87,238] },
    // The first flight crop's right edge leads its beak by 58 source px.
    // Use that same contact plane here so the bird does not jump at takeoff.
    releaseOffset: Object.freeze({ x: (255-87.5)*xineophScale, y: (84-238)*xineophScale }),
  }),
  projectile: xineophSheet({
    animations: { fire: [7,8,9] },
    regions: { default: [40,20,236,135], 8: [45,25,233,130], 9: [55,25,239,133] },
    // The right edge is the leading contact plane, conservatively ahead of
    // both light tips; neither blade crosses the target before impact.
    contactPlane: 'leading-edge',
    anchors: { default: [276,114], 8: [278,100], 9: [294,121] },
    clips: {
      7: [[40,20],[276,20],[276,142],[273,150],[260,155],[128,155],[128,118],[40,118]],
      8: [[45,25],[278,25],[278,138],[274,145],[260,155],[128,155],[128,118],[45,118]],
      9: [[55,25],[294,25],[294,130],[288,135],[282,140],[277,145],[271,150],[252,158],[128,158],[128,118],[55,118]],
    },
  }),
  impact: xineophSheet({
    animations: { impact: [13,14,14,15] },
    regions: { default: [145,75,110,132] },
    anchors: { default: [236,173] },
  }),
});

/** Native-facing creature layers: the first fifteen cells contain one caster;
 * the five flight and four impact cells contain effects only. The previous
 * Xineoph sheets remain available above, with every original bitmap unchanged.
 */
function creatureAnimation({ asset, projectileAsset = asset, impactAsset = projectileAsset, element, nativeFacing, sourceBodyHeight,
  feet, lastNose, flightRects, flightNoses, impactCore }) {
  const displayScale = 144 / sourceBodyHeight;
  const common = { asset, sourceWidth: 1024, sourceHeight: 1536, columns: 4, rows: 6, nativeFacing };
  const actorRegions = { default: [0,0,256,256] };
  const actorAnchors = { default: feet[0] };
  feet.forEach((point, frame) => { actorAnchors[frame] = point; });
  const firstRect = flightRects[15];
  const flightAnchors = { default: [nativeFacing === 'right' ? firstRect[0]+firstRect[2] : firstRect[0], flightNoses[15][1]] };
  for (const frame of [15,16,17,18,19]) {
    const [x, , w] = flightRects[frame];
    flightAnchors[frame] = [nativeFacing === 'right' ? x+w : x, flightNoses[frame][1]];
  }
  const firstContact = flightAnchors[15][0];
  // Align the same leading plane on the final pose and first flight frame.
  // The mouth/nose therefore stays continuous even when the FX canvas changes.
  const releaseOffset = Object.freeze({
    x: (lastNose[0] + firstContact - flightNoses[15][0] - feet[14][0]) * displayScale,
    y: (lastNose[1] - feet[14][1]) * displayScale,
  });
  return Object.freeze({
    nativeFacing, element,
    actor: xineophSheet({ ...common, sourceBodyHeight, targetBodyHeight: 144, displayScale,
      animations: { [element]: [0,1,10,11,12,13,14] },
      regions: actorRegions, anchors: actorAnchors, releaseOffset }),
    charge: xineophSheet({ ...common, sourceBodyHeight, targetBodyHeight: 144, displayScale,
      animations: { [element]: [2,3,4,5,6,7,8,9] },
      regions: actorRegions, anchors: actorAnchors }),
    projectile: xineophSheet({ ...common, asset: projectileAsset, displayScale, contactPlane: 'leading-edge',
      animations: { [element]: [15,16,17,18,19] },
      regions: { default: flightRects[15], ...flightRects }, anchors: flightAnchors }),
    // Both burst/splash layers fit around the defender rather than inheriting
    // the larger caster scale; the final source cell is intentionally empty.
    impact: xineophSheet({ ...common, asset: impactAsset, displayScale: .8,
      animations: { impact: [20,21,22,23] },
      regions: { default: [0,0,256,256] }, anchors: { default: impactCore } }),
  });
}

export const CREATURE_ANIMATION_SHEETS = Object.freeze({
  xineoph: creatureAnimation({
    asset: 'phoenixFireAnimation', projectileAsset: 'phoenixCleanEffects', element: 'fire', nativeFacing: 'right', sourceBodyHeight: 104,
    feet: [[52,236],[51.5,236],[51.5,236],[51.5,236],[52,236],
      [51.5,236],[51.5,236],[51.5,236],[52,236],[51.5,236],
      [51.5,236],[51.5,236],[52,236],[51.5,236],[51.5,236]],
    lastNose: [161,89.5],
    flightRects: { 15: [28,38,210,143], 16: [21,32,213,147],
      17: [23,36,206,141], 18: [27,46,203,130], 19: [34,44,189,137] },
    flightNoses: { 15: [167,114.5], 16: [165,111.6], 17: [165,113],
      18: [161,116.33], 19: [151,121] },
    impactCore: [163.21,163.68],
  }),
  pacific: creatureAnimation({
    asset: 'pacificDolphinAnimation', element: 'water', nativeFacing: 'left', sourceBodyHeight: 105,
    feet: [[200,237],[199.5,237],[199.5,237],[199.5,237],[199.5,237],
      [199.5,237],[199.5,237],[200,237],[200,237],[199.5,237],
      [200,237],[199.5,237],[199.5,237],[199.5,237],[199.5,237]],
    lastNose: [52,120.5],
    flightRects: { 15: [37,36,199,148], 16: [24,28,209,153],
      17: [17,32,219,153], 18: [22,45,214,131], 19: [25,43,208,142] },
    flightNoses: { 15: [50,130], 16: [43,123.69], 17: [44,130.38],
      18: [50,131.78], 19: [49,132.78] },
    impactCore: [71.94,151.65],
  }),
});

export const XINEOPH_ANIMATION_SHEETS = CREATURE_ANIMATION_SHEETS.xineoph;
export const PACIFIC_ANIMATION_SHEETS = CREATURE_ANIMATION_SHEETS.pacific;

/** Approved Earth/Golem crops and anchors copied from the review manifests.
 * Explicit spill regions (including Golem fists) and per-frame transform scales
 * are retained; no source PNG is sliced or repainted.
 */
function freezeMetadata(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeMetadata);
    Object.freeze(value);
  }
  return value;
}
export const EARTH_ANIMATION_SHEETS = freezeMetadata({"walk":{"asset":"earthWalk","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":0.8044692737430168,"frameAnchors":[{"x":0.4983089064261556,"y":0.9605411499436303},{"x":0.503945885005637,"y":0.9605411499436303},{"x":0.5005636978579482,"y":0.9605411499436303},{"x":0.5062006764374295,"y":0.9605411499436303},{"x":0.5118376550169109,"y":0.9616685456595265},{"x":0.5084554678692221,"y":0.9571589627959414},{"x":0.5186020293122886,"y":0.9571589627959414},{"x":0.5310033821871477,"y":0.9571589627959414},{"x":0.48703494926719276,"y":0.9492671927846674},{"x":0.4813979706877114,"y":0.9492671927846674},{"x":0.4859075535512965,"y":0.9492671927846674},{"x":0.4859075535512965,"y":0.9492671927846674},{"x":0.4983089064261556,"y":0.9368658399098083},{"x":0.5016910935738444,"y":0.9368658399098083},{"x":0.5005636978579482,"y":0.9368658399098083},{"x":0.5016910935738444,"y":0.9368658399098083},{"x":0.4983089064261556,"y":0.9605411499436303},{"x":0.503945885005637,"y":0.9605411499436303},{"x":0.5028184892897407,"y":0.9605411499436303},{"x":0.5062006764374295,"y":0.9605411499436303},{"x":0.5118376550169109,"y":0.9616685456595265},{"x":0.5084554678692221,"y":0.9616685456595265},{"x":0.5163472378804961,"y":0.9616685456595265},{"x":0.5310033821871477,"y":0.9616685456595265},{"x":0.48703494926719276,"y":0.9537767756482526},{"x":0.4813979706877114,"y":0.9537767756482526},{"x":0.48703494926719276,"y":0.9537767756482526},{"x":0.4859075535512965,"y":0.9537767756482526},{"x":0.4983089064261556,"y":0.9368658399098083},{"x":0.5016910935738444,"y":0.9368658399098083},{"x":0.5005636978579482,"y":0.9368658399098083},{"x":0.5016910935738444,"y":0.9368658399098083}],"sourceBodyHeight":179,"targetBodyHeight":144,"directions":{"earth":{"down":0,"left":1,"right":2,"up":3},"air":{"down":4,"left":5,"right":6,"up":7}},"facing":{"earth":"right","air":"left"},"animations":{"earth":[8,9,10,11],"air":[20,21,22,23]}},"idle":{"asset":"earthIdle","sourceWidth":1254,"sourceHeight":1254,"columns":4,"rows":4,"frameMs":160,"displayScale":0.6037735849056604,"frameAnchors":[{"x":0.5143540669856459,"y":0.9218500797448166},{"x":0.5215311004784688,"y":0.9218500797448166},{"x":0.5199362041467305,"y":0.9218500797448166},{"x":0.5127591706539075,"y":0.9218500797448166},{"x":0.5135566188197768,"y":0.9202551834130781},{"x":0.5087719298245614,"y":0.9202551834130781},{"x":0.5087719298245614,"y":0.9202551834130781},{"x":0.5103668261562998,"y":0.9202551834130781},{"x":0.5135566188197768,"y":0.9186602870813397},{"x":0.5151515151515151,"y":0.9186602870813397},{"x":0.5055821371610846,"y":0.9186602870813397},{"x":0.518341307814992,"y":0.9186602870813397},{"x":0.5167464114832536,"y":0.9170653907496013},{"x":0.5167464114832536,"y":0.9170653907496013},{"x":0.518341307814992,"y":0.9170653907496013},{"x":0.5199362041467305,"y":0.9170653907496013}],"sourceBodyHeight":238.5,"targetBodyHeight":144,"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7],"air":[8,9,10,11,12,13,14,15]}},"basicAttack":{"asset":"earthBasicAttack","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":0.9473684210526315,"frameAnchors":[{"x":0.4983089064261556,"y":0.9470124013528749},{"x":0.49492671927846676,"y":0.9470124013528749},{"x":0.4915445321307779,"y":0.9470124013528749},{"x":0.4926719278466742,"y":0.9470124013528749},{"x":0.4915445321307779,"y":0.943630214205186},{"x":0.4904171364148816,"y":0.943630214205186},{"x":0.48928974069898534,"y":0.943630214205186},{"x":0.49492671927846676,"y":0.943630214205186},{"x":0.49379932356257045,"y":0.9447576099210823},{"x":0.4904171364148816,"y":0.9447576099210823},{"x":0.48928974069898534,"y":0.9447576099210823},{"x":0.49492671927846676,"y":0.9447576099210823},{"x":0.4915445321307779,"y":0.9413754227733935},{"x":0.4926719278466742,"y":0.9413754227733935},{"x":0.4915445321307779,"y":0.9413754227733935},{"x":0.49943630214205187,"y":0.9413754227733935},{"x":0.5050732807215332,"y":0.9470124013528749},{"x":0.5084554678692221,"y":0.9470124013528749},{"x":0.5073280721533259,"y":0.9470124013528749},{"x":0.5084554678692221,"y":0.9470124013528749},{"x":0.5095828635851184,"y":0.9481397970687712},{"x":0.5062006764374295,"y":0.9481397970687712},{"x":0.5073280721533259,"y":0.9481397970687712},{"x":0.5084554678692221,"y":0.9481397970687712},{"x":0.5073280721533259,"y":0.9492671927846674},{"x":0.5062006764374295,"y":0.9492671927846674},{"x":0.5050732807215332,"y":0.9492671927846674},{"x":0.5062006764374295,"y":0.9492671927846674},{"x":0.5073280721533259,"y":0.9503945885005637},{"x":0.5062006764374295,"y":0.9503945885005637},{"x":0.5050732807215332,"y":0.9503945885005637},{"x":0.5084554678692221,"y":0.9503945885005637}],"sourceBodyHeight":152,"targetBodyHeight":144,"launchAnchors":{"earth":{"x":0.7508455467869222,"y":0.7158962795941376},"air":{"x":0.2615558060879369,"y":0.7249154453213078}},"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"simpleCast":{"asset":"earthSimpleCast","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":0.935064935064935,"frameAnchors":[{"x":0.5095828635851184,"y":0.95152198421646},{"x":0.5084554678692221,"y":0.95152198421646},{"x":0.5073280721533259,"y":0.95152198421646},{"x":0.5084554678692221,"y":0.95152198421646},{"x":0.5050732807215332,"y":0.9526493799323562},{"x":0.5084554678692221,"y":0.9526493799323562},{"x":0.5073280721533259,"y":0.9526493799323562},{"x":0.5107102593010147,"y":0.9526493799323562},{"x":0.5095828635851184,"y":0.9492671927846674},{"x":0.503945885005637,"y":0.9492671927846674},{"x":0.5050732807215332,"y":0.9492671927846674},{"x":0.5084554678692221,"y":0.9492671927846674},{"x":0.5095828635851184,"y":0.9503945885005637},{"x":0.5107102593010147,"y":0.9503945885005637},{"x":0.5073280721533259,"y":0.9503945885005637},{"x":0.5107102593010147,"y":0.9503945885005637},{"x":0.5118376550169109,"y":0.9470124013528749},{"x":0.5174746335963923,"y":0.9470124013528749},{"x":0.5163472378804961,"y":0.95152198421646},{"x":0.5174746335963923,"y":0.9470124013528749},{"x":0.5140924464487034,"y":0.9481397970687712},{"x":0.5197294250281849,"y":0.9481397970687712},{"x":0.5163472378804961,"y":0.9481397970687712},{"x":0.5174746335963923,"y":0.9481397970687712},{"x":0.5163472378804961,"y":0.9492671927846674},{"x":0.5197294250281849,"y":0.9492671927846674},{"x":0.5163472378804961,"y":0.9492671927846674},{"x":0.5174746335963923,"y":0.9492671927846674},{"x":0.5163472378804961,"y":0.9458850056369785},{"x":0.5174746335963923,"y":0.9458850056369785},{"x":0.5186020293122886,"y":0.9458850056369785},{"x":0.5174746335963923,"y":0.9458850056369785}],"sourceBodyHeight":154,"targetBodyHeight":144,"launchAnchors":{"earth":{"x":0.8252536640360767,"y":0.6933483652762119},"air":{"x":0.1600901916572717,"y":0.7091319052987599}},"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"largeCast":{"asset":"earthLargeCast","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":1.0359712230215827,"frameAnchors":[{"x":0.5028184892897407,"y":0.9830890642615558},{"x":0.4859075535512965,"y":0.9830890642615558},{"x":0.44419391206313413,"y":0.9785794813979707},{"x":0.447576099210823,"y":0.9830890642615558},{"x":0.4487034949267193,"y":0.9706877113866967},{"x":0.44983089064261556,"y":0.9706877113866967},{"x":0.44419391206313413,"y":0.9706877113866967},{"x":0.447576099210823,"y":0.9706877113866967},{"x":0.4464487034949267,"y":0.971815107102593},{"x":0.44983089064261556,"y":0.971815107102593},{"x":0.4464487034949267,"y":0.971815107102593},{"x":0.44983089064261556,"y":0.971815107102593},{"x":0.4351747463359639,"y":0.9729425028184893},{"x":0.43404735062006766,"y":0.9729425028184893},{"x":0.46223224351747466,"y":0.9729425028184893},{"x":0.4904171364148816,"y":0.9729425028184893},{"x":0.5073280721533259,"y":0.9695603156708005},{"x":0.5129650507328072,"y":0.9695603156708005},{"x":0.48478015783540024,"y":0.9695603156708005},{"x":0.5332581736189402,"y":0.9695603156708005},{"x":0.5975197294250282,"y":0.9661781285231116},{"x":0.5963923337091319,"y":0.9661781285231116},{"x":0.5997745208568207,"y":0.9661781285231116},{"x":0.6031567080045096,"y":0.9661781285231116},{"x":0.5997745208568207,"y":0.9673055242390078},{"x":0.5986471251409244,"y":0.9673055242390078},{"x":0.5997745208568207,"y":0.9673055242390078},{"x":0.6031567080045096,"y":0.9673055242390078},{"x":0.6020293122886133,"y":0.963923337091319},{"x":0.6031567080045096,"y":0.963923337091319},{"x":0.5727170236753101,"y":0.963923337091319},{"x":0.5084554678692221,"y":0.963923337091319}],"sourceBodyHeight":139,"targetBodyHeight":144,"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"shield":{"asset":"earthShield","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":0.87804878,"frameAnchors":[{"x":0.491544532,"y":0.933483653},{"x":0.499436302,"y":0.933483653},{"x":0.496054115,"y":0.933483653},{"x":0.531003382,"y":0.933483653},{"x":0.500563698,"y":0.930101466},{"x":0.503945885,"y":0.930101466},{"x":0.500563698,"y":0.930101466},{"x":0.535512965,"y":0.930101466},{"x":0.502818489,"y":0.926719278},{"x":0.531003382,"y":0.926719278},{"x":0.534385569,"y":0.931228861},{"x":0.506200676,"y":0.926719278},{"x":0.500563698,"y":0.927846674},{"x":0.501691094,"y":0.927846674},{"x":0.498308906,"y":0.927846674},{"x":0.499436302,"y":0.927846674},{"x":0.516347238,"y":0.906426156},{"x":0.521984216,"y":0.906426156},{"x":0.520856821,"y":0.906426156},{"x":0.521984216,"y":0.906426156},{"x":0.527621195,"y":0.903043968},{"x":0.524239008,"y":0.903043968},{"x":0.520856821,"y":0.903043968},{"x":0.521984216,"y":0.903043968},{"x":0.518602029,"y":0.904171364},{"x":0.521984216,"y":0.904171364},{"x":0.534385569,"y":0.904171364},{"x":0.519729425,"y":0.904171364},{"x":0.518602029,"y":0.900789177},{"x":0.524239008,"y":0.900789177},{"x":0.520856821,"y":0.900789177},{"x":0.521984216,"y":0.900789177}],"sourceBodyHeight":164,"targetBodyHeight":144,"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"powerUp":{"asset":"earthPowerUp","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":0.883435583,"frameAnchors":[{"x":0.516347238,"y":0.910935738},{"x":0.519729425,"y":0.910935738},{"x":0.516347238,"y":0.910935738},{"x":0.515219842,"y":0.888387824},{"x":0.520856821,"y":0.88951522},{"x":0.517474634,"y":0.88951522},{"x":0.511837655,"y":0.88951522},{"x":0.533258174,"y":0.88951522},{"x":0.516347238,"y":0.886133033},{"x":0.519729425,"y":0.886133033},{"x":0.516347238,"y":0.886133033},{"x":0.510710259,"y":0.890642616},{"x":0.523111612,"y":0.882750846},{"x":0.519729425,"y":0.90529876},{"x":0.516347238,"y":0.90529876},{"x":0.512965051,"y":0.90529876},{"x":0.500563698,"y":0.901916573},{"x":0.512965051,"y":0.901916573},{"x":0.507328072,"y":0.901916573},{"x":0.510710259,"y":0.901916573},{"x":0.505073281,"y":0.903043968},{"x":0.512965051,"y":0.903043968},{"x":0.509582864,"y":0.903043968},{"x":0.510710259,"y":0.903043968},{"x":0.505073281,"y":0.904171364},{"x":0.512965051,"y":0.904171364},{"x":0.509582864,"y":0.904171364},{"x":0.510710259,"y":0.904171364},{"x":0.505073281,"y":0.896279594},{"x":0.512965051,"y":0.896279594},{"x":0.507328072,"y":0.896279594},{"x":0.510710259,"y":0.896279594}],"sourceBodyHeight":163,"targetBodyHeight":144,"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"enhancement":{"asset":"earthEnhancement","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":0.941176471,"frameAnchors":[{"x":0.520856821,"y":0.923900789},{"x":0.506200676,"y":0.923900789},{"x":0.482525366,"y":0.923900789},{"x":0.474633596,"y":0.923900789},{"x":0.496054115,"y":0.923900789},{"x":0.483652762,"y":0.923900789},{"x":0.453213078,"y":0.923900789},{"x":0.465614431,"y":0.923900789},{"x":0.496054115,"y":0.923900789},{"x":0.483652762,"y":0.923900789},{"x":0.484780158,"y":0.923900789},{"x":0.476888388,"y":0.923900789},{"x":0.520856821,"y":0.923900789},{"x":0.501691094,"y":0.923900789},{"x":0.496054115,"y":0.923900789},{"x":0.508455468,"y":0.923900789},{"x":0.516347238,"y":0.903607666},{"x":0.512965051,"y":0.903607666},{"x":0.471251409,"y":0.903607666},{"x":0.481397971,"y":0.903607666},{"x":0.500563698,"y":0.903607666},{"x":0.499436302,"y":0.903607666},{"x":0.482525366,"y":0.903607666},{"x":0.476888388,"y":0.903607666},{"x":0.502818489,"y":0.903607666},{"x":0.499436302,"y":0.903607666},{"x":0.491544532,"y":0.903607666},{"x":0.485907554,"y":0.903607666},{"x":0.520856821,"y":0.903607666},{"x":0.508455468,"y":0.903607666},{"x":0.496054115,"y":0.903607666},{"x":0.503945885,"y":0.903607666}],"sourceBodyHeight":153,"targetBodyHeight":144,"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"basicProjectiles":{"asset":"earthBasicProjectiles","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":0.55,"frameAnchors":[{"x":0.4915445321307779,"y":0.532130777903044},{"x":0.5310033821871477,"y":0.5411499436302142},{"x":0.496054114994363,"y":0.5366403607666291},{"x":0.5174746335963923,"y":0.5388951521984217},{"x":0.5366403607666291,"y":0.52423900789177},{"x":0.5400225479143179,"y":0.52423900789177},{"x":0.5479143179255919,"y":0.52423900789177},{"x":0.5580608793686584,"y":0.52423900789177},{"x":0.5546786922209695,"y":0.5231116121758738},{"x":0.5490417136414881,"y":0.5231116121758738},{"x":0.552423900789177,"y":0.5434047350620068},{"x":0.5851183765501691,"y":0.5434047350620068},{"x":0.5851183765501691,"y":0.5434047350620068},{"x":0.5851183765501691,"y":0.5434047350620068},{"x":0.5851183765501691,"y":0.5434047350620068},{"x":0.5851183765501691,"y":0.5434047350620068},{"x":0.5028184892897407,"y":0.5028184892897407},{"x":0.5310033821871477,"y":0.5005636978579482},{"x":0.44419391206313413,"y":0.48252536640360766},{"x":0.45434047350620066,"y":0.48703494926719276},{"x":0.41262683201803835,"y":0.4791431792559188},{"x":0.4047350620067644,"y":0.4836527621195039},{"x":0.41262683201803835,"y":0.4836527621195039},{"x":0.4633596392333709,"y":0.4813979706877114},{"x":0.41262683201803835,"y":0.48027057497181513},{"x":0.41149943630214203,"y":0.48027057497181513},{"x":0.41262683201803835,"y":0.48027057497181513},{"x":0.4137542277339346,"y":0.47350620067643745},{"x":0.4137542277339346,"y":0.47350620067643745},{"x":0.4137542277339346,"y":0.47350620067643745},{"x":0.4137542277339346,"y":0.47350620067643745},{"x":0.4137542277339346,"y":0.47350620067643745}],"sourceBodyHeight":76,"targetBodyHeight":144,"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"largeProjectiles":{"asset":"earthLargeProjectiles","sourceWidth":887,"sourceHeight":1774,"columns":4,"rows":8,"frameMs":125,"displayScale":1.05,"frameAnchors":[{"x":0.48703494926719276,"y":0.874859075535513},{"x":0.503945885005637,"y":0.874859075535513},{"x":0.4915445321307779,"y":0.874859075535513},{"x":0.4904171364148816,"y":0.874859075535513},{"x":0.48928974069898534,"y":0.8759864712514093},{"x":0.4926719278466742,"y":0.8759864712514093},{"x":0.5050732807215332,"y":0.8759864712514093},{"x":0.4836527621195039,"y":0.8759864712514093},{"x":0.4915445321307779,"y":0.8726042841037204},{"x":0.4836527621195039,"y":0.8771138669673055},{"x":0.4915445321307779,"y":0.8771138669673055},{"x":0.5062006764374295,"y":0.8726042841037204},{"x":0.5062006764374295,"y":0.8726042841037204},{"x":0.5062006764374295,"y":0.8726042841037204},{"x":0.5062006764374295,"y":0.8726042841037204},{"x":0.5062006764374295,"y":0.8726042841037204},{"x":0.44419391206313413,"y":0.6629086809470124},{"x":0.4813979706877114,"y":0.6178128523111612},{"x":0.5028184892897407,"y":0.5208568207440811},{"x":0.5197294250281849,"y":0.48252536640360766},{"x":0.5208568207440811,"y":0.4926719278466742},{"x":0.5107102593010147,"y":0.4836527621195039},{"x":0.5118376550169109,"y":0.4836527621195039},{"x":0.5107102593010147,"y":0.4836527621195039},{"x":0.5095828635851184,"y":0.5005636978579482},{"x":0.5084554678692221,"y":0.5005636978579482},{"x":0.5095828635851184,"y":0.49379932356257045},{"x":0.5174746335963923,"y":0.49379932356257045},{"x":0.5174746335963923,"y":0.49379932356257045},{"x":0.5174746335963923,"y":0.49379932356257045},{"x":0.5174746335963923,"y":0.49379932356257045},{"x":0.5174746335963923,"y":0.49379932356257045}],"sourceBodyHeight":170,"targetBodyHeight":144,"facing":{"earth":"right","air":"left"},"animations":{"earth":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"air":[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]}},"sharedAura":{"asset":"earthAura","sourceWidth":1254,"sourceHeight":1254,"columns":4,"rows":4,"frameMs":125,"displayScale":0.5,"frameAnchors":[{"x":0.5,"y":0.6188197767145136},{"x":0.5,"y":0.6188197767145136},{"x":0.5,"y":0.6188197767145136},{"x":0.5,"y":0.6188197767145136},{"x":0.4864433811802233,"y":0.620414673046252},{"x":0.5007974481658692,"y":0.6283891547049442},{"x":0.49920255183413076,"y":0.6188197767145136},{"x":0.49920255183413076,"y":0.6188197767145136},{"x":0.5007974481658692,"y":0.5901116427432217},{"x":0.5007974481658692,"y":0.5901116427432217},{"x":0.49920255183413076,"y":0.5901116427432217},{"x":0.49920255183413076,"y":0.5901116427432217},{"x":0.5,"y":0.6188197767145136},{"x":0.5,"y":0.6188197767145136},{"x":0.5,"y":0.6188197767145136},{"x":0.5,"y":0.6188197767145136}],"facing":{"earth":"right","air":"left"},"animations":{"aura":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]}}});

export const GOLEM_ANIMATION_SHEETS = freezeMetadata({"poses":{"asset":"golemPoses","sourceWidth":1024,"sourceHeight":1536,"columns":4,"rows":6,"frameMs":125,"displayScale":1,"frameAnchors":[{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.45714285714285713,"y":0.890625},{"x":0.42857142857142855,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.45714285714285713,"y":0.890625},{"x":0.42857142857142855,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625},{"x":0.5,"y":0.890625}],"frameRects":[{"x":0,"y":0,"w":256,"h":256},{"x":256,"y":0,"w":256,"h":256},{"x":512,"y":0,"w":256,"h":256},{"x":768,"y":0,"w":256,"h":256},{"x":0,"y":256,"w":256,"h":256},{"x":256,"y":256,"w":256,"h":256},{"x":512,"y":256,"w":280,"h":256},{"x":800,"y":256,"w":224,"h":256},{"x":0,"y":512,"w":256,"h":256},{"x":256,"y":512,"w":256,"h":256},{"x":512,"y":512,"w":280,"h":256},{"x":800,"y":512,"w":224,"h":256},{"x":0,"y":768,"w":256,"h":256},{"x":256,"y":768,"w":256,"h":256},{"x":512,"y":768,"w":256,"h":256},{"x":768,"y":768,"w":256,"h":256},{"x":0,"y":1024,"w":256,"h":256},{"x":256,"y":1024,"w":256,"h":256},{"x":512,"y":1024,"w":256,"h":256},{"x":768,"y":1024,"w":256,"h":256},{"x":0,"y":1280,"w":256,"h":256},{"x":256,"y":1280,"w":256,"h":256},{"x":512,"y":1280,"w":256,"h":256},{"x":768,"y":1280,"w":256,"h":256}],"anchor":{"x":0.5,"y":0.890625},"animations":{"Idle":[0,1,2,3],"Basic cast":[4,5,5,6,5,6,5,6,5,6,5,6,7,7,0,0],"Heavy cast":[8,9,9,10,9,10,9,10,9,10,9,10,11,11,0,0],"Quick hit":[12,13,14,15],"Boost":[16,17,17,18,17,18,17,18,17,18,17,18,19,19,0,0],"Enhancement":[20,21,21,22,21,22,21,22,21,22,21,22,23,23,0,0],"idle":[0,1,2,3],"basicCast":[4,5,5,6,5,6,5,6,5,6,5,6,7,7,0,0],"basicAttack":[4,5,5,6,5,6,5,6,5,6,5,6,7,7,0,0],"simpleCast":[4,5,5,6,5,6,5,6,5,6,5,6,7,7,0,0],"heavyCast":[8,9,9,10,9,10,9,10,9,10,9,10,11,11,0,0],"largeCast":[8,9,9,10,9,10,9,10,9,10,9,10,11,11,0,0],"hit":[12,13,14,15],"hitReaction":[12,13,14,15],"powerUp":[16,17,17,18,17,18,17,18,17,18,17,18,19,19,0,0],"enhancement":[20,21,21,22,21,22,21,22,21,22,21,22,23,23,0,0]}},"transform":{"asset":"golemTransform","sourceWidth":1254,"sourceHeight":1254,"columns":4,"rows":4,"frameMs":125,"displayScale":1,"frameAnchors":[{"x":0.5311004784688995,"y":0.9569377990430622},{"x":0.529505582137161,"y":0.960127591706539},{"x":0.5311004784688995,"y":0.9569377990430622},{"x":0.5135566188197768,"y":0.960127591706539},{"x":0.49282296650717705,"y":0.8899521531100478},{"x":0.5167464114832536,"y":0.8899521531100478},{"x":0.48484848484848486,"y":0.8899521531100478},{"x":0.5279106858054227,"y":0.8899521531100478},{"x":0.5279106858054227,"y":0.8899521531100478},{"x":0.5167464114832536,"y":0.8899521531100478},{"x":0.5055821371610846,"y":0.8899521531100478},{"x":0.4784688995215311,"y":0.9027113237639554},{"x":0.5263157894736842,"y":0.9122807017543859},{"x":0.529505582137161,"y":0.9186602870813397},{"x":0.532695374800638,"y":0.9186602870813397},{"x":0.532695374800638,"y":0.9186602870813397}],"frameScales":[0.5714,0.5714,0.5714,0.5714,0.64,0.78,0.87,0.87,0.87,0.87,0.82,0.68,0.62,0.605,0.605,0.605],"anchor":{"x":0.5,"y":0.90625},"animations":{"Transform":[0,1,2,3,4,5,6,7],"Revert":[8,9,10,11,12,13,14,15],"transform":[0,1,2,3,4,5,6,7],"revert":[8,9,10,11,12,13,14,15]}},"heavyBoulder":{"asset":"earthHeavyBoulder","sourceWidth":1254,"sourceHeight":1254,"columns":4,"rows":4,"frameMs":125,"displayScale":0.8,"anchor":{"x":0.5,"y":0.9250398724082934},"animations":{"Formation":[0,1,2,3],"Rolling flight":[4,5,6,7,8,9,10,11],"Quick shatter":[12,13,14,15],"formation":[0,1,2,3],"flight":[4,5,6,7,8,9,10,11],"impact":[12,13,14,15]}}});

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
  // Xineoph inherits Charred Blade's original phoenix; source sheet stays intact.
  ...fireSlabCrops.map((crop,index) => [`Fire-${index+1}`, slab('fireSlabSheet',2037,772,index === 10 ? fireSlabCrops[5] : crop,`Fire-${index+1}`)]),
  ['Water-0', slab('waterSlabSheet',2037,772,waterSlabCrops[9],'Water-0')],
  ...waterSlabCrops.map((crop,index) => [`Water-${index+1}`, slab('waterSlabSheet',2037,772,crop,`Water-${index+1}`)]),
  ...Array.from({ length: 5 }, (_, index) => [`Earth-${index+1}`, slab('earthCard',1086,1448,[68,70,951,1254],`Earth-${index+1}`)]),
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
  const illustration = SPELL_ILLUSTRATIONS[spellId];
  const earth = definition.type === 'Earth';
  // Every illustration lives in its own viewport. The angled mask stays inside
  // the upper frame aperture and never enters the live beige rules panel.
  const slabScale = crop.asset === 'fireZeroSlab' ? crop.w / 282 : 1;
  const aperture = earth
    ? { x: 79, y: 86, w: 793, h: 617, clip: 'polygon(6% 0,94% 0,100% 8%,100% 95%,96% 100%,4% 100%,0 95%,0 8%)' }
    : { x: 13 * slabScale, y: 17 * slabScale, w: crop.w - 26 * slabScale, h: Math.min(164 * slabScale, crop.h * .495 - 18 * slabScale), clip: 'polygon(4% 0,96% 0,100% 6%,100% 96%,96% 100%,4% 100%,0 96%,0 6%)' };
  const art = illustration
    ? `<span data-card-illustration="${illustration.asset}" style="position:absolute;left:${aperture.x/crop.w*100}%;top:${aperture.y/crop.h*100}%;width:${aperture.w/crop.w*100}%;height:${aperture.h/crop.h*100}%;display:block;overflow:hidden;clip-path:${aperture.clip};background:#07100b"><img alt="" draggable="false" src="${ASSETS[illustration.asset]}" style="display:block;width:100%;height:100%;object-fit:cover;image-rendering:pixelated" /></span>`
    : '';
  return `<span aria-hidden="true" class="spell-slab-art ${className}" data-spell-slab="${spellId}" data-slab-label="${crop.label}" data-copy-density="${density}" data-copy-type="${definition.type}" style="position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;background:${earth?'transparent':'#030308'}">${cropImage(crop)}${art}<span class="slab-live-paper"${earth?' style="top:57.4%;left:8.1%;right:8.1%;bottom:7.5%"':''}><strong class="slab-live-title">${definition.name}</strong><span class="slab-live-rules" data-slab-rules="${spellId}">${slabRulesMarkup(spellId)}</span></span></span>`;
}

/** Stable illustration mapping shared by cards, previews and the deck builder. */
export const SPELL_ILLUSTRATIONS = freezeMetadata({"Fire-2":{"asset":"heatboxArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Fire-2"},"Fire-15":{"asset":"blazeArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Fire-15"},"Fire-6":{"asset":"charredBladeArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Fire-6"},"Fire-11":{"asset":"xineophReimaginedArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Fire-11"},"Fire-14":{"asset":"sunsetterArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Fire-14"},"Water-2":{"asset":"seaBoltArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Water-2"},"Water-0":{"asset":"swellArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Water-0"},"Water-12":{"asset":"coralCrashArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Water-12"},"Water-9":{"asset":"pacificArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Water-9"},"Water-14":{"asset":"poseidonRiftArt","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Water-14"},"Earth-1":{"asset":"earth1Art","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Earth-1"},"Earth-2":{"asset":"earth2Art","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Earth-2"},"Earth-3":{"asset":"earth3Art","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Earth-3"},"Earth-4":{"asset":"earth4Art","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Earth-4"},"Earth-5":{"asset":"earth5Art","width":1536,"height":1024,"x":0,"y":0,"w":1536,"h":1024,"label":"Earth-5"}});

/** Art-only viewports are available where a smaller illustration is needed. */
export const SPELL_ART = Object.freeze(Object.fromEntries(Object.entries(SPELL_SLABS).map(([id,crop]) => {
  if (SPELL_ILLUSTRATIONS[id]) return [id,SPELL_ILLUSTRATIONS[id]];
  const fate = id.startsWith('FAT-');
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
  earthFrame: { width: 1292, height: 1218, x: 90, y: 37, w: 1112, h: 1067 },
  airFrame: { width: 1292, height: 1218, x: 90, y: 37, w: 1112, h: 1067 },
  enhanceEarth: { width: 1774, height: 887, x: 27, y: 126, w: 833, h: 312 },
  earthCard: { width: 1086, height: 1448, x: 68, y: 70, w: 951, h: 1254 },
  earthMage: { width: 1254, height: 1254, x: 75, y: 44, w: 185, h: 245 },
  earthIcons: { width: 1254, height: 1254, x: 0, y: 0, w: 1254, h: 1254 },
  iconEarth: { width: 1254, height: 1254, x: 0, y: 0, w: 627, h: 627 },
  iconEarthenShield: { width: 1254, height: 1254, x: 0, y: 627, w: 627, h: 627 },
  iconGolemHead: { width: 1254, height: 1254, x: 627, y: 627, w: 627, h: 627 },
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
