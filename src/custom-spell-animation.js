import { COMBAT_ANIMATION_SHEETS, EARTH_ANIMATION_SHEETS, GOLEM_ANIMATION_SHEETS } from './assets.js';
import { getCustomSpellSheet } from './custom-spell-sheets.js';
import { getSpellVisual } from './spell-visuals.js';
import { getPlayerSchool } from './elements.js';
import { PIXEL_ICON_CROPS } from './pixel-icons.js';
import { preloadAnimationSheet, createAnimationSprite, paintAnimationFrame, hideAnimationSprite } from './animation-sprites.js';

export const CUSTOM_SPELL_TIMING = Object.freeze({ formationEnd: 500, releaseAt: 1500,
  impactAt: 2500, attackEnd: 2840, hitFlashMs: 210, hitFrameMs: 85, actorEnd: 2000 });
const feet = [{x:236,y:450},{x:788,y:450}];
const actorNames = {'basic-attack':'basicAttack','simple-cast':'simpleCast','large-cast':'largeCast',shield:'shield','power-up':'powerUp'};
const callsSafely = (view, callback, result) => {try {callback?.(result);} catch(error) {view.setTimeout(()=>{throw error;},0);}};
const lerp = (a,b,t) => a+(b-a)*t;
const clamp = value => Math.max(0,Math.min(1,value));
const flashFilter = 'brightness(1.4) sepia(1) saturate(8) hue-rotate(-45deg)';
const qualified = (sheet,total) => Number.isFinite(total)&&sheet.threshold!==null&&total>=sheet.threshold;
const rewardSheet = kind => {
  const crop=PIXEL_ICON_CROPS[kind];
  return {asset:'battlePixelIcons',sourceWidth:crop.width,sourceHeight:crop.height,columns:1,rows:1,
    frameRects:[{x:crop.x,y:crop.y,w:crop.w,h:crop.h}],displayScale:44/crop.w,anchor:{x:.5,y:.5}};
};
const rewards = Object.freeze(Object.fromEntries(['fire','water','mana','heart'].map(kind=>[kind,rewardSheet(kind)])));
const canRelease = (spellId,isQualified) => ['Fire-2','Water-0'].includes(spellId)
  || ['Fire-15','Earth-2'].includes(spellId)&&isQualified;

/** Physical frame selection is independent of combat state and atlas dimensions. */
export function getCustomSpellMoment(spellId,time,{modifiedTotal=null,golem=false}={}) {
  const sheet=getCustomSpellSheet(spellId);if(!sheet)return null;
  const elapsed=Math.max(0,Number(time)||0),isQualified=qualified(sheet,modifiedTotal);
  const inactive=spellId==='Earth-5'&&!golem,damaging=sheet.kind==='attack'&&!inactive;
  const persistent=spellId==='Earth-4'&&isQualified;
  const release=canRelease(spellId,isQualified);
  const duration=damaging?CUSTOM_SPELL_TIMING.attackEnd:persistent?1500:release?2240:1840;
  const impactAt=damaging?2500:500;
  const common={damaging,inactive,qualified:isQualified,persistent,duration,impactAt,
    hitFlash:damaging&&elapsed>=2500&&elapsed<2710,actorVisible:elapsed<Math.min(2000,duration)};
  if(elapsed>=duration)return {...common,phase:'complete',frame:15,visible:false};
  if(elapsed<500)return {...common,phase:inactive?'inactive-forming':'forming',
    frame:inactive?[0,1,0,1][Math.floor(elapsed/125)]:Math.floor(elapsed/125),visible:true};
  if(elapsed<1500)return {...common,phase:inactive?'inactive-fizzle':'lingering',
    frame:inactive?[0,1][Math.floor((elapsed-500)/125)%2]:4+Math.floor((elapsed-500)/125)%4,visible:true};
  if(damaging&&elapsed<2500)return {...common,phase:'flight',frame:8+Math.floor((elapsed-1500)/250),visible:true};
  if(damaging)return {...common,phase:['Earth-1','Earth-3'].includes(spellId)?'caster-shield':'impact',
    frame:12+Math.min(3,Math.floor((elapsed-2500)/85)),visible:spellId!=='Earth-3'||isQualified};
  if(release&&elapsed<1900)return {...common,phase:'release',frame:8+Math.floor((elapsed-1500)/100),visible:true};
  const fadeStart=release?1900:1500,index=Math.min(3,Math.floor((elapsed-fadeStart)/85));
  return {...common,phase:inactive?'inactive-fizzle':'fade',
    frame:inactive||spellId==='Fire-15'&&!isQualified?[14,14,15,15][index]:12+index,visible:true};
}

function feedbackFor(spellId,total) {
  const high=Number.isFinite(total);
  if(spellId==='Fire-6'&&high&&total>=7)return [{kind:'fire',amount:2}];
  if(spellId==='Water-2'&&high&&total>=8)return [{kind:'water',amount:1}];
  if(spellId==='Water-12'&&high&&total>=7)return [{kind:'heart'}];
  if(spellId==='Fire-15'&&high&&total>=6)return [{kind:'mana',amount:1}];
  if(spellId==='Earth-2'&&high&&total>=6)return [{kind:'mana',amount:1}];
  if(spellId==='Water-0')return [{kind:'mana',amount:1},...(high&&total>=7?[{kind:'water',amount:1}]:[])];
  return [];
}
function atSeat(root,index) {return root.querySelector(`[data-arena-seat="${index}"]`);}
const savedProperty=(node,name)=>({value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)});
function restoreProperty(node,name,saved) {if(!node||!saved)return;if(saved.value)node.style.setProperty(name,saved.value,saved.priority);else node.style.removeProperty(name);}
function restoreDataset(node,name,value) {if(!node)return;if(value===undefined)delete node.dataset[name];else node.dataset[name]=value;}

/** Named spell visuals only. Authoritative outcomes remain owned by the host. */
export function createCustomSpellAnimator({root,scene}={}) {
  root ||= scene?.element||scene;
  if(!root?.append)throw new Error('Custom spell animation needs the battle scene.');
  const document=root.ownerDocument,view=document.defaultView;
  const layer=document.createElement('div');layer.className='spell-animation-layer custom-spell-animation-layer';
  layer.setAttribute('aria-hidden','true');
  Object.assign(layer.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'4',display:'none'});layer.hidden=true;
  const actor=createAnimationSprite(document,'custom-spell-actor');
  const effect=createAnimationSprite(document,'custom-spell-effect');
  const targetActor=createAnimationSprite(document,'custom-spell-hit-actor');
  const feedback=[0,1].map(index=>createAnimationSprite(document,`custom-spell-secondary custom-spell-secondary-${index}`));
  layer.append(actor,effect,targetActor,...feedback);root.append(layer);
  const nodes=[actor,effect,targetActor,...feedback],seen=new Set();
  let current=null,sequence=0,generation=0,request=0;
  const reduced=()=>Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const detail=(job,extra={})=>({key:job.key,spellId:job.spellId,casterIndex:job.casterIndex,kind:job.kind,...extra});
  function impact(job,extra={}) {if(job.done||job.impacted)return;job.impacted=true;callsSafely(view,job.onImpact,detail(job,extra));}
  function hideStanding(job,name) {
    if(!job[name]?.sprite||job[name].hidden)return;
    const entry=job[name];entry.hidden=true;entry.visibility=savedProperty(entry.sprite,'visibility');
    entry.flag=entry.node.dataset[name==='caster'?'spellCasting':'spellHit'];
    entry.sprite.style.visibility='hidden';entry.node.dataset[name==='caster'?'spellCasting':'spellHit']='true';
  }
  function restoreStanding(job,name) {
    const entry=job[name];if(!entry?.hidden)return;entry.hidden=false;
    restoreProperty(entry.sprite,'visibility',entry.visibility);
    restoreDataset(entry.node,name==='caster'?'spellCasting':'spellHit',entry.flag);
  }
  function flash(job,on) {
    const target=job.target;if(!target?.sprite||target.flashing===on)return;
    target.flashing=on;
    if(on){target.filter=savedProperty(target.sprite,'filter');target.hitFlag=target.node.dataset.spellHit;
      target.sprite.style.filter=flashFilter;target.node.dataset.spellHit='true';}
    else{restoreProperty(target.sprite,'filter',target.filter);restoreDataset(target.node,'spellHit',target.hitFlag);}
  }
  function finish(job,{cancelled=false,settle=true,skipped=false}={}) {
    if(job.done)return;if(settle)impact(job,{cancelled,skipped});if(job.done)return;job.done=true;
    if(current===job){
      generation++;if(request)view.cancelAnimationFrame(request);request=0;
      restoreStanding(job,'caster');restoreStanding(job,'target');flash(job,false);
      for(const node of nodes){hideAnimationSprite(node);node.style.filter='';node.style.opacity='1';}
      Object.assign(layer.dataset,{phase:cancelled?'cancelled':'complete',stage:cancelled?'cancelled':'complete'});
      layer.hidden=true;layer.style.display='none';
      delete root.dataset.spellAnimating;
      if(root.dataset.customSpell===job.spellId&&root.dataset.customCasterIndex===String(job.casterIndex)){
        delete root.dataset.customSpell;delete root.dataset.customCasterIndex;
      }
      current=null;
    }
    const result=detail(job,{cancelled,skipped});if(settle)callsSafely(view,job.onComplete,result);job.resolve(result);
  }
  function cancel({settle=true}={}) {if(current)finish(current,{cancelled:true,settle});}
  function drawEffect(job,frame,point,size=240,node=effect) {
    paintAnimationFrame(node,job.sheet,frame,point,{mirror:job.casterIndex===1,size:size/(job.sheet.sourceWidth/job.sheet.columns*job.sheet.displayScale)});
    Object.assign(node.dataset,{element:job.type,phase:layer.dataset.phase,mirrored:String(job.casterIndex===1)});
  }
  function paint(job,elapsed,moment) {
    const {casterIndex,sheet}=job,point=feet[casterIndex],target=feet[1-casterIndex];
    Object.assign(layer.dataset,{elapsed:String(Math.round(elapsed)),phase:moment.phase,stage:moment.phase,
      frame:String(moment.frame),qualified:String(moment.qualified),effectVisible:String(moment.visible),
      hitFlash:String(moment.hitFlash),inactiveGolem:String(moment.inactive)});
    if(moment.actorVisible){
      hideStanding(job,'caster');
      const local=Math.min(15,Math.floor(elapsed/125));
      paintAnimationFrame(actor,job.actorSheet,job.actorFrames[local],point,{mirror:job.actorMirror});
      Object.assign(actor.dataset,{element:job.type,phase:elapsed<500?'forming':elapsed<1500?'lingering':'recovering',sequenceFrame:String(local)});
    }else{hideAnimationSprite(actor);restoreStanding(job,'caster');}
    if(moment.visible){
      let x=point.x,y=350,size=sheet.element==='earth'?220:200;
      if(job.spellId==='Water-0')size=230;
      if(job.spellId==='Earth-4'){y=370;size=200;}
      if(job.spellId==='Fire-14'){y=elapsed<1500?245:370;size=260;}
      if(moment.damaging&&elapsed>=1500){
        const ratio=clamp((elapsed-1500)/1000),direction=casterIndex===0?1:-1;
        x=lerp(point.x+direction*45,target.x,ratio);y=350-Math.sin(Math.PI*ratio)*28;
        if(job.spellId==='Fire-14'){x=lerp(point.x,target.x,ratio);y=lerp(10,340,ratio);size=260;}
        if(['Earth-3','Earth-5'].includes(job.spellId)){y=430;size=280;}
        if(elapsed>=2500){
          x=['Earth-1','Earth-3'].includes(job.spellId)?point.x:target.x;
          y=job.spellId==='Earth-3'||job.spellId==='Earth-5'?430:340;size=250;
          if(job.spellId==='Earth-3'||job.spellId==='Earth-5')size=280;
          if(job.spellId==='Earth-1'){y=350;size=moment.qualified?240:220;}
        }
      }
      drawEffect(job,moment.frame,{x,y},size);
    }else hideAnimationSprite(effect);
    const rewardStart=moment.damaging?2500:1500;
    for(const[index,node]of feedback.entries()){
      const reward=job.feedback[index],age=elapsed-rewardStart;
      if(!reward||age<0||age>=400){hideAnimationSprite(node);continue;}
      const offset=(job.feedback.length===2?(index===0?-28:28):0);
      paintAnimationFrame(node,rewards[reward.kind],0,{x:point.x+offset,y:300-age*.055});
      node.style.opacity=String(Math.min(1,(400-age)/120));
      Object.assign(node.dataset,{reward:reward.kind,amount:reward.amount===undefined?'':String(reward.amount),phase:'earned-feedback'});
    }
    if(job.targetGolem&&moment.damaging&&elapsed>=2500&&elapsed<2840){
      hideStanding(job,'target');flash(job,false);
      const index=Math.min(3,Math.floor((elapsed-2500)/85));
      paintAnimationFrame(targetActor,GOLEM_ANIMATION_SHEETS.poses,GOLEM_ANIMATION_SHEETS.poses.animations.hitReaction[index],target,{mirror:casterIndex===0});
      targetActor.style.filter=moment.hitFlash?flashFilter:'';
      Object.assign(targetActor.dataset,{phase:'quick-hit',element:'earth'});
    }else{hideAnimationSprite(targetActor);restoreStanding(job,'target');flash(job,moment.hitFlash);}
  }
  function play({key,spellId,casterIndex,players,golem,modifiedTotal=null,onImpact,onComplete}={}) {
    key=String(key??`custom:${++sequence}:${spellId}:${casterIndex}`);
    if(current?.key===key)return current.promise;
    if(seen.has(key))return Promise.resolve({key,spellId,casterIndex,duplicate:true});
    cancel({settle:false});seen.add(key);
    const sheet=getCustomSpellSheet(spellId),visual=getSpellVisual(spellId);
    const job={key,spellId,casterIndex,sheet,kind:visual?.kind||'none',onImpact,onComplete,done:false,impacted:false};
    job.promise=new Promise(resolve=>{job.resolve=resolve;});current=job;
    Object.assign(layer.dataset,{animationKey:key,spellId:String(spellId??''),casterIndex:String(casterIndex??''),
      kind:job.kind,customAnimation:'named-spell',phase:'loading',stage:'loading',modifiedTotal:Number.isFinite(modifiedTotal)?String(modifiedTotal):'',afterimages:'0'});
    if(!sheet||!visual||![0,1].includes(casterIndex)||reduced()){finish(job,{skipped:true});return job.promise;}
    const casterNode=atSeat(root,casterIndex),targetNode=atSeat(root,1-casterIndex),type=sheet.element;
    const isGolem=type==='earth'&&Boolean(golem??players?.[casterIndex]?.golemActive??casterNode?.dataset.form==='golem');
    const first=getCustomSpellMoment(spellId,0,{modifiedTotal,golem:isGolem});
    const action=first.inactive?'powerUp':actorNames[visual.kind];
    const actorSheet=isGolem?GOLEM_ANIMATION_SHEETS.poses:(type==='earth'?EARTH_ANIMATION_SHEETS:COMBAT_ANIMATION_SHEETS)[action];
    const actorFrames=actorSheet?.animations[type]||actorSheet?.animations[action==='shield'?'powerUp':action];
    const targetType=getPlayerSchool(players?.[1-casterIndex])||targetNode?.dataset.element||targetNode?.dataset.arenaWizard;
    const targetGolem=targetType==='earth'&&Boolean(players?.[1-casterIndex]?.golemActive??targetNode?.dataset.form==='golem');
    if(actorFrames?.length!==16){finish(job,{skipped:true});return job.promise;}
    Object.assign(job,{type,isGolem,actorSheet,actorFrames,targetGolem,feedback:feedbackFor(spellId,modifiedTotal),
      actorMirror:(actorSheet.facing?.[type]||(type==='water'?'left':'right'))!==(casterIndex===0?'right':'left'),
      caster:casterNode?{node:casterNode,sprite:casterNode.querySelector('.wizard-sprite')}:null,
      target:targetNode?{node:targetNode,sprite:targetNode.querySelector('.wizard-sprite'),flashing:false}:null});
    Object.assign(layer.dataset,{element:type,targetElement:String(targetType||''),targetIndex:String(1-casterIndex),
      mirrored:String(casterIndex===1),duration:String(first.duration),impactAt:String(first.impactAt),releaseAt:'1500',lingerMs:'1000'});
    Object.assign(root.dataset,{spellAnimating:'true',customSpell:spellId,customCasterIndex:String(casterIndex)});
    const token=generation,needed=[actorSheet,sheet,...job.feedback.map(reward=>rewards[reward.kind])];
    if(first.damaging&&targetGolem)needed.push(GOLEM_ANIMATION_SHEETS.poses);
    Promise.all(needed.map(preloadAnimationSheet)).then(loaded=>{
      if(current!==job||job.done||generation!==token)return;
      if(loaded.some(value=>!value)||reduced()){finish(job,{skipped:true});return;}
      layer.hidden=false;layer.style.display='block';let start=null;
      function tick(time){
        request=0;if(current!==job||job.done||generation!==token)return;
        if(reduced()){finish(job,{skipped:true});return;}
        if(start===null){start=time;layer.dataset.startedAt=String(time);}
        const elapsed=Math.max(0,time-start),moment=getCustomSpellMoment(spellId,elapsed,{modifiedTotal,golem:isGolem});
        if(elapsed>=moment.duration){finish(job);return;}
        paint(job,elapsed,moment);
        if(elapsed>=moment.impactAt)impact(job);
        if(current!==job||job.done||generation!==token)return;
        request=view.requestAnimationFrame(tick);
      }
      request=view.requestAnimationFrame(tick);
    }).catch(()=>{if(current===job&&!job.done)finish(job,{skipped:true});});
    return job.promise;
  }
  return {element:layer,play,cancel,isPlaying:()=>current!==null,hasSeen:key=>seen.has(String(key))};
}
