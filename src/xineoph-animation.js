/** Presentation timing only; the battle engine remains the owner of damage. */
export const XINEOPH_TIMING = Object.freeze({
  windupEnd: 500,
  releaseAt: 1500,
  formationEnd: 1700,
  wingFrameMs: 125,
  chargeFrameMs: 62.5,
  flightFrameMs: 1000 / 12,
  flightAt: 2075,
  impactAt: 2975,
  duration: 3315,
});

/** The approved charge, formation and three wing poses precede one flight. */
export function getXineophMoment(elapsed) {
  const time = Math.max(0, elapsed);
  if (time < XINEOPH_TIMING.flightAt) {
    const actorFrame = time < XINEOPH_TIMING.windupEnd / 2 ? 0 : time < XINEOPH_TIMING.windupEnd ? 1
      : time < XINEOPH_TIMING.releaseAt ? 2 : time < XINEOPH_TIMING.formationEnd ? 3
        : time < XINEOPH_TIMING.formationEnd + XINEOPH_TIMING.wingFrameMs ? 4
          : time < XINEOPH_TIMING.formationEnd + XINEOPH_TIMING.wingFrameMs * 2 ? 5 : 6;
    const stage = actorFrame < 2 ? 'windup' : actorFrame === 2 ? 'linger'
      : actorFrame === 3 ? 'forming' : ['wing-up', 'wing-middle', 'wing-down'][actorFrame - 4];
    const chargeSequenceFrame = stage === 'linger'
      ? Math.floor((time - XINEOPH_TIMING.windupEnd) / XINEOPH_TIMING.chargeFrameMs) : null;
    return { phase: 'casting', stage, actorFrame, wingPose: Math.max(0, actorFrame - 3), lightBlades: actorFrame === 6,
      ...(chargeSequenceFrame === null ? {} : { chargeSequenceFrame, chargeFrame: chargeSequenceFrame % 8 }) };
  }
  if (time < XINEOPH_TIMING.impactAt) {
    const sequenceFrame = Math.floor((time - XINEOPH_TIMING.flightAt) / XINEOPH_TIMING.flightFrameMs);
    return { phase: 'projectile', stage: 'flight', actorFrame: null,
      sequenceFrame, projectileFrame: [7, 8, 9][sequenceFrame % 3],
      progress: (time - XINEOPH_TIMING.flightAt) / (XINEOPH_TIMING.impactAt - XINEOPH_TIMING.flightAt), lightBlades: true };
  }
  if (time < XINEOPH_TIMING.duration) {
    const hitTime = time - XINEOPH_TIMING.impactAt;
    return { phase: 'impact', stage: hitTime < 210 ? 'quick-hit' : 'impact-fade', actorFrame: null,
      hitTime, hitIndex: Math.min(3, Math.floor(hitTime / 85)), lightBlades: false };
  }
  return { phase: 'complete', stage: 'complete', actorFrame: null, lightBlades: false };
}
