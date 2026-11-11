const FEET = [{x:236,y:450},{x:788,y:450}];
const PALETTES = Object.freeze({
  fire: ['#ff622b','#ffbf35','#fff2a0'],
  water: ['#158bfb','#69dcff','#e1fbff'],
  earth: ['#48a849','#a4e266','#f1ffb5'],
});
const clamp = value => Math.max(0,Math.min(1,value));
const pixel = value => Math.round(value/3)*3;

/** The roll tier is independent of the player's bank or a capped actual gain. */
export function getEnhancementVisualTier(modifiedTotal) {
  if(!Number.isFinite(modifiedTotal))return 0;
  return modifiedTotal>=12?12:modifiedTotal>=9?9:modifiedTotal>=6?6:0;
}

export function getEnhancementFlourishMoment(elapsed,modifiedTotal) {
  const tier=getEnhancementVisualTier(modifiedTotal),time=Math.max(0,Number(elapsed)||0);
  const phase=time<500?'forming':time<1500?'lingering':time<2000?'fading':'complete';
  const opacity=clamp((time-250)/250)*clamp((2000-time)/500);
  return {tier,phase,visible:tier>=9&&time>=250&&time<2000,
    opacity,ringCount:tier>=12?2:tier>=9?1:0,sparkCount:tier>=12?32:tier>=9?18:0};
}

/** Extra rough-pixel celebration; the approved 6+ actor stays unchanged. */
export function createEnhancementFlourish({root}={}) {
  if(!root?.append)throw new Error('Enhancement flourish needs its animation layer.');
  const document=root.ownerDocument,element=document.createElement('div');
  element.className='enhancement-flourish';element.setAttribute('aria-hidden','true');
  Object.assign(element.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'5',display:'none'});
  element.hidden=true;
  const make=(className,index)=>{
    const node=document.createElement('span');node.className=className;
    Object.assign(node.style,{position:'absolute',left:'0',top:'0',pointerEvents:'none',imageRendering:'pixelated',display:'none'});
    node.dataset.particle=String(index);element.append(node);return node;
  };
  const rings=Array.from({length:56},(_,i)=>make('enhancement-ring-pixel',i));
  const sparks=Array.from({length:32},(_,i)=>make('enhancement-spark-pixel',i));
  root.append(element);
  function reset(){
    element.hidden=true;element.style.display='none';element.dataset.active='false';
    element.dataset.tier='0';
    for(const node of [...rings,...sparks])node.style.display='none';
  }
  function draw(elapsed,{school,casterIndex,modifiedTotal=null,enhancementBonus=null}={}) {
    // Older callers may supply the nominal award, which still describes the
    // final roll tier even if the 30% bank cap reduced the actual gain.
    const total=Number.isFinite(modifiedTotal)?modifiedTotal
      :enhancementBonus===30?12:enhancementBonus===20?9:enhancementBonus===10?6:null;
    const moment=getEnhancementFlourishMoment(elapsed,total),palette=PALETTES[school];
    if(!moment.visible||!palette||![0,1].includes(casterIndex)){
      reset();
      if(moment.phase!=='complete'&&palette&&[0,1].includes(casterIndex)){
        element.dataset.tier=String(moment.tier);element.dataset.phase=moment.phase;
      }
      return moment;
    }
    const point=FEET[casterIndex],time=Math.floor(Math.max(0,elapsed)/80)*80;
    const pulse=Math.sin(time/145),strong=moment.tier===12;
    element.hidden=false;element.style.display='block';element.style.opacity=String(moment.opacity);
    Object.assign(element.dataset,{active:'true',tier:String(moment.tier),phase:moment.phase,
      casterIndex:String(casterIndex),element:school,ringCount:String(moment.ringCount),
      sparkCount:String(moment.sparkCount),modifiedTotal:Number.isFinite(modifiedTotal)?String(modifiedTotal):'',
      logicalX:String(point.x),logicalY:String(point.y),lingerMs:'1000'});
    for(const[index,node]of rings.entries()){
      const ring=Math.floor(index/28),part=index%28;
      if(ring>=moment.ringCount){node.style.display='none';continue;}
      const angle=part/28*Math.PI*2+(ring===0?time:-time)/850;
      const rx=(strong?82:66)+pulse*5-ring*17,ry=14+ring*3;
      const y=point.y-49-ring*49+Math.sin(angle)*ry;
      const x=point.x+Math.cos(angle)*rx;
      Object.assign(node.style,{display:'block',width:'9px',height:'4px',
        background:palette[(part+Math.floor(time/160))%4===0?2:1],
        boxShadow:`0 3px ${palette[0]}`,transform:`translate(${pixel(x-4)}px, ${pixel(y-2)}px)`,
        opacity:String(.55+.4*(Math.sin(angle)>.1?1:.4))});
    }
    for(const[index,node]of sparks.entries()){
      if(index>=moment.sparkCount){node.style.display='none';continue;}
      const progress=((time/1100+index*.173)%1),angle=index*2.39996+(casterIndex===0?1:-1)*time/1600;
      const radius=(strong?38:30)+progress*(strong?64:47);
      const x=point.x+Math.cos(angle)*radius,y=point.y-25-progress*(strong?145:114)+Math.sin(angle)*12;
      const bright=(index+Math.floor(time/120))%3===0;
      Object.assign(node.style,{display:'block',width:bright?'5px':'4px',height:bright?'5px':'4px',
        background:palette[bright?2:1],boxShadow:bright?`-4px 0 ${palette[1]},4px 0 ${palette[1]},0 -4px ${palette[1]},0 4px ${palette[0]}`:`0 3px ${palette[0]}`,
        transform:`translate(${pixel(x)}px, ${pixel(y)}px)`,opacity:String(Math.min(1,(1-progress)*1.4))});
    }
    return moment;
  }
  return {element,draw,reset};
}
