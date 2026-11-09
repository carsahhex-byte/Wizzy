import { COMBAT_ANIMATION_SHEETS } from './assets.546c1b22a293.js';
import { preloadAnimationSheet, createAnimationSprite, paintAnimationFrame, hideAnimationSprite } from './animation-sprites.426185d0bae4.js';

const FEET = [{ x: 236, y: 439 }, { x: 788, y: 439 }];
const FRAME_MS = 125;
const FORMATION_MS = 500;
const ACTIVATION_MS = 1500;
const FIZZLE_MS = 500;
const RETRY_MS = 2500;

/** Persistent, cosmetic ground rings. The host owns Aura duration and combat state. */
export function createAuraAnimator({ root } = {}) {
  if (!root?.append) throw new Error('Aura animation needs the persistent battle scene.');
  const document = root.ownerDocument;
  const view = document.defaultView;
  const sheet = COMBAT_ANIMATION_SHEETS.aura;
  const frames = sheet?.animations?.aura;
  const media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => Boolean(media?.matches);
  const now = () => view.performance?.now?.() ?? Date.now();
  const element = document.createElement('div');
  element.className = 'aura-animation-layer';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1', display: 'none' });
  element.hidden = true;
  const rings = FEET.map((point, index) => {
    const node = createAnimationSprite(document, 'aura-animation-ring');
    node.dataset.auraPlayer = String(index);
    node.dataset.phase = 'hidden';
    node.dataset.auraTurns = '0';
    element.append(node);
    return { index, point, node, turns: 0, mode: 'hidden', started: null };
  });
  root.append(element);

  let current = null;
  let visible = true;
  let hiddenAt = null;
  let generation = 0;
  let waitingGeneration = -1;
  let waitingImage = null;
  let request = 0;
  let sequence = 0;
  const seen = new Set();
  let loadStatus = sheet && frames?.length >= 16 ? 'idle' : 'unavailable';
  let imageReady = null;
  let retryAt = 0;
  let recovering = false;
  let loadAttempt = 0;
  element.dataset.loadState = loadStatus;

  function loadImage() {
    recovering = loadStatus === 'failed';
    loadStatus = 'loading';
    element.dataset.loadState = loadStatus;
    element.dataset.loadAttempt = String(++loadAttempt);
    // The shared loader removes failed cache entries, including timed-out images
    // whose underlying browser request may have since completed and been cached.
    imageReady = preloadAnimationSheet(sheet).catch(() => false).then(loaded => {
      loadStatus = loaded ? 'ready' : 'failed';
      element.dataset.loadState = loadStatus;
      retryAt = loaded ? 0 : now() + RETRY_MS;
      recovering = false;
      return loaded;
    });
  }

  function call(callback, result) {
    try { callback?.(result); }
    catch (error) { view.setTimeout(() => { throw error; }, 0); }
  }
  const detail = (job, extra = {}) => ({ key: job.key, casterIndex: job.casterIndex, ...extra });
  function impact(job, extra = {}) {
    if (job.done || job.impacted) return;
    job.impacted = true;
    call(job.onImpact, detail(job, extra));
  }
  function finish(job, { settle = true, cancelled = false, skipped = false } = {}) {
    if (!job || job.done) return;
    if (settle) impact(job, { cancelled, skipped });
    if (job.done) return; // The impact callback may reset or replace the duel.
    job.done = true;
    if (current === job) {
      current = null;
      delete element.dataset.animationKey;
      const ring = rings[job.casterIndex];
      if (ring) {
        ring.mode = cancelled && !ring.turns ? 'hidden' : 'loop';
        ring.started = job.started === null ? null : job.started + FORMATION_MS;
      }
    }
    const result = detail(job, { cancelled, skipped });
    if (settle) call(job.onComplete, result);
    job.resolve(result);
  }
  function stopFrames() {
    if (request) view.cancelAnimationFrame(request);
    request = 0;
  }
  function hide(ring) {
    hideAnimationSprite(ring.node);
    ring.node.dataset.phase = 'hidden';
  }
  function refreshLayer() {
    const showing = visible && rings.some(ring => !ring.node.hidden);
    element.hidden = !showing;
    element.style.display = showing ? 'block' : 'none';
  }
  function paint(ring, index, phase) {
    if (!visible || loadStatus !== 'ready') { hide(ring); return; }
    const frame = frames[index];
    if (ring.node.hidden || ring.node.dataset.frame !== String(frame)) {
      paintAnimationFrame(ring.node, sheet, frame, ring.point);
    }
    ring.node.dataset.phase = phase;
  }
  function hasWork() {
    return current !== null || rings.some(ring => ring.mode !== 'hidden');
  }
  function ensureLoaded({ allowRetry = false } = {}) {
    if (loadStatus === 'ready') return true;
    if (!hasWork()) return false;
    const failedBefore = loadStatus === 'failed' || recovering;
    if (loadStatus === 'idle' || loadStatus === 'failed' && allowRetry && now() >= retryAt) loadImage();
    // Once a request has failed, recovery is cosmetic and must not hold another
    // action while the browser retries or finishes its cached image request.
    if (failedBefore && current) finish(current, { skipped: true });
    if (loadStatus === 'failed' || loadStatus === 'unavailable') {
      if (current) finish(current, { skipped: true });
      for (const ring of rings) hide(ring);
      refreshLayer();
      return false;
    }
    if (waitingGeneration !== generation || waitingImage !== imageReady) {
      const token = generation;
      waitingGeneration = token;
      waitingImage = imageReady;
      imageReady.then(() => {
        if (generation !== token) return;
        schedule();
      });
    }
    return false;
  }
  function staticRings() {
    if (current) finish(current, { skipped: true });
    for (const ring of rings) {
      if (ring.mode === 'fizzle') ring.mode = 'hidden';
      if (ring.mode === 'loop') paint(ring, 4, 'loop');
      else hide(ring);
    }
    refreshLayer();
  }
  function schedule({ allowRetry = false } = {}) {
    if (!visible) return;
    if (reducedMotion() && current) finish(current, { skipped: true });
    if (!ensureLoaded({ allowRetry })) return;
    if (reducedMotion()) { staticRings(); return; }
    if (!request && hasWork()) request = view.requestAnimationFrame(tick);
    else if (!hasWork()) refreshLayer();
  }
  function tick(time) {
    request = 0;
    if (!visible) return;
    if (reducedMotion()) { schedule(); return; }
    const job = current;
    if (job) {
      if (job.started === null) job.started = time;
      const elapsed = Math.max(0, time - job.started);
      if (elapsed >= FORMATION_MS) impact(job);
      if (job.done || current !== job) { schedule(); return; }
      if (elapsed >= ACTIVATION_MS) finish(job);
      else {
        const forming = elapsed < FORMATION_MS;
        paint(rings[job.casterIndex], forming ? Math.floor(elapsed / FRAME_MS)
          : 4 + Math.min(7, Math.floor((elapsed - FORMATION_MS) / FRAME_MS)), forming ? 'forming' : 'lingering');
      }
    }
    for (const ring of rings) {
      if (current?.casterIndex === ring.index) continue;
      if (ring.mode === 'hidden') { hide(ring); continue; }
      if (ring.started === null) ring.started = time;
      const elapsed = Math.max(0, time - ring.started);
      if (ring.mode === 'fizzle') {
        if (elapsed >= FIZZLE_MS) { ring.mode = 'hidden'; hide(ring); }
        else paint(ring, 12 + Math.floor(elapsed / FRAME_MS), 'fizzling');
      } else paint(ring, 4 + Math.floor(elapsed / FRAME_MS) % 8, 'loop');
    }
    refreshLayer();
    schedule();
  }

  function sync(players, { visible: nextVisible = true } = {}) {
    const showing = Boolean(nextVisible);
    if (visible && !showing) {
      hiddenAt = now();
      stopFrames();
      for (const ring of rings) hide(ring);
    } else if (!visible && showing && hiddenAt !== null) {
      const paused = Math.max(0, now() - hiddenAt);
      if (current && current.started !== null) current.started += paused;
      for (const ring of rings) if (ring.started !== null) ring.started += paused;
      hiddenAt = null;
    }
    visible = showing;
    for (const ring of rings) {
      const turns = Math.max(0, Number(players?.[ring.index]?.auraTurns) || 0);
      ring.node.dataset.auraTurns = String(turns);
      if (current?.casterIndex === ring.index) {
        // The host deliberately holds the old 0-turn UI until the impact callback.
        if (turns > 0 || current.impacted) ring.turns = turns;
        continue;
      }
      const hadTurns = ring.turns > 0;
      ring.turns = turns;
      if (turns > 0) {
        if (ring.mode !== 'loop') { ring.mode = 'loop'; ring.started = null; }
      } else if (hadTurns || ring.mode === 'loop') {
        ring.mode = reducedMotion() ? 'hidden' : 'fizzle';
        ring.started = null;
      }
    }
    refreshLayer();
    schedule({ allowRetry: true });
  }

  function activate({ key, casterIndex, onImpact, onComplete } = {}) {
    key = String(key ?? `aura:${++sequence}`);
    if (current?.key === key) return current.promise;
    if (seen.has(key)) return Promise.resolve({ key, casterIndex, duplicate: true });
    if (current) finish(current, { cancelled: true, settle: false });
    stopFrames();
    generation += 1;
    seen.add(key);
    const job = { key, casterIndex, onImpact, onComplete, started: null, impacted: false, done: false };
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    current = job;
    element.dataset.animationKey = key;
    if (![0, 1].includes(casterIndex)) { finish(job, { skipped: true }); return job.promise; }
    rings[casterIndex].mode = 'loop';
    rings[casterIndex].started = null;
    schedule({ allowRetry: true });
    return job.promise;
  }

  function reset({ settle = false } = {}) {
    generation += 1;
    waitingGeneration = -1;
    waitingImage = null;
    stopFrames();
    if (current) finish(current, { cancelled: true, settle });
    current = null;
    seen.clear();
    delete element.dataset.animationKey;
    for (const ring of rings) {
      ring.turns = 0;
      ring.mode = 'hidden';
      ring.started = null;
      ring.node.dataset.auraTurns = '0';
      hide(ring);
    }
    refreshLayer();
  }

  function motionChanged() {
    stopFrames();
    schedule({ allowRetry: true });
  }
  if (media?.addEventListener) media.addEventListener('change', motionChanged);
  else media?.addListener?.(motionChanged);

  return { element, sync, activate, reset, isActivating: () => current !== null };
}
