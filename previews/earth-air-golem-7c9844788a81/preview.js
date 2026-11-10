/* Offline art viewer. No imports, network requests or live battle state. */
(() => {
  'use strict';
  const manifest=window.WIZZY_EARTH_AIR_GOLEM_REVIEW||{}, sheets=manifest.sheets||{};
  if(manifest.embeddedImages){
    for(const sheet of [...Object.values(sheets),...Object.values(manifest.references||{}).map(r=>r.sheet)])sheet.src=manifest.embeddedImages[sheet.src]||sheet.src;
    if(manifest.legacyManifest&&manifest.legacyTemplate){
      for(const sheet of Object.values(manifest.legacyManifest.sheets)){const key=sheet.src.startsWith('../')?sheet.src.slice(3):`legacy-gallery/${sheet.src}`;sheet.src=manifest.embeddedImages[key]||sheet.src;}
      const json=JSON.stringify(manifest.legacyManifest).replace(/<\/script/gi,'<\\/script');
      manifest.legacyInline=manifest.legacyTemplate.replace(/<script>window\.WIZZY_EARTH_AIR_PREVIEW=[\s\S]*?;<\/script>/,()=>`<script>window.WIZZY_EARTH_AIR_PREVIEW=${json};</script>`).replace('</head>','<style>#download-pack{display:none}</style></head>');
    }
  }
  const $=id=>document.getElementById(id), stage=$('sprite-stage'), viewer=$('preview-sprite');
  const entries=Object.entries(sheets), images=[];
  let selected=entries[0]?.[0], sequenceName='', index=0, playing=!matchMedia('(prefers-reduced-motion: reduce)').matches, mirrored=false, elapsed=0, previous=performance.now();
  let shield=0, golem=false;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function sequence(){const sheet=sheets[selected], raw=sheet?.animations?.[sequenceName];return{frames:Array.isArray(raw)?raw:raw?.frames||[0],frameMs:raw?.frameMs||sheet?.frameMs||125};}
  function rect(sheet,frame){return sheet.frameRects?.[frame]||{x:frame%sheet.columns*sheet.sourceWidth/sheet.columns,y:Math.floor(frame/sheet.columns)*sheet.sourceHeight/sheet.rows,w:sheet.sourceWidth/sheet.columns,h:sheet.sourceHeight/sheet.rows};}
  function paint(node,sheet,frame,x,y,scale=sheet.displayScale||1,mirror=false){
    if(!sheet){node.hidden=true;return;}node.hidden=false;
    scale*=sheet.frameScales?.[frame]??1;
    const r=rect(sheet,frame),a=sheet.frameAnchors?.[frame]||sheet.anchor||{x:.5,y:.94};
    const ax=Array.isArray(a)?a[0]:a.x,ay=Array.isArray(a)?a[1]:a.y;
    Object.assign(node.style,{width:`${r.w*scale}px`,height:`${r.h*scale}px`,backgroundImage:`url("${sheet.src}")`,backgroundSize:`${sheet.sourceWidth*scale}px ${sheet.sourceHeight*scale}px`,backgroundPosition:`${-r.x*scale}px ${-r.y*scale}px`,left:`${x-r.w*scale*ax}px`,top:`${y-r.h*scale*ay}px`,transform:mirror?'scaleX(-1)':'',transformOrigin:`${ax*100}% ${ay*100}%`});
    Object.assign(node.dataset,{sheet:sheet.id||'',frame:String(frame)});
  }
  function reference(name){return manifest.references?.[name];}
  function drawForm(){
    const ref=golem?{sheet:sheets.golemPoses,frame:0}:reference('earth');
    paint($('form-sprite'),ref?.sheet,ref?.frame||0,$('form-sprite').parentElement.clientWidth/2,260,ref?.sheet?.displayScale||1);
    $('form-name').textContent=golem?'Earth Golem · +10 damaging spells':'Earth Wizard';
    $('shield-value').textContent=String(shield);$('shield').value=String(shield);
    document.body.dataset.golem=String(golem);document.body.dataset.shield=String(shield);
  }
  function setShield(value){shield=Number(value);if(shield>=20)golem=true;$('form-status').textContent=golem?(shield>=20?'Golem form active. Earth can end its turn and remain transformed.':'Golem form persists for now. Rebuild to 20 before Earth ends its turn.'):'Build Shield to 20 to transform.';drawForm();}
  $('shield').oninput=e=>setShield(e.target.value);$('set-twenty').onclick=()=>setShield(20);$('set-nineteen').onclick=()=>setShield(19);
  $('end-turn').onclick=()=>{if(shield<=19)golem=false;$('form-status').textContent=golem?'Earth ended its turn with at least 20 Shield: Golem form remains.':'Earth ended its turn below 20 Shield: wizard form.';drawForm();};
  function render(){
    const sheet=sheets[selected];if(!sheet)return;
    const seq=sequence();index=Math.min(index,seq.frames.length-1);const frame=seq.frames[index],zoom=Number($('zoom').value);
    const staticIcon=['elementIcons','statFrames','enhanceButtons'].includes(selected),centerY=staticIcon?stage.clientHeight/2:330;
    const region=rect(sheet,frame),baseScale=sheet.displayScale||1;
    const fit=staticIcon?Math.min(1,(stage.clientWidth-24)/(region.w*baseScale),(stage.clientHeight-24)/(region.h*baseScale)):1;
    paint(viewer,sheet,frame,stage.clientWidth/2,centerY,baseScale*fit*zoom,mirrored);
    viewer.setAttribute('aria-label',`${sheet.title}, ${sequenceName}, source frame ${frame}`);
    $('frame').max=String(seq.frames.length-1);$('frame').value=String(index);$('frame-label').textContent=`${index+1} / ${seq.frames.length} · source ${frame}`;
    $('play').textContent=playing?'Pause':'Play';$('play').setAttribute('aria-pressed',String(playing));
    $('sheet-info').textContent=`${sheet.sourceWidth} × ${sheet.sourceHeight} PNG · ${sheet.columns} columns × ${sheet.rows} rows · ${seq.frameMs} ms per playback frame · ${sequenceName}`;
    for(const n of $('frame-grid').children)n.setAttribute('aria-current',String(Number(n.dataset.frame)===frame));
    Object.assign(stage.dataset,{sheet:selected,frame:String(frame),sequence:sequenceName,playing:String(playing)});
  }
  function updateSequence(){index=0;elapsed=0;sequenceName=$('sequence-select').value;render();}
  function updateSheet(){
    selected=$('sheet-select').value;const sheet=sheets[selected];
    $('sequence-select').innerHTML=Object.keys(sheet.animations||{Still:[0]}).map(name=>`<option>${escape(name)}</option>`).join('');
    $('download-source').href=sheet.src;$('download-source').download=sheet.filename||selected+'.png';
    $('frame-grid').replaceChildren();
    for(let frame=0;frame<sheet.columns*sheet.rows;frame++){
      const button=document.createElement('button');button.className='thumb';button.dataset.frame=String(frame);button.setAttribute('aria-label',`Inspect source frame ${frame}`);
      const sprite=document.createElement('span');sprite.className='sprite';const number=document.createElement('span');number.className='number';number.textContent=String(frame);button.append(sprite,number);$('frame-grid').append(button);
      const r=rect(sheet,frame),scale=Math.min(85/r.w,85/r.h);paint(sprite,sheet,frame,button.clientWidth/2,48,scale);sprite.style.top=`${(85-r.h*scale)/2}px`;sprite.style.left=`${(button.clientWidth-r.w*scale)/2}px`;
      button.onclick=()=>{playing=false;const seq=sequence(),at=seq.frames.indexOf(frame);if(at>=0){index=at;render();}else{paint(viewer,sheet,frame,stage.clientWidth/2,330,(sheet.displayScale||1)*Number($('zoom').value),mirrored);stage.dataset.frame=String(frame);$('frame-label').textContent=`Source frame ${frame}`;for(const n of $('frame-grid').children)n.setAttribute('aria-current',String(Number(n.dataset.frame)===frame));$('play').textContent='Play';}};
    }
    updateSequence();
  }
  $('sheet-select').innerHTML=entries.map(([id,s])=>`<option value="${id}">${escape(s.title)}</option>`).join('');
  $('sheet-select').onchange=updateSheet;$('sequence-select').onchange=updateSequence;
  $('frame').oninput=e=>{playing=false;index=Number(e.target.value);elapsed=0;render();};
  $('play').onclick=()=>{playing=!playing;elapsed=0;render();};$('restart').onclick=()=>{index=0;elapsed=0;render();};
  $('mirror').onclick=()=>{mirrored=!mirrored;$('mirror').setAttribute('aria-pressed',String(mirrored));render();};$('zoom').onchange=render;
  $('background').onchange=()=>stage.dataset.background=$('background').value;
  function drawReferences(){
    $('comparison').replaceChildren();
    for(const name of ['fire','water','earth','air','golem']){
      const ref=name==='golem'?{sheet:sheets.golemPoses,frame:0}:reference(name);if(!ref?.sheet)continue;
      const card=document.createElement('article');card.className='comparison-card';const sprite=document.createElement('span');sprite.className='sprite';const title=document.createElement('h3');title.textContent=name==='golem'?'Earth Golem':name[0].toUpperCase()+name.slice(1);card.append(sprite,title);$('comparison').append(card);
      paint(sprite,ref.sheet,ref.frame||0,card.clientWidth/2,220,ref.sheet.displayScale||1,name==='water'||name==='air');
    }
    drawForm();
  }
  $('sheet-cards').innerHTML=entries.map(([id,s])=>`<article class="sheet-card"><h3>${escape(s.title)}</h3><img src="${s.src}" alt="${escape(s.title)} original sheet" loading="lazy"><p>${s.sourceWidth} × ${s.sourceHeight} · ${s.columns} × ${s.rows} grid<br>SHA-256 ${String(s.sha256||'').slice(0,16)}…</p><a href="${s.src}" download="${escape(s.filename||id+'.png')}">Download original PNG ↓</a></article>`).join('');
  if(manifest.standalone){for(const n of document.querySelectorAll('[data-zip-link]'))n.hidden=true;$('legacy-open').hidden=true;}
  if(manifest.legacyInline){$('legacy-player').removeAttribute('src');$('legacy-player').srcdoc=manifest.legacyInline;}
  for(const s of [...Object.values(sheets),...Object.values(manifest.references||{}).map(r=>r.sheet)])if(s?.src){const image=new Image();image.src=s.src;images.push(image);}
  Promise.all(images.map(im=>im.decode().catch(()=>null))).then(()=>{document.body.dataset.ready=String(images.every(im=>im.naturalWidth>0));render();drawReferences();});
  updateSheet();drawReferences();
  function tick(now){const delta=Math.min(250,now-previous);previous=now;if(playing&&!document.hidden){elapsed+=delta;const seq=sequence();if(elapsed>=seq.frameMs){const advance=Math.floor(elapsed/seq.frameMs);elapsed%=seq.frameMs;index=(index+advance)%seq.frames.length;render();}}requestAnimationFrame(tick);}requestAnimationFrame(tick);
  window.addEventListener('resize',()=>{render();drawReferences();});
  window.WIZZY_ART_REVIEW=Object.freeze({setShield,get golem(){return golem;},get shield(){return shield;},get selected(){return selected;},pause(){playing=false;render();},setFrame(frame){playing=false;const seq=sequence();index=Math.max(0,Math.min(seq.frames.length-1,frame));render();}});
})();
