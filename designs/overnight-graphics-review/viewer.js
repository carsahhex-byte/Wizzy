(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('graphics-metadata').textContent);
  const $=id=>document.getElementById(id);
  const canvas=$('arena'),ctx=canvas.getContext('2d');
  const ids=['spell-select','direction','earth-form','outcome','backdrop','play-toggle','restart','step-back','step-forward','speed','timeline','next-turn','end-next-turn'];
  const controls=Object.fromEntries(ids.map(id=>[id,$(id)]));
  const images=new Map(),pendingImages=new Map();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let selected=null,ready=false,playing=false,elapsed=0,lastTime=null,speed=1,selectionGeneration=0;
  let opponentTurn=false,fadeAt=null;
  const poseHeight=112,feetY=391;
  const frameSource=spell=>spell.frames||Array.from({length:spell.columns*spell.rows},(_,index)=>index);
  const frameAt=(frames,index)=>frames[Math.min(frames.length-1,Math.max(0,index))];
  const isFate=()=>selected?.kind==='fate';
  const isPersistent=()=>selected?.id==='Earth-4'&&controls.outcome.value==='threshold';
  const fragmentsHeld=()=>isPersistent()&&elapsed>=1500&&(fadeAt===null||elapsed<fadeAt);
  const isAttack=()=>selected?.kind==='attack';
  const validGolemAttack=()=>selected?.id!=='Earth-5'||controls['earth-form'].value==='golem';
  const hasRelease=()=>!isAttack()&&!isPersistent()&&selected?.id!=='Earth-4'&&selected?.id!=='Water-0'
    &&(selected?.id!=='Earth-2'&&selected?.id!=='Fire-15'||controls.outcome.value==='threshold');
  const duration=()=>isFate()?600:isAttack()?2840:hasRelease()?2240:1840;
  const assetUrl=file=>data.assets[file]?.dataUrl||file.split('/').map(encodeURIComponent).join('/');
  const fileName=file=>file.split('/').pop();
  function loadImage(file){
    if(images.has(file))return Promise.resolve(images.get(file));
    if(pendingImages.has(file))return pendingImages.get(file);
    const promise=new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{images.set(file,image);resolve(image);};
      image.onerror=()=>reject(new Error(`Could not load ${file}. Keep the art folder beside index.html, or open preview.html.`));
      image.src=assetUrl(file);
    });pendingImages.set(file,promise);return promise;
  }
  function fail(error){
    $('load-error').textContent=error.message||String(error);$('load-error').hidden=false;
    document.documentElement.dataset.previewReady='false';playing=false;ready=false;updateControls();
  }
  function spriteRect(sheet,frame){
    if(sheet.frameRects?.[frame]){const r=sheet.frameRects[frame];return Array.isArray(r)?{x:r[0],y:r[1],w:r[2],h:r[3]}:r;}
    const asset=data.assets[sheet.file],w=(sheet.sourceWidth||asset.width)/sheet.columns,h=(sheet.sourceHeight||asset.height)/sheet.rows;
    return {x:frame%sheet.columns*w,y:Math.floor(frame/sheet.columns)*h,w,h};
  }
  function drawFrame(sheet,frame,x,y,size,{mirror=false,alpha=1,anchor=null,flash=false}={}){
    const image=images.get(sheet.file);if(!image)return;
    const rect=spriteRect(sheet,frame),width=size,height=size*rect.h/rect.w;
    const origin=anchor||sheet.frameAnchors?.[frame]||sheet.anchor||{x:.5,y:.5};
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(Math.round(x),Math.round(y));if(mirror)ctx.scale(-1,1);
    if(flash)ctx.filter='sepia(1) saturate(6) hue-rotate(320deg) brightness(1.35)';
    ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h,-Math.round(origin.x*width),-Math.round(origin.y*height),Math.round(width),Math.round(height));
    ctx.restore();
  }
  function wizardReference(element,golem=false){return golem?data.references.golem:data.references[element];}
  function drawWizard(element,x,facing,{caster=false,golem=false,hit=false}={}){
    const idle=wizardReference(element,golem);if(!idle)return;
    let sheet=idle,frame=frameAt(idle.sequence||idle.animations?.idle||[0],Math.floor(elapsed/160)%(idle.sequence||idle.animations?.idle||[0]).length);
    let nativeFacing=idle.nativeFacing||'right',bodyScale=poseHeight/(idle.sourceBodyHeight||180);
    if(caster&&!isFate()&&elapsed<1500&&validGolemAttack()){
      const cast=golem?data.references.golem:element==='earth'?data.references.earthCast:data.references.fireWaterCast;
      const sequence=golem?(selected.id==='Earth-5'?cast.animations.heavyCast:cast.animations.basicCast):cast.animations[element];
      sheet=cast;frame=frameAt(sequence,Math.floor(elapsed/125));
      nativeFacing=golem?'right':element==='water'?'left':'right';bodyScale=poseHeight/(cast.sourceBodyHeight||180);
    }
    const rect=spriteRect(sheet,frame),size=golem?rect.w*.7:rect.w*bodyScale;
    drawFrame(sheet,frame,x,feetY,size,{mirror:facing!==nativeFacing,anchor:sheet.frameAnchors?.[frame]||{x:.5,y:.89},flash:hit});
  }
  function backdrop(){
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    const mode=controls.backdrop.value;
    if(mode==='forest'&&images.has(data.references.forest.file))ctx.drawImage(images.get(data.references.forest.file),0,0,1024,540,0,0,960,480);
    else if(mode==='checker'){
      for(let y=0;y<480;y+=24)for(let x=0;x<960;x+=24){ctx.fillStyle=(x/24+y/24)%2?'#d8d5c8':'#eeeade';ctx.fillRect(x,y,24,24);}
    }else{ctx.fillStyle=mode==='light'?'#e4dece':'#101927';ctx.fillRect(0,0,960,480);ctx.fillStyle=mode==='light'?'#b2ad9c':'#263748';ctx.fillRect(0,391,960,4);}
  }
  function drawDice(){
    const dice=[{x:426,value:3},{x:507,value:4}];
    for(const die of dice){
      ctx.fillStyle='#0a0a1c';ctx.fillRect(die.x-35,283,70,70);ctx.fillStyle='#f8f3e5';ctx.fillRect(die.x-30,288,60,60);
      ctx.fillStyle='#15132b';const coords=die.value===3?[[-17,-17],[0,0],[17,17]]:[[-17,-17],[17,-17],[-17,17],[17,17]];
      for(const[x,y]of coords)ctx.fillRect(die.x+x-4,318+y-4,8,8);
    }
    ctx.fillStyle=controls.backdrop.value==='light'||controls.backdrop.value==='checker'?'#20283a':'#fff2ce';ctx.font='bold 21px monospace';ctx.textAlign='center';
    ctx.fillText(elapsed>=600?'Fate applied · primary spell may resolve':'Fate response · rolled total 7',480,409);
  }
  function spellFrame(){
    const frames=frameSource(selected),hold=selected.holdFrames?.length?selected.holdFrames:frames.slice(4,12);
    if(isFate())return {frame:frameAt(frames,Math.floor(elapsed/(600/frames.length))),phase:elapsed<600?'Fate above dice':'Fate complete',visible:elapsed<600};
    if(fadeAt!==null&&elapsed>=fadeAt){const age=elapsed-fadeAt;return {frame:frameAt(frames.slice(-4),Math.floor(age/85)),phase:age<340?'Merciful fragments dissolving':'Merciful expired',visible:age<340};}
    if(elapsed<500)return {frame:frameAt(frames.slice(0,4),Math.floor(elapsed/125)),phase:'Formation',visible:true};
    if(elapsed<1500)return {frame:hold[Math.floor((elapsed-500)/125)%hold.length],phase:'One-second particle hold',visible:true};
    if(isPersistent()){
      const loop=selected.loopFrames?.length?selected.loopFrames:frames.slice(4,12);
      return {frame:loop[Math.floor((elapsed-1500)/125)%loop.length],phase:opponentTurn?'Opponent’s next turn · fragments held':'Cast resolved · fragments held',visible:true};
    }
    if(isAttack()){
      if(elapsed<2500){const travel=frames.slice(8,12);return {frame:travel[Math.floor((elapsed-1500)/250)%travel.length],phase:validGolemAttack()?'Travel':'Inactive Golem · dormant/fizzle',visible:validGolemAttack()};}
      const secondary=['Earth-1','Earth-3'].includes(selected.id),shown=selected.id!=='Earth-3'||controls.outcome.value==='threshold';
      return {frame:frameAt(frames.slice(-4),Math.floor((elapsed-2500)/85)),phase:elapsed<2840?(secondary?'Quick hit · caster Shield follow-through':'Quick impact'):'Complete',visible:elapsed<2840&&validGolemAttack()&&shown};
    }
    if(hasRelease()&&elapsed<1900)return {frame:frameAt(frames.slice(8,12),Math.floor((elapsed-1500)/100)),phase:'Release / qualified flourish',visible:true};
    const fadeStart=hasRelease()?1900:1500;
    return {frame:frameAt(frames.slice(-4),Math.floor((elapsed-fadeStart)/85)),phase:elapsed<fadeStart+340?'Dissolve':'Complete',visible:elapsed<fadeStart+340};
  }
  function drawEffects(info,casterX,targetX,mirror){
    if(!info.visible)return;
    if(isFate()){
      const progress=Math.min(1,elapsed/600),fade=Math.min(1,progress/.14,(1-progress)/.25);
      const pulse=1+Math.sin(progress*Math.PI*3)*.055;
      drawFrame(selected,info.frame,480,211-progress*6,160*pulse,{mirror:false,anchor:{x:.5,y:.5},alpha:Math.max(0,fade)});
      const value=selected.id==='FAT-001'?'+4':selected.id==='FAT-002'?'−4':controls.outcome.value==='threshold'?'+2':'−2';
      ctx.font='bold 25px monospace';ctx.textAlign='center';ctx.fillStyle='#ffe9a0';ctx.strokeStyle='#1c103c';ctx.lineWidth=6;ctx.strokeText(value,480,267);ctx.fillText(value,480,267);return;
    }
    let x=casterX,y=318,size=selected.element==='earth'?230:210;
    if(isAttack()&&elapsed>=1500){
      const ratio=Math.min(1,(elapsed-1500)/1000);x=casterX+(targetX-casterX)*ratio;y=310-Math.sin(ratio*Math.PI)*28;
      if(selected.id==='Fire-14'){y=elapsed<2500?35+ratio*270:310;size=260;}
      if(selected.id==='Earth-3'||selected.id==='Earth-5'){y=373;size=260;}
      if(elapsed>=2500){x=['Earth-1','Earth-3'].includes(selected.id)?casterX:targetX;y=selected.element==='earth'?350:315;size=250;}
    }
    if(isPersistent()&&elapsed>=1500){y=322;size=275;}
    drawFrame(selected,info.frame,x,y,size,{mirror});
  }
  function updateControls(){
    controls['play-toggle'].textContent=playing?'Pause':'Play';controls['play-toggle'].setAttribute('aria-pressed',String(playing));
    controls['earth-form'].disabled=!ready||selected?.element!=='earth';
    controls.outcome.disabled=!ready||isFate()&&selected.id!=='FAT-003';
    controls['next-turn'].disabled=!ready||!isPersistent()||opponentTurn||fadeAt!==null;
    controls['end-next-turn'].disabled=!ready||!isPersistent()||!opponentTurn||fadeAt!==null;
    if(selected){controls.timeline.max=String(isPersistent()?Math.max(5000,elapsed+1000):duration());controls.timeline.value=String(elapsed);}
    $('time-label').textContent=`${(elapsed/1000).toFixed(2)} s`;
    $('persistent-controls').hidden=selected?.id!=='Earth-4';
    $('persistence-status').textContent=!isPersistent()?'Base result · no lasting fragments':fadeAt!==null?(elapsed-fadeAt<340?'End of next turn · fading':'Expired at end of opponent’s next turn'):elapsed<1500?'Fragments forming':opponentTurn?'Held throughout opponent’s next turn':'Held after cast; awaiting opponent’s next turn';
  }
  function paint(){
    if(!ready||!selected)return;
    backdrop();const mirror=controls.direction.value==='mirrored',casterX=mirror?770:190,targetX=mirror?190:770;
    const element=selected.element==='fate'?'fire':selected.element,opponent=element==='water'?'fire':'water';
    const hit=isAttack()&&validGolemAttack()&&elapsed>=2500&&elapsed<2710;
    drawWizard(element,casterX,mirror?'left':'right',{caster:true,golem:element==='earth'&&controls['earth-form'].value==='golem'});
    drawWizard(opponent,targetX,mirror?'right':'left',{hit});
    if(isFate())drawDice();const info=spellFrame();drawEffects(info,casterX,targetX,mirror);
    ctx.textAlign='center';ctx.font='bold 16px monospace';ctx.fillStyle='#fff1d3';ctx.strokeStyle='#101221';ctx.lineWidth=5;
    for(const[x,label]of [[casterX,element.toUpperCase()],[targetX,opponent.toUpperCase()]]){ctx.strokeText(label,x,442);ctx.fillText(label,x,442);}
    $('frame-status').textContent=`${info.phase} · source frame ${info.frame}${isAttack()&&!validGolemAttack()?' · Tectonic requires active Golem':''}`;
    Object.assign(canvas.dataset,{spellId:selected.id,frame:String(info.frame),phase:info.phase,elapsed:String(Math.round(elapsed)),mirrored:String(mirror),effectVisible:String(info.visible),persistent:String(fragmentsHeld()),opponentTurn:String(opponentTurn),hitFlash:String(hit),earthForm:controls['earth-form'].value});
    updateControls();
  }
  function seek(time,{pause=true}={}){
    if(!ready)return;if(pause)playing=false;elapsed=Math.max(0,Number(time)||0);lastTime=null;
    if(!isPersistent()&&fadeAt===null)elapsed=Math.min(elapsed,duration());paint();
  }
  function restart(){elapsed=0;lastTime=null;opponentTurn=false;fadeAt=null;paint();}
  async function selectSpell(id){
    const generation=++selectionGeneration;selected=data.spells.find(spell=>spell.id===id)||data.spells[0];
    ready=false;playing=false;elapsed=0;lastTime=null;opponentTurn=false;fadeAt=null;
    for(const control of Object.values(controls))control.disabled=true;
    if(!selected){$('spell-name').textContent='Spell sheets are still being prepared';$('spell-description').textContent='This is an incomplete draft viewer.';return;}
    try{
      await loadImage(selected.file);if(generation!==selectionGeneration)return;
      $('load-error').hidden=true;ready=true;for(const control of Object.values(controls))control.disabled=false;
      controls['spell-select'].value=selected.id;
      controls.outcome.options[0].textContent=selected.id==='FAT-003'?'+2 to the roll':'Threshold reached';
      controls.outcome.options[1].textContent=selected.id==='FAT-003'?'−2 to the roll':'Base effect';
      if(selected.id==='Earth-5')controls['earth-form'].value='golem';
      $('spell-name').textContent=selected.name;$('spell-description').textContent=selected.description||'';
      $('spell-notes').textContent=Array.isArray(selected.notes)?selected.notes.join(' '):selected.notes||'';
      $('download-current').href=assetUrl(selected.file);$('download-current').download=fileName(selected.file);
      $('current-sheet').src=assetUrl(selected.file);$('current-sheet').alt=`${selected.name} · original ${selected.columns} by ${selected.rows} effect sheet`;
      canvas.setAttribute('aria-label',`${selected.name} spell animation preview`);playing=!reducedMotion.matches;document.documentElement.dataset.previewReady='true';paint();
    }catch(error){if(generation===selectionGeneration)fail(error);}
  }
  function showImage(item){
    $('image-title').textContent=item.name;$('large-image').src=assetUrl(item.file);$('large-image').alt=item.name;
    const dialog=$('image-dialog');if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  }
  function artCard(item,{screen=false,source=false}={}){
    const article=document.createElement('article');article.className='art-card';article.dataset.artId=item.id;
    const title=document.createElement('h3');title.textContent=item.name;article.append(title);
    const button=document.createElement('button');button.type='button';button.className='art-open';button.setAttribute('aria-label',`Open ${item.name} at full resolution`);
    if(item.frames?.length&&item.columns&&item.rows&&!source){
      const tile=document.createElement('canvas');tile.width=360;tile.height=260;tile.className='state-canvas';tile.setAttribute('role','img');tile.setAttribute('aria-label',`${item.name} · normal and hover artwork`);button.append(tile);
      let hovered=false;
      const drawTile=()=>{
        if(!images.has(item.file))return;const context=tile.getContext('2d'),frame=item.frames[hovered?Math.min(1,item.frames.length-1):0],rect=spriteRect(item,frame);
        context.clearRect(0,0,tile.width,tile.height);context.imageSmoothingEnabled=false;
        const scale=Math.min(tile.width/rect.w,tile.height/rect.h);context.drawImage(images.get(item.file),rect.x,rect.y,rect.w,rect.h,(tile.width-rect.w*scale)/2,(tile.height-rect.h*scale)/2,rect.w*scale,rect.h*scale);tile.dataset.frame=String(frame);
      };
      for(const type of ['pointerenter','focus'])button.addEventListener(type,()=>{hovered=true;drawTile();});
      for(const type of ['pointerleave','blur'])button.addEventListener(type,()=>{hovered=false;drawTile();});
      loadImage(item.file).then(drawTile).catch(fail);
    }else{
      const image=document.createElement('img');image.loading='lazy';image.decoding='async';image.src=assetUrl(item.file);image.alt=item.name;button.append(image);
    }
    button.addEventListener('click',()=>showImage(item));article.append(button);
    if(item.columns&&item.rows&&!screen&&!source){
      const caption=document.createElement('p');caption.textContent=`${item.columns} × ${item.rows} sheet${item.frames?` · selected frames ${item.frames.join(', ')}`:''}`;article.append(caption);
      if(item.rowOrder&&item.columnOrder){const states=document.createElement('p');states.textContent=`Rows: ${item.rowOrder.join(' / ')}. Columns: ${item.columnOrder.join(' / ')}.`;article.append(states);}
    }
    if(item.description){const text=document.createElement('p');text.textContent=item.description;article.append(text);}
    const dimensions=document.createElement('small'),asset=data.assets[item.file];dimensions.textContent=`${asset.width} × ${asset.height} · ${(asset.bytes/1024).toFixed(0)} KB`;article.append(dimensions);
    const link=document.createElement('a');link.className='asset-link';link.href=assetUrl(item.file);link.download=fileName(item.file);link.textContent='Download original PNG';article.append(link);return article;
  }
  function galleries(){
    const sourceItems=[];
    for(const spell of data.spells){
      const shared=sourceItems.find(item=>item.file===spell.file);
      if(shared){shared.name+=` / ${spell.name}`;shared.description='Shared original atlas; each named effect uses its own frame range in the review.';}
      else sourceItems.push({...spell});
    }
    for(const[container,items,options]of [[$('screen-gallery'),data.screens,{screen:true}],[$('graphics-gallery'),data.graphics,{}],[$('source-gallery'),sourceItems,{source:true}]]){
      if(!items.length){const note=document.createElement('p');note.className='empty-gallery';note.textContent='Artwork is still being prepared for this draft.';container.append(note);}
      else for(const item of items)container.append(artCard(item,options));
    }
  }
  controls['spell-select'].addEventListener('change',event=>selectSpell(event.target.value));
  controls['play-toggle'].addEventListener('click',()=>{if(!ready)return;if(!playing&&(!isPersistent()&&elapsed>=duration()||fadeAt!==null&&elapsed>=fadeAt+340))restart();playing=!playing;lastTime=null;paint();});
  controls.restart.addEventListener('click',restart);
  controls['step-back'].addEventListener('click',()=>seek(elapsed-100));controls['step-forward'].addEventListener('click',()=>seek(elapsed+100));
  controls.timeline.addEventListener('input',event=>seek(event.target.value));
  controls.speed.addEventListener('change',event=>{speed=Number(event.target.value);lastTime=null;});
  for(const id of ['direction','earth-form','backdrop'])controls[id].addEventListener('change',paint);
  controls.outcome.addEventListener('change',()=>{opponentTurn=false;fadeAt=null;paint();});
  controls['next-turn'].addEventListener('click',()=>{if(!isPersistent()||fadeAt!==null)return;opponentTurn=true;elapsed=Math.max(elapsed,1840);lastTime=null;paint();});
  controls['end-next-turn'].addEventListener('click',()=>{if(!isPersistent()||!opponentTurn||fadeAt!==null)return;fadeAt=elapsed;playing=true;lastTime=null;paint();});
  $('close-image').addEventListener('click',()=>{$('image-dialog').close?.();$('image-dialog').removeAttribute('open');});
  $('image-dialog').addEventListener('click',event=>{if(event.target===$('image-dialog'))$('close-image').click();});
  document.addEventListener('visibilitychange',()=>{lastTime=null;});
  reducedMotion.addEventListener?.('change',()=>{if(reducedMotion.matches){playing=false;lastTime=null;paint();}});
  function tick(time){
    if(ready&&playing&&!document.hidden){
      if(lastTime!==null)elapsed+=Math.max(0,time-lastTime)*speed;lastTime=time;
      if(fadeAt!==null&&elapsed>=fadeAt+340){elapsed=fadeAt+340;playing=false;}
      else if(!isPersistent()&&elapsed>=duration()){elapsed=duration();playing=false;}
      paint();
    }else lastTime=null;
    requestAnimationFrame(tick);
  }
  async function initialize(){
    try{
      if(data.previewOnly!==true||data.integration!=='not-installed')throw new Error('This must be a separate, preview-only art package.');
      for(const spell of data.spells){const option=document.createElement('option');option.value=spell.id;option.textContent=`${spell.name} · ${spell.id}`;controls['spell-select'].append(option);}
      $('spell-count').textContent=`${data.spells.length} spell effects · ${new Set(data.spells.map(spell=>spell.file)).size} original effect sheets · Xineoph and Pacific preserved · ${data.draft?'incomplete working draft':'complete graphics draft'}`;
      galleries();
      const refs=[...new Set(Object.values(data.references).map(reference=>reference.file))];await Promise.all(refs.map(loadImage));
      await selectSpell(data.spells[0]?.id);requestAnimationFrame(tick);
    }catch(error){fail(error);}
  }
  window.WIZZY_GRAPHICS_REVIEW=data;
  window.WIZZY_GRAPHICS_REVIEW_PLAYER={selectSpell,seek,restart,paint,getState:()=>({ready,playing,spellId:selected?.id,elapsed,speed,opponentTurn,fadeAt,persistent:fragmentsHeld(),frame:selected?spellFrame().frame:null})};
  initialize();
})();
