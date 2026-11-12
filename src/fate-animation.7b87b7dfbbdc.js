import { preloadAnimationSheet, createAnimationSprite, paintAnimationFrame, hideAnimationSprite } from './animation-sprites.0930dbf02ced.js';

export const FATE_FEEDBACK_SHEET = Object.freeze({
  asset: 'fateFeedbackFx', sourceWidth: 2172, sourceHeight: 724, columns: 3, rows: 1,
  displayScale: .24, anchor: Object.freeze({ x: .5, y: .5 }),
  frameRects: Object.freeze([190, 914, 1638].map(x => Object.freeze({ x, y: 195, w: 345, h: 370 }))),
});
export const FATE_FEEDBACK_TIMING = Object.freeze({ impactAt: 200, duration: 600 });
const FRAMES = Object.freeze({ 'FAT-001': 0, 'FAT-002': 1, 'FAT-003': 2 });

/** Brief dice feedback. This never rolls, applies Fate or changes turn priority. */
export function createFateAnimator({ root, loadSheet = preloadAnimationSheet } = {}) {
  if (!root?.append) throw new Error('Fate feedback needs a battle-board mount.');
  const document = root.ownerDocument, view = document.defaultView;
  const media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => Boolean(media?.matches);
  const element = document.createElement('div');
  element.className = 'fate-feedback-layer'; element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '7', display: 'none' });
  element.hidden = true;
  const glyph = createAnimationSprite(document, 'fate-feedback-glyph');
  const amount = document.createElement('span'); amount.className = 'fate-feedback-amount';
  Object.assign(amount.style, { position: 'absolute', left: '535px', top: '498px', color: '#ffe5a1', font: '900 25px/1 monospace', textShadow: '2px 2px #170c32,-2px -2px #170c32' });
  element.append(glyph, amount); root.append(element);
  let current = null, request = 0, generation = 0, sequence = 0;
  const seen = new Set();
  function call(callback, detail) {
    try { callback?.(detail); } catch (error) { view.setTimeout(() => { throw error; }, 0); }
  }
  const detail = (job, extra = {}) => ({ key: job.key, spellId: job.spellId, casterIndex: job.casterIndex, amount: job.amount, ...extra });
  function impact(job, extra = {}) {
    if (job.done || job.impacted) return;
    job.impacted = true; call(job.onImpact, detail(job, extra));
  }
  function stopFrames() { if (request) view.cancelAnimationFrame(request); request = 0; }
  function hide() {
    hideAnimationSprite(glyph); amount.hidden = true;
    element.hidden = true; element.style.display = 'none';
  }
  function finish(job, { settle = true, cancelled = false, skipped = false } = {}) {
    if (!job || job.done) return;
    if (settle) impact(job, { cancelled, skipped });
    if (job.done) return;
    job.done = true;
    if (current === job) {
      current = null; stopFrames(); hide();
      element.dataset.phase = cancelled ? 'cancelled' : 'complete';
      delete element.dataset.animationKey;
    }
    const result = detail(job, { cancelled, skipped });
    if (settle) call(job.onComplete, result);
    job.resolve(result);
  }
  function paint(job, elapsed) {
    const progress = Math.min(1, Math.max(0, elapsed / 600));
    const opacity = Math.max(0, Math.min(1, elapsed / 80, (600 - elapsed) / 180));
    const pulse = .93 + Math.sin(progress * Math.PI) * .12;
    paintAnimationFrame(glyph, FATE_FEEDBACK_SHEET, FRAMES[job.spellId], { x: 482, y: 516 - 8 * progress }, { size: pulse });
    glyph.style.opacity = String(opacity); amount.style.opacity = String(opacity);
    glyph.dataset.phase = 'fate-feedback'; amount.hidden = false;
    Object.assign(element.dataset, { elapsed: String(Math.round(elapsed)), phase: 'fate-feedback' });
    element.hidden = false; element.style.display = 'block';
  }
  function schedule(job) {
    if (current !== job || job.done) return;
    if (reduced()) { finish(job, { skipped: true }); return; }
    const token = generation;
    request = view.requestAnimationFrame(time => {
      if (token !== generation || current !== job || job.done) return;
      request = 0;
      if (reduced()) { finish(job, { skipped: true }); return; }
      if (document.hidden) { job.lastTime = null; schedule(job); return; }
      if (job.lastTime !== null) job.elapsed += Math.max(0, time - job.lastTime);
      job.lastTime = time;
      if (job.elapsed >= FATE_FEEDBACK_TIMING.impactAt) impact(job);
      if (current !== job || job.done) return;
      if (job.elapsed >= FATE_FEEDBACK_TIMING.duration) { finish(job); return; }
      paint(job, job.elapsed); schedule(job);
    });
  }
  function animate({ key, spellId, casterIndex, amount: delta, onImpact, onComplete } = {}) {
    key = String(key ?? `fate:${++sequence}`);
    if (current?.key === key) return current.promise;
    if (seen.has(key)) return Promise.resolve({ key, spellId, casterIndex, duplicate: true });
    if (current) finish(current, { cancelled: true, settle: false });
    generation += 1; seen.add(key);
    const job = { key, spellId, casterIndex, amount: Number.isFinite(delta) ? delta : spellId === 'FAT-001' ? 4 : spellId === 'FAT-002' ? -4 : 2,
      onImpact, onComplete, elapsed: 0, lastTime: null, impacted: false, done: false };
    job.promise = new Promise(resolve => { job.resolve = resolve; }); current = job;
    Object.assign(element.dataset, { animationKey: key, spellId: String(spellId), casterIndex: String(casterIndex), duration: '600', impactAt: '200', phase: 'loading' });
    amount.textContent = `${job.amount >= 0 ? '+' : '−'}${Math.abs(job.amount)}`;
    if (!Object.hasOwn(FRAMES, spellId) || ![0, 1].includes(casterIndex) || reduced()) { finish(job, { skipped: true }); return job.promise; }
    const token = generation;
    Promise.resolve().then(() => loadSheet(FATE_FEEDBACK_SHEET)).catch(() => false).then(loaded => {
      if (token !== generation || current !== job || job.done) return;
      if (!loaded || reduced()) finish(job, { skipped: true });
      else schedule(job);
    });
    return job.promise;
  }
  function reset({ settle = false } = {}) {
    generation += 1; stopFrames();
    if (current) finish(current, { cancelled: true, settle });
    seen.clear(); hide(); element.dataset.phase = 'hidden'; delete element.dataset.animationKey;
  }
  function mount(nextRoot) {
    if (!nextRoot?.append) return false;
    if (element.parentNode !== nextRoot) nextRoot.append(element);
    return true;
  }
  const motionChanged = () => { if (reduced() && current) finish(current, { skipped: true }); };
  if (media?.addEventListener) media.addEventListener('change', motionChanged);
  else media?.addListener?.(motionChanged);
  document.addEventListener?.('visibilitychange', () => { if (current) current.lastTime = null; });
  return { element, animate, play: animate, reset, mount, isPlaying: () => current !== null };
}
