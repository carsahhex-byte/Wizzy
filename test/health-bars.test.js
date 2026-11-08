import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthBars } from '../src/health-bars.js';

// Only the DOM operations used by the public mount API: create a progressbar,
// replace a render slot, and retain its assigned fill width across renders.
function fixture() {
  let now = 0, reduced = false, nextFrame = 0, settlements = 0;
  const frames = new Map(), attached = new Map(), slots = new Map();
  const view = {
    performance: { now: () => now },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const document = { defaultView: view, createElement: () => ({
    dataset: {}, style: {}, attributes: new Map(), children: [],
    setAttribute(name, value) { this.attributes.set(name, value); },
    append(child) { this.children.push(child); },
  }) };
  const root = { ownerDocument: document,
    querySelector: selector => slots.get(Number(selector.match(/"(\d+)"/)?.[1])) || null,
    contains: node => [...attached.values()].includes(node),
  };
  const controller = createHealthBars({ onSettled: () => settlements++ });
  return {
    controller,
    setTime(value) { now = value; },
    setReduced(value) { reduced = value; },
    render(players) {
      attached.clear(); slots.clear();
      players.forEach((player, index) => slots.set(index, { replaceWith(node) { attached.set(index, node); slots.delete(index); } }));
      controller.mount(root, players);
    },
    async raf(timestamp) {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(timestamp);
      await Promise.resolve();
    },
    node: index => attached.get(index),
    percent: index => Number(attached.get(index).dataset.healthPercent),
    painted: index => Number.parseFloat(attached.get(index).children[0].style.width),
    get settlements() { return settlements; },
  };
}

for (const [name, initial, target] of [['damage', 100, 0], ['healing', 0, 100]]) {
  test(`${name} does not reverse when a queued RAF timestamp precedes the latest mount`, async () => {
    const ui = fixture(), players = [{ name: 'Fire', hp: initial, maxHp: 100 }];
    ui.render(players);
    const persistent = ui.node(0);
    players[0].hp = target; ui.render(players);
    ui.setTime(250); ui.render(players);
    const displayed = ui.percent(0), painted = ui.painted(0);
    assert.equal(ui.node(0), persistent);
    assert.equal(persistent.dataset.healthStartedAt, '0');

    // A render can sample performance.now() later than the RAF already queued
    // for this browser frame. That stale frame must not rewind either value.
    await ui.raf(240);
    assert.equal(ui.percent(0), displayed);
    assert.equal(ui.painted(0), painted);
    assert.equal(persistent.dataset.healthStartedAt, '0');

    ui.setTime(260); await ui.raf(260);
    assert.ok(target < initial ? ui.percent(0) < displayed : ui.percent(0) > displayed);
    assert.equal(ui.painted(0), ui.percent(0));
    assert.equal(ui.settlements, 0);
    ui.setTime(800); await ui.raf(800);
    assert.equal(ui.percent(0), target);
    assert.equal(ui.painted(0), target);
    assert.equal(ui.controller.isAnimating(), false);
    assert.equal(ui.settlements, 1, 'the original 800ms timeline settles once');
    ui.render(players); await ui.raf(900);
    assert.equal(ui.settlements, 1, 'unchanged snapshots do not restart or resettle');
  });
}

test('retargeting starts at the displayed fill; reset and reduced motion finish safely', async () => {
  const ui = fixture(), players = [{ name: 'Fire', hp: 100, maxHp: 100 }];
  ui.render(players); players[0].hp = 0; ui.render(players);
  ui.setTime(400); ui.render(players);
  assert.equal(ui.percent(0), 50);
  players[0].hp = 80; ui.render(players);
  assert.equal(ui.percent(0), 50);
  assert.equal(ui.node(0).dataset.healthFromPercent, '50');
  ui.setTime(800); await ui.raf(800);
  assert.equal(ui.percent(0), 65);
  ui.setTime(1200); await ui.raf(1200);
  assert.equal(ui.percent(0), 80);
  assert.equal(ui.settlements, 1);

  players[0].hp = 0; ui.render(players);
  ui.setTime(1400); await ui.raf(1400);
  ui.controller.reset(); players[0].hp = 25; ui.render(players);
  assert.equal(ui.percent(0), 25);
  assert.equal(ui.controller.isAnimating(), false);
  await ui.raf(2000);
  assert.equal(ui.settlements, 1, 'reset cancels the old cycle without callbacks');

  ui.setReduced(true); players[0].hp = 0; ui.render(players);
  await Promise.resolve();
  assert.equal(ui.percent(0), 0);
  assert.equal(ui.painted(0), 0);
  assert.equal(ui.controller.isAnimating(), false);
  assert.equal(ui.settlements, 2);
});
