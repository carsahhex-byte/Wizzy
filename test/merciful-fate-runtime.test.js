import test from 'node:test';
import assert from 'node:assert/strict';
import { createMercifulAnimator, MERCIFUL_STONE_SHEET } from '../src/merciful-animation.js';
import { createFateAnimator, FATE_FEEDBACK_SHEET, FATE_FEEDBACK_TIMING } from '../src/fate-animation.js';

class Element {
  constructor(document) { this.ownerDocument = document; this.children = []; this.style = {}; this.dataset = {}; this.parentNode = null; }
  setAttribute() {}
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      node.parentNode = this; this.children.push(node);
    }
  }
}
function scene({ reduced = false } = {}) {
  let time = 0, nextId = 0;
  const pending = new Map(), listeners = new Map(), mediaListeners = [];
  const media = { matches: reduced, addEventListener: (_name, callback) => mediaListeners.push(callback) };
  const view = { matchMedia: () => media, performance: { now: () => time }, setTimeout,
    requestAnimationFrame: callback => { const id = ++nextId; pending.set(id, callback); return id; },
    cancelAnimationFrame: id => pending.delete(id) };
  const document = { defaultView: view, hidden: false,
    createElement: () => new Element(document),
    addEventListener: (name, callback) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); } };
  const root = new Element(document);
  return { root, document, pending,
    tick(value) { time = value; const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    hidden(value) { document.hidden = value; for (const callback of listeners.get('visibilitychange') || []) callback(); },
    reduced(value) { media.matches = value; mediaListeners.forEach(callback => callback()); },
  };
}
const ready = () => new Promise(resolve => setImmediate(resolve));
const players = (left = 2, right = null) => [
  { id: 'left', school: 'earth', element: 'Earth', golemActive: false, shieldBypassUntilOpponentTurn: left },
  { id: 'right', school: right === null ? 'water' : 'earth', element: right === null ? 'Water' : 'Earth', golemActive: false, shieldBypassUntilOpponentTurn: right },
];

test('Merciful restores a lease without formation, keeps its clock through rerenders and hides its duplicate during its cast', async () => {
  const state = scene(), animator = createMercifulAnimator({ root: state.root, loadSheet: () => Promise.resolve(true) });
  const snapshot = players(), original = JSON.stringify(snapshot), ring = animator.element.children[0];
  animator.sync(snapshot); await ready();
  assert.equal(ring.dataset.frame, '4');
  assert.equal(ring.dataset.phase, 'loop');
  assert.equal(ring.dataset.logicalX, '236');
  assert.equal(ring.dataset.logicalY, '370');
  assert.equal(ring.dataset.asset, 'spellMercifulFx');
  state.tick(0); state.tick(875);
  assert.equal(ring.dataset.frame, '11');
  animator.sync(snapshot);
  assert.equal(ring.dataset.frame, '11', 'HUD rerenders do not restart the loop');
  snapshot[0].golemActive = true;
  animator.sync(snapshot);
  assert.equal(ring.dataset.golem, 'true');
  assert.equal(ring.dataset.frame, '11', 'changing form does not restart a lease');
  state.root.dataset.customSpell = 'Earth-4'; state.root.dataset.customCasterIndex = '0';
  state.tick(1000);
  assert.equal(ring.hidden, true, 'primary Merciful owns its visible forming/hold effect');
  delete state.root.dataset.customSpell; delete state.root.dataset.customCasterIndex;
  state.tick(1125);
  assert.equal(ring.hidden, false);
  assert.equal(ring.dataset.frame, '5', 'persistent clock continued while its duplicate was hidden');
  snapshot[0].golemActive = false;
  assert.equal(JSON.stringify(snapshot), original, 'the controller never mutates combat state');
  animator.reset();
});

test('both Earth seats persist through turn staging and only the cleared lease fades for 340ms', async () => {
  const state = scene(), animator = createMercifulAnimator({ root: state.root, loadSheet: () => true });
  const snapshot = players(2, 3), [left, right] = animator.element.children;
  animator.sync(snapshot); await ready();
  assert.equal(animator.isActive(0), true); assert.equal(animator.isActive(1), true);
  assert.equal(right.dataset.logicalX, '788'); assert.equal(right.dataset.mirrored, 'true');
  assert.match(right.style.transform, /scaleX\(-1\)/);
  state.tick(0); state.tick(125);
  animator.sync(snapshot); // opening/canceling End Turn is only another render
  assert.equal(left.dataset.phase, 'loop'); assert.equal(right.dataset.phase, 'loop');
  snapshot[0].shieldBypassUntilOpponentTurn = null;
  animator.sync(snapshot);
  assert.equal(left.dataset.frame, '12'); assert.equal(left.dataset.phase, 'fading');
  assert.equal(right.dataset.phase, 'loop');
  state.tick(380);
  assert.equal(left.dataset.frame, '15');
  state.tick(465);
  assert.equal(left.hidden, true); assert.equal(animator.isActive(0), false);
  assert.equal(right.hidden, false); assert.equal(animator.isActive(1), true);
  animator.reset(); assert.equal(animator.element.hidden, true); assert.equal(state.pending.size, 0);
});

test('Merciful pauses when the battle/document is hidden and supports static reduced motion', async () => {
  const state = scene(), animator = createMercifulAnimator({ root: state.root, loadSheet: () => true });
  const snapshot = players(), ring = animator.element.children[0];
  animator.sync(snapshot); await ready(); state.tick(0); state.tick(250);
  assert.equal(ring.dataset.frame, '6');
  animator.sync(snapshot, { visible: false });
  assert.equal(ring.hidden, true); assert.equal(state.pending.size, 0);
  state.tick(5000); animator.sync(snapshot, { visible: true }); state.tick(9000);
  assert.equal(ring.dataset.frame, '6', 'returning from Home resumes rather than jumping');
  state.hidden(true); state.tick(15000); assert.equal(ring.hidden, true);
  state.hidden(false); state.tick(18000); assert.equal(ring.dataset.frame, '6');
  state.tick(18125); assert.equal(ring.dataset.frame, '7');
  state.reduced(true);
  assert.equal(ring.dataset.frame, '4'); assert.equal(state.pending.size, 0);
  snapshot[0].shieldBypassUntilOpponentTurn = null; animator.sync(snapshot);
  assert.equal(ring.hidden, true, 'reduced motion does not run a fizzle');
  animator.reset();
});

test('Merciful preload failure is cosmetic and retries later; reset rejects stale loader callbacks', async () => {
  const state = scene(); let loads = 0;
  const animator = createMercifulAnimator({ root: state.root, loadSheet: () => ++loads > 1 });
  const ring = animator.element.children[0];
  animator.sync(players()); await ready();
  assert.equal(animator.element.dataset.loadState, 'failed'); assert.equal(ring.hidden, true); assert.equal(state.pending.size, 0);
  state.tick(3000); animator.sync(players()); await ready();
  assert.equal(loads, 2); assert.equal(ring.dataset.phase, 'loop');
  animator.reset();
  let resolveLoad;
  const delayed = createMercifulAnimator({ root: state.root, loadSheet: () => new Promise(resolve => { resolveLoad = resolve; }) });
  delayed.sync(players()); await ready(); delayed.reset(); resolveLoad(true); await ready();
  assert.equal(delayed.element.hidden, true); assert.equal(delayed.isActive(0), false); assert.equal(state.pending.size, 0);
  delayed.sync(players()); assert.equal(delayed.element.children[0].dataset.frame, '4'); delayed.reset();
});

test('Fate has its own crop above dice, applies one callback at200ms and finishes at600ms', async () => {
  assert.deepEqual(FATE_FEEDBACK_TIMING, { impactAt: 200, duration: 600 });
  assert.equal(FATE_FEEDBACK_SHEET.columns, 3); assert.equal(MERCIFUL_STONE_SHEET.columns, 4);
  const state = scene(), animator = createFateAnimator({ root: state.root, loadSheet: () => true });
  const callbacks = [], options = { key: 'twist', spellId: 'FAT-003', amount: -2, casterIndex: 1,
    onImpact: detail => callbacks.push(['impact', detail]), onComplete: detail => callbacks.push(['complete', detail]) };
  const promise = animator.play(options);
  assert.equal(animator.play(options), promise, 'same in-flight key returns its existing promise');
  await ready(); state.tick(0); state.tick(199);
  const [glyph, label] = animator.element.children;
  assert.equal(callbacks.length, 0); assert.equal(glyph.dataset.frame, '2');
  assert.equal(glyph.dataset.asset, 'fateFeedbackFx'); assert.equal(glyph.dataset.sourceRect, '1638,195,345,370');
  assert.equal(label.textContent, '−2'); assert.ok(Number(glyph.dataset.logicalY) < 585, 'glyph is above the dice frame');
  assert.doesNotMatch(glyph.style.transform, /scaleX/);
  state.tick(200); assert.deepEqual(callbacks.map(call => call[0]), ['impact']);
  state.tick(599); assert.equal(animator.element.hidden, false);
  state.tick(600);
  assert.deepEqual(callbacks.map(call => call[0]), ['impact', 'complete']);
  assert.equal(animator.isPlaying(), false); assert.equal(animator.element.hidden, true); assert.equal(state.pending.size, 0);
  assert.equal((await promise).amount, -2);
  assert.equal((await animator.play(options)).duplicate, true); assert.equal(callbacks.length, 2);
});

test('Fate failures, invalid inputs and reduced motion settle exactly once without holding controls', async () => {
  for (const mode of ['load-failed', 'invalid', 'reduced']) {
    const state = scene({ reduced: mode === 'reduced' }); let loadCalls = 0;
    const animator = createFateAnimator({ root: state.root, loadSheet: () => { loadCalls += 1; return false; } });
    const calls = [];
    const result = await animator.play({ spellId: mode === 'invalid' ? 'Fire-2' : 'FAT-001', casterIndex: 0,
      onImpact: detail => calls.push(['impact', detail]), onComplete: detail => calls.push(['complete', detail]) });
    assert.equal(result.skipped, true); assert.equal(calls.length, 2); assert.equal(animator.element.hidden, true); assert.equal(state.pending.size, 0);
    assert.equal(loadCalls, mode === 'load-failed' ? 1 : 0);
  }
});

test('Fate reset cancels stale callbacks, clears seen keys for a new duel, and remounts after rerenders', async () => {
  const state = scene(), animator = createFateAnimator({ root: state.root, loadSheet: () => true });
  const calls = [], options = { key: 'same-card-log', spellId: 'FAT-002', casterIndex: 0,
    onImpact: () => calls.push('impact'), onComplete: () => calls.push('complete') };
  const before = animator.play(options); await ready(); state.tick(0); state.tick(100);
  const oldCallbacks = [...state.pending.values()]; animator.reset({ settle: false });
  assert.equal((await before).cancelled, true); assert.deepEqual(calls, []);
  const board = new Element(state.document); animator.mount(board); animator.mount(board);
  assert.deepEqual(board.children, [animator.element], 'reattachment never duplicates the layer');
  const next = animator.play(options); await ready();
  const requestCount = state.pending.size; oldCallbacks.forEach(callback => callback(10000));
  assert.equal(state.pending.size, requestCount); assert.deepEqual(calls, []);
  state.tick(20000); state.tick(20200); state.tick(20600);
  assert.equal((await next).cancelled, false); assert.deepEqual(calls, ['impact', 'complete']);
});

test('Fate pauses elapsed time while hidden and a motion preference change settles an active visual', async () => {
  const state = scene(), animator = createFateAnimator({ root: state.root, loadSheet: () => true });
  const calls = [], promise = animator.play({ key: 'fortune', spellId: 'FAT-001', casterIndex: 1,
    onImpact: () => calls.push('impact'), onComplete: () => calls.push('complete') });
  await ready(); state.tick(0); state.tick(100);
  state.hidden(true); state.tick(10000); state.hidden(false); state.tick(20000);
  assert.equal(animator.element.dataset.elapsed, '100'); assert.deepEqual(calls, []);
  state.tick(20100); assert.deepEqual(calls, ['impact']);
  state.reduced(true);
  assert.equal((await promise).skipped, true); assert.deepEqual(calls, ['impact', 'complete']); assert.equal(state.pending.size, 0);
});

test('a Fate impact callback may reset the duel without allowing an old completion callback', async () => {
  const state = scene(), animator = createFateAnimator({ root: state.root, loadSheet: () => true });
  let impacts = 0, completions = 0;
  const promise = animator.play({ key: 'reentrant', spellId: 'FAT-003', casterIndex: 0,
    onImpact: () => { impacts += 1; animator.reset({ settle: false }); }, onComplete: () => { completions += 1; } });
  await ready(); state.tick(0); state.tick(200);
  assert.equal((await promise).cancelled, true); assert.equal(impacts, 1); assert.equal(completions, 0);
  assert.equal(state.pending.size, 0); assert.equal(animator.element.hidden, true);
});
