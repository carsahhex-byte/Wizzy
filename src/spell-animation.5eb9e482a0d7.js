import { COMBAT_ANIMATION_SHEETS, SPELL_ANIMATION_SHEETS, CREATURE_ANIMATION_SHEETS, EARTH_ANIMATION_SHEETS, GOLEM_ANIMATION_SHEETS } from './assets.16c339a8ba87.js';
import { getSpellVisual } from './spell-visuals.9db470ce394a.js';
import { preloadAnimationSheet, createAnimationSprite, paintAnimationFrame, hideAnimationSprite } from './animation-sprites.52fb5ae204d4.js';
import { CREATURE_TIMING, getCreatureMoment, getCreatureAnimation } from './creature-animation.3c4d156c7b44.js';
import { getPlayerSchool } from './elements.f91c53cdab44.js';

const FRAME_MS = 125;
const ACTOR_END = 2000;
const RELEASE = 1500;
const ARRIVAL = 2500;
// Original quick hit: standing-model flash, then four 85ms impact frames.
const HIT_FLASH_MS = 210;
const HIT_FRAME_MS = 85;
const HIT_END = ARRIVAL + HIT_FRAME_MS * 4;
const FEET = [{ x: 236, y: 450 }, { x: 788, y: 450 }];
const actorSheets = { 'basic-attack': 'basicAttack', 'simple-cast': 'simpleCast', 'large-cast': 'largeCast',
  shield: 'shield', 'power-up': 'powerUp', enhancement: 'enhancement' };
const TRANSFORMS = new Set(['golem-transform', 'golem-revert']);
const schoolOf = player => getPlayerSchool(player) || '';
const nativeFacing = (sheet, type) => sheet?.facing?.[type] || (type === 'water' || type === 'air' ? 'left' : 'right');
const framesFor = (sheet, type, name) => sheet?.animations?.[type] || sheet?.animations?.[name];
function wizardAt(root, index) {
  const seated = root.querySelector(`[data-arena-seat="${index}"]`);
  return seated?.dataset.arenaSeat === String(index) ? seated
    : root.querySelector(`[data-arena-wizard="${index === 0 ? 'fire' : 'water'}"]`);
}
// Measured white-core offsets in each approved actor's release frame (12).
const releaseOffsets = {
  'basic-attack': { fire: { x: 64.31, y: -51.37 }, water: { x: -61.48, y: -52.58 } },
  'simple-cast': { fire: { x: 63.34, y: -53.59 }, water: { x: -83.91, y: -55.76 } },
};
const lerp = (start, end, amount) => start + (end - start) * amount;
const curve = (start, control, end, amount) => ({
  x: (1 - amount) ** 2 * start.x + 2 * (1 - amount) * amount * control.x + amount ** 2 * end.x,
  y: (1 - amount) ** 2 * start.y + 2 * (1 - amount) * amount * control.y + amount ** 2 * end.y,
});
const property = (node, name) => ({ value: node.style.getPropertyValue(name), priority: node.style.getPropertyPriority(name) });
function restoreProperty(node, name, saved) {
  if (saved.value) node.style.setProperty(name, saved.value, saved.priority);
  else node.style.removeProperty(name);
}
function restoreData(node, name, value) {
  if (value === undefined) delete node.dataset[name];
  else node.dataset[name] = value;
}

/** Persistent visual playback only; combat outcomes are already owned by the host. */
export function createSpellAnimator({ root, scene } = {}) {
  root ||= scene?.element || scene;
  if (!root?.append) throw new Error('Spell animation needs the persistent battle scene.');
  const document = root.ownerDocument, view = document.defaultView;
  const element = document.createElement('div');
  element.className = 'spell-animation-layer';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '4', display: 'none' });
  element.hidden = true;
  const actor = createAnimationSprite(document, 'spell-animation-actor');
  const projectile = createAnimationSprite(document, 'spell-projectile');
  const impact = createAnimationSprite(document, 'spell-impact');
  const targetActor = createAnimationSprite(document, 'spell-hit-actor');
  const afterimages = [45, 90].map((lagMs, index) => {
    const node = createAnimationSprite(document, `spell-projectile-afterimage spell-projectile-afterimage-${index + 1}`);
    node.dataset.lagMs = String(lagMs);
    node.style.opacity = '0';
    return { node, lagMs, opacity: index === 0 ? .22 : .1 };
  });
  element.append(actor, targetActor, afterimages[1].node, afterimages[0].node, projectile, impact);
  root.append(element);
  const seen = new Set();
  let current = null, generation = 0, frameRequest = 0;
  const reducedMotion = () => Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // Load only the actor/effects needed for this playback. Starting the app must
  // not download every combat atlas before the player reaches a battle.

  function detail(job, extra = {}) {
    return { key: job.key, spellId: job.spellId, casterIndex: job.casterIndex, kind: job.kind, ...extra };
  }
  function call(callback, value) {
    try { callback?.(value); }
    catch (error) { view.setTimeout(() => { throw error; }, 0); }
  }
  function hideAfterimages() {
    for (const { node } of afterimages) {
      hideAnimationSprite(node);
      node.style.opacity = '0';
      node.style.filter = '';
      for (const key of ['element', 'frame', 'asset', 'logicalX', 'logicalY', 'sourceRect',
        'contactPlane', 'contactX', 'contactY', 'sourceElapsed', 'phase']) delete node.dataset[key];
    }
    element.dataset.afterimages = '0';
  }
  function deliverImpact(job, extra = {}) {
    if (job.impacted || job.done) return;
    job.impacted = true;
    call(job.onImpact, detail(job, extra));
  }
  function hideStanding(job, target = false) {
    const name = target ? 'target' : 'caster';
    const sprite = job[`${name}Sprite`], wizard = job[name];
    if (!sprite || job[`${name}Hidden`]) return;
    job[`${name}Visibility`] = property(sprite, 'visibility');
    job[`${name}Flag`] = wizard.dataset[target ? 'spellHit' : 'spellCasting'];
    job[`${name}Hidden`] = true;
    sprite.style.visibility = 'hidden';
    wizard.dataset[target ? 'spellHit' : 'spellCasting'] = 'true';
  }
  function restoreStanding(job, target = false) {
    const name = target ? 'target' : 'caster';
    if (!job[`${name}Hidden`]) return;
    job[`${name}Hidden`] = false;
    restoreProperty(job[`${name}Sprite`], 'visibility', job[`${name}Visibility`]);
    restoreData(job[name], target ? 'spellHit' : 'spellCasting', job[`${name}Flag`]);
  }
  function hitFlash(job, visible) {
    if (!job.targetSprite || job.flash === visible) return;
    job.flash = visible;
    if (visible) {
      job.targetFilter = property(job.targetSprite, 'filter');
      job.hitFlag = job.target.dataset.spellHit;
      job.target.dataset.spellHit = 'true';
      job.targetSprite.style.filter = 'brightness(1.4) sepia(1) saturate(8) hue-rotate(-45deg)';
    } else {
      restoreProperty(job.targetSprite, 'filter', job.targetFilter);
      restoreData(job.target, 'spellHit', job.hitFlag);
    }
  }
  function finish(job, { cancelled = false, settle = true, skipped = false } = {}) {
    if (job.done) return;
    if (settle) deliverImpact(job, { cancelled, skipped });
    if (job.done) return; // Impact callbacks may hide or replace this duel.
    job.done = true;
    if (current === job) {
      generation += 1;
      if (frameRequest) view.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      restoreStanding(job);
      restoreStanding(job, true);
      hitFlash(job, false);
      hideAfterimages();
      for (const node of [actor, targetActor, projectile, impact]) hideAnimationSprite(node);
      element.dataset.phase = cancelled ? 'cancelled' : 'complete';
      element.dataset.stage = cancelled ? 'cancelled' : 'complete';
      element.hidden = true;
      element.style.display = 'none';
      delete root.dataset.spellAnimating;
      current = null;
    }
    const result = detail(job, { cancelled, skipped });
    if (settle) call(job.onComplete, result);
    job.resolve(result);
  }
  function cancel({ settle = true } = {}) {
    if (current) finish(current, { cancelled: true, settle });
  }

  function play({ key, spellId = null, casterIndex, kind, element: requestedElement, players, golem, onImpact, onComplete } = {}) {
    key = String(key ?? `${kind || spellId}:${casterIndex}`);
    if (current?.key === key) return current.promise;
    if (seen.has(key)) return Promise.resolve({ key, spellId, casterIndex, duplicate: true });
    // Replacement playback must not release the replacement's presentation lock.
    cancel({ settle: false });
    seen.add(key);
    const casterNode = wizardAt(root, casterIndex);
    const targetNode = wizardAt(root, 1 - casterIndex);
    const requestedType = String(requestedElement || schoolOf(players?.[casterIndex]) || casterNode?.dataset.element
      || casterNode?.dataset.arenaWizard || (casterIndex === 0 ? 'fire' : 'water')).toLowerCase();
    const transforming = TRANSFORMS.has(kind), striking = kind === 'golem-strike';
    const visual = kind === 'enhancement' || transforming || striking
      ? { kind, element: requestedType, damaging: striking }
      : getSpellVisual(spellId);
    const job = { key, spellId, casterIndex, kind: visual?.kind || 'none', onImpact, onComplete,
      done: false, impacted: false, casterHidden: false, flash: false };
    const creature = kind === 'enhancement' || transforming || striking ? null : getCreatureAnimation(spellId);
    const customCreature = creature !== null;
    const creatureSheets = customCreature ? CREATURE_ANIMATION_SHEETS[creature.key] : null;
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    current = job;
    hideAfterimages();
    Object.assign(element.dataset, { animationKey: key, spellAnimation: job.kind, kind: job.kind,
      spellId: String(spellId ?? ''), casterIndex: String(casterIndex ?? ''), phase: 'loading', stage: 'loading',
      customAnimation: creature?.key || '', creaturePose: '', wingPose: '', tailPose: '', formationPose: '', effectArcs: 'false', lightBlades: 'false',
      chargeFrame: '', chargeSequenceFrame: '' });
    if (!visual || ![0, 1].includes(casterIndex) || reducedMotion()) {
      finish(job, { skipped: true });
      return job.promise;
    }
    const type = visual.element.toLowerCase(), targetType = schoolOf(players?.[1 - casterIndex]) || targetNode?.dataset.element
      || targetNode?.dataset.arenaWizard || (casterIndex === 0 ? 'water' : 'fire');
    const isGolem = type === 'earth' && (golem ?? players?.[casterIndex]?.golemActive ?? casterNode?.dataset.form === 'golem');
    const isEarth = type === 'earth' || type === 'air';
    const actionName = striking ? 'largeCast' : actorSheets[job.kind];
    const sheet = transforming ? GOLEM_ANIMATION_SHEETS.transform : customCreature ? creatureSheets?.actor
      : isGolem ? GOLEM_ANIMATION_SHEETS.poses : (isEarth ? EARTH_ANIMATION_SHEETS : COMBAT_ANIMATION_SHEETS)[actionName];
    const frames = transforming ? sheet?.animations[kind === 'golem-transform' ? 'transform' : 'revert']
      : framesFor(sheet, type, isGolem && actionName === 'shield' ? 'powerUp' : actionName);
    const chargeSheet = customCreature ? creatureSheets?.charge : null;
    const chargeFrames = chargeSheet?.animations[type];
    const heavyEarth = type === 'earth' && (job.kind === 'large-cast' || striking);
    const projectileSheet = customCreature ? creatureSheets?.projectile : heavyEarth ? GOLEM_ANIMATION_SHEETS.heavyBoulder
      : (isEarth ? EARTH_ANIMATION_SHEETS : COMBAT_ANIMATION_SHEETS)[job.kind === 'large-cast' ? 'largeProjectiles' : 'basicProjectiles'];
    const projectileFrames = heavyEarth ? [...(projectileSheet?.animations.formation || projectileSheet?.animations.Formation?.frames || []),
      ...(projectileSheet?.animations.flight || projectileSheet?.animations['Rolling flight']?.frames || [])] : projectileSheet?.animations[type];
    const hitSheet = heavyEarth ? projectileSheet : customCreature ? creatureSheets?.impact : SPELL_ANIMATION_SHEETS.basicAttack;
    const hitFrames = heavyEarth ? hitSheet?.animations.impact || hitSheet?.animations['Quick shatter']?.frames : hitSheet?.animations.impact;
    const targetGolem = targetType === 'earth' && (players?.[1 - casterIndex]?.golemActive ?? targetNode?.dataset.form === 'golem');
    const targetSheet = targetGolem ? GOLEM_ANIMATION_SHEETS.poses : null;
    const targetFrames = targetSheet?.animations.hitReaction || targetSheet?.animations.hit;
    if (frames?.length !== (transforming ? 8 : customCreature ? 7 : 16)
      || visual.damaging && (projectileFrames?.length !== (customCreature ? 5 : heavyEarth ? 12 : 16) || hitFrames?.length !== 4)
      || customCreature && chargeFrames?.length !== 8
      || customCreature && !['x', 'y'].every(axis => Number.isFinite(sheet?.releaseOffset?.[axis]))) {
      finish(job, { skipped: true });
      return job.promise;
    }
    const duration = transforming ? 1000 : customCreature ? CREATURE_TIMING.duration : visual.damaging ? HIT_END : ACTOR_END;
    const impactAt = transforming ? duration : customCreature ? CREATURE_TIMING.impactAt : visual.damaging ? ARRIVAL : 500;
    const mirror = customCreature ? creature.nativeFacing !== (casterIndex === 0 ? 'right' : 'left')
      : nativeFacing(sheet, type) !== (casterIndex === 0 ? 'right' : 'left');
    const point = FEET[casterIndex], targetPoint = { x: FEET[1 - casterIndex].x, y: heavyEarth ? FEET[1 - casterIndex].y : 370 };
    const releaseFrame = frames[12], releaseRect = sheet.frameRects?.[releaseFrame]
      || { w: sheet.sourceWidth / sheet.columns, h: sheet.sourceHeight / sheet.rows };
    const releaseAnchor = sheet.frameAnchors?.[releaseFrame] || sheet.anchor || { x: .5, y: .5 };
    const releaseCore = sheet.launchAnchors?.[type] || sheet.launchAnchor;
    const offset = customCreature ? sheet.releaseOffset : releaseCore
      ? { x: (releaseCore.x - releaseAnchor.x) * releaseRect.w * sheet.displayScale,
        y: (releaseCore.y - releaseAnchor.y) * releaseRect.h * sheet.displayScale }
      : releaseOffsets[job.kind]?.[type] || { x: 50, y: -50 };
    const launch = heavyEarth ? { x: casterIndex === 0 ? -180 : 1204, y: point.y } : job.kind === 'large-cast'
      ? type === 'fire' ? { x: casterIndex === 0 ? 160 : 864, y: -150 } : { x: casterIndex === 1 ? 1150 : -126, y: 360 }
      : { x: point.x + (mirror ? -offset.x : offset.x), y: point.y + offset.y };
    job.caster = casterNode;
    job.target = targetNode;
    job.casterSprite = job.caster?.querySelector('.wizard-sprite');
    job.targetSprite = job.target?.querySelector('.wizard-sprite');
    Object.assign(element.dataset, { targetIndex: String(1 - casterIndex), element: type, targetElement: targetType,
      frame: String(frames[0]), duration: String(duration), impactAt: String(impactAt), releaseAt: String(RELEASE), lingerMs: '1000',
      flightAt: String(customCreature ? CREATURE_TIMING.flightAt : RELEASE) });
    root.dataset.spellAnimating = 'true';
    const needed = customCreature ? [sheet, chargeSheet, projectileSheet, hitSheet]
      : visual.damaging ? [sheet, projectileSheet, hitSheet] : [sheet];
    if (visual.damaging && targetSheet) needed.push(targetSheet);
    const requestGeneration = generation;
    Promise.all(needed.map(preloadAnimationSheet)).then(loaded => {
      if (current !== job || job.done || requestGeneration !== generation) return;
      if (loaded.some(success => !success) || reducedMotion()) { finish(job, { skipped: true }); return; }
      element.hidden = false;
      element.style.display = 'block';
      hideStanding(job);
      let start = null;
      function tick(time) {
        frameRequest = 0;
        if (current !== job || job.done || requestGeneration !== generation) return;
        if (reducedMotion()) { finish(job, { skipped: true }); return; }
        if (start === null) { start = time; element.dataset.startedAt = String(time); }
        const elapsed = Math.max(0, time - start);
        element.dataset.elapsed = String(Math.round(elapsed));
        if (elapsed >= duration) { finish(job); return; }

        if (transforming) {
          const localFrame = Math.min(frames.length - 1, Math.floor(elapsed / FRAME_MS));
          paintAnimationFrame(actor, sheet, frames[localFrame], point, { mirror });
          Object.assign(actor.dataset, { element: type, sequenceFrame: String(localFrame), phase: kind });
          Object.assign(element.dataset, { phase: 'transforming', stage: kind, frame: String(frames[localFrame]) });
        } else if (customCreature) {
          const moment = getCreatureMoment(elapsed, { pose: creature.pose });
          Object.assign(element.dataset, { phase: moment.phase, stage: moment.stage,
            creaturePose: moment.creaturePose ? String(moment.creaturePose) : '',
            wingPose: moment.wingPose ? String(moment.wingPose) : '', tailPose: moment.tailPose ? String(moment.tailPose) : '',
            formationPose: moment.formationPose ? String(moment.formationPose) : '', effectArcs: String(moment.effectArcs), lightBlades: String(moment.lightBlades),
            chargeFrame: moment.chargeFrame === undefined ? '' : String(moment.chargeFrame),
            chargeSequenceFrame: moment.chargeSequenceFrame === undefined ? '' : String(moment.chargeSequenceFrame) });
          if (moment.actorFrame !== null) {
            const charge = moment.chargeFrame !== undefined;
            const actorSheet = charge ? chargeSheet : sheet;
            const actorFrame = charge ? chargeFrames[moment.chargeFrame] : frames[moment.actorFrame];
            paintAnimationFrame(actor, actorSheet, actorFrame, point, { mirror });
            Object.assign(actor.dataset, { element: type, sequenceFrame: String(charge ? moment.chargeFrame : moment.actorFrame), phase: moment.stage });
            element.dataset.frame = String(actorFrame);
            hideAfterimages();
            hideAnimationSprite(projectile);
            hideAnimationSprite(impact);
          } else {
            hideAnimationSprite(actor);
            restoreStanding(job);
            if (moment.phase === 'projectile') {
              const control = { x: lerp(launch.x, targetPoint.x, .65), y: targetPoint.y + 50 };
              const position = curve(launch, control, targetPoint, moment.progress);
              const frame = projectileFrames[moment.sequenceFrame % projectileFrames.length];
              paintAnimationFrame(projectile, projectileSheet, frame, position, { mirror });
              Object.assign(projectile.dataset, { element: type, sequenceFrame: String(moment.sequenceFrame), phase: 'flight',
                contactPlane: 'leading-edge', contactX: String(position.x), contactY: String(position.y) });
              for (const { node, lagMs, opacity } of afterimages) {
                const sourceElapsed = Math.max(CREATURE_TIMING.flightAt, elapsed - lagMs);
                const past = getCreatureMoment(sourceElapsed, { pose: creature.pose });
                const pastPoint = curve(launch, control, targetPoint, past.progress);
                const pastFrame = projectileFrames[past.sequenceFrame % projectileFrames.length];
                paintAnimationFrame(node, projectileSheet, pastFrame, pastPoint, { mirror });
                node.style.opacity = String(opacity);
                node.style.filter = '';
                Object.assign(node.dataset, { element: type, phase: 'trail', sourceElapsed: String(sourceElapsed),
                  contactPlane: 'leading-edge', contactX: String(pastPoint.x), contactY: String(pastPoint.y) });
              }
              element.dataset.afterimages = '2';
              element.dataset.frame = String(frame);
              hideAnimationSprite(impact);
            } else {
              hideAfterimages();
              hideAnimationSprite(projectile);
              hitFlash(job, moment.hitTime < HIT_FLASH_MS);
              paintAnimationFrame(impact, hitSheet, hitFrames[moment.hitIndex], targetPoint, { mirror });
              impact.style.filter = '';
              Object.assign(impact.dataset, { element: type, sequenceFrame: String(moment.hitIndex), phase: 'fade' });
              element.dataset.hitFrame = String(hitFrames[moment.hitIndex]);
            }
          }
        } else {
          if (elapsed < ACTOR_END) {
            const localFrame = Math.min(15, Math.floor(elapsed / FRAME_MS));
            paintAnimationFrame(actor, sheet, frames[localFrame], point, { mirror });
            Object.assign(actor.dataset, { element: type, sequenceFrame: String(localFrame),
              phase: localFrame < 4 ? 'windup' : localFrame < 12 ? 'linger' : 'recover' });
            element.dataset.frame = String(frames[localFrame]);
          } else {
            hideAnimationSprite(actor);
            restoreStanding(job);
          }

          if (!visual.damaging) {
            element.dataset.phase = 'casting';
            element.dataset.stage = elapsed < 500 ? 'windup' : elapsed < RELEASE ? 'linger' : 'recover';
          } else {
            element.dataset.phase = elapsed < RELEASE ? 'casting' : elapsed < ARRIVAL ? 'projectile' : 'impact';
            element.dataset.stage = elapsed < 500 ? 'windup' : elapsed < RELEASE ? 'linger' : elapsed < ARRIVAL ? 'flight'
              : elapsed < ARRIVAL + HIT_FLASH_MS ? 'quick-hit' : 'impact-fade';
            // The actor already carries its charged orb. Only large offscreen
            // effects form separately; smaller shots appear on release itself.
            const projectileVisibleAt = job.kind === 'large-cast' || heavyEarth ? 1000 : RELEASE;
            if (elapsed >= projectileVisibleAt && elapsed < ARRIVAL) {
              const localFrame = elapsed < RELEASE ? Math.floor((elapsed - 1000) / FRAME_MS)
                : 4 + Math.floor((elapsed - RELEASE) / FRAME_MS);
              const progress = Math.max(0, Math.min(1, (elapsed - RELEASE) / 1000));
              const position = job.kind === 'large-cast' && type === 'fire'
                ? curve(launch, { x: casterIndex === 0 ? 200 : 824, y: 500 }, targetPoint, progress)
                : { x: lerp(launch.x, targetPoint.x, progress), y: lerp(launch.y, targetPoint.y, progress) };
              paintAnimationFrame(projectile, projectileSheet, projectileFrames[localFrame], position,
                { mirror, size: job.kind === 'simple-cast' ? 1.15 : 1 });
              Object.assign(projectile.dataset, { element: type, sequenceFrame: String(localFrame), phase: elapsed < RELEASE ? 'forming' : 'flight' });
            } else hideAnimationSprite(projectile);

            if (elapsed >= ARRIVAL) {
              const hitTime = elapsed - ARRIVAL;
              const index = Math.min(3, Math.floor(hitTime / HIT_FRAME_MS));
              hitFlash(job, hitTime < HIT_FLASH_MS);
              paintAnimationFrame(impact, hitSheet, hitFrames[index], targetPoint,
                { size: heavyEarth ? 1 : job.kind === 'large-cast' ? 1.7 : 1 });
              impact.style.filter = type === 'water' ? 'hue-rotate(155deg) saturate(1.25)' : '';
              Object.assign(impact.dataset, { element: type, sequenceFrame: String(index), phase: 'fade' });
              element.dataset.hitFrame = String(hitFrames[index]);
            }
          }
        }
        if (visual.damaging && targetSheet && elapsed >= impactAt) {
          hitFlash(job, false);
          hideStanding(job, true);
          const hitIndex = Math.min(3, Math.floor((elapsed - impactAt) / HIT_FRAME_MS));
          paintAnimationFrame(targetActor, targetSheet, targetFrames[hitIndex], FEET[1 - casterIndex], {
            mirror: nativeFacing(targetSheet, targetType) !== (casterIndex === 0 ? 'left' : 'right'),
          });
          Object.assign(targetActor.dataset, { element: targetType, phase: 'quick-hit', sequenceFrame: String(hitIndex) });
        }
        if (elapsed >= impactAt) deliverImpact(job);
        if (current !== job || job.done || requestGeneration !== generation) return;
        frameRequest = view.requestAnimationFrame(tick);
      }
      frameRequest = view.requestAnimationFrame(tick);
    });
    return job.promise;
  }

  return { element, play, cancel, isPlaying: () => current !== null };
}
