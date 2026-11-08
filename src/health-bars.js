/** Persistent presentation bars; authoritative HP remains with the game host. */
export function createHealthBars({ onSettled = () => {}, duration = 800 } = {}) {
  if (!Number.isFinite(duration) || duration < 0) throw new Error('Health animation duration must be nonnegative.');
  const bars = [];
  let view = null;
  let frameRequest = 0;
  let generation = 0;
  let cycleActive = false;
  let notificationQueued = false;
  const isAnimating = () => bars.some(bar => bar?.animation);
  const reducedMotion = () => Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const format = value => String(Math.round(value * 10000) / 10000);

  function paint(bar) {
    bar.fill.style.width = `${format(bar.percent)}%`;
    bar.track.dataset.healthPercent = format(bar.percent);
    bar.track.dataset.healthTargetPercent = format(bar.target);
    bar.track.dataset.healthFromPercent = format(bar.from);
    bar.track.dataset.healthAnimating = String(Boolean(bar.animation));
    if (bar.startedAt === null) delete bar.track.dataset.healthStartedAt;
    else bar.track.dataset.healthStartedAt = format(bar.startedAt);
    bar.fill.dataset.healthPercent = format(bar.percent);
  }
  function sample(bar, time, immediate = false) {
    if (!bar.animation) return;
    const progress = immediate ? 1 : Math.min(1, Math.max(0, (time - bar.animation.start) / duration));
    // Smoothstep has zero velocity at each end and accelerates in the middle.
    const eased = progress * progress * (3 - 2 * progress);
    bar.percent = bar.animation.from + (bar.target - bar.animation.from) * eased;
    if (progress >= 1) { bar.percent = bar.target; bar.animation = null; }
  }
  function settled() {
    if (!cycleActive || isAnimating() || notificationQueued) return;
    cycleActive = false;
    notificationQueued = true;
    const token = generation;
    // Let a host's current DOM rebuild finish before it opens a victory dialog.
    queueMicrotask(() => {
      if (token !== generation) return;
      notificationQueued = false;
      if (!isAnimating()) {
        cycleActive = false;
        if (typeof onSettled === 'function') onSettled();
      }
    });
  }
  function schedule() {
    if (!isAnimating()) {
      if (frameRequest) view?.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      settled();
      return;
    }
    if (frameRequest || !view) return;
    const token = generation;
    frameRequest = view.requestAnimationFrame(time => {
      if (token !== generation) return;
      frameRequest = 0;
      const immediate = reducedMotion();
      for (const bar of bars) {
        if (!bar?.initialized) continue;
        sample(bar, time, immediate);
        paint(bar);
      }
      schedule();
    });
  }
  function createBar(document, index) {
    const track = document.createElement('div');
    track.className = 'health-track';
    track.dataset.healthBar = String(index);
    track.dataset.healthDuration = String(duration);
    track.dataset.healthEasing = 'smoothstep';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    const fill = document.createElement('span');
    fill.dataset.healthFill = String(index);
    fill.setAttribute('aria-hidden', 'true');
    track.append(fill);
    return { track, fill, percent: 0, target: 0, from: 0, startedAt: null, animation: null, initialized: false };
  }
  function mount(root, players) {
    if (!root?.querySelector || !Array.isArray(players)) return;
    const nextView = root.ownerDocument?.defaultView;
    if (!nextView) return;
    if (view && view !== nextView) reset();
    view = nextView;
    const time = view.performance.now();
    const immediate = reducedMotion() || duration === 0;
    for (let index = 0; index < Math.min(2, players.length); index += 1) {
      const player = players[index];
      if (!player || !Number.isFinite(player.hp) || !Number.isFinite(player.maxHp) || player.maxHp <= 0) continue;
      const slot = root.querySelector(`[data-health-bar-slot="${index}"]`);
      let bar = bars[index];
      if (!slot && (!bar || !root.contains(bar.track))) continue;
      if (!bar) { bar = createBar(root.ownerDocument, index); bars[index] = bar; }
      if (slot) slot.replaceWith(bar.track);
      const hp = Math.max(0, Math.min(player.maxHp, player.hp));
      const target = hp / player.maxHp * 100;
      bar.track.setAttribute('aria-label', `${player.name || player.id || `Player ${index + 1}`} HP`);
      bar.track.setAttribute('aria-valuemax', String(player.maxHp));
      bar.track.setAttribute('aria-valuenow', String(hp));
      if (!bar.initialized) {
        bar.initialized = true;
        bar.percent = target;
        bar.target = target;
        bar.from = target;
      } else {
        sample(bar, time, immediate);
        if (Math.abs(target - bar.target) > .0000001) {
          bar.from = bar.percent;
          bar.target = target;
          bar.startedAt = time;
          cycleActive = true;
          if (immediate || Math.abs(bar.percent - target) < .0000001) {
            bar.percent = target;
            bar.animation = null;
          } else bar.animation = { from: bar.percent, start: time };
        }
      }
      paint(bar);
    }
    schedule();
  }
  function reset() {
    generation += 1;
    if (frameRequest) view?.cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    cycleActive = false;
    notificationQueued = false;
    for (const bar of bars) {
      if (!bar) continue;
      bar.animation = null;
      bar.initialized = false;
      bar.startedAt = null;
      bar.track.dataset.healthAnimating = 'false';
    }
  }
  return { mount, reset, isAnimating };
}
