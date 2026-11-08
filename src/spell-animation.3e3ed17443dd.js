import { ASSETS, SPELL_ANIMATION_SHEETS } from './assets.263d5388516b.js';
import { getSpellVisual } from './spell-visuals.ffab9b18cbbf.js';

const imageLoads = new Map();
function preload(asset) {
  if (imageLoads.has(asset)) return imageLoads.get(asset);
  const source = ASSETS[asset];
  if (!source || typeof Image !== 'function') return Promise.resolve(false);
  const promise = new Promise(resolve => {
    const image = new Image();
    let finished = false;
    const timer = setTimeout(() => finish(false), 4000);
    function finish(success) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(success);
    }
    image.onload = async () => {
      try { if (typeof image.decode === 'function') await image.decode(); } catch {}
      finish(image.naturalWidth > 0);
    };
    image.onerror = () => finish(false);
    image.src = source;
    if (image.complete && image.naturalWidth > 0) {
      Promise.resolve(typeof image.decode === 'function' ? image.decode().catch(() => {}) : null)
        .then(() => finish(true));
    }
  });
  imageLoads.set(asset, promise);
  promise.then(success => { if (!success && imageLoads.get(asset) === promise) imageLoads.delete(asset); });
  return promise;
}

const actorSheetNames = { 'simple-cast': 'simpleCast', 'large-cast': 'largeCast', shield: 'elementalShield', 'power-up': 'firePowerUp' };
const feet = [{ x: 236, y: 450 }, { x: 788, y: 450 }];
const clamp = value => Math.min(1, Math.max(0, value));
const interpolate = (start, end, amount) => start + (end - start) * amount;
const motionPoint = (start, control, end, amount) => ({
  x: (1 - amount) ** 2 * start.x + 2 * (1 - amount) * amount * control.x + amount ** 2 * end.x,
  y: (1 - amount) ** 2 * start.y + 2 * (1 - amount) * amount * control.y + amount ** 2 * end.y,
});
const saveProperty = (node, name) => ({ value: node.style.getPropertyValue(name), priority: node.style.getPropertyPriority(name) });
function restoreProperty(node, name, saved) {
  if (saved.value) node.style.setProperty(name, saved.value, saved.priority);
  else node.style.removeProperty(name);
}

/** Cosmetic-only spell playback. Combat state and saved effects stay in the host. */
export function createSpellAnimator({ root, scene } = {}) {
  root ||= scene?.element || scene;
  if (!root?.append) throw new Error('Spell animation needs the persistent battle scene.');
  const document = root.ownerDocument;
  const view = document.defaultView;
  const element = document.createElement('div');
  element.className = 'spell-animation-layer';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '4', display: 'none' });
  element.hidden = true;
  function sprite(className) {
    const node = document.createElement('span');
    node.className = className;
    Object.assign(node.style, { position: 'absolute', left: '0', top: '0', display: 'none', overflow: 'hidden',
      backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none' });
    node.hidden = true;
    element.append(node);
    return node;
  }
  const actor = sprite('spell-animation-actor');
  const projectile = sprite('spell-projectile');
  const impact = sprite('spell-impact');
  root.append(element);
  const seen = new Set();
  let current = null;
  let generation = 0;
  let frameRequest = 0;
  const reducedMotion = () => Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // Decode in the background while the player builds a deck or opens a duel.
  for (const sheet of Object.values(SPELL_ANIMATION_SHEETS)) preload(sheet.asset);

  function hideNode(node) { node.hidden = true; node.style.display = 'none'; }
  function showFrame(node, sheet, frame, point, { size = 1, mirror = false, waterTint = false } = {}) {
    const width = sheet.sourceWidth / sheet.columns * sheet.displayScale * size;
    const height = sheet.sourceHeight / sheet.rows * sheet.displayScale * size;
    const anchor = sheet.frameAnchors[frame] || { x: .5, y: .5 };
    const column = frame % sheet.columns;
    const row = Math.floor(frame / sheet.columns);
    Object.assign(node.style, {
      display: 'block', width: `${width}px`, height: `${height}px`,
      backgroundImage: `url("${ASSETS[sheet.asset]}")`,
      backgroundSize: `${width * sheet.columns}px ${height * sheet.rows}px`,
      backgroundPosition: `${-column * width}px ${-row * height}px`,
      transformOrigin: `${anchor.x * width}px ${anchor.y * height}px`,
      transform: `translate(${Math.round(point.x - anchor.x * width)}px, ${Math.round(point.y - anchor.y * height)}px)${mirror ? ' scaleX(-1)' : ''}`,
      filter: waterTint ? 'hue-rotate(155deg) saturate(1.25)' : '',
    });
    node.hidden = false;
    node.dataset.frame = String(frame);
    node.dataset.asset = sheet.asset;
    node.dataset.logicalX = String(Math.round(point.x));
    node.dataset.logicalY = String(Math.round(point.y));
  }
  function detail(job, extra = {}) { return { key: job.key, spellId: job.spellId, casterIndex: job.casterIndex, ...extra }; }
  function call(callback, value) {
    try { callback?.(value); }
    catch (error) { view.setTimeout(() => { throw error; }, 0); }
  }
  function deliverImpact(job, extra = {}) {
    if (job.impacted || job.done) return;
    job.impacted = true;
    call(job.onImpact, detail(job, extra));
  }
  function hitFlash(job, visible) {
    if (!job.targetSprite || job.flash === visible) return;
    job.flash = visible;
    if (visible) {
      job.target.dataset.spellHit = 'true';
      job.targetSprite.style.filter = 'brightness(1.4) sepia(1) saturate(8) hue-rotate(-45deg)';
    } else {
      if (job.oldHit === undefined) delete job.target.dataset.spellHit;
      else job.target.dataset.spellHit = job.oldHit;
      restoreProperty(job.targetSprite, 'filter', job.targetFilter);
    }
  }
  function restoreStanding(job) {
    if (job.casterSprite && job.casterVisibility) restoreProperty(job.casterSprite, 'visibility', job.casterVisibility);
    hitFlash(job, false);
  }
  function finish(job, { cancelled = false, settle = true, skipped = false } = {}) {
    if (job.done) return;
    if (settle) deliverImpact(job, { cancelled, skipped });
    if (job.done) return; // An impact callback may replace or hide the duel.
    job.done = true;
    if (current === job) {
      generation += 1;
      if (frameRequest) view.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      restoreStanding(job);
      current = null;
      element.dataset.phase = cancelled ? 'cancelled' : 'complete';
      element.hidden = true;
      element.style.display = 'none';
      for (const node of [actor, projectile, impact]) hideNode(node);
      delete root.dataset.spellAnimating;
    }
    const result = detail(job, { cancelled, skipped });
    if (settle) call(job.onComplete, result);
    job.resolve(result);
  }
  function cancel({ settle = true } = {}) {
    if (current) finish(current, { cancelled: true, settle });
  }

  function play({ key, spellId, casterIndex, onImpact, onComplete } = {}) {
    key = String(key ?? `${spellId}:${casterIndex}`);
    if (current?.key === key) return current.promise;
    if (seen.has(key)) return Promise.resolve({ key, spellId, casterIndex, duplicate: true });
    // A replacement owns the screen now; do not let callbacks from the old
    // presentation release the replacement's held stats or action lock.
    cancel({ settle: false });
    seen.add(key);
    const visual = getSpellVisual(spellId);
    const job = { key, spellId, casterIndex, onImpact, onComplete, impacted: false, done: false, flash: false };
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    current = job;
    Object.assign(element.dataset, { animationKey: key, spellAnimation: visual?.kind || 'none',
      spellId: String(spellId ?? ''), casterIndex: String(casterIndex ?? ''), phase: 'loading' });
    if (!visual || ![0, 1].includes(casterIndex) || reducedMotion()) {
      finish(job, { skipped: true });
      return job.promise;
    }
    const type = visual.element.toLowerCase();
    const sheet = visual.kind === 'basic-attack'
      ? SPELL_ANIMATION_SHEETS[type === 'fire' ? 'basicAttack' : 'simpleCast']
      : SPELL_ANIMATION_SHEETS[actorSheetNames[visual.kind]];
    const frames = sheet?.animations[type];
    const basic = SPELL_ANIMATION_SHEETS.basicAttack;
    const large = SPELL_ANIMATION_SHEETS.largeProjectiles;
    if (!sheet || !frames?.length || visual.damaging && (!basic || visual.kind === 'large-cast' && !large)) {
      finish(job, { skipped: true });
      return job.promise;
    }
    const frameMs = visual.kind === 'shield' ? 125 : visual.kind === 'power-up' ? 130 : 105;
    const actorDuration = frames.length * frameMs;
    const release = visual.kind === 'large-cast' ? actorDuration
      : visual.kind === 'basic-attack' && type === 'fire' ? frameMs * 2 : frameMs * 4;
    const arrival = visual.damaging ? release + (visual.kind === 'large-cast' ? 940 : 560)
      : frameMs * (visual.kind === 'power-up' ? 5 : 4);
    const duration = visual.damaging ? Math.max(actorDuration, arrival + 340) : actorDuration;
    const point = feet[casterIndex];
    const targetPoint = { x: feet[1 - casterIndex].x, y: 370 };
    const forward = casterIndex === 0 ? 1 : -1;
    const casterType = casterIndex === 0 ? 'fire' : 'water';
    job.caster = root.querySelector(`[data-arena-wizard="${casterType}"]`);
    job.target = root.querySelector(`[data-arena-wizard="${casterIndex === 0 ? 'water' : 'fire'}"]`);
    job.casterSprite = job.caster?.querySelector('.wizard-sprite');
    job.targetSprite = job.target?.querySelector('.wizard-sprite');
    job.casterVisibility = job.casterSprite ? saveProperty(job.casterSprite, 'visibility') : null;
    job.targetFilter = job.targetSprite ? saveProperty(job.targetSprite, 'filter') : null;
    job.oldHit = job.target?.dataset.spellHit;
    Object.assign(element.dataset, { targetIndex: String(1 - casterIndex), frame: String(frames[0]) });
    root.dataset.spellAnimating = 'true';
    const needed = [sheet.asset];
    if (visual.damaging) needed.push(basic.asset);
    if (visual.kind === 'large-cast') needed.push(large.asset);
    const requestGeneration = generation;
    Promise.all([...new Set(needed)].map(preload)).then(loaded => {
      if (current !== job || job.done || requestGeneration !== generation) return;
      if (loaded.some(value => !value) || reducedMotion()) { finish(job, { skipped: true }); return; }
      element.hidden = false;
      element.style.display = 'block';
      if (job.casterSprite) job.casterSprite.style.visibility = 'hidden';
      let start = null;
      function tick(time) {
        frameRequest = 0;
        if (current !== job || job.done || requestGeneration !== generation) return;
        if (reducedMotion()) { finish(job, { skipped: true }); return; }
        if (start === null) start = time;
        const elapsed = Math.max(0, time - start);
        if (elapsed >= duration) { finish(job); return; }
        const frame = frames[Math.min(frames.length - 1, Math.floor(elapsed / frameMs))];
        showFrame(actor, sheet, frame, point, { mirror: (type === 'fire') !== (casterIndex === 0) });
        actor.dataset.element = type;
        element.dataset.frame = String(frame);
        element.dataset.phase = elapsed < release || !visual.damaging ? 'casting' : elapsed < arrival ? 'projectile' : 'impact';
        if (visual.damaging && elapsed >= release && elapsed < arrival) {
          const progress = clamp((elapsed - release) / (arrival - release));
          if (visual.kind === 'large-cast') {
            const sequence = large.animations[type];
            const flightFrame = sequence[Math.floor((elapsed - release) / 105) % sequence.length];
            let position;
            if (type === 'fire') {
              position = motionPoint({ x: casterIndex === 0 ? 160 : 864, y: -150 },
                { x: casterIndex === 0 ? 200 : 824, y: 500 }, targetPoint, progress);
            } else position = { x: interpolate(casterIndex === 1 ? 1150 : -126, targetPoint.x, progress), y: interpolate(360, 370, progress) };
            showFrame(projectile, large, flightFrame, position, { mirror: (type === 'fire') !== (casterIndex === 0) });
          } else {
            const sequence = basic.animations.projectile;
            const flightFrame = sequence[Math.floor((elapsed - release) / 95) % sequence.length];
            showFrame(projectile, basic, flightFrame, {
              x: interpolate(point.x + forward * 65, targetPoint.x, progress),
              y: interpolate(370, targetPoint.y, progress),
            }, { size: visual.kind === 'basic-attack' ? .9 : 1.15, mirror: forward < 0, waterTint: type === 'water' });
          }
          projectile.dataset.element = type;
        } else hideNode(projectile);
        if (elapsed >= arrival) {
          deliverImpact(job);
          if (job.done || current !== job) return;
          if (visual.damaging) {
            hitFlash(job, elapsed < arrival + 210);
            const sequence = basic.animations.impact;
            const index = Math.min(sequence.length - 1, Math.floor((elapsed - arrival) / 85));
            showFrame(impact, basic, sequence[index], targetPoint,
              { size: visual.kind === 'large-cast' ? 1.7 : 1, waterTint: type === 'water' });
          }
        } else hideNode(impact);
        frameRequest = view.requestAnimationFrame(tick);
      }
      frameRequest = view.requestAnimationFrame(tick);
    });
    return job.promise;
  }

  return { element, play, cancel, isPlaying: () => current !== null };
}
