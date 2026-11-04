/** Original uploaded artwork. Crop metadata only hides transparent export margins. */
import { OPTIMIZED_ART } from './optimized-art.390d7e04e87f.js';

export const ASSET_FILES = Object.freeze({
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

// Resolve from the document so both a domain root and a project subpath work.
// Standalone builds provide these same originals as data URLs once per asset.
export const ASSETS = Object.freeze(Object.fromEntries(
  Object.entries(ASSET_FILES).map(([key, filename]) => {
    const assetPath = OPTIMIZED_ART[key]
      ? `./public/optimized/${OPTIMIZED_ART[key].file}`
      : `./public/graphics/${encodeURIComponent(filename)}`;
    return [key, globalThis.WIZZY_ASSET_URLS?.[key] || (
      typeof document === 'undefined'
        ? assetPath
        : new URL(assetPath, document.baseURI).href
    )];
  }),
));

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
