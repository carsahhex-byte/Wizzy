import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleScene } from '../src/battle-scene.js';
import { WIZARD_SPRITES, EARTH_ANIMATION_SHEETS } from '../src/assets.js';

class Element {
  constructor(document) {
    this.ownerDocument = document; this.style = {}; this.dataset = {}; this.children = []; this.attributes = {};
    this.classList = { toggle: (name,enabled) => {
      const classes = new Set(this.className.split(' ')); if (enabled) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
    }};
  }
  setAttribute(name,value) { this.attributes[name] = value; }
  set innerHTML(value) {
    this.children = [];
    if (value.includes('wizard-sprite')) for (const className of ['mage-shadow','wizard-sprite']) {
      const child = new Element(this.ownerDocument); child.className = className; this.append(child);
    }
  }
  append(...children) { this.children.push(...children); }
  querySelector(selector) { return this.children.find(child => child.className?.split(' ').includes(selector.slice(1))) || null; }
}
function fixture(t,{reduced=false}={}) {
  const savedDocument = globalThis.document, savedImage = globalThis.Image;
  const pending = new Map(); let id = 0;
  const view = {
    matchMedia: () => ({matches:reduced}),
    requestAnimationFrame: callback => { pending.set(++id,callback); return id; },
    cancelAnimationFrame: key => pending.delete(key),
  };
  const document = {defaultView:view,createElement: () => new Element(document)};
  globalThis.document = document;
  globalThis.Image = class {
    naturalWidth = 887;
    set src(value) { queueMicrotask(()=>this.onload?.()); }
    async decode() {}
  };
  t.after(()=> {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedImage === undefined) delete globalThis.Image; else globalThis.Image = savedImage;
  });
  const scene = createBattleScene();
  return {scene,pending,wizards:scene.element.children.filter(child=>child.dataset.arenaSeat!==undefined),
    tick: time => { const callbacks=[...pending.values()]; pending.clear(); callbacks.forEach(callback=>callback(time)); }};
}
const players = schools => schools.map((school,index)=>({id:`seat-${index+1}`,school,golemActive:false}));

test('school selection and inward facing are independent of player seats', t => {
  const state = fixture(t);
  for (const schools of [['fire','earth'],['earth','fire'],['water','earth'],['earth','water'],['earth','earth'],['water','fire']]) {
    state.scene.setCombatants(players(schools));
    for (const [index,wizard] of state.wizards.entries()) {
      assert.equal(wizard.dataset.arenaSeat,String(index));
      assert.equal(wizard.dataset.element,schools[index]);
      assert.equal(wizard.dataset.playerId,`seat-${index+1}`);
      assert.equal(wizard.dataset.direction,index===0?'right':'left');
      const sprite = wizard.querySelector('.wizard-sprite');
      if (schools[index] === 'earth') {
        assert.equal(sprite.dataset.asset,EARTH_ANIMATION_SHEETS.idle.asset);
        assert.equal(sprite.style.transform.includes('scaleX(-1)'),index===1);
      } else {
        const row = WIZARD_SPRITES.directions[schools[index]][index===0?'right':'left'];
        assert.equal(sprite.style.backgroundPosition,`0px ${-row*192}px`);
        assert.equal(sprite.style.transform,'');
      }
    }
  }
  state.scene.hide();
});

test('Golem idle, revert and hide retain each actor seat and cleanly stop idle animation', t => {
  const state = fixture(t), combatants = players(['earth','earth']);
  combatants[1].golemActive = true;
  state.scene.setCombatants(combatants);
  state.scene.setActive(1);
  assert.equal(state.wizards[1].dataset.form,'golem');
  assert.equal(state.wizards[1].querySelector('.wizard-sprite').dataset.asset,'golemPoses');
  assert.equal(state.wizards[0].dataset.form,'wizard');
  assert.equal(state.wizards[1].dataset.active,'true');
  state.tick(0); state.tick(160);
  assert.equal(state.wizards[1].querySelector('.wizard-sprite').dataset.frame,'1');
  combatants[1].golemActive = false;
  state.scene.setCombatants(combatants);
  assert.equal(state.wizards[1].dataset.form,'wizard');
  assert.equal(state.wizards[1].querySelector('.wizard-sprite').dataset.asset,'earthIdle');
  state.scene.hide(); assert.equal(state.pending.size,0);
});

test('Earth walking uses the measured walk anchor and switches to idle at entrance completion', async t => {
  const state = fixture(t);
  state.scene.setCombatants(players(['water','earth']));
  assert.equal(state.scene.prepareEntrance('earth-entrance'),true);
  assert.equal(await state.scene.startEntrance('earth-entrance'),true);
  state.tick(0); state.tick(500);
  assert.equal(state.wizards[1].querySelector('.wizard-sprite').dataset.asset,'earthWalk');
  assert.equal(state.wizards[1].querySelector('.wizard-sprite').dataset.logicalY,'180');
  assert.equal(state.wizards[1].querySelector('.wizard-sprite').style.transform.includes('scaleX(-1)'),true);
  state.tick(1800);
  assert.equal(state.wizards[1].querySelector('.wizard-sprite').dataset.asset,'earthIdle');
  assert.equal(state.scene.prepareEntrance('earth-entrance'),false);
  state.scene.hide(); assert.equal(state.pending.size,0);
});

test('reduced motion retains Earth/Golem poses without scheduling animation', t => {
  const state = fixture(t,{reduced:true}), combatants=players(['earth','earth']);
  combatants[0].golemActive=true; state.scene.setCombatants(combatants);
  assert.equal(state.scene.prepareEntrance('reduced'),false);
  assert.equal(state.pending.size,0);
  assert.equal(state.wizards[0].querySelector('.wizard-sprite').dataset.asset,'golemPoses');
  state.scene.hide();
});
