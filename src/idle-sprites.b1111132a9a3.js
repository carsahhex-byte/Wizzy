/** Approved idle revision. Source PNGs remain byte-identical to the review. */
function freezeIdleMetadata(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeIdleMetadata);
    Object.freeze(value);
  }
  return value;
}

const sheets = {
  "fireWater": {
    "asset": "wizardIdleClean",
    "sourceWidth": 1254,
    "sourceHeight": 1254,
    "columns": 4,
    "rows": 4,
    "sourceBodyHeight": 234.0,
    "frameAnchors": [
      {
        "x": 0.518341307814992,
        "y": 0.9122807017543859
      },
      {
        "x": 0.5199362041467305,
        "y": 0.9122807017543859
      },
      {
        "x": 0.5215311004784688,
        "y": 0.9122807017543859
      },
      {
        "x": 0.5215311004784688,
        "y": 0.9122807017543859
      },
      {
        "x": 0.5199362041467305,
        "y": 0.9106858054226475
      },
      {
        "x": 0.5199362041467305,
        "y": 0.9106858054226475
      },
      {
        "x": 0.5215311004784688,
        "y": 0.9106858054226475
      },
      {
        "x": 0.5231259968102073,
        "y": 0.9106858054226475
      },
      {
        "x": 0.5135566188197768,
        "y": 0.9122807017543859
      },
      {
        "x": 0.5167464114832536,
        "y": 0.9090909090909091
      },
      {
        "x": 0.5167464114832536,
        "y": 0.9122807017543859
      },
      {
        "x": 0.5199362041467305,
        "y": 0.9122807017543859
      },
      {
        "x": 0.518341307814992,
        "y": 0.9106858054226475
      },
      {
        "x": 0.5215311004784688,
        "y": 0.9106858054226475
      },
      {
        "x": 0.518341307814992,
        "y": 0.9106858054226475
      },
      {
        "x": 0.518341307814992,
        "y": 0.9106858054226475
      }
    ],
    "targetBodyHeight": 144,
    "displayScale": 0.6153846153846154,
    "frameMs": 160
  },
  "earthAir": {
    "asset": "earthIdleClean",
    "sourceWidth": 1774,
    "sourceHeight": 887,
    "columns": 4,
    "rows": 2,
    "sourceBodyHeight": 337.0,
    "frameAnchors": [
      {
        "x": 0.5163472378804961,
        "y": 0.9177001127395716
      },
      {
        "x": 0.5186020293122886,
        "y": 0.9177001127395716
      },
      {
        "x": 0.5174746335963923,
        "y": 0.9177001127395716
      },
      {
        "x": 0.5186020293122886,
        "y": 0.9177001127395716
      },
      {
        "x": 0.5186020293122886,
        "y": 0.9165727170236753
      },
      {
        "x": 0.5186020293122886,
        "y": 0.9165727170236753
      },
      {
        "x": 0.5174746335963923,
        "y": 0.9165727170236753
      },
      {
        "x": 0.5186020293122886,
        "y": 0.9165727170236753
      }
    ],
    "targetBodyHeight": 144,
    "displayScale": 0.42729970326409494,
    "frameMs": 160
  }
};

/** Sixteen 160ms steps retain two breathing cycles and exactly one blink. */
export const IDLE_ANIMATION_SHEETS = freezeIdleMetadata({
  fire: {
    ...sheets.fireWater,
    nativeFacing: 'right',
    animations: { idle: [0, 1, 2, 1, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7] },
  },
  water: {
    ...sheets.fireWater,
    nativeFacing: 'left',
    animations: { idle: [8, 9, 10, 9, 12, 13, 14, 15, 8, 9, 10, 11, 12, 13, 14, 15] },
  },
  earth: {
    ...sheets.earthAir,
    nativeFacing: 'right',
    animations: { idle: [0, 1, 1, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7] },
  },
});
