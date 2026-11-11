import { GOLEM_ANIMATION_SHEETS } from './assets.bdca32752f3b.js';
import { getCustomSpellSheet } from './custom-spell-sheets.41eeef9da694.js';
import { createAnimationSprite, paintAnimationFrame, hideAnimationSprite } from './animation-sprites.9586121f4b25.js';
import { createEnhancementFlourish } from './enhancement-animation.1647c044ed1d.js';
import { REVISED_SPELL_SHEETS } from './revised-spell-sheets.d2d231945d87.js';

const FEET=[{x:236,y:450},{x:788,y:450}];
const IDS=new Set(['Fire-2','Fire-14','Water-0','Water-14','Earth-3']);
const clamp=v=>Math.max(0,Math.min(1,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);

/** Presentation timelines only; the authoritative spell has already resolved. */
export function getRevisedSpellMoment(id,time,{modifiedTotal=null}={}){
  if(!IDS.has(id))return null;
  const elapsed=Math.max(0,Number(time)||0),total=Number.isFinite(modifiedTotal)?modifiedTotal:-Infinity;
  const damaging=['Fire-14','Water-14','Earth-3'].includes(id),impactAt=damaging?2500:500;
  const tier=id==='Fire-2'?(total>=10?10:total>=7?7:0):0;
  const qualified=id==='Earth-3'?total>=7:id==='Fire-14'?total>=8:id==='Water-14'?total>=8:id==='Water-0'?total>=7:tier>=7;
  const duration=id==='Fire-14'?3250:id==='Water-14'?2840:id==='Earth-3'&&qualified?3500:
    id==='Earth-3'?2840:id==='Fire-2'&&tier===10?3840:id==='Fire-2'&&tier===7?2840:2240;
  const common={damaging,inactive:false,qualified,persistent:false,duration,impactAt,tier,
    hitFlash:damaging&&elapsed>=2500&&elapsed<2710,actorVisible:elapsed<Math.min(2000,duration)};
  let phase='forming',frame=Math.min(3,Math.floor(elapsed/125)),visible=true;
  if(elapsed>=duration)return{...common,phase:'complete',frame:15,visible:false};
  if(id==='Fire-14'){
    phase=elapsed<500?'forming':elapsed<1500?'lingering':elapsed<2500?'flight':'impact';
    visible=elapsed>=1500;
    frame=elapsed<1500?frame:elapsed<2500?8+Math.min(3,Math.floor((elapsed-1500)/250)):12+Math.min(3,Math.floor((elapsed-2500)/190));
  }else if(id==='Water-14'){
    phase=elapsed<500?'whirlpool-forming':elapsed<1500?'trident-rise':elapsed<2000?'trident-hover':elapsed<2500?'trident-dive':'impact';
    frame=elapsed<500?frame:elapsed<2500?4+Math.floor((elapsed-500)/125)%8:12+Math.min(3,Math.floor((elapsed-2500)/85));
  }else if(id==='Earth-3'){
    phase=elapsed<500?'forming':elapsed<1500?'lingering':elapsed<2500?'flight':!qualified?'impact':
      elapsed<2940?'shell-building':elapsed<3120?'white-flash':'shell-fade';
    frame=elapsed<500?frame:elapsed<1500?4+Math.floor((elapsed-500)/125)%4:
      elapsed<2500?8+Math.min(3,Math.floor((elapsed-1500)/250)):12+Math.min(3,Math.floor((elapsed-2500)/100));
    visible=elapsed<2500||qualified;
  }else if(id==='Water-0'||tier===0){
    phase=elapsed<500?'forming':elapsed<1500?'lingering':elapsed<1900?'release':'fade';
    frame=elapsed<500?frame:4+Math.floor((elapsed-500)/125)%4;
  }else{
    phase=elapsed<500?'forming':elapsed<1500?'ring-rise':tier===7?(elapsed<2500?'ring-hover':'fade'):
      elapsed<2000?'ring-hover':elapsed<2500?'ring-descend':elapsed<3500?'burst':'fade';
    frame=elapsed<500?frame:4+Math.floor((elapsed-500)/125)%4;
  }
  return{...common,phase,frame,visible};
}

/** Layered rings and separate moving pieces share the parent's animation clock. */
export function createRevisedSpellPainter({root,layer,effect}={}){
  const document=root.ownerDocument;
  const rear=document.createElement('div');rear.className='revised-spell-rear-layer';rear.setAttribute('aria-hidden','true');
  Object.assign(rear.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'1',display:'none'});rear.hidden=true;
  const backRing=createAnimationSprite(document,'revised-ring-back');rear.append(backRing);root.append(rear);
  const pool=createAnimationSprite(document,'rift-whirlpool'),burst=createAnimationSprite(document,'revised-spell-burst');
  const shell=createAnimationSprite(document,'earthbound-stone-shell');
  pool.style.zIndex='0';effect.style.zIndex='1';burst.style.zIndex='2';shell.style.zIndex='2';
  // The pool is behind the raised trident within the foreground effect layer.
  layer.append(pool,burst,shell);
  const flourish=createEnhancementFlourish({root:layer});
  const extras=[backRing,pool,burst,shell];
  const hide=node=>{hideAnimationSprite(node);node.style.opacity='1';node.style.filter='';node.style.clipPath='';};
  function reset(){
    for(const node of extras)hide(node);
    if(!flourish.element.hidden)flourish.reset();
    rear.hidden=true;rear.style.display='none';delete layer.dataset.choreography;delete layer.dataset.variant;
  }
  function paint(node,sheet,frame,point,size,{mirror=false,rotation=0,opacity=1}={}){
    paintAnimationFrame(node,sheet,frame,point,{mirror,size:size/(sheet.sourceWidth/sheet.columns*sheet.displayScale)});
    if(rotation)node.style.transform+=` rotate(${rotation}deg)`;
    node.style.opacity=String(clamp(opacity));
    Object.assign(node.dataset,{rotation:String(rotation),phase:layer.dataset.phase,element:layer.dataset.element,mirrored:String(mirror)});
  }
  function ring(job,frame,y,size,opacity=1){
    const x=FEET[job.casterIndex].x,sheet=REVISED_SPELL_SHEETS.rings;
    const physical=(job.type==='water'?4:0)+frame%4;
    paint(backRing,sheet,physical,{x,y},size,{opacity});
    backRing.style.transform+=' scaleY(.5)';
    const split=sheet.frameAnchors[physical].y*100;
    backRing.style.clipPath=`inset(0 0 ${100-split}% 0)`;backRing.dataset.layer='behind-wizard';
    paint(effect,sheet,physical,{x,y},size,{opacity});
    effect.style.transform+=' scaleY(.5)';
    effect.style.clipPath=`inset(${split}% 0 0 0)`;effect.dataset.layer='in-front-of-feet';
    rear.hidden=false;rear.style.display='block';
  }
  function sheetsFor(job){
    if(['Fire-2','Water-0'].includes(job.spellId))return[REVISED_SPELL_SHEETS.rings];
    if(job.spellId==='Water-14')return[REVISED_SPELL_SHEETS.trident,REVISED_SPELL_SHEETS.whirlpool];
    if(job.spellId==='Earth-3'&&job.modifiedTotal>=7)return[job.isGolem?GOLEM_ANIMATION_SHEETS.poses:GOLEM_ANIMATION_SHEETS.transform];
    return[];
  }
  function draw(job,elapsed,moment){
    reset();if(!IDS.has(job.spellId))return{handled:false};
    const seat=job.casterIndex,direction=seat===0?1:-1,point=FEET[seat],target=FEET[1-seat];
    const frame=Math.floor(elapsed/125)%4;
    Object.assign(layer.dataset,{choreography:job.spellId,variant:String(moment.tier||0)});
    effect.style.opacity='1';effect.style.filter='';effect.style.clipPath='';
    if(job.spellId==='Fire-2'||job.spellId==='Water-0'){
      const rising=job.spellId==='Fire-2'&&moment.tier>=7;
      let y=439,size=job.spellId==='Water-0'?215:195;
      if(rising){
        const progress=smooth(clamp((elapsed-500)/1000));y=lerp(439,326,progress);size=lerp(195,255,progress);
        if(moment.tier===10&&elapsed>=2000){const drop=smooth(clamp((elapsed-2000)/500));y=lerp(326,439,drop);size=lerp(255,225,drop);}
      }
      const fadeStart=moment.duration-340,opacity=elapsed<500?clamp(elapsed/300):elapsed>fadeStart?clamp((moment.duration-elapsed)/340):1;
      ring(job,frame,y,size,opacity);
      if(job.spellId==='Fire-2'&&moment.tier===10&&elapsed>=2500){
        const age=elapsed-2500;
        paint(burst,REVISED_SPELL_SHEETS.rings,12+Math.floor(age/125)%4,{x:point.x,y:423},270,{opacity});
        burst.style.transform+=' scaleY(.6)';
        flourish.draw(age+500,{school:'fire',casterIndex:seat,modifiedTotal:12});
      }
      return{handled:true,shellVisible:false};
    }
    if(job.spellId==='Fire-14'){
      if(elapsed<1500){hide(effect);return{handled:true};}
      if(elapsed<2500){
        const t=clamp((elapsed-1500)/1000),fall=t*t;
        paint(effect,job.sheet,moment.frame,{x:lerp(point.x+direction*30,target.x,fall),y:lerp(-180,350,fall)},270,{mirror:seat===1});
        effect.dataset.trajectory='from-sky';
      }else{
        const age=elapsed-2500,t=clamp(age/750);
        paint(effect,job.sheet,moment.frame,{x:target.x,y:365},lerp(260,440,smooth(t)),{mirror:seat===1,opacity:clamp((750-age)/210)});
        // The existing expanding impact is accompanied by a second, staggered
        // pixel shock ring instead of another meteor or a long defender flash.
        paint(burst,job.sheet,12+Math.min(1,Math.floor(age/200)),{x:target.x,y:387},lerp(170,470,t),
          {mirror:seat===1,opacity:.55*clamp((600-age)/300)});
        burst.dataset.burst='expanding-fire-ring';
      }
      return{handled:true};
    }
    if(job.spellId==='Water-14'){
      const poolPoint={x:point.x+direction*95,y:420};
      if(elapsed<2250){
        const poolFrame=elapsed<500?Math.floor(elapsed/125):elapsed<2000?4+Math.floor((elapsed-500)/125)%8:12+Math.min(3,Math.floor((elapsed-2000)/65));
        paint(pool,REVISED_SPELL_SHEETS.whirlpool,poolFrame,poolPoint,190,{opacity:elapsed<500?clamp(elapsed/250):clamp((2250-elapsed)/250)});
      }
      if(elapsed<500)hide(effect);
      else if(elapsed<1500){
        const t=smooth(clamp((elapsed-500)/1000));
        paint(effect,REVISED_SPELL_SHEETS.trident,4+frame,{x:poolPoint.x,y:lerp(429,291,t)},160,{opacity:clamp((elapsed-500)/180)});
      }else if(elapsed<2000){
        const t=clamp((elapsed-1500)/500);
        paint(effect,REVISED_SPELL_SHEETS.trident,4+frame,{x:poolPoint.x,y:291-Math.sin(t*Math.PI)*3},160,{rotation:direction*90*smooth(t)});
      }else if(elapsed<2500){
        const t=clamp((elapsed-2000)/500),travel=t*t;
        const x=lerp(poolPoint.x,target.x,travel),y=lerp(291,370,travel);
        const angle=direction*90+direction*Math.atan2(79,Math.abs(target.x-poolPoint.x))*180/Math.PI;
        paint(effect,REVISED_SPELL_SHEETS.trident,8+frame,{x,y},160,{rotation:lerp(direction*90,angle,smooth(t))});
      }else paint(effect,getCustomSpellSheet('Water-14'),moment.frame,{x:target.x,y:370},270,{mirror:seat===1});
      return{handled:true};
    }
    // Earthbound's baseline is the ground itself, not the center of its cell.
    if(elapsed<2500){
      const t=clamp((elapsed-1500)/1000);
      paint(effect,job.sheet,moment.frame,{x:lerp(point.x+direction*75,target.x,t),y:450},280,{mirror:seat===1});
      effect.dataset.contactPlane='ground';
      return{handled:true};
    }
    if(!moment.qualified){hide(effect);return{handled:true};}
    const age=elapsed-2500,shellFrame=job.isGolem?Math.floor(age/110)%4:4+Math.min(3,Math.floor(age/110));
    const shellOpacity=elapsed>=3120?clamp((3500-elapsed)/380):1;
    paint(effect,job.sheet,12+Math.min(3,Math.floor(age/110)),{x:point.x,y:450},280,{mirror:seat===1,opacity:shellOpacity});
    paintAnimationFrame(shell,job.isGolem?GOLEM_ANIMATION_SHEETS.poses:GOLEM_ANIMATION_SHEETS.transform,shellFrame,point,{mirror:seat===1});
    shell.style.opacity=String(shellOpacity);
    shell.style.filter=elapsed>=2940?'brightness(0) invert(1)':'';
    if(elapsed>=2940)effect.style.filter='brightness(0) invert(1)';
    Object.assign(shell.dataset,{phase:moment.phase,temporary:'true',element:'earth'});
    return{handled:true,shellVisible:true};
  }
  return{draw,reset,sheetsFor,element:rear};
}
