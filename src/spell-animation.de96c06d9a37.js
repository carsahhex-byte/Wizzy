import { COMBAT_ANIMATION_SHEETS, SPELL_ANIMATION_SHEETS } from './assets.f2b415fa45e6.js';
import { getSpellVisual } from './spell-visuals.1295f8570cfc.js';
import { preloadAnimationSheet, createAnimationSprite, paintAnimationFrame, hideAnimationSprite } from './animation-sprites.3a3bc963155a.js';

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
  element.append(actor, projectile, impact);
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
      hitFlash(job, false);
      for (const node of [actor, projectile, impact]) hideAnimationSprite(node);
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

  function play({ key, spellId = null, casterIndex, kind, onImpact, onComplete } = {}) {
    key = String(key ?? `${kind || spellId}:${casterIndex}`);
    if (current?.key === key) return current.promise;
    if (seen.has(key)) return Promise.resolve({ key, spellId, casterIndex, duplicate: true });
    // Replacement playback must not release the replacement's presentation lock.
    cancel({ settle: false });
    seen.add(key);
    const visual = kind === 'enhancement'
      ? { kind, element: casterIndex === 0 ? 'Fire' : 'Water', damaging: false }
      : getSpellVisual(spellId);
    const job = { key, spellId, casterIndex, kind: visual?.kind || 'none', onImpact, onComplete,
      done: false, impacted: false, casterHidden: false, flash: false };
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    current = job;
    Object.assign(element.dataset, { animationKey: key, spellAnimation: job.kind, kind: job.kind,
      spellId: String(spellId ?? ''), casterIndex: String(casterIndex ?? ''), phase: 'loading', stage: 'loading' });
    if (!visual || ![0, 1].includes(casterIndex) || reducedMotion()) {
      finish(job, { skipped: true });
      return job.promise;
    }
    const type = visual.element.toLowerCase(), targetType = casterIndex === 0 ? 'water' : 'fire';
    const sheet = COMBAT_ANIMATION_SHEETS[actorSheets[job.kind]];
    const frames = sheet?.animations[type];
    const projectileSheet = COMBAT_ANIMATION_SHEETS[job.kind === 'large-cast' ? 'largeProjectiles' : 'basicProjectiles'];
    const projectileFrames = projectileSheet?.animations[type];
    const hitSheet = SPELL_ANIMATION_SHEETS.basicAttack;
    const hitFrames = hitSheet?.animations.impact;
    if (frames?.length !== 16 || visual.damaging && (projectileFrames?.length !== 16 || hitFrames?.length !== 4)) {
      finish(job, { skipped: true });
      return job.promise;
    }
    const duration = visual.damaging ? HIT_END : ACTOR_END;
    const impactAt = visual.damaging ? ARRIVAL : 500;
    const mirror = (type === 'fire') !== (casterIndex === 0);
    const point = FEET[casterIndex], targetPoint = { x: FEET[1 - casterIndex].x, y: 370 };
    const offset = releaseOffsets[job.kind]?.[type] || { x: 0, y: 0 };
    const launch = job.kind === 'large-cast'
      ? type === 'fire' ? { x: casterIndex === 0 ? 160 : 864, y: -150 } : { x: casterIndex === 1 ? 1150 : -126, y: 360 }
      : { x: point.x + (mirror ? -offset.x : offset.x), y: point.y + offset.y };
    job.caster = root.querySelector(`[data-arena-wizard="${casterIndex === 0 ? 'fire' : 'water'}"]`);
    job.target = root.querySelector(`[data-arena-wizard="${targetType}"]`);
    job.casterSprite = job.caster?.querySelector('.wizard-sprite');
    job.targetSprite = job.target?.querySelector('.wizard-sprite');
    Object.assign(element.dataset, { targetIndex: String(1 - casterIndex), element: type, targetElement: targetType,
      frame: String(frames[0]), duration: String(duration), impactAt: String(impactAt), releaseAt: String(RELEASE), lingerMs: '1000' });
    root.dataset.spellAnimating = 'true';
    const needed = visual.damaging ? [sheet, projectileSheet, hitSheet] : [sheet];
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
          const projectileVisibleAt = job.kind === 'large-cast' ? 1000 : RELEASE;
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
              { size: job.kind === 'large-cast' ? 1.7 : 1 });
            impact.style.filter = type === 'water' ? 'hue-rotate(155deg) saturate(1.25)' : '';
            Object.assign(impact.dataset, { element: type, sequenceFrame: String(index), phase: 'fade' });
            element.dataset.hitFrame = String(hitFrames[index]);
          }
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
