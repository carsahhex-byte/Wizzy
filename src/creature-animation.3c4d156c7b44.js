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
