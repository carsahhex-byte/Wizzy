import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpellAnimator } from '../src/spell-animation.js';
import { CUSTOM_SPELL_ANIMATION_SHEETS, CUSTOM_SPELL_IDS, getCustomSpellSheet } from '../src/custom-spell-sheets.js';
import { CUSTOM_SPELL_TIMING, getCustomSpellMoment } from '../src/custom-spell-animation.js';

class Style {
  getPropertyValue(key){return this[key]||'';}
  getPropertyPriority(){return '';}
  setProperty(key,value){this[key]=String(value);}
  removeProperty(key){delete this[key];}
}
class Element {
  constructor(document){this.ownerDocument=document;this.style=new Style();this.dataset={};this.children=[];}
  setAttribute(){}
  append(...nodes){this.children.push(...nodes);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){
    const match=node=>selector.startsWith('.')?node.className?.split(' ').includes(selector.slice(1))
      :node.dataset.arenaSeat===selector.match(/^\[data-arena-seat="([01])"\]$/)?.[1];
    return this.children.flatMap(node=>[...(match(node)?[node]:[]),...node.querySelectorAll(selector)]);
  }
}
function makeScene({reduced=false,school='fire',casterIndex=0,golem=false,targetGolem=false}={}){
  let id=0;const pending=new Map();
  const view={matchMedia:()=>({matches:reduced}),setTimeout,
    requestAnimationFrame:callback=>{pending.set(++id,callback);return id;},cancelAnimationFrame:key=>pending.delete(key)};
  const document={defaultView:view,createElement:()=>new Element(document)};
  const root=new Element(document),wizards=[],players=[];
  for(let index=0;index<2;index++){
    const own=index===casterIndex,element=own?school:targetGolem?'earth':school==='water'?'fire':'water';
    const node=new Element(document),sprite=new Element(document);
    Object.assign(node.dataset,{arenaSeat:String(index),arenaWizard:element,element,form:(own?golem:targetGolem)?'golem':'wizard'});
    sprite.className='wizard-sprite';sprite.style.visibility='visible';sprite.style.filter='contrast(1.05)';
    node.append(sprite);root.append(node);wizards.push({node,sprite});players.push({element,golemActive:own?golem:targetGolem});
  }
  const animator=createSpellAnimator({root});
  return {root,animator,wizards,players,pending,node:name=>root.querySelector('.'+name),
    tick:time=>{const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(time);}};
}
function fakeImages(t,{missing=false}={}){
  const old=globalThis.Image;
  if(missing)delete globalThis.Image;
  else globalThis.Image=class {
    naturalWidth=1254;complete=false;
    set src(value){queueMicrotask(()=>{this.complete=true;this.onload?.();});}
    async decode(){}
  };
  t.after(()=>{if(old===undefined)delete globalThis.Image;else globalThis.Image=old;});
}
const ready=()=>new Promise(resolve=>setImmediate(resolve));
const options=(scene,id,extras={})=>({key:id,spellId:id,casterIndex:0,players:scene.players,modifiedTotal:12,...extras});

test('approved spell metadata keeps all thirteen effects distinct and source cells bounded',()=>{
  assert.equal(CUSTOM_SPELL_IDS.length,13);
  assert.equal(new Set(CUSTOM_SPELL_IDS.map(id=>getCustomSpellSheet(id).asset)).size,13);
  for(const id of CUSTOM_SPELL_IDS){
    const sheet=getCustomSpellSheet(id);assert.equal(Object.isFrozen(sheet),true);
    assert.equal(sheet.sourceWidth,1254);assert.equal(sheet.sourceHeight,1254);
    assert.equal(sheet.frameRects.length,16);
    for(const rect of sheet.frameRects){assert.ok(rect.x>=0&&rect.y>=0&&rect.w>0&&rect.h>0);assert.ok(rect.x+rect.w<=1254&&rect.y+rect.h<=1254);}
  }
  assert.equal(getCustomSpellSheet('Earth-1').name,'OffoDefo');
  assert.equal(getCustomSpellSheet('Water-12').name,'Carbonate');
  for(const id of ['Fire-11','Water-9','FAT-001','missing',null])assert.equal(getCustomSpellSheet(id),null);
});

test('missing image support settles both callbacks once and releases all presentation locks',async t=>{
  fakeImages(t,{missing:true});const state=makeScene(),calls=[];
  const result=await state.animator.play(options(state,'Fire-2',{onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
  assert.equal(result.skipped,true);assert.deepEqual(calls,['impact','complete']);
  assert.equal(state.animator.isPlaying(),false);assert.equal(state.root.dataset.customSpell,undefined);
  assert.equal(state.root.dataset.spellAnimating,undefined);assert.equal(state.pending.size,0);
  assert.equal(state.wizards[0].sprite.style.visibility,'visible');
});

test('every named attack and buff runs its approved layers with one impact and clean mirrored completion',async t=>{
  fakeImages(t);
  for(const id of CUSTOM_SPELL_IDS)for(const seat of [0,1]){
    const sheet=getCustomSpellSheet(id),golem=id==='Earth-5';
    const state=makeScene({school:sheet.element,casterIndex:seat,golem}),calls=[];
    const job=state.animator.play(options(state,id,{key:`${id}:${seat}`,casterIndex:seat,golem,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    await ready();state.tick(0);
    const layer=state.animator.customElement,effect=state.node('custom-spell-effect');
    assert.equal(layer.hidden,false,id);assert.equal(layer.dataset.spellId,id);
    if(id==='Fire-14'){
      assert.equal(effect.hidden,true,'Sunsetter uses the existing heavy Fire charge without a second orb');
      assert.equal(state.node('custom-spell-actor').dataset.asset,'combatV2LargeCast');
    }else if(id==='Water-14'){
      assert.equal(effect.hidden,true,'the whirlpool forms before the trident appears');
      assert.equal(state.node('rift-whirlpool').dataset.asset,'spellRiftWhirlpool');
    }else if(['Fire-2','Water-0'].includes(id)){
      assert.equal(effect.dataset.asset,'spellElementalRings');
    }else{
      assert.equal(effect.dataset.asset,sheet.asset);assert.equal(effect.dataset.mirrored,String(seat===1));
    }
    assert.equal(state.wizards[seat].sprite.style.visibility,'hidden');
    state.tick(500);state.tick(1499);
    assert.equal(layer.dataset.phase,getCustomSpellMoment(id,1499,{modifiedTotal:12,golem}).phase,id);
    if(id==='Fire-14')assert.equal(effect.hidden,true);
    else assert.equal(effect.dataset.asset,['Fire-2','Water-0'].includes(id)?'spellElementalRings':id==='Water-14'?'spellRiftTrident':sheet.asset);
    const moment=getCustomSpellMoment(id,0,{modifiedTotal:12,golem});
    if(moment.damaging){
      assert.deepEqual(calls,[]);state.tick(1500);assert.equal(layer.dataset.phase,getCustomSpellMoment(id,1500,{modifiedTotal:12,golem}).phase);
      assert.equal(effect.dataset.asset,id==='Water-14'?'spellRiftTrident':sheet.asset);
      if(id!=='Water-14')assert.equal(effect.dataset.mirrored,String(seat===1));
      state.tick(2499);assert.deepEqual(calls,[]);state.tick(2500);assert.deepEqual(calls,['impact']);
      assert.notEqual(state.wizards[1-seat].sprite.style.filter,'contrast(1.05)');
      state.tick(2710);assert.equal(state.wizards[1-seat].sprite.style.filter,'contrast(1.05)');
    }else assert.deepEqual(calls,['impact']);
    state.tick(moment.duration);await job;
    assert.deepEqual(calls,['impact','complete'],`${id}:${seat}`);assert.equal(layer.hidden,true);
    assert.equal(state.animator.isPlaying(),false);assert.equal(state.pending.size,0);
    assert.equal(state.root.dataset.customSpell,undefined);assert.equal(state.root.dataset.spellAnimating,undefined);
    for(const wizard of state.wizards){assert.equal(wizard.sprite.style.visibility,'visible');assert.equal(wizard.sprite.style.filter,'contrast(1.05)');}
  }
});

test('hand-held effects form in front of the caster on either side instead of above the hat',async t=>{
  fakeImages(t);
  const placements=[['Fire-15',75,390],['Fire-6',85,380],
    ['Water-2',85,380],['Water-12',90,380],['Earth-1',75,385]];
  for(const [id,inward,y]of placements)for(const seat of[0,1]){
    const state=makeScene({school:getCustomSpellSheet(id).element,casterIndex:seat});
    const job=state.animator.play(options(state,id,{key:`front:${id}:${seat}`,casterIndex:seat}));
    await ready();state.tick(0);
    const effect=state.node('custom-spell-effect'),actor=state.node('custom-spell-actor');
    const casterX=seat===0?236:788,direction=seat===0?1:-1;
    assert.ok(state.animator.customElement.children.indexOf(effect)>state.animator.customElement.children.indexOf(actor),
      'the isolated effect draws in front of the casting actor');
    for(const time of[0,375,500,1000,1499]){
      state.tick(time);
      assert.equal(effect.hidden,false,`${id}:${seat}:${time}`);
      assert.equal(Number(effect.dataset.logicalX),casterX+direction*inward,`${id} faces the opponent`);
      assert.equal(Number(effect.dataset.logicalY),y,`${id} remains at hand/face height through the charge`);
      assert.equal(effect.dataset.mirrored,String(seat===1));
    }
    state.tick(3000);await job;
  }
});

test('ground effects stay on the arena floor and self-protection stays centered on its caster',async t=>{
  fakeImages(t);
  for(const id of['Earth-3','Earth-5'])for(const seat of[0,1]){
    const state=makeScene({school:'earth',casterIndex:seat,golem:id==='Earth-5'});
    const job=state.animator.play(options(state,id,{key:`ground:${id}:${seat}`,casterIndex:seat,golem:id==='Earth-5'}));
    await ready();state.tick(0);
    const effect=state.node('custom-spell-effect');
    for(const time of[0,375,500,1499,1500,1750,2250,2499]){
      state.tick(time);assert.equal(effect.hidden,false);
      assert.equal(effect.dataset.logicalY,id==='Earth-3'?'450':'430',`${id}:${seat}:${time} keeps its base at ground level`);
    }
    state.tick(2500);assert.equal(effect.dataset.logicalY,id==='Earth-3'?'450':'430');
    assert.equal(effect.dataset.logicalX,String(id==='Earth-3'?(seat===0?236:788):(seat===0?788:236)));
    state.tick(getCustomSpellMoment(id,0,{modifiedTotal:12,golem:id==='Earth-5'}).duration);await job;
  }
  for(const [id,y]of[['Earth-2',360],['Earth-4',370]])for(const seat of[0,1]){
    const state=makeScene({school:'earth',casterIndex:seat});
    const job=state.animator.play(options(state,id,{key:`self:${id}:${seat}`,casterIndex:seat}));
    await ready();state.tick(0);
    for(const time of[0,500,1499]){
      state.tick(time);const effect=state.node('custom-spell-effect');
      assert.equal(effect.dataset.logicalX,String(seat===0?236:788),`${id} surrounds its caster`);
      assert.equal(Number(effect.dataset.logicalY),y);
    }
    state.tick(3000);await job;
  }
});

test('Sunsetter keeps one heavy charge, drops its meteor from the sky and expands its explosion',async t=>{
  fakeImages(t);
  for(const seat of[0,1]){
    const state=makeScene({school:'fire',casterIndex:seat}),calls=[];
    const job=state.animator.play(options(state,'Fire-14',{key:`sunsetter:${seat}`,casterIndex:seat,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    await ready();state.tick(0);
    const effect=state.node('custom-spell-effect'),actor=state.node('custom-spell-actor'),layer=state.animator.customElement;
    assert.equal(layer.dataset.chargeSource,'heavy-fire-actor');
    for(const time of[0,375,500,1000,1375,1499]){
      state.tick(time);
      assert.equal(effect.hidden,true,`no isolated custom orb before release at ${time}`);
      assert.equal(layer.dataset.effectVisible,'false');
      assert.equal(actor.dataset.asset,'combatV2LargeCast');
      assert.equal(Number(actor.dataset.frame),Math.floor(time/125));
      assert.equal(actor.hidden,false);
    }
    state.tick(1500);
    assert.equal(effect.hidden,false);assert.equal(effect.dataset.asset,'spellSunsetterFx');assert.equal(effect.dataset.frame,'8');
    assert.equal(effect.dataset.logicalX,String(seat===0?266:758));assert.equal(effect.dataset.logicalY,'-180');
    assert.equal(effect.dataset.trajectory,'from-sky');
    assert.equal(actor.dataset.frame,'1','clean recovery excludes the baked outgoing orb');
    const launchX=Number(effect.dataset.logicalX),direction=seat===0?1:-1;
    let previousX=launchX;
    for(const [time,frame,actorFrame]of[[1501,8,1],[1625,8,1],[1750,9,15],[1875,9,15],[2000,10,null],[2250,11,null],[2499,11,null]]){
      state.tick(time);
      assert.equal(Number(effect.dataset.frame),frame);
      assert.ok((Number(effect.dataset.logicalX)-previousX)*direction>=0,'meteor moves continuously toward the opponent');
      assert.ok(Number(effect.dataset.logicalY)>=-180&&Number(effect.dataset.logicalY)<=350,'meteor descends through the arena');
      if(actorFrame===null)assert.equal(actor.hidden,true);else{
        assert.equal(actor.hidden,false);assert.equal(Number(actor.dataset.frame),actorFrame);
      }
      previousX=Number(effect.dataset.logicalX);
    }
    assert.ok(Math.abs(Number(effect.dataset.logicalX)-(seat===0?788:236))<=2,'meteor reaches the opponent at the end of flight');
    assert.deepEqual(calls,[]);state.tick(2500);assert.deepEqual(calls,['impact']);
    assert.equal(effect.dataset.frame,'12');
    const widthAtImpact=parseFloat(effect.style.width),burst=state.node('revised-spell-burst');
    assert.equal(burst.hidden,false);assert.equal(burst.dataset.burst,'expanding-fire-ring');
    state.tick(2710);assert.equal(state.wizards[1-seat].sprite.style.filter,'contrast(1.05)');
    state.tick(3000);assert.ok(parseFloat(effect.style.width)>widthAtImpact+100,'explosion grows beyond the projectile');
    assert.equal(layer.hidden,false,'the blast can linger while the hit flash stays quick');
    state.tick(3250);await job;assert.deepEqual(calls,['impact','complete']);
    assert.equal(effect.hidden,true);assert.equal(burst.hidden,true);
  }
});

test('Swell surrounds either caster with separate rear and front wave halves for its standard duration',async t=>{
  fakeImages(t);
  for(const seat of[0,1]){
    const state=makeScene({school:'water',casterIndex:seat}),calls=[];
    const job=state.animator.play(options(state,'Water-0',{casterIndex:seat,modifiedTotal:6,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    await ready();state.tick(0);
    const front=state.node('custom-spell-effect'),back=state.node('revised-ring-back'),rear=state.node('revised-spell-rear-layer');
    for(const time of[375,500,1000,1499,1900,2100]){
      state.tick(time);
      assert.equal(front.hidden,false);assert.equal(back.hidden,false);assert.equal(rear.hidden,false);
      for(const node of[front,back]){
        assert.equal(node.dataset.asset,'spellElementalRings');assert.equal(node.dataset.logicalX,seat===0?'236':'788');
        assert.equal(node.dataset.logicalY,'439','wave circles the feet rather than floating beside the face');
        assert.ok(Number(node.dataset.frame)>=4&&Number(node.dataset.frame)<=7,'the wave uses Water frames');
      }
      assert.equal(back.dataset.layer,'behind-wizard');assert.equal(front.dataset.layer,'in-front-of-feet');
      assert.match(back.style.clipPath,/^inset\(0 0 /);assert.match(front.style.clipPath,/^inset\([^ ]+ 0 0 0\)$/);
      assert.equal(rear.style.zIndex,'1');
    }
    assert.deepEqual(calls,['impact']);assert.equal(Number(state.animator.customElement.dataset.duration),2240);
    state.tick(2240);await job;assert.deepEqual(calls,['impact','complete']);
    assert.equal(rear.hidden,true);assert.equal(back.hidden,true);assert.equal(front.hidden,true);
  }
});

test('Heatbox tiers circle the feet, rise on seven and descend into a sparkling burst on ten',async t=>{
  fakeImages(t);
  for(const seat of[0,1])for(const [total,tier,duration]of[[6,0,2240],[7,7,2840],[9,7,2840],[10,10,3840]]){
    const state=makeScene({school:'fire',casterIndex:seat}),players=structuredClone(state.players),calls=[];
    const job=state.animator.play(options(state,'Fire-2',{key:`heat:${seat}:${total}`,casterIndex:seat,modifiedTotal:total,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    await ready();state.tick(0);const layer=state.animator.customElement,front=state.node('custom-spell-effect');
    const back=state.node('revised-ring-back'),burst=state.node('revised-spell-burst');
    assert.equal(layer.dataset.variant,String(tier));assert.equal(front.dataset.logicalY,'439');
    state.tick(500);assert.deepEqual(calls,['impact']);
    state.tick(1499);
    assert.equal(front.dataset.logicalY,tier===0?'439':'326');
    assert.equal(back.dataset.logicalY,front.dataset.logicalY,'ring halves rise together around the caster');
    assert.equal(front.dataset.logicalX,seat===0?'236':'788');
    if(tier===10){
      state.tick(2250);assert.ok(Number(front.dataset.logicalY)>326&&Number(front.dataset.logicalY)<439);
      state.tick(2500);assert.equal(front.dataset.logicalY,'439');assert.equal(burst.hidden,false);
      const sparkle=layer.querySelector('.enhancement-flourish');
      assert.equal(sparkle.hidden,false);assert.equal(sparkle.dataset.tier,'12');
      assert.equal(layer.dataset.phase,'burst');state.tick(3499);assert.equal(burst.hidden,false);
    }else{
      state.tick(Math.min(duration-1,2500));assert.equal(burst.hidden,true);
      assert.equal(layer.querySelector('.enhancement-flourish').hidden,true);
    }
    assert.equal(Number(layer.dataset.duration),duration);state.tick(duration);await job;
    assert.deepEqual(calls,['impact','complete']);assert.deepEqual(state.players,players,'the flourish cannot grant additional resources or Enhancement');
    assert.equal(back.hidden,true);assert.equal(burst.hidden,true);
    assert.equal(layer.querySelector('.enhancement-flourish').hidden,true);
  }
});

test('Poseidon’s Rift rises from an inward whirlpool, rotates during a half-second hover and accelerates into its dive',async t=>{
  fakeImages(t);
  for(const seat of[0,1]){
    const state=makeScene({school:'water',casterIndex:seat}),calls=[],direction=seat===0?1:-1;
    const job=state.animator.play(options(state,'Water-14',{key:`rift:${seat}`,casterIndex:seat,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    await ready();state.tick(0);
    const effect=state.node('custom-spell-effect'),pool=state.node('rift-whirlpool'),actor=state.node('custom-spell-actor');
    const poolX=(seat===0?236:788)+direction*95;
    assert.equal(effect.hidden,true);assert.equal(Number(pool.dataset.logicalX),poolX);assert.equal(pool.dataset.logicalY,'420');
    state.tick(500);assert.equal(effect.dataset.asset,'spellRiftTrident');assert.equal(effect.dataset.logicalY,'429');
    assert.equal(actor.dataset.frame,'17','clean Water pose excludes its baked heavy wave charge');
    state.tick(1499);assert.equal(effect.dataset.logicalY,'291');assert.equal(effect.dataset.rotation,'0');
    state.tick(1500);assert.equal(state.animator.customElement.dataset.phase,'trident-hover');
    state.tick(1750);assert.equal(Number(effect.dataset.rotation),direction*45);
    assert.equal(Number(effect.dataset.logicalX),poolX);assert.ok(Math.abs(Number(effect.dataset.logicalY)-291)<=3);
    state.tick(1999);assert.equal(state.animator.customElement.dataset.phase,'trident-hover');
    assert.ok(Math.abs(Number(effect.dataset.rotation)-direction*90)<.01);
    state.tick(2000);assert.equal(state.animator.customElement.dataset.phase,'trident-dive');
    assert.equal(Number(effect.dataset.logicalX),poolX);assert.equal(effect.dataset.logicalY,'291');
    state.tick(2125);const firstQuarter=Number(effect.dataset.logicalX);
    state.tick(2250);const middle=Number(effect.dataset.logicalX);assert.equal(pool.hidden,true,'whirlpool subsides after launch');
    state.tick(2375);const thirdQuarter=Number(effect.dataset.logicalX);
    assert.ok(Math.abs(thirdQuarter-middle)>Math.abs(firstQuarter-poolX),'the trident eases into a fast dive');
    state.tick(2499);assert.deepEqual(calls,[]);assert.ok(Math.abs(Number(effect.dataset.logicalX)-(seat===0?788:236))<3);
    state.tick(2500);assert.deepEqual(calls,['impact']);assert.equal(effect.dataset.asset,'spellPoseidonRiftFx');
    state.tick(2710);assert.equal(state.wizards[1-seat].sprite.style.filter,'contrast(1.05)');
    state.tick(2840);await job;assert.deepEqual(calls,['impact','complete']);assert.equal(pool.hidden,true);
  }
});

test('Earthbound hits along the ground before a threshold-only temporary stone shell flashes white and fades',async t=>{
  fakeImages(t);
  for(const seat of[0,1])for(const total of[6,7]){
    const state=makeScene({school:'earth',casterIndex:seat}),players=structuredClone(state.players),calls=[];
    const job=state.animator.play(options(state,'Earth-3',{key:`shell:${seat}:${total}`,casterIndex:seat,modifiedTotal:total,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    await ready();state.tick(0);const effect=state.node('custom-spell-effect'),shell=state.node('earthbound-stone-shell');
    for(const time of[0,500,1499,1500,2000,2499]){
      state.tick(time);assert.equal(effect.dataset.logicalY,'450');assert.equal(effect.dataset.contactPlane,'ground');
      assert.equal(shell.hidden,true);
    }
    state.tick(2500);assert.deepEqual(calls,['impact']);assert.equal(!shell.hidden,total>=7);
    if(total>=7){
      assert.equal(shell.dataset.temporary,'true');assert.equal(shell.dataset.phase,'shell-building');
      assert.equal(state.wizards[seat].sprite.style.visibility,'hidden');assert.equal(shell.dataset.asset,'golemTransform');
      assert.equal(effect.dataset.logicalX,seat===0?'236':'788');assert.equal(effect.dataset.logicalY,'450');
      state.tick(2940);assert.equal(shell.style.filter,'brightness(0) invert(1)');assert.equal(effect.style.filter,shell.style.filter);
      assert.equal(shell.dataset.phase,'white-flash');state.tick(3310);assert.equal(shell.dataset.phase,'shell-fade');
      assert.ok(Number(shell.style.opacity)>0&&Number(shell.style.opacity)<1);
    }else assert.equal(effect.hidden,true,'a failed Shield threshold cannot show a stone transformation');
    state.tick(total>=7?3500:2840);await job;assert.deepEqual(calls,['impact','complete']);
    assert.equal(shell.hidden,true);assert.equal(state.wizards[seat].sprite.style.visibility,'visible');
    assert.equal(state.wizards[seat].node.dataset.form,'wizard');assert.deepEqual(state.players,players,'the temporary shell cannot change actual Golem form');
  }
});

test('revised spell cancellation clears rear waves, pools, shells and sparkles before another action',async t=>{
  fakeImages(t);
  for(const[id,total,time]of[['Fire-2',10,3000],['Fire-14',12,3000],['Water-0',7,1000],['Water-14',12,1750],['Earth-3',7,3000]]){
    const state=makeScene({school:getCustomSpellSheet(id).element}),calls=[];
    const job=state.animator.play(options(state,id,{key:`cancel:${id}`,modifiedTotal:total,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    await ready();state.tick(0);state.tick(time);state.animator.cancel({settle:false});await job;
    for(const name of['revised-ring-back','rift-whirlpool','revised-spell-burst','earthbound-stone-shell','custom-spell-effect'])
      assert.equal(state.node(name).hidden,true,`${id} leaves no ${name}`);
    assert.equal(state.node('revised-spell-rear-layer').hidden,true);
    assert.equal(state.animator.customElement.querySelector('.enhancement-flourish').hidden,true);
    assert.equal(state.pending.size,0);assert.equal(state.wizards[0].sprite.style.visibility,'visible');
    assert.equal(calls.filter(value=>value==='complete').length,0,'replacement does not settle a canceled presentation');
    const next=state.animator.play(options(state,'Fire-6',{key:`next:${id}`}));
    await ready();state.tick(5000);assert.equal(state.node('custom-spell-effect').style.clipPath,'');
    assert.equal(state.node('custom-spell-effect').style.filter,'');state.tick(7840);await next;
  }
});

test('reduced motion settles each revised spell once without leaving temporary layers or altering players',async t=>{
  fakeImages(t);
  for(const id of['Fire-2','Fire-14','Water-0','Water-14','Earth-3']){
    const state=makeScene({school:getCustomSpellSheet(id).element,reduced:true}),before=structuredClone(state.players),calls=[];
    const result=await state.animator.play(options(state,id,{onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')}));
    assert.equal(result.skipped,true);assert.deepEqual(calls,['impact','complete']);assert.deepEqual(state.players,before);
    assert.equal(state.animator.customElement.hidden,true);assert.equal(state.node('revised-spell-rear-layer').hidden,true);
    assert.equal(state.node('earthbound-stone-shell').hidden,true);assert.equal(state.node('rift-whirlpool').hidden,true);
    assert.equal(state.animator.customElement.querySelector('.enhancement-flourish').hidden,true);
    assert.equal(state.pending.size,0);assert.equal(state.wizards[0].sprite.style.visibility,'visible');
  }
});

test('threshold-only Shield and Mana feedback uses final Modified Roll and stays with the caster',async t=>{
  fakeImages(t);
  for(const [id,total,shown] of [['Earth-3',6,false],['Earth-3',7,true],['Earth-1',2,true]]){
    const state=makeScene({school:'earth',casterIndex:1}),job=state.animator.play(options(state,id,{casterIndex:1,modifiedTotal:total}));
    await ready();state.tick(0);state.tick(2500);
    const fx=state.node('custom-spell-effect');assert.equal(!fx.hidden,shown);
    if(shown)assert.equal(fx.dataset.logicalX,'788','Shield follow-through is on Earth, not the opponent');
    assert.equal(state.animator.customElement.dataset.hitFlash,'true','primary damage still hits for base rolls');
    state.tick(getCustomSpellMoment(id,0,{modifiedTotal:total}).duration);await job;
  }
  for(const [id,threshold,kind] of [['Fire-15',6,'mana'],['Earth-2',6,'mana'],['Water-12',7,'heart'],['Water-2',8,'water'],['Fire-6',7,'fire']]){
    for(const total of [threshold-1,threshold]){
      const state=makeScene({school:getCustomSpellSheet(id).element}),job=state.animator.play(options(state,id,{key:`${id}:${total}`,modifiedTotal:total}));
      await ready();state.tick(0);state.tick(getCustomSpellSheet(id).kind==='attack'?2500:1500);
      const feedback=state.node('custom-spell-secondary-0');assert.equal(!feedback.hidden,total>=threshold,id);
      if(total>=threshold){assert.equal(feedback.dataset.reward,kind);assert.equal(feedback.dataset.logicalX,'236');}
      state.tick(3000);await job;
    }
  }
});

test('Merciful hands its qualified held fragments to the persistent layer without a false fade',async t=>{
  fakeImages(t);
  assert.deepEqual(CUSTOM_SPELL_TIMING,{formationEnd:500,releaseAt:1500,impactAt:2500,attackEnd:2840,hitFlashMs:210,hitFrameMs:85,actorEnd:2000});
  for(const [roll,duration] of [[5,1840],[6,1500],[null,1840]]){
    const state=makeScene({school:'earth'}),calls=[],job=state.animator.play(options(state,'Earth-4',{modifiedTotal:roll,onImpact:()=>calls.push('impact')}));
    await ready();state.tick(0);assert.equal(state.root.dataset.customSpell,'Earth-4');
    state.tick(500);assert.deepEqual(calls,['impact']);state.tick(1499);assert.equal(state.root.dataset.customSpell,'Earth-4');
    assert.equal(Number(state.animator.customElement.dataset.duration),duration);
    state.tick(duration);await job;assert.equal(state.root.dataset.customSpell,undefined);assert.deepEqual(calls,['impact']);
  }
});

test('Tectonic fizzles without Golem and active attacks retain the quick Golem hit reaction',async t=>{
  fakeImages(t);
  const dormant=makeScene({school:'earth'}),calls=[],job=dormant.animator.play(options(dormant,'Earth-5',{golem:false,onImpact:()=>calls.push('impact')}));
  await ready();dormant.tick(0);dormant.tick(1500);
  assert.equal(dormant.animator.customElement.dataset.inactiveGolem,'true');assert.equal(dormant.animator.customElement.dataset.hitFlash,'false');
  assert.equal(dormant.wizards[1].sprite.style.filter,'contrast(1.05)');dormant.tick(1840);await job;assert.deepEqual(calls,['impact']);
  const active=makeScene({school:'earth',golem:true,targetGolem:true}),attack=active.animator.play(options(active,'Earth-5',{golem:true}));
  await ready();active.tick(0);active.tick(2500);
  assert.equal(active.node('custom-spell-hit-actor').dataset.asset,'golemPoses');
  assert.equal(active.wizards[1].sprite.style.visibility,'hidden');active.tick(2840);await attack;
  assert.equal(active.wizards[1].sprite.style.visibility,'visible');assert.equal(active.node('custom-spell-hit-actor').hidden,true);
});

test('custom and generic routes cancel each other safely, deduplicate, and honor reduced motion',async t=>{
  fakeImages(t);const state=makeScene(),calls=[];
  const first=state.animator.play(options(state,'Fire-6',{key:'first',onImpact:()=>calls.push('old-impact'),onComplete:()=>calls.push('old-complete')}));
  assert.equal(state.animator.play(options(state,'Fire-6',{key:'first'})),first);await ready();state.tick(0);
  const generic=state.animator.play(options(state,'Fire-12',{key:'generic',onImpact:()=>calls.push('generic-impact')}));
  await first;assert.deepEqual(calls,[]);await ready();state.tick(100);
  assert.equal(state.animator.element.dataset.customAnimation,'');
  const next=state.animator.play(options(state,'Fire-15',{key:'next',onImpact:()=>calls.push('new-impact'),onComplete:()=>calls.push('new-complete')}));
  await generic;await ready();state.tick(200);state.tick(2440);await next;
  assert.deepEqual(calls,['new-impact','new-complete']);
  const duplicate=await state.animator.play(options(state,'Fire-15',{key:'next',onImpact:()=>assert.fail('duplicate replayed')}));
  assert.equal(duplicate.duplicate,true);
  const reduced=makeScene({reduced:true}),skipped=await reduced.animator.play(options(reduced,'Fire-2'));
  assert.equal(skipped.skipped,true);assert.equal(reduced.pending.size,0);assert.equal(reduced.root.dataset.customSpell,undefined);
  const cancelling=state.animator.play(options(state,'Fire-2',{key:'cancel',onImpact:()=>calls.push('cancel-impact'),onComplete:()=>calls.push('cancel-complete')}));
  await ready();state.tick(3000);state.animator.cancel();state.animator.cancel();await cancelling;
  assert.deepEqual(calls.slice(-2),['cancel-impact','cancel-complete']);assert.equal(state.root.dataset.customSpell,undefined);
});
