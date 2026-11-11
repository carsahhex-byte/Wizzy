import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpellAnimator } from '../src/spell-animation.js';
import { paintAnimationFrame, createAnimationSprite } from '../src/animation-sprites.js';
import { XINEOPH_TIMING, getXineophMoment } from '../src/xineoph-animation.js';
import { CREATURE_ANIMATION_SHEETS, EARTH_ANIMATION_SHEETS, GOLEM_ANIMATION_SHEETS } from '../src/assets.js';
import { CREATURE_TIMING, getCreatureMoment, getCreatureAnimation } from '../src/creature-animation.js';

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
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = node => {
      if (selector.startsWith('.')) return node.className?.split(' ').includes(selector.slice(1));
      const seat = selector.match(/^\[data-arena-seat="([01])"\]$/);
      if (seat) return node.dataset.arenaSeat === seat[1];
      const wizard = selector.match(/^\[data-arena-wizard="([a-z]+)"\]$/);
      return Boolean(wizard && node.dataset.arenaWizard === wizard[1]);
    };
    const found = [];
    for (const child of this.children) {
      if (matches(child)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
}
function scene({ reduced = false, schools = ['fire', 'water'], forms = [] } = {}) {
  let nextId = 0;
  const pending = new Map();
  const view = {
    matchMedia: () => ({ matches: reduced }), setTimeout,
    requestAnimationFrame: callback => { const id = ++nextId; pending.set(id, callback); return id; },
    cancelAnimationFrame: id => pending.delete(id),
  };
  const document = { defaultView: view, createElement: () => new Element(document) };
  const root = new Element(document), wizards = [];
  for (const [index, id] of schools.entries()) {
    const wizard = new Element(document), sprite = new Element(document);
    wizard.dataset.arenaWizard = id; wizard.dataset.arenaSeat = String(index);
    wizard.dataset.element = id; wizard.dataset.form = forms[index] || 'wizard'; sprite.className = 'wizard-sprite';
    sprite.style.visibility = 'visible'; sprite.style.filter = 'contrast(1.05)';
    wizard.append(sprite); root.append(wizard); wizards.push({ wizard, sprite });
  }
  const animator = createSpellAnimator({ root });
  return { root, document, animator, wizards, pending,
    tick: time => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    node: name => root.querySelector(`.${name}`),
    nodes: name => root.querySelectorAll(`.${name}`),
  };
}
function noAfterimages(state) {
  const ghosts = state.nodes('spell-projectile-afterimage');
  assert.equal(ghosts.length, 2);
  for (const ghost of ghosts) {
    assert.equal(ghost.hidden, true);
    assert.equal(Number(ghost.style.opacity), 0);
    assert.equal(ghost.style.filter || '', '');
  }
  assert.equal(state.animator.element.dataset.afterimages, '0');
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

const creatures = [
  { key: 'xineoph', spellId: 'Fire-11', element: 'fire', nativeFacing: 'right', pose: 'wing', nativeCaster: 0 },
  { key: 'pacific', spellId: 'Water-9', element: 'water', nativeFacing: 'left', pose: 'tail', nativeCaster: 1 },
];
const sheetsFor = creature => CREATURE_ANIMATION_SHEETS[creature.key];

test('both creature routes share the approved charge, two formation poses, and one quick impact', () => {
  assert.deepEqual(CREATURE_TIMING, { windupEnd: 500, releaseAt: 1500, formationEnd: 1700,
    formationFrameMs: 100, wingFrameMs: 125, chargeFrameMs: 62.5, flightFrameMs: 1000 / 12,
    flightAt: 2075, impactAt: 2975, duration: 3315 });
  assert.deepEqual(XINEOPH_TIMING, CREATURE_TIMING, 'the earlier timing API remains compatible');
  for (const creature of creatures) {
    assert.deepEqual(getCreatureAnimation(creature.spellId), {
      key: creature.key, nativeFacing: creature.nativeFacing, pose: creature.pose,
    });
    for (const [time, stage, actorFrame, creaturePose, formationPose] of [
      [0, 'windup', 0, 0, 0], [249, 'windup', 0, 0, 0], [250, 'windup', 1, 0, 0],
      [500, 'linger', 2, 0, 0], [1499, 'linger', 2, 0, 0],
      [1500, 'forming', 2, 0, 1], [1599, 'forming', 2, 0, 1],
      [1600, 'forming', 3, 0, 2], [1699, 'forming', 3, 0, 2],
      [1700, `${creature.pose}-up`, 4, 1, 0], [1825, `${creature.pose}-middle`, 5, 2, 0],
      [1950, `${creature.pose}-down`, 6, 3, 0], [2074, `${creature.pose}-down`, 6, 3, 0],
    ]) {
      const moment = getCreatureMoment(time, { pose: creature.pose });
      assert.deepEqual([moment.stage, moment.actorFrame, moment.creaturePose, moment.formationPose],
        [stage, actorFrame, creaturePose, formationPose], `${creature.key} at ${time}ms`);
      assert.equal(moment.wingPose ?? 0, creature.pose === 'wing' ? creaturePose : 0);
      assert.equal(moment.tailPose ?? 0, creature.pose === 'tail' ? creaturePose : 0);
      assert.equal(moment.lightBlades, creature.pose === 'wing' && creaturePose === 3);
      assert.equal(moment.effectArcs, creaturePose === 3);
    }
    for (let sequence = 0; sequence < 16; sequence += 1) {
      const moment = getCreatureMoment(500 + sequence * 62.5, { pose: creature.pose });
      assert.deepEqual([moment.actorFrame, moment.chargeFrame, moment.chargeSequenceFrame], [2, sequence % 8, sequence]);
      assert.equal(getCreatureMoment(500 + (sequence + 1) * 62.5 - .001, { pose: creature.pose }).chargeFrame, sequence % 8);
    }
    assert.equal(getCreatureMoment(1500, { pose: creature.pose }).chargeFrame ?? null, null);
  }
  for (const [time, frame] of [[2075, 15], [2159, 16], [2242, 17], [2326, 18], [2410, 19], [2493, 15]]) {
    assert.equal(getCreatureMoment(time).projectileFrame, frame, 'five flight textures advance at twelve frames per second');
  }
  assert.equal(getCreatureMoment(2075).progress, 0);
  assert.equal(getCreatureMoment(2974).stage, 'flight');
  assert.equal(getCreatureMoment(2974, { pose: 'tail' }).effectArcs, true);
  assert.equal(getCreatureMoment(2975).hitTime, 0);
  assert.equal(getCreatureMoment(2975).effectArcs, false);
  assert.equal(getCreatureMoment(3184).stage, 'quick-hit');
  assert.equal(getCreatureMoment(3185).stage, 'impact-fade');
  assert.equal(getCreatureMoment(3315).stage, 'complete');
  assert.equal(getCreatureMoment(3315).effectArcs, false);
  assert.deepEqual(getXineophMoment(1950), getCreatureMoment(1950), 'the earlier moment API remains compatible');
  for (const id of ['Fire-6', 'Water-2', 'FAT-001', 'unknown', null]) assert.equal(getCreatureAnimation(id), null);
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

test('failed creature atlases settle once and release presentation locks before later retries', async t => {
  images(t, { fail: true });
  for (const creature of creatures) {
    const state = scene(), impacts = [], completes = [];
    const result = await state.animator.play({ key: `failed-${creature.key}`, spellId: creature.spellId, casterIndex: creature.nativeCaster,
      onImpact: detail => impacts.push(detail), onComplete: detail => completes.push(detail) });
    assert.equal(result.skipped, true); assert.equal(impacts.length, 1); assert.equal(completes.length, 1);
    assert.equal(state.animator.isPlaying(), false); assert.equal(state.pending.size, 0);
    assert.equal(state.wizards[creature.nativeCaster].sprite.style.visibility, 'visible');
    assert.equal(state.root.dataset.spellAnimating, undefined); noAfterimages(state);
    await ready();
  }
});

test('phoenix and dolphin playback keep feet fixed, converge their trails and hit once in either direction', async t => {
  const loaded = images(t);
  for (const creature of creatures) {
    const sheets = sheetsFor(creature), frames = sheet => sheet.animations[creature.element];
    assert.deepEqual(frames(sheets.actor), [0, 1, 10, 11, 12, 13, 14]);
    assert.deepEqual(frames(sheets.charge), [2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(frames(sheets.projectile), [15, 16, 17, 18, 19]);
    assert.deepEqual(sheets.impact.animations.impact, [20, 21, 22, 23]);
    assert.deepEqual(frames(sheets.projectile).map(frame => sheets.projectile.frameAnchors[frame].x),
      Array(5).fill(creature.nativeFacing === 'right' ? 1 : 0), 'each native leading plane is ahead of every flight pose');
    const expectedActor = creature.key === 'xineoph' ? 'phoenixFireAnimation' : 'pacificDolphinAnimation';
    const expectedEffects = creature.key === 'xineoph' ? 'phoenixCleanEffects' : expectedActor;
    assert.deepEqual(['actor', 'charge', 'projectile', 'impact'].map(role => sheets[role].asset),
      [expectedActor, expectedActor, expectedEffects, expectedEffects],
      'the deep-red phoenix caster stays separate from clean flying effects; Dolphin keeps its original atlas');
    for (const casterIndex of [0, 1]) {
      const state = scene(), impacts = [], completes = [], key = `${creature.key}-${casterIndex}`;
      const completion = state.animator.play({ key, spellId: creature.spellId, casterIndex,
        onImpact: detail => impacts.push(detail), onComplete: detail => completes.push(detail) });
      assert.equal(state.animator.play({ key, spellId: creature.spellId, casterIndex }), completion);
      await ready(); state.tick(0);
      const actor = state.node('spell-animation-actor'), projectile = state.node('spell-projectile');
      const layer = state.animator.element, target = state.wizards[1 - casterIndex].sprite;
      assert.equal(layer.dataset.customAnimation, creature.key); assert.equal(layer.dataset.kind, 'basic-attack');
      assert.deepEqual([layer.dataset.releaseAt, layer.dataset.flightAt, layer.dataset.impactAt, layer.dataset.duration],
        ['1500', '2075', '2975', '3315']);
      for (const [time, stage, sourceFrame, formationPose] of [
        [250, 'windup', 1, ''], [500, 'linger', 2, ''], [1499, 'linger', 9, ''],
        [1500, 'forming', 10, '1'], [1600, 'forming', 11, '2'],
        [1700, `${creature.pose}-up`, 12, ''], [1825, `${creature.pose}-middle`, 13, ''],
        [1950, `${creature.pose}-down`, 14, ''],
      ]) {
        state.tick(time); assert.equal(layer.dataset.stage, stage);
        assert.equal(actor.dataset.frame, String(sourceFrame));
        assert.equal(actor.dataset.asset, expectedActor);
        assert.equal(layer.dataset.formationPose, formationPose);
        assert.equal(actor.dataset.logicalX, casterIndex === 0 ? '236' : '788');
        assert.equal(actor.dataset.logicalY, '450');
        assert.equal(projectile.hidden, true); assert.equal(impacts.length, 0);
      }
      assert.equal(layer.dataset.creaturePose, '3');
      assert.equal(layer.dataset.wingPose, creature.pose === 'wing' ? '3' : '');
      assert.equal(layer.dataset.tailPose, creature.pose === 'tail' ? '3' : '');
      assert.equal(layer.dataset.lightBlades, String(creature.pose === 'wing'));
      assert.equal(layer.dataset.effectArcs, 'true');
      state.tick(2075);
      assert.equal(actor.hidden, true); assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'visible');
      assert.equal(projectile.hidden, false); assert.equal(projectile.dataset.asset, sheets.projectile.asset);
      const mirror = (creature.nativeFacing === 'right') !== (casterIndex === 0);
      assert.equal(projectile.style.transform.includes('scaleX(-1)'), mirror);
      assert.equal(projectile.dataset.contactPlane, 'leading-edge');
      const offset = sheets.actor.releaseOffset;
      const releaseX = (casterIndex === 0 ? 236 : 788) + (mirror ? -offset.x : offset.x);
      assert.ok(Math.abs(Number(projectile.dataset.contactX) - releaseX) < 1e-9);
      assert.ok(Math.abs(Number(projectile.dataset.contactY) - (450 + offset.y)) < 1e-9);
      const startX = Number(projectile.dataset.logicalX);
      for (let index = 0; index < 5; index += 1) {
        state.tick(2075 + index * CREATURE_TIMING.flightFrameMs + 1);
        assert.equal(projectile.dataset.frame, String(15 + index));
        assert.equal(projectile.dataset.asset, expectedEffects, 'each flight texture uses the effects-only atlas');
        assert.equal(projectile.style.transform.includes('scaleX(-1)'), mirror);
        for (const ghost of state.nodes('spell-projectile-afterimage').filter(node => !node.hidden)) {
          assert.equal(ghost.dataset.asset, expectedEffects, 'afterimages also use the clean effects atlas');
        }
      }
      state.tick(2435);
      const ninetyMsBehind = [Number(projectile.dataset.contactX), Number(projectile.dataset.contactY)];
      state.tick(2480);
      const fortyFiveMsBehind = [Number(projectile.dataset.contactX), Number(projectile.dataset.contactY)];
      state.tick(2525);
      assert.ok(casterIndex === 0 ? Number(projectile.dataset.logicalX) > startX : Number(projectile.dataset.logicalX) < startX);
      assert.equal(layer.dataset.afterimages, '2');
      const ghosts = state.nodes('spell-projectile-afterimage').sort((left, right) => Number(left.dataset.lagMs) - Number(right.dataset.lagMs));
      assert.equal(ghosts.length, 2);
      for (const [index, ghost] of ghosts.entries()) {
        const lag = [45, 90][index], recordedPoint = index === 0 ? fortyFiveMsBehind : ninetyMsBehind;
        assert.equal(ghost.hidden, false); assert.equal(Number(ghost.style.opacity), [.22, .1][index]);
        assert.equal(ghost.dataset.asset, expectedEffects);
        assert.equal(ghost.style.filter || '', ''); assert.equal(Number(ghost.dataset.lagMs), lag);
        assert.equal(Number(ghost.dataset.sourceElapsed), 2525 - lag);
        assert.ok(Math.abs(Number(ghost.dataset.contactX) - recordedPoint[0]) < 1e-9);
        assert.ok(Math.abs(Number(ghost.dataset.contactY) - recordedPoint[1]) < 1e-9);
        assert.ok(casterIndex === 0 ? Number(ghost.dataset.contactX) < Number(projectile.dataset.contactX)
          : Number(ghost.dataset.contactX) > Number(projectile.dataset.contactX));
        assert.equal(ghost.dataset.frame, String(getCreatureMoment(2525 - lag, { pose: creature.pose }).projectileFrame));
      }
      state.tick(2974); assert.equal(impacts.length, 0);
      for (const node of [projectile, ...ghosts]) assert.ok(casterIndex === 0 ? Number(node.dataset.contactX) < 788 : Number(node.dataset.contactX) > 236);
      state.tick(2975);
      assert.equal(impacts.length, 1); assert.equal(projectile.hidden, true); assert.match(target.style.filter, /brightness/); noAfterimages(state);
      assert.equal(state.node('spell-impact').dataset.logicalX, casterIndex === 0 ? '788' : '236');
      assert.equal(state.node('spell-impact').dataset.asset, expectedEffects);
      assert.equal(state.node('spell-impact').style.filter, '');
      state.tick(3184); assert.match(target.style.filter, /brightness/);
      state.tick(3185); assert.equal(target.style.filter, 'contrast(1.05)');
      state.tick(3315); await completion;
      assert.equal(impacts.length, 1); assert.equal(completes.length, 1); noAfterimages(state);
      assert.equal(state.animator.isPlaying(), false); assert.equal(layer.hidden, true);
      assert.equal(state.root.dataset.spellAnimating, undefined);
      assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'visible');
      const duplicate = await state.animator.play({ key, spellId: creature.spellId, casterIndex,
        onImpact: () => assert.fail('completed animation replayed') });
      assert.equal(duplicate.duplicate, true); assert.equal(state.pending.size, 0);
    }
  }
  assert.equal(loaded.length, 3, 'four plays share one deep-red caster atlas, one clean phoenix effects atlas and one Dolphin atlas');
});

test('both charged holds play eight pulse frames twice with unchanged wizard feet and body scale', async t => {
  images(t);
  for (const creature of creatures) {
    const state = scene(), impacts = [], charge = sheetsFor(creature).charge;
    assert.equal(charge.animations[creature.element].length, 8); assert.equal(charge.targetBodyHeight, 144);
    assert.ok(Math.abs(charge.sourceBodyHeight * charge.displayScale - 144) < 1e-9);
    const completion = state.animator.play({ key: `pulsing-${creature.key}`, spellId: creature.spellId, casterIndex: creature.nativeCaster,
      onImpact: detail => impacts.push(detail) });
    await ready(); state.tick(0); state.tick(499);
    const actor = state.node('spell-animation-actor');
    for (let sequence = 0; sequence < 16; sequence += 1) {
      state.tick(500 + sequence * 62.5);
      assert.equal(actor.dataset.asset, charge.asset); assert.equal(actor.dataset.frame, String(2 + sequence % 8));
      assert.deepEqual([actor.dataset.logicalX, actor.dataset.logicalY], [creature.nativeCaster === 0 ? '236' : '788', '450']);
      assert.equal(state.animator.element.dataset.chargeFrame, String(sequence % 8));
      assert.equal(state.animator.element.dataset.chargeSequenceFrame, String(sequence));
      assert.equal(state.animator.element.dataset.stage, 'linger'); assert.equal(impacts.length, 0); noAfterimages(state);
    }
    state.tick(1500);
    assert.equal(actor.dataset.frame, '10'); assert.equal(state.animator.element.dataset.chargeFrame, '');
    state.tick(1600); assert.equal(actor.dataset.frame, '11');
    state.tick(3315); await completion; assert.equal(impacts.length, 1); noAfterimages(state);
  }
});

test('cancel, replacement, and reduced motion preserve ownership and clean both creatures', async t => {
  images(t);
  for (const creature of creatures) {
    const state = scene(), events = [], casterIndex = creature.nativeCaster;
    const first = state.animator.play({ key: 'old', spellId: creature.spellId, casterIndex,
      onImpact: () => events.push('old-impact'), onComplete: () => events.push('old-complete') });
    const second = state.animator.play({ key: 'new', spellId: creature.spellId, casterIndex,
      onImpact: () => events.push('new-impact'), onComplete: () => events.push('new-complete') });
    assert.equal((await first).cancelled, true);
    await ready(); state.tick(0); state.tick(1825);
    assert.deepEqual(events, []); assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'hidden');
    state.animator.cancel(); state.animator.cancel(); await second;
    assert.deepEqual(events, ['new-impact', 'new-complete']); assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'visible');
    assert.equal(state.pending.size, 0); noAfterimages(state);
    const silent = state.animator.play({ key: 'silent-cancel', spellId: creature.spellId, casterIndex,
      onImpact: () => assert.fail('silent cancel delivered'), onComplete: () => assert.fail('silent cancel completed') });
    state.animator.cancel({ settle: false }); await silent; await ready(); assert.equal(state.pending.size, 0); noAfterimages(state);
    const flightCancel = state.animator.play({ key: 'cancel-in-flight', spellId: creature.spellId, casterIndex });
    await ready(); state.tick(0); state.tick(2500); assert.equal(state.animator.element.dataset.afterimages, '2');
    state.animator.cancel(); await flightCancel; noAfterimages(state);
    const afterHit = state.animator.play({ key: 'cancel-after-impact', spellId: creature.spellId, casterIndex,
      onImpact: () => events.push('hit-impact'), onComplete: () => events.push('hit-complete') });
    await ready(); state.tick(0); state.tick(2975); assert.match(state.wizards[1 - casterIndex].sprite.style.filter, /brightness/);
    state.animator.cancel(); await afterHit;
    assert.deepEqual(events.slice(2), ['hit-impact', 'hit-complete']);
    assert.equal(state.wizards[1 - casterIndex].sprite.style.filter, 'contrast(1.05)'); noAfterimages(state);
    const reduced = scene({ reduced: true }), calls = [];
    const skipped = await reduced.animator.play({ key: 'reduced', spellId: creature.spellId, casterIndex,
      onImpact: () => calls.push('impact'), onComplete: () => calls.push('complete') });
    assert.equal(skipped.skipped, true); assert.deepEqual(calls, ['impact', 'complete']);
    assert.equal(reduced.pending.size, 0); assert.equal(reduced.wizards[casterIndex].sprite.style.visibility, 'visible'); noAfterimages(reduced);
  }
});

test('generic Water, both creatures and ordinary Fire reuse an animator without stale hues or custom state', async t => {
  images(t);
  const state = scene(), impacts = [];
  const water = state.animator.play({ key: 'prior-water', spellId: 'Water-4', casterIndex: 1 });
  await ready(); state.tick(0); state.tick(2500); assert.match(state.node('spell-impact').style.filter, /hue-rotate\(155deg\)/);
  state.tick(2840); await water;
  const named = state.animator.play({ key: 'named-before-creatures', spellId: 'Fire-6', casterIndex: 0, modifiedTotal: 7 });
  await ready(); state.tick(0); state.tick(1500);
  assert.equal(state.animator.customElement.dataset.spellId, 'Fire-6');
  assert.equal(state.node('custom-spell-effect').dataset.asset, 'spellCharredBladeFx');
  state.tick(2840); await named;
  assert.equal(state.animator.customElement.hidden, true, 'named spell layer clears before the creature route');
  for (const creature of creatures) {
    const custom = state.animator.play({ key: `after-water-${creature.key}`, spellId: creature.spellId, casterIndex: creature.nativeCaster });
    await ready(); state.tick(0); state.tick(1950); assert.equal(state.animator.element.dataset.creaturePose, '3');
    state.tick(2975); assert.equal(state.node('spell-impact').style.filter, ''); state.tick(3315); await custom;
  }
  const completion = state.animator.play({ key: 'ordinary-fire', spellId: 'Fire-12', casterIndex: 0,
    onImpact: detail => impacts.push(detail) });
  await ready(); state.tick(0); state.tick(1500);
  for (const key of ['customAnimation', 'creaturePose', 'wingPose', 'tailPose', 'formationPose', 'chargeFrame', 'chargeSequenceFrame']) {
    assert.equal(state.animator.element.dataset[key], '', `${key} resets for a generic spell`);
  }
  assert.equal(state.animator.element.dataset.lightBlades, 'false'); noAfterimages(state);
  assert.equal(state.animator.element.dataset.effectArcs, 'false');
  assert.equal(state.animator.element.dataset.duration, '2840'); assert.equal(state.animator.element.dataset.impactAt, '2500');
  assert.equal(state.node('spell-projectile').hidden, false);
  state.tick(2499); assert.equal(impacts.length, 0); state.tick(2500); assert.equal(impacts.length, 1);
  state.tick(2840); await completion; assert.equal(impacts.length, 1);
});

test('Earth wizard and Golem casts face inward from either seat, including mirror matches', async t => {
  images(t);
  for (const casterIndex of [0, 1]) for (const golemActive of [false, true]) {
    for (const [spellId, kind, actorAsset] of [
      ['Earth-1', undefined, golemActive ? 'golemPoses' : 'earthBasicAttack'],
      ['Earth-2', undefined, golemActive ? 'golemPoses' : 'earthShield'],
      ['Earth-4', undefined, golemActive ? 'golemPoses' : 'earthPowerUp'],
      [null, 'enhancement', golemActive ? 'golemPoses' : 'earthEnhancement'],
      ['Earth-5', undefined, golemActive ? 'golemPoses' : 'earthPowerUp'],
      [null, 'golem-strike', 'golemPoses'],
    ]) {
      const activeForm = kind === 'golem-strike' || golemActive;
      const forms = ['golem', 'golem']; forms[casterIndex] = activeForm ? 'golem' : 'wizard';
      const state = scene({ schools: ['earth', 'earth'], forms }), impacts = [];
      const completion = state.animator.play({ key: `${casterIndex}:${golemActive}:${spellId || kind}`, spellId, kind,
        casterIndex, golem: activeForm, modifiedTotal: 12, onImpact: event => impacts.push(event) });
      await ready(); state.tick(0);
      const custom = spellId !== null;
      const layer = custom ? state.animator.customElement : state.animator.element;
      const actor = state.node(custom ? 'custom-spell-actor' : 'spell-animation-actor');
      assert.equal(actor.dataset.asset, actorAsset);
      assert.equal(actor.style.transform.includes('scaleX(-1)'), casterIndex === 1);
      assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'hidden');
      assert.equal(state.wizards[1 - casterIndex].sprite.style.visibility, 'visible');
      const damaging = layer.dataset.impactAt === '2500';
      if (damaging) {
        state.tick(1500);
        const projectile = state.node(custom ? 'custom-spell-effect' : 'spell-projectile');
        assert.equal(projectile.hidden, false);
        assert.equal(projectile.style.transform.includes('scaleX(-1)'), casterIndex === 1);
        if (spellId === 'Earth-5') assert.equal(projectile.dataset.asset, 'spellTectonicFx');
        if (kind === 'golem-strike') assert.equal(projectile.dataset.asset, 'earthHeavyBoulder');
        state.tick(2499); assert.equal(impacts.length, 0);
        state.tick(2500); assert.equal(impacts.length, 1);
        const hitActor = state.node(custom ? 'custom-spell-hit-actor' : 'spell-hit-actor');
        assert.equal(hitActor.dataset.asset, 'golemPoses');
        assert.equal(hitActor.dataset.frame, '12');
        assert.equal(state.wizards[1 - casterIndex].sprite.style.visibility, 'hidden');
        state.tick(2840);
      } else {
        if(spellId === 'Earth-5') assert.equal(layer.dataset.inactiveGolem,'true');
        state.tick(500); assert.equal(impacts.length, 1); state.tick(Number(layer.dataset.duration));
      }
      await completion;
      assert.equal(impacts.length, 1);
      assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'visible');
      assert.equal(state.wizards[1 - casterIndex].sprite.style.visibility, 'visible');
      assert.equal(state.node(custom ? 'custom-spell-hit-actor' : 'spell-hit-actor').hidden, true);
    }
  }
});

test('Golem transformations keep measured feet and per-frame sizes while settling once', async t => {
  images(t);
  for (const casterIndex of [0, 1]) for (const kind of ['golem-transform', 'golem-revert']) {
    const state = scene({ schools: ['earth', 'earth'] }), impacts = [];
    const completion = state.animator.play({ key: `${kind}:${casterIndex}`, kind, casterIndex,
      onImpact: event => impacts.push(event) });
    await ready(); state.tick(0);
    const sheet = GOLEM_ANIMATION_SHEETS.transform, frames = sheet.animations[kind === 'golem-transform' ? 'transform' : 'revert'];
    const actor = state.node('spell-animation-actor');
    for (const [index, frame] of frames.entries()) {
      state.tick(index * 125);
      assert.equal(actor.dataset.frame, String(frame));
      assert.equal(actor.dataset.logicalX, casterIndex === 0 ? '236' : '788');
      assert.equal(actor.dataset.logicalY, '450');
      assert.equal(actor.style.width, `${sheet.sourceWidth / sheet.columns * sheet.displayScale * sheet.frameScales[frame]}px`);
      assert.equal(actor.style.transform.includes('scaleX(-1)'), casterIndex === 1);
    }
    assert.equal(impacts.length, 0); state.tick(1000); await completion;
    assert.equal(impacts.length, 1); assert.equal(state.animator.isPlaying(), false);
  }
  const state = scene({ reduced: true, schools: ['earth', 'earth'] }), impacts = [];
  assert.equal((await state.animator.play({ key: 'reduced-earth', kind: 'golem-transform', casterIndex: 1,
    onImpact: event => impacts.push(event) })).skipped, true);
  assert.equal(impacts.length, 1);
});

test('ordinary Fire and Water actors, releases and hits work from the opposite seat', async t => {
  images(t);
  for (const [school, spellId, casterIndex] of [['fire', 'Fire-12', 1], ['water', 'Water-6', 0]]) {
    const state = scene({ schools: [school, school] }), impacts = [];
    const completion = state.animator.play({ key: `opposite:${school}`, spellId, casterIndex,
      onImpact: event => impacts.push(event) });
    await ready(); state.tick(0); state.tick(1500);
    assert.equal(state.wizards[casterIndex].sprite.style.visibility, 'hidden');
    assert.equal(state.node('spell-projectile').style.transform.includes('scaleX(-1)'), true);
    const releaseX = Number(state.node('spell-projectile').dataset.logicalX);
    state.tick(2200);
    assert.ok(casterIndex === 0 ? Number(state.node('spell-projectile').dataset.logicalX) > releaseX
      : Number(state.node('spell-projectile').dataset.logicalX) < releaseX);
    state.tick(2500); assert.equal(impacts.length, 1);
    assert.match(state.wizards[1 - casterIndex].sprite.style.filter, /brightness/);
    state.tick(2840); await completion;
  }
});
