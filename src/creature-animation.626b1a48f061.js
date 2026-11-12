/** Presentation timing only; the battle engine remains the owner of damage. */
export const CREATURE_TIMING = Object.freeze({
  windupEnd: 500,
  releaseAt: 1500,
  formationEnd: 1700,
  formationFrameMs: 100,
  wingFrameMs: 125,
  chargeFrameMs: 62.5,
  flightFrameMs: 1000 / 12,
  flightAt: 2075,
  impactAt: 2975,
  duration: 3315,
});

const creatures = Object.freeze({
  'Fire-11': Object.freeze({ key: 'xineoph', nativeFacing: 'right', pose: 'wing' }),
  'Water-9': Object.freeze({ key: 'pacific', nativeFacing: 'left', pose: 'tail' }),
});

/** Approved orange effects contain no baked caster. The original alpha layer
 * keeps the generated color revision inside the approved sprite silhouette. */
export const XINEOPH_FORMATION_SHEET = Object.freeze({
  asset: 'xineophOrangeFormation', alphaMaskAsset: 'xineophFormationMask',
  sourceWidth: 1254, sourceHeight: 1254, columns: 4, rows: 4,
  displayScale: 1, anchor: Object.freeze({ x: .5, y: .5 }),
  frameRects: Object.freeze(Array.from({ length: 16 }, (_, frame) => {
    const col = frame % 4, row = Math.floor(frame / 4);
    const x = Math.round(col * 1254 / 4), y = Math.round(row * 1254 / 4);
    return Object.freeze({ x, y, w: Math.round((col + 1) * 1254 / 4) - x,
      h: Math.round((row + 1) * 1254 / 4) - y });
  })),
  animations: Object.freeze({ fire: Object.freeze([2, 3, 4, 5, 6, 7, 8, 7]) }),
  releaseOffset: Object.freeze({ x: 231.17850570482148, y: -172.67942583732057 }),
});

/** Match the approved draft's floor-level charge rising into the phoenix. */
export function getXineophFormation(elapsed) {
  const time = Math.max(0, elapsed), progress = Math.max(0, Math.min(1, (time - 1500) / 200));
  const charge = XINEOPH_FORMATION_SHEET.animations.fire;
  const frame = time < 250 ? 0 : time < 500 ? 1
    : time < 1500 ? charge[Math.floor((time - 500) / CREATURE_TIMING.chargeFrameMs) % charge.length]
      : time < 1600 ? 9 : time < 1700 ? 10 : time < 1825 ? 12 : time < 1950 ? 13 : 14;
  return { frame, offset: { x: 90, y: -120 - 50 * progress }, size: 260 + 20 * progress };
}

export function getCreatureAnimation(spellId) {
  return typeof spellId === 'string' && Object.hasOwn(creatures, spellId) ? creatures[spellId] : null;
}

/** Both creatures charge, form in two poses, then launch after three accents. */
export function getCreatureMoment(elapsed, { pose = 'wing' } = {}) {
  const time = Math.max(0, elapsed);
  const emptyPoses = { creaturePose: 0, wingPose: 0, tailPose: 0, formationPose: 0 };
  if (time < CREATURE_TIMING.flightAt) {
    const actorFrame = time < CREATURE_TIMING.windupEnd / 2 ? 0 : time < CREATURE_TIMING.windupEnd ? 1
      : time < CREATURE_TIMING.releaseAt + CREATURE_TIMING.formationFrameMs ? 2
        : time < CREATURE_TIMING.formationEnd ? 3
          : time < CREATURE_TIMING.formationEnd + CREATURE_TIMING.wingFrameMs ? 4
            : time < CREATURE_TIMING.formationEnd + CREATURE_TIMING.wingFrameMs * 2 ? 5 : 6;
    const forming = time >= CREATURE_TIMING.releaseAt && time < CREATURE_TIMING.formationEnd;
    const creaturePose = time >= CREATURE_TIMING.formationEnd ? actorFrame - 3 : 0;
    const stage = time < CREATURE_TIMING.windupEnd ? 'windup' : time < CREATURE_TIMING.releaseAt ? 'linger'
      : forming ? 'forming' : [`${pose}-up`, `${pose}-middle`, `${pose}-down`][creaturePose - 1];
    const chargeSequenceFrame = stage === 'linger'
      ? Math.floor((time - CREATURE_TIMING.windupEnd) / CREATURE_TIMING.chargeFrameMs) : null;
    return { phase: 'casting', stage, actorFrame, creaturePose,
      wingPose: pose === 'wing' ? creaturePose : 0, tailPose: pose === 'tail' ? creaturePose : 0,
      formationPose: forming ? actorFrame - 1 : 0,
      effectArcs: creaturePose === 3,
      lightBlades: pose === 'wing' && creaturePose === 3,
      ...(chargeSequenceFrame === null ? {} : { chargeSequenceFrame, chargeFrame: chargeSequenceFrame % 8 }) };
  }
  if (time < CREATURE_TIMING.impactAt) {
    const sequenceFrame = Math.floor((time - CREATURE_TIMING.flightAt) / CREATURE_TIMING.flightFrameMs);
    return { phase: 'projectile', stage: 'flight', actorFrame: null, ...emptyPoses,
      sequenceFrame, projectileFrame: 15 + sequenceFrame % 5,
      progress: (time - CREATURE_TIMING.flightAt) / (CREATURE_TIMING.impactAt - CREATURE_TIMING.flightAt),
      effectArcs: true,
      lightBlades: pose === 'wing' };
  }
  if (time < CREATURE_TIMING.duration) {
    const hitTime = time - CREATURE_TIMING.impactAt;
    return { phase: 'impact', stage: hitTime < 210 ? 'quick-hit' : 'impact-fade', actorFrame: null,
      ...emptyPoses, hitTime, hitIndex: Math.min(3, Math.floor(hitTime / 85)), effectArcs: false, lightBlades: false };
  }
  return { phase: 'complete', stage: 'complete', actorFrame: null, ...emptyPoses, effectArcs: false, lightBlades: false };
}
