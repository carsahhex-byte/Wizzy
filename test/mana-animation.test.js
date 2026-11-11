import test from 'node:test';
import assert from 'node:assert/strict';
import { createManaAnimator, getManaVisualTier } from '../src/mana-animation.js';

class Element {
  constructor(document) { this.ownerDocument = document; this.children = []; this.style = {}; this.dataset = {}; }
  setAttribute() {}
  append(...nodes) { this.children.push(...nodes); }
  querySelector(selector) {
    const seat = selector.match(/^\[data-arena-seat="([01])"\]$/)?.[1];
    return this.children.find(node => node.dataset.arenaSeat === seat) || null;
  }
}
function scene({ reduced = false } = {}) {
  let nextId = 0;
  const pending = new Map(), listeners = new Map(), mediaListeners = [];
  const media = { matches: reduced, addEventListener: (_name, callback) => mediaListeners.push(callback) };
  const observers = [];
  const view = { matchMedia: () => media,
    requestAnimationFrame: callback => { const id = ++nextId; pending.set(id, callback); return id; },
    cancelAnimationFrame: id => pending.delete(id),
    MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} },
  };
  const document = { defaultView: view, hidden: false,
    createElement: () => new Element(document),
    addEventListener: (name, callback) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); } };
  const root = new Element(document), actors = [0, 1].map(index => {
    const node = new Element(document); node.dataset.arenaSeat = String(index); root.append(node); return node;
  });
  return { root, document, actors, pending,
    tick(time) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    hidden(value) { document.hidden = value; for (const callback of listeners.get('visibilitychange') || []) callback(); },
    reduced(value) { media.matches = value; mediaListeners.forEach(callback => callback()); },
    mutation() { observers.forEach(callback => callback()); },
  };
}
const players = (left = 5, right = 7, school = 'fire') => [
  { id: 'left', school, mana: left, golemActive: false },
  { id: 'right', school: 'water', mana: right, golemActive: false },
];

test('mana visuals use inclusive thresholds and do not invent tiers for invalid mana', () => {
  for (const [mana, tier] of [[0,0],[4,0],[5,5],[6,5],[7,7],[8,7],[9,9],[10,10],[11,10],[-1,0],[null,0],[undefined,0],[NaN,0],[Infinity,0]]) {
    assert.equal(getManaVisualTier(mana), tier, String(mana));
  }
});

test('mana sparkles derive independently from both players and use crisp school-colored pixel art', () => {
  const state = scene(), animator = createManaAnimator({ root: state.root });
  const snapshot = players(5, 10), original = JSON.stringify(snapshot), [left, right] = animator.element.children;
  animator.sync(snapshot);
  assert.equal(animator.getTier(0), 5); assert.equal(animator.getTier(1), 10);
  assert.equal(animator.isActive(0), true); assert.equal(animator.isActive(1), true);
  assert.equal(left.hidden, false); assert.equal(right.hidden, false);
  assert.equal(left.dataset.logicalX, '236'); assert.equal(right.dataset.logicalX, '788');
  assert.equal(left.dataset.logicalY, '450'); assert.equal(right.dataset.logicalY, '450');
  assert.equal(left.dataset.manaPlayer, '0'); assert.equal(right.dataset.manaPlayer, '1');
  assert.equal(left.dataset.arenaSeat, undefined, 'effect nodes cannot masquerade as wizard actors');
  assert.equal(right.style.transform, 'scaleX(-1)');
  assert.match(decodeURIComponent(left.style.backgroundImage), /shape-rendering="crispEdges"/);
  assert.match(decodeURIComponent(left.style.backgroundImage), /#ef5839/);
  assert.match(decodeURIComponent(right.style.backgroundImage), /#52bce9/);
  assert.ok(Number(left.style.opacity) < Number(right.style.opacity));
  assert.equal(state.pending.size, 1, 'one frame loop serves both players');
  assert.equal(JSON.stringify(snapshot), original, 'visuals never mutate mana or battle state');
  animator.reset();
});

test('mana spending downgrades immediately and HUD renders or tier changes preserve the idle clock', () => {
  const state = scene(), animator = createManaAnimator({ root: state.root }), snapshot = players(7, 9);
  const [left, right] = animator.element.children;
  animator.sync(snapshot); state.tick(0); state.tick(250);
  assert.equal(left.dataset.frame, '2'); assert.equal(right.dataset.frame, '2');
  animator.sync(snapshot); assert.equal(left.dataset.frame, '2'); assert.equal(state.pending.size, 1);
  snapshot[0].mana = 10; animator.sync(snapshot);
  assert.equal(left.dataset.manaTier, '10'); assert.equal(left.dataset.frame, '2');
  snapshot[0].mana = 5; animator.sync(snapshot);
  assert.equal(left.dataset.manaTier, '5'); assert.equal(left.dataset.frame, '2');
  snapshot[0].mana = 4; animator.sync(snapshot);
  assert.equal(left.hidden, true); assert.equal(animator.isActive(0), false); assert.equal(right.hidden, false);
  snapshot[1].mana = 3; animator.sync(snapshot);
  assert.equal(animator.element.hidden, true); assert.equal(state.pending.size, 0);
  animator.reset();
});

test('mana effects pause while battle or document is hidden and reduced motion remains static', () => {
  const state = scene(), animator = createManaAnimator({ root: state.root }), snapshot = players();
  const left = animator.element.children[0];
  animator.sync(snapshot); state.tick(0); state.tick(250);
  animator.sync(snapshot, { visible: false }); assert.equal(left.hidden, true); assert.equal(state.pending.size, 0);
  state.tick(5000); animator.sync(snapshot, { visible: true }); state.tick(9000);
  assert.equal(left.dataset.frame, '2', 'time on other screens does not advance the effect');
  state.tick(9125); assert.equal(left.dataset.frame, '3');
  state.hidden(true); assert.equal(left.hidden, true); assert.equal(state.pending.size, 0);
  state.tick(16000); state.hidden(false); state.tick(18000);
  assert.equal(left.dataset.frame, '3');
  state.reduced(true); assert.equal(left.dataset.frame, '0'); assert.equal(left.dataset.phase, 'static');
  assert.equal(state.pending.size, 0);
  state.reduced(false); state.tick(20000); assert.equal(left.dataset.frame, '3');
  state.tick(20125); assert.equal(left.dataset.frame, '4');
  animator.reset();
});

test('casting and hit ownership suppress mana glimmers and clearing the flags restores them', () => {
  const state = scene(), animator = createManaAnimator({ root: state.root }), snapshot = players();
  const [left, right] = animator.element.children;
  animator.sync(snapshot); state.tick(0); state.tick(250);
  state.root.dataset.spellAnimating = 'true'; state.mutation();
  assert.equal(left.hidden, true); assert.equal(right.hidden, true); assert.equal(left.dataset.phase, 'suppressed');
  state.tick(500);
  delete state.root.dataset.spellAnimating; state.mutation();
  assert.equal(left.hidden, false); assert.equal(left.dataset.frame, '4', 'suppression does not reset the idle clock');
  state.actors[0].dataset.spellCasting = 'true'; state.mutation();
  assert.equal(left.hidden, true); assert.equal(right.hidden, false);
  delete state.actors[0].dataset.spellCasting; state.actors[1].dataset.spellHit = 'true'; state.mutation();
  assert.equal(left.hidden, false); assert.equal(right.hidden, true);
  state.reduced(true); delete state.actors[1].dataset.spellHit; state.mutation();
  assert.equal(right.hidden, false); assert.equal(right.dataset.phase, 'static'); assert.equal(state.pending.size, 0);
  state.root.dataset.spellAnimating = 'true'; state.mutation(); assert.equal(animator.element.hidden, true);
  delete state.root.dataset.spellAnimating; state.mutation(); assert.equal(animator.element.hidden, false);
  animator.reset();
});

test('Earth Golem sizing stays within the arena and reset cancels stale frame work', () => {
  const state = scene(), animator = createManaAnimator({ root: state.root }), snapshot = players(10, 0, 'earth');
  const left = animator.element.children[0];
  animator.sync(snapshot); state.tick(0); state.tick(375);
  assert.match(decodeURIComponent(left.style.backgroundImage), /#78bc62/);
  const wizardHeight = parseFloat(left.style.height);
  snapshot[0].golemActive = true; animator.sync(snapshot);
  assert.equal(left.dataset.frame, '3'); assert.equal(left.dataset.golem, 'true');
  assert.ok(parseFloat(left.style.height) > wizardHeight);
  assert.ok(parseFloat(left.style.top) + parseFloat(left.style.height) < 470);
  const stale = [...state.pending.values()]; animator.reset();
  stale.forEach(callback => callback(10000));
  assert.equal(animator.element.hidden, true); assert.equal(animator.getTier(0), 0); assert.equal(state.pending.size, 0);
  animator.sync(snapshot); assert.equal(left.dataset.frame, '0');
  snapshot[0] = { id: 'replacement', school: 'fire', mana: 9 }; animator.sync(snapshot);
  assert.equal(left.dataset.element, 'fire'); assert.equal(left.dataset.frame, '0');
  assert.equal(left.dataset.golem, 'false');
  animator.sync([null, null]); assert.equal(animator.element.hidden, true); assert.equal(state.pending.size, 0);
  animator.reset();
});
