import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpellAnimator } from '../src/spell-animation.js';
import { paintAnimationFrame, createAnimationSprite } from '../src/animation-sprites.js';
import { XINEOPH_TIMING, getXineophMoment } from '../src/xineoph-animation.js';
import { XINEOPH_ANIMATION_SHEETS } from '../src/assets.js';

class Style {
  getPropertyValue(key) { return this[key] || ''; }
  getPropertyPriority() { return ''; }
  setProperty(key, value) { this[key] = String(value); }
  removeProperty(key) { delete this[key]; }
}
class Element {
  constructor(document) { this.ownerDocument = document; this.style = new Style(); this.dataset = {}; this.children = []; }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  querySelector(selector) {
    const matches = node => selector.startsWith('.') ? node.className?.split(' ').includes(selector.slice(1))
      : node.dataset.arenaWizard === selector.match(/^\[data-arena-wizard="(fire|water)"\]$/)?.[1];
    for (const child of this.children) {
      if (matches(child)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}
function scene({ reduced = false } = {}) {
  let nextId = 0;
  const pending = new Map();
  const view = {
    matchMedia: () => ({ matches: reduced }), setTimeout,
    requestAnimationFrame: callback => { const id = ++nextId; pending.set(id, callback); return id; },
    cancelAnimationFrame: id => pending.delete(id),
  };
  const document = { defaultView: view, createElement: () => new Element(document) };
  const root = new Element(document), wizards = [];
  for (const id of ['fire', 'water']) {
    const wizard = new Element(document), sprite = new Element(document);
    wizard.dataset.arenaWizard = id; sprite.className = 'wizard-sprite';
    sprite.style.visibility = 'visible'; sprite.style.filter = 'contrast(1.05)';
    wizard.append(sprite); root.append(wizard); wizards.push({ wizard, sprite });
  }
  const animator = createSpellAnimator({ root });
  return { root, document, animator, wizards, pending,
    tick: time => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    node: name => root.querySelector(`.${name}`),
  };
}
function images(t, { fail = false } = {}) {
  const original = globalThis.Image, loaded = [];
  globalThis.Image = class {
    naturalWidth = fail ? 0 : 1536;
    complete = false;
    set src(value) {
      loaded.push(value);
      queueMicrotask(() => { this.complete = true; if (fail) this.onerror?.(); else this.onload?.(); });
    }
    async decode() {}
  };
  t.after(() => { if (original === undefined) delete globalThis.Image; else globalThis.Image = original; });
  return loaded;
}
const ready = () => new Promise(resolve => setImmediate(resolve));

test('Xineoph timing keeps a full charge, exactly three wing poses and one quick impact', () => {
  assert.deepEqual(XINEOPH_TIMING, { windupEnd: 500, releaseAt: 1500, formationEnd: 1700,
    wingFrameMs: 125, flightAt: 2075, impactAt: 2975, duration: 3315 });
  for (const [time, stage, actorFrame, wingPose, lightBlades] of [
    [0, 'windup', 0, 0, false], [249, 'windup', 0, 0, false], [250, 'windup', 1, 0, false],
    [500, 'linger', 2, 0, false], [1499, 'linger', 2, 0, false], [1500, 'forming', 3, 0, false],
    [1700, 'wing-up', 4, 1, false], [1825, 'wing-middle', 5, 2, false],
    [1950, 'wing-down', 6, 3, true], [2074, 'wing-down', 6, 3, true],
  ]) {
    const moment = getXineophMoment(time);
    assert.deepEqual([moment.stage, moment.actorFrame, moment.wingPose, moment.lightBlades],
      [stage, actorFrame, wingPose, lightBlades], `at ${time}ms`);
  }
  assert.equal(getXineophMoment(2075).progress, 0);
  assert.equal(getXineophMoment(2974).stage, 'flight');
  assert.equal(getXineophMoment(2975).hitTime, 0);
  assert.equal(getXineophMoment(3184).stage, 'quick-hit');
  assert.equal(getXineophMoment(3185).stage, 'impact-fade');
  assert.equal(getXineophMoment(3315).stage, 'complete');
});

test('frame regions preserve source alignment, reject missing crops and reset clips for ordinary atlases', () => {
  const { document } = scene(), node = createAnimationSprite(document, 'test-sprite');
  const uniform = { asset: 'combatV2BasicAttack', sourceWidth: 400, sourceHeight: 200,
    columns: 4, rows: 2, displayScale: 2 };
  assert.equal(paintAnimationFrame(node, uniform, 5, { x: 100, y: 200 }), true);
  assert.deepEqual([node.style.width, node.style.height, node.style.backgroundPosition, node.style.backgroundSize],
    ['200px', '200px', '-200px -200px', '800px 400px']);
  const cropped = { ...uniform, frameRects: [null, { x: 210, y: 30, w: 50, h: 80 }],
    frameAnchors: [null, { x: .8, y: .75 }], frameClips: [null, 'polygon(0 0, 100% 0, 100% 80%)'] };
  assert.equal(paintAnimationFrame(node, cropped, 1, { x: 100, y: 200 }, { mirror: true }), true);
  assert.deepEqual([node.style.width, node.style.height, node.style.backgroundPosition, node.style.transformOrigin],
    ['100px', '160px', '-420px -60px', '80px 120px']);
  assert.equal(node.style.transform, 'translate(20px, 80px) scaleX(-1)');
  assert.equal(node.dataset.sourceRect, '210,30,50,80'); assert.match(node.style.clipPath, /^polygon/);
  assert.equal(paintAnimationFrame(node, uniform, 0, { x: 100, y: 200 }), true);
  assert.equal(node.style.clipPath, '');
  for (const frame of [0, 2]) {
    assert.equal(paintAnimationFrame(node, cropped, frame, { x: 0, y: 0 }), false);
    assert.equal(node.hidden, true, 'explicit empty crops cannot draw full scene cells');
  }
  assert.equal(paintAnimationFrame(node, { ...uniform, frameRects: [{ x: 390, y: 0, w: 20, h: 20 }] }, 0, { x: 0, y: 0 }), false);
});

test('a failed Xineoph atlas settles once, releases the lock, and can be loaded by a later playback', async t => {
  images(t, { fail: true });
  const state = scene(), impacts = [], completes = [];
  const result = await state.animator.play({ key: 'failed-atlas', spellId: 'Fire-11', casterIndex: 0,
    onImpact: detail => impacts.push(detail), onComplete: detail => completes.push(detail) });
  assert.equal(result.skipped, true); assert.equal(impacts.length, 1); assert.equal(completes.length, 1);
  assert.equal(state.animator.isPlaying(), false); assert.equal(state.pending.size, 0);
  assert.equal(state.wizards[0].sprite.style.visibility, 'visible');
  assert.equal(state.root.dataset.spellAnimating, undefined);
  await ready();
});

test('actual Xineoph playback holds fixed caster feet, releases one projectile and hits once in either direction', async t => {
  const loaded = images(t);
  assert.deepEqual(XINEOPH_ANIMATION_SHEETS.projectile.animations.fire.map(frame =>
    XINEOPH_ANIMATION_SHEETS.projectile.frameAnchors[frame].x), [1, 1, 1],
  'the contact plane is ahead of both light tips in every flight pose');
  for (const casterIndex of [0, 1]) {
    const state = scene(), impacts = [], completes = [];
    const completion = state.animator.play({ key: `xineoph-${casterIndex}`, spellId: 'Fire-11', casterIndex,
      onImpact: detail => impacts.push(detail), onComplete: detail => completes.push(detail) });
    assert.equal(state.animator.play({ key: `xineoph-${casterIndex}`, spellId: 'Fire-11', casterIndex }), completion,
      'duplicate in-flight requests share playback rather than scheduling another impact');
    await ready(); state.tick(0);
    const actor = state.node('spell-animation-actor'), projectile = state.node('spell-projectile');
    const layer = state.animator.element, target = state.wizards[1 - casterIndex].sprite;
    assert.equal(layer.dataset.customAnimation, 'xineoph');
    assert.equal(layer.dataset.kind, 'basic-attack');
    assert.deepEqual([layer.dataset.releaseAt, layer.dataset.flightAt, layer.dataset.impactAt, layer.dataset.duration],
      ['1500', '2075', '2975', '3315']);
    for (const [time, stage] of [[250, 'windup'], [500, 'linger'], [1499, 'linger'], [1500, 'forming'],
      [1700, 'wing-up'], [1825, 'wing-middle'], [1950, 'wing-down']]) {
      state.tick(time); assert.equal(layer.dataset.stage, stage);
      assert.equal(actor.dataset.logicalX, casterIndex === 0 ? '236' : '788');
      assert.equal(actor.dataset.logicalY, '450');
      assert.equal(projectile.hidden, true); assert.equal(impacts.length, 0);
    }
    assert.equal(layer.dataset.wingPose, '3'); assert.equal(layer.dataset.lightBlades, 'true');
    state.tick(2075);
    assert.equal(actor.hidden, true); assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'visible');
    assert.equal(projectile.hidden, false); assert.equal(projectile.dataset.asset, 'xineophAnimation');
    assert.equal(projectile.style.transform.includes('scaleX(-1)'), casterIndex === 1);
    assert.equal(projectile.dataset.contactPlane, 'leading-edge');
    const offset = XINEOPH_ANIMATION_SHEETS.actor.releaseOffset;
    const releaseX = (casterIndex === 0 ? 236 : 788) + (casterIndex === 0 ? offset.x : -offset.x);
    assert.ok(Math.abs(Number(projectile.dataset.contactX) - releaseX) < 1e-9,
      'the first flight contact plane begins at the actor release plane');
    assert.ok(Math.abs(Number(projectile.dataset.contactY) - (450 + offset.y)) < 1e-9);
    const startX = Number(projectile.dataset.logicalX);
    state.tick(2525);
    assert.ok(casterIndex === 0 ? Number(projectile.dataset.logicalX) > startX : Number(projectile.dataset.logicalX) < startX);
    state.tick(2974); assert.equal(impacts.length, 0);
    const contactX = Number(projectile.dataset.contactX);
    assert.ok(casterIndex === 0 ? contactX < 788 : contactX > 236,
      'neither the bird nor either leading light tip can cross the target before impact');
    state.tick(2975);
    assert.equal(impacts.length, 1); assert.equal(projectile.hidden, true); assert.match(target.style.filter, /brightness/);
    assert.equal(state.node('spell-impact').dataset.logicalX, casterIndex === 0 ? '788' : '236');
    state.tick(3184); assert.match(target.style.filter, /brightness/);
    state.tick(3185); assert.equal(target.style.filter, 'contrast(1.05)');
    state.tick(3315); await completion;
    assert.equal(impacts.length, 1); assert.equal(completes.length, 1);
    assert.equal(state.animator.isPlaying(), false); assert.equal(layer.hidden, true);
    assert.equal(state.root.dataset.spellAnimating, undefined);
    assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'visible');
    const duplicate = await state.animator.play({ key: `xineoph-${casterIndex}`, spellId: 'Fire-11', casterIndex,
      onImpact: () => assert.fail('completed animation replayed') });
    assert.equal(duplicate.duplicate, true); assert.equal(state.pending.size, 0);
  }
  assert.equal(loaded.length, 1, 'actor, flight and impact share one decoded atlas');
});

test('cancel, replacement, and reduced motion preserve callback ownership and restore standing sprites', async t => {
  images(t);
  const state = scene(), events = [];
  const first = state.animator.play({ key: 'old', spellId: 'Fire-11', casterIndex: 0,
    onImpact: () => events.push('old-impact'), onComplete: () => events.push('old-complete') });
  // Replacement before the cached preload continuation must not release a new lock.
  const second = state.animator.play({ key: 'new', spellId: 'Fire-11', casterIndex: 0,
    onImpact: () => events.push('new-impact'), onComplete: () => events.push('new-complete') });
  assert.equal((await first).cancelled, true);
  await ready(); state.tick(0); state.tick(1825);
  assert.deepEqual(events, []); assert.equal(state.wizards[0].sprite.style.visibility, 'hidden');
  state.animator.cancel(); state.animator.cancel(); await second;
  assert.deepEqual(events, ['new-impact', 'new-complete']);
  assert.equal(state.wizards[0].sprite.style.visibility, 'visible'); assert.equal(state.pending.size, 0);
  const silent = state.animator.play({ key: 'silent-cancel', spellId: 'Fire-11', casterIndex: 0,
    onImpact: () => assert.fail('silent cancel delivered'), onComplete: () => assert.fail('silent cancel completed') });
  state.animator.cancel({ settle: false }); await silent; await ready();
  assert.equal(state.pending.size, 0);
  const afterHit = state.animator.play({ key: 'cancel-after-impact', spellId: 'Fire-11', casterIndex: 0,
    onImpact: () => events.push('hit-impact'), onComplete: () => events.push('hit-complete') });
  await ready(); state.tick(0); state.tick(2975);
  assert.match(state.wizards[1].sprite.style.filter, /brightness/);
  state.animator.cancel(); await afterHit;
  assert.deepEqual(events.slice(2), ['hit-impact', 'hit-complete']);
  assert.equal(state.wizards[1].sprite.style.filter, 'contrast(1.05)');
  const reduced = scene({ reduced: true }), calls = [];
  const skipped = await reduced.animator.play({ key: 'reduced', spellId: 'Fire-11', casterIndex: 0,
    onImpact: () => calls.push('impact'), onComplete: () => calls.push('complete') });
  assert.equal(skipped.skipped, true); assert.deepEqual(calls, ['impact', 'complete']);
  assert.equal(reduced.pending.size, 0); assert.equal(reduced.wizards[0].sprite.style.visibility, 'visible');
});

test('Water, Xineoph and ordinary Fire reuse the animator without stale hues or custom state', async t => {
  images(t);
  const state = scene(), impacts = [];
  const water = state.animator.play({ key: 'prior-water', spellId: 'Water-2', casterIndex: 1 });
  await ready(); state.tick(0); state.tick(2500);
  assert.match(state.node('spell-impact').style.filter, /hue-rotate\(155deg\)/);
  state.tick(2840); await water;
  const custom = state.animator.play({ key: 'after-water-xineoph', spellId: 'Fire-11', casterIndex: 0 });
  await ready(); state.tick(0); state.tick(1950);
  assert.equal(state.animator.element.dataset.lightBlades, 'true');
  state.tick(2975); assert.equal(state.node('spell-impact').style.filter, '');
  state.tick(3315); await custom;
  const completion = state.animator.play({ key: 'ordinary-fire', spellId: 'Fire-6', casterIndex: 0,
    onImpact: detail => impacts.push(detail) });
  await ready(); state.tick(0); state.tick(1500);
  assert.equal(state.animator.element.dataset.customAnimation, '');
  assert.equal(state.animator.element.dataset.wingPose, '');
  assert.equal(state.animator.element.dataset.lightBlades, 'false');
  assert.equal(state.animator.element.dataset.duration, '2840');
  assert.equal(state.animator.element.dataset.impactAt, '2500');
  assert.equal(state.node('spell-projectile').hidden, false);
  state.tick(2499); assert.equal(impacts.length, 0);
  state.tick(2500); assert.equal(impacts.length, 1);
  state.tick(2840); await completion; assert.equal(impacts.length, 1);
});
