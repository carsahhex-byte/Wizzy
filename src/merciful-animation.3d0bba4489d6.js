import { preloadAnimationSheet, createAnimationSprite, paintAnimationFrame, hideAnimationSprite } from './animation-sprites.9586121f4b25.js';
import { getPlayerSchool } from './elements.f91c53cdab44.js';

export const MERCIFUL_STONE_SHEET = Object.freeze({
  asset: 'spellMercifulFx', sourceWidth: 1254, sourceHeight: 1254, columns: 4, rows: 4,
  // The arena clips at y470. A ~201px orbit around y370 keeps the lower
  // stones visible while enclosing both the Wizard and Golem standing bodies.
  displayScale: .64, anchor: Object.freeze({ x: .5, y: .5 }),
});
const POSITIONS = [{ x: 236, y: 370 }, { x: 788, y: 370 }];
const FRAME_MS = 125, FADE_MS = 340, RETRY_MS = 2500;

/** A cosmetic lease indicator; combat state alone determines its lifetime. */
export function createMercifulAnimator({ root, loadSheet = preloadAnimationSheet } = {}) {
  if (!root?.append) throw new Error('Merciful needs the persistent battle scene.');
  const document = root.ownerDocument, view = document.defaultView;
  const media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => Boolean(media?.matches);
  const now = () => view.performance?.now?.() ?? Date.now();
  const element = document.createElement('div');
  element.className = 'merciful-animation-layer';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3', display: 'none' });
  element.hidden = true;
  const stones = POSITIONS.map((point, index) => {
    const node = createAnimationSprite(document, 'merciful-stone-ring');
    Object.assign(node.dataset, { mercifulPlayer: String(index), phase: 'hidden', deadline: '' });
    element.append(node);
    return { index, point, node, playerId: null, deadline: null, mode: 'hidden', elapsed: 0 };
  });
  root.append(element);
  let visible = true, request = 0, lastTime = null, generation = 0;
  let loadStatus = 'idle', imageReady = null, waitingPromise = null, waitingGeneration = -1, retryAt = 0;
  let suppressed = new Set();
  element.dataset.loadState = loadStatus;
  const showing = () => visible && !document.hidden;
  const hasWork = () => stones.some(stone => stone.mode !== 'hidden');
  const suppressedByCast = stone => suppressed.has(stone.index)
    || root.dataset.customSpell === 'Earth-4' && root.dataset.customCasterIndex === String(stone.index);

  function hide(stone) {
    hideAnimationSprite(stone.node);
    stone.node.dataset.phase = 'hidden';
  }
  function refreshLayer() {
    const show = showing() && stones.some(stone => !stone.node.hidden);
    element.hidden = !show;
    element.style.display = show ? 'block' : 'none';
  }
  function stopFrames() {
    generation += 1;
    if (request) view.cancelAnimationFrame(request);
    request = 0;
    lastTime = null;
  }
  function paint(stone) {
    if (!showing() || loadStatus !== 'ready' || stone.mode === 'hidden' || suppressedByCast(stone)) { hide(stone); return; }
    if (stone.mode === 'fade' && (reduced() || stone.elapsed >= FADE_MS)) { stone.mode = 'hidden'; hide(stone); return; }
    const frame = stone.mode === 'fade' ? 12 + Math.min(3, Math.floor(stone.elapsed / 85))
      : reduced() ? 4 : 4 + Math.floor(stone.elapsed / FRAME_MS) % 8;
    paintAnimationFrame(stone.node, MERCIFUL_STONE_SHEET, frame, stone.point, { mirror: stone.index === 1 });
    stone.node.dataset.phase = stone.mode === 'fade' ? 'fading' : 'loop';
    stone.node.dataset.elapsed = String(Math.round(stone.elapsed));
    stone.node.dataset.mirrored = String(stone.index === 1);
  }
  function repaint() { for (const stone of stones) paint(stone); refreshLayer(); }
  function ensureLoaded({ allowRetry = false } = {}) {
    if (loadStatus === 'ready') return true;
    if (!hasWork()) return false;
    if (loadStatus === 'idle' || loadStatus === 'failed' && allowRetry && now() >= retryAt) {
      loadStatus = 'loading'; element.dataset.loadState = loadStatus;
      imageReady = Promise.resolve().then(() => loadSheet(MERCIFUL_STONE_SHEET)).catch(() => false).then(loaded => {
        loadStatus = loaded ? 'ready' : 'failed'; element.dataset.loadState = loadStatus;
        retryAt = loaded ? 0 : now() + RETRY_MS;
        return loaded;
      });
    }
    if (loadStatus === 'loading' && (waitingPromise !== imageReady || waitingGeneration !== generation)) {
      const token = generation; waitingPromise = imageReady; waitingGeneration = token;
      imageReady.then(() => { if (token === generation) schedule(); });
    }
    return false;
  }
  function schedule(options) {
    if (!showing()) { repaint(); return; }
    if (!ensureLoaded(options)) { repaint(); return; }
    repaint();
    if (!reduced() && !request && hasWork()) {
      const token = generation;
      request = view.requestAnimationFrame(time => tick(time, token));
    }
  }
  function tick(time, token) {
    if (token !== generation) return;
    request = 0;
    if (!showing() || reduced()) { lastTime = null; schedule(); return; }
    const delta = lastTime === null ? 0 : Math.max(0, time - lastTime);
    lastTime = time;
    for (const stone of stones) if (stone.mode !== 'hidden') stone.elapsed += delta;
    schedule();
    if (!hasWork()) lastTime = null;
  }
  function sync(players, { visible: nextVisible = true, suppressPlayerIndices = [] } = {}) {
    if (visible !== Boolean(nextVisible)) stopFrames();
    visible = Boolean(nextVisible);
    suppressed = new Set(suppressPlayerIndices);
    for (const stone of stones) {
      const player = players?.[stone.index], id = player?.id ?? null;
      const value = player?.shieldBypassUntilOpponentTurn;
      const deadline = getPlayerSchool(player) === 'earth' && Number.isSafeInteger(value) && value > 0 ? value : null;
      const changedPlayer = id !== stone.playerId;
      stone.playerId = id;
      stone.node.dataset.deadline = deadline === null ? '' : String(deadline);
      stone.node.dataset.golem = String(Boolean(player?.golemActive));
      if (deadline !== null) {
        if (stone.mode !== 'loop' || stone.deadline !== deadline || changedPlayer) { stone.mode = 'loop'; stone.elapsed = 0; }
      } else if (!changedPlayer && stone.deadline !== null && stone.mode === 'loop') {
        stone.mode = reduced() ? 'hidden' : 'fade'; stone.elapsed = 0;
      } else if (changedPlayer) { stone.mode = 'hidden'; stone.elapsed = 0; }
      stone.deadline = deadline;
    }
    if (!hasWork()) stopFrames();
    schedule({ allowRetry: true });
  }
  function reset() {
    stopFrames(); suppressed.clear();
    for (const stone of stones) {
      Object.assign(stone, { playerId: null, deadline: null, mode: 'hidden', elapsed: 0 });
      stone.node.dataset.deadline = ''; hide(stone);
    }
    refreshLayer();
  }
  document.addEventListener?.('visibilitychange', () => { stopFrames(); schedule(); });
  const motionChanged = () => { stopFrames(); schedule({ allowRetry: true }); };
  if (media?.addEventListener) media.addEventListener('change', motionChanged);
  else media?.addListener?.(motionChanged);
  return { element, sync, reset, isActive: index => stones[index]?.mode === 'loop' };
}
