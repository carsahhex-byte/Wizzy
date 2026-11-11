import { getPlayerSchool } from './elements.f91c53cdab44.js';

const FEET = [{ x: 236, y: 450 }, { x: 788, y: 450 }];
const FRAME_MS = 125;
const PALETTES = Object.freeze({
  fire: ['#8b3029', '#ef5839', '#ffd17a'],
  water: ['#24568f', '#52bce9', '#c1f7ff'],
  earth: ['#346c39', '#78bc62', '#d1ee99'],
});
const OPACITY = { 5: .42, 7: .46, 9: .51, 10: .58 };
const artwork = new Map();

/** Cosmetic thresholds only; this value never grants a battle bonus. */
export function getManaVisualTier(mana) {
  const value = Number(mana);
  if (!Number.isFinite(value)) return 0;
  return value >= 10 ? 10 : value >= 9 ? 9 : value >= 7 ? 7 : value >= 5 ? 5 : 0;
}

// Coarse, separately placed rectangles keep the orbit and sparks on a pixel
// grid. The center stays clear so the wizard's face and robe remain readable.
function pixelArtwork(school, tier, frame) {
  const key = `${school}:${tier}:${frame}`;
  if (artwork.has(key)) return artwork.get(key);
  const colors = PALETTES[school], pixels = [];
  const rect = (x, y, width, height, color, opacity = 1) => pixels.push(
    `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${width}" height="${height}" fill="${color}" opacity="${opacity}"/>`);
  const orbit = (cy, rx, ry, count, offset) => {
    for (let index = 0; index < count; index++) {
      const angle = (index / count + frame / 64 + offset) * Math.PI * 2;
      const bright = (index + Math.floor(frame / 2)) % 5 === 0;
      rect(40 + Math.cos(angle) * rx - 1, cy + Math.sin(angle) * ry - 1,
        bright ? 3 : 2, 2, colors[bright ? 2 : 1], bright ? .9 : .55);
    }
  };
  const spark = (x, y, bright) => {
    rect(x, y, 2, 2, colors[bright ? 2 : 1], bright ? .95 : .65);
    if (bright) {
      rect(x - 1, y, 4, 1, colors[1], .7);
      rect(x, y - 1, 1, 4, colors[2], .8);
    }
  };

  if (tier >= 7) orbit(73, tier === 10 ? 31 : 27, 7, tier >= 9 ? 22 : 16, 0);
  if (tier >= 9) orbit(54, tier === 10 ? 28 : 25, 6, tier === 10 ? 18 : 12, .25);
  const count = tier === 5 ? 5 : tier === 7 ? 7 : tier === 9 ? 10 : 14;
  const height = tier === 5 ? 12 : tier === 7 ? 22 : tier === 9 ? 37 : 49;
  for (let index = 0; index < count; index++) {
    const progress = (frame + index * 3) % 16 / 16;
    const side = index % 2 ? 1 : -1;
    const x = 40 + side * (19 + index % 4 * 3) + (frame + index) % 3 - 1;
    const y = 73 - progress * height;
    spark(x, y, (frame + index * 2) % 7 === 0);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" shape-rendering="crispEdges">${pixels.join('')}</svg>`;
  const source = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  artwork.set(key, source);
  return source;
}

/** Low-key mana glimmers. The host owns Mana, turns and all battle effects. */
export function createManaAnimator({ root } = {}) {
  if (!root?.append) throw new Error('Mana animation needs the persistent battle scene.');
  const document = root.ownerDocument, view = document.defaultView;
  const media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => Boolean(media?.matches);
  const element = document.createElement('div');
  element.className = 'mana-animation-layer';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3', display: 'none' });
  element.hidden = true;
  const glimmers = FEET.map((point, index) => {
    const node = document.createElement('span');
    node.className = 'mana-idle-glimmer';
    node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, { position: 'absolute', pointerEvents: 'none', backgroundRepeat: 'no-repeat',
      backgroundSize: '100% 100%', imageRendering: 'pixelated', display: 'none' });
    Object.assign(node.dataset, { manaPlayer: String(index), manaTier: '0', phase: 'hidden', frame: '0' });
    node.hidden = true;
    element.append(node);
    return { index, point, node, tier: 0, school: '', playerId: null, golem: false, elapsed: 0 };
  });
  root.append(element);
  let visible = true, request = 0, lastTime = null, generation = 0;
  const showing = () => visible && !document.hidden;
  const hasWork = () => glimmers.some(glimmer => glimmer.tier > 0);
  function suppressed(glimmer) {
    if (root.dataset.spellAnimating === 'true') return true;
    const actor = root.querySelector?.(`[data-arena-seat="${glimmer.index}"]`);
    return actor?.dataset.spellCasting === 'true' || actor?.dataset.spellHit === 'true';
  }
  function hide(glimmer, phase = 'hidden') {
    glimmer.node.hidden = true;
    glimmer.node.style.display = 'none';
    glimmer.node.dataset.phase = phase;
  }
  function paint(glimmer) {
    const { node, tier, school, point } = glimmer;
    if (!showing() || !tier) { hide(glimmer); return; }
    if (suppressed(glimmer)) { hide(glimmer, 'suppressed'); return; }
    const frame = reduced() ? 0 : Math.floor(glimmer.elapsed / FRAME_MS) % 16;
    const scale = glimmer.golem ? 2.24 : 2;
    Object.assign(node.style, { display: 'block', left: `${point.x - 40 * scale}px`, top: `${point.y - 74 * scale}px`,
      width: `${80 * scale}px`, height: `${80 * scale}px`, opacity: String(OPACITY[tier]),
      backgroundImage: pixelArtwork(school, tier, frame), transform: glimmer.index === 1 ? 'scaleX(-1)' : '' });
    node.hidden = false;
    Object.assign(node.dataset, { phase: reduced() ? 'static' : 'loop', frame: String(frame),
      elapsed: String(Math.round(glimmer.elapsed)), logicalX: String(point.x), logicalY: String(point.y),
      mirrored: String(glimmer.index === 1) });
  }
  function repaint() {
    glimmers.forEach(paint);
    const show = showing() && glimmers.some(glimmer => !glimmer.node.hidden);
    element.hidden = !show;
    element.style.display = show ? 'block' : 'none';
  }
  function stopFrames() {
    generation++;
    if (request) view.cancelAnimationFrame(request);
    request = 0;
    lastTime = null;
  }
  function schedule() {
    repaint();
    if (!showing() || reduced() || !hasWork() || request) return;
    const token = generation;
    request = view.requestAnimationFrame(time => {
      if (token !== generation) return;
      request = 0;
      if (!showing() || reduced()) { lastTime = null; schedule(); return; }
      const delta = lastTime === null ? 0 : Math.max(0, time - lastTime);
      lastTime = time;
      for (const glimmer of glimmers) if (glimmer.tier) glimmer.elapsed += delta;
      schedule();
    });
  }
  function sync(players, { visible: nextVisible = true } = {}) {
    if (visible !== Boolean(nextVisible)) stopFrames();
    visible = Boolean(nextVisible);
    for (const glimmer of glimmers) {
      const player = players?.[glimmer.index], school = getPlayerSchool(player) || '';
      const id = player?.id ?? null;
      if (id !== glimmer.playerId || school !== glimmer.school) glimmer.elapsed = 0;
      Object.assign(glimmer, { playerId: id, school, tier: PALETTES[school] ? getManaVisualTier(player?.mana) : 0,
        golem: school === 'earth' && Boolean(player?.golemActive) });
      Object.assign(glimmer.node.dataset, { element: school, mana: String(player?.mana ?? 0),
        manaTier: String(glimmer.tier), golem: String(glimmer.golem) });
    }
    if (!hasWork()) stopFrames();
    schedule();
  }
  function reset() {
    stopFrames();
    for (const glimmer of glimmers) {
      Object.assign(glimmer, { playerId: null, school: '', tier: 0, golem: false, elapsed: 0 });
      Object.assign(glimmer.node.dataset, { manaTier: '0', mana: '0', element: '', golem: 'false', frame: '0', elapsed: '0' });
      hide(glimmer);
    }
    repaint();
  }
  document.addEventListener?.('visibilitychange', () => { stopFrames(); schedule(); });
  const motionChanged = () => { stopFrames(); schedule(); };
  if (media?.addEventListener) media.addEventListener('change', motionChanged);
  else media?.addListener?.(motionChanged);
  // Reduced motion needs no animation frames, but still hides immediately when
  // a spell takes ownership of the arena and resumes after the casting flag clears.
  const observer = view.MutationObserver ? new view.MutationObserver(schedule) : null;
  observer?.observe(root, { subtree: true, attributes: true,
    attributeFilter: ['data-spell-animating', 'data-spell-casting', 'data-spell-hit'] });
  return { element, sync, reset, isActive: index => Boolean(glimmers[index]?.tier),
    getTier: index => glimmers[index]?.tier ?? 0 };
}
