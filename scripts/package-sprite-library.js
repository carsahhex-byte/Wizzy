/** Collect original sprite PNGs into an offline, deduplicated backup library. */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { ASSET_FILES, ASSET_CROPS, WIZARD_SPRITES, COMBAT_ANIMATION_SHEETS, SPELL_ANIMATION_SHEETS, CREATURE_ANIMATION_SHEETS, LEGACY_XINEOPH_ANIMATION_SHEETS } from '../src/assets.js';
import { PIXEL_ICON_CROPS } from '../src/pixel-icons.js';

const repo=path.resolve(import.meta.dirname,'..');
const output=path.resolve(process.argv[2]||'/workspace/artifacts/Wizzy-Sprite-Library');
if(output===repo||output.startsWith(path.join(repo,'public'))||output.startsWith(path.join(repo,'designs')))throw Error('Choose an artifact output folder.');
const sha=d=>createHash('sha256').update(d).digest('hex');
const range=(n,start=0)=>Array.from({length:n},(_,i)=>i+start);
const all=['Fire','Water','Earth','Air','Golem'];
const files=new Map(),assets=[],hashes=new Map(),paths=new Map();
const safe=s=>s.replace(/<\/script/gi,'<\\/script');
const copy=value=>JSON.parse(JSON.stringify(value));
const sourceName=p=>p.startsWith(repo+path.sep)?path.relative(repo,p).split(path.sep).join('/'):p;
const pngPath=key=>path.join(repo,'public/graphics',ASSET_FILES[key]);
const meta=s=>copy(s);

async function register(from,file,options={}){
  from=path.resolve(from);const data=await readFile(from);
  if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Not a PNG: '+from);
  const digest=sha(data),width=data.readUInt32BE(16),height=data.readUInt32BE(20);
  const old=hashes.get(digest);
  if(old){
    old.elements=[...new Set([...old.elements,...options.elements||[]])];
    old.sources.push(sourceName(from));
    if(options.title!==old.title)old.aliases.push({title:options.title,status:options.status||'current',source:sourceName(from)});
    paths.set(from,old);return old;
  }
  const metadata={columns:1,rows:1,animations:{'Original image':[0]},...options.metadata,sourceWidth:width,sourceHeight:height};
  if(metadata.frameRects)for(const r of metadata.frameRects)if(r&&(r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>width+.01||r.y+r.h>height+.01))throw Error('Out of bounds crop: '+from);
  const asset={id:options.id||path.basename(file,'.png'),title:options.title||path.basename(from,'.png'),file,elements:options.elements||all,category:options.category||'Sprites',status:options.status||'current',width,height,bytes:data.length,sha256:digest,sources:[sourceName(from)],aliases:[],metadata,notes:options.notes||''};
  assets.push(asset);hashes.set(digest,asset);paths.set(from,asset);files.set(file,data);return asset;
}
const put=(key,file,options)=>register(pngPath(key),file,options);
const names={basicAttack:'Basic attack',simpleCast:'Simple cast',largeCast:'Heavy cast',shield:'Elemental shield',powerUp:'Power-up',enhancement:'Enhancement jump',aura:'Aura ring',basicProjectiles:'Basic projectiles and impacts',largeProjectiles:'Heavy projectiles',hitReaction:'Held hit-reaction reference'};
const currentKeys={basicAttack:'combatV2BasicAttack',simpleCast:'combatV2SimpleCast',largeCast:'combatV2LargeCast',shield:'combatV2Shield',powerUp:'combatV2PowerUp',enhancement:'combatV2Enhancement',aura:'combatV2Aura',basicProjectiles:'combatV2BasicProjectiles',largeProjectiles:'combatV2LargeProjectiles',hitReaction:'combatV2HitReaction'};
const walk={...meta(WIZARD_SPRITES),frameMs:125,anchor:{x:.5,y:60/64},animations:{Fire:range(16),Water:range(16,16)},notes:'Four directions × four frames per element; normalized source-cell feet anchor.'};
await put('wizardWalkAtlas','Shared/Fire-Water/walking.png',{id:'fw-walk',title:'Fire / Water walking and standing',elements:['Fire','Water'],category:'Walking',metadata:walk});
for(const[name,sheet]of Object.entries(COMBAT_ANIMATION_SHEETS)){
  await put(currentKeys[name],`Shared/${name==='aura'?'Effects':'Fire-Water'}/${name}.png`,{id:'fw-'+name,title:names[name],elements:name==='aura'?all:['Fire','Water'],category:name==='aura'?'Aura':name.includes('Projectiles')?'Effects':name==='hitReaction'?'Hit reaction':'Casting',status:name==='hitReaction'?'reference':'current',metadata:meta(sheet),notes:name==='hitReaction'?'Retained one-second-linger reference. Live damage hits currently use a 210 ms standing-sprite red flash and four 85 ms original impact frames.':''});
}
const idle=JSON.parse(await readFile(path.join(repo,'designs/idle-previews/metadata.json'),'utf8'));
await register(path.join(repo,'designs/idle-previews/idle-wizards.png'),'Shared/Fire-Water/idle-preview.png',{id:'fw-idle',title:'Fire / Water idle animation draft',elements:['Fire','Water'],category:'Idle',status:'preview',metadata:idle,notes:'Breathing and blinking preview; not currently used for live battle idle.'});

function creatureMetadata(config,element){
  const base=meta(config.actor),animations={},sequenceSheets={};
  for(const[layer,title]of[['actor','Casting'],['charge','Pulsing charge'],['projectile','Flight'],['impact','Quick impact']]){
    const sheet=meta(config[layer]),frames=sheet.animations[element]||sheet.animations.impact;
    animations[title]=frames;sequenceSheets[title]=sheet;
  }
  return {...base,animations,sequenceSheets,frameMs:125,timingReference:{windup:500,chargeHold:1000,flightAt:2075,impactAt:2975,completeAt:3315}};
}
await put('phoenixFireAnimation','Fire/Custom/Xineoph-current-deep-red.png',{id:'fire-xineoph-current',title:'Xineoph phoenix — current deep-red caster',elements:['Fire'],category:'Custom attacks',status:'known-issue',metadata:creatureMetadata(CREATURE_ANIMATION_SHEETS.xineoph,'fire'),notes:'Exact current backup. Source frame 15 contains a stray wizard hat in the flight crop; it repeats near 2.5 s and 2.9 s. No fix has been applied to this original. Use the separately preserved clean original effects as a reference.'});
await put('pacificDolphinAnimation','Water/Custom/Pacific-dolphin.png',{id:'water-pacific',title:'Pacific dolphin — current animation',elements:['Water'],category:'Custom attacks',metadata:creatureMetadata(CREATURE_ANIMATION_SHEETS.pacific,'water')});
await register(path.join(repo,'designs/sprite-library-extras/fire/phoenix-clean-effects.png'),'Fire/Custom/Xineoph-original-clean-flight.png',{id:'fire-xineoph-clean',title:'Xineoph — original clean flight effects backup',elements:['Fire'],category:'Custom attacks',status:'reference',metadata:creatureMetadata(CREATURE_ANIMATION_SHEETS.xineoph,'fire'),notes:'Clean phoenix flight and impact frames before the deep-red recolor. The earlier caster palette remains lighter red. This is an alternate source backup, not a live-game change.'});
for(const[element,key]of[['Fire','fireMage'],['Water','waterMage']])await put(key,`${element}/Original-Characters/${element.toLowerCase()}-mage-portrait.png`,{id:element.toLowerCase()+'-portrait',title:element+' original large wizard portrait',elements:[element],category:'Characters',status:'reference'});

const legacyKeys={simpleCast:'wizardSimpleCast',largeCast:'wizardLargeCast',basicAttack:'wizardBasicAttack',elementalShield:'wizardElementalShield',firePowerUp:'wizardFirePowerUp',largeProjectiles:'wizardLargeProjectiles'};
for(const[name,sheet]of Object.entries(SPELL_ANIMATION_SHEETS))await put(legacyKeys[name],`Archive/Fire-Water/Original-${name}.png`,{id:'original-'+name,title:'Original '+name,elements:name==='firePowerUp'?['Fire']:['Fire','Water'],category:'Original animations',status:'archive',metadata:meta(sheet),notes:'Earlier source retained for backup and original quick-impact references.'});
const legacyCombined={...meta(LEGACY_XINEOPH_ANIMATION_SHEETS.actor),animations:{Casting:LEGACY_XINEOPH_ANIMATION_SHEETS.actor.animations.fire,Flight:LEGACY_XINEOPH_ANIMATION_SHEETS.projectile.animations.fire,Impact:LEGACY_XINEOPH_ANIMATION_SHEETS.impact.animations.impact},sequenceSheets:{Casting:meta(LEGACY_XINEOPH_ANIMATION_SHEETS.actor),Flight:meta(LEGACY_XINEOPH_ANIMATION_SHEETS.projectile),Impact:meta(LEGACY_XINEOPH_ANIMATION_SHEETS.impact)}};
await put('xineophAnimation','Archive/Fire/Xineoph-previous-phoenix.png',{id:'fire-xineoph-previous',title:'Xineoph previous long phoenix and light blades',elements:['Fire'],category:'Custom attacks',status:'archive',metadata:legacyCombined});
await put('xineophCharge','Archive/Fire/Xineoph-previous-charge-pulse.png',{id:'fire-xineoph-previous-charge',title:'Xineoph previous charge pulse',elements:['Fire'],category:'Custom attacks',status:'archive',metadata:meta(LEGACY_XINEOPH_ANIMATION_SHEETS.charge)});
for(const[name,file]of[['Original Enhancement draft','enhancement-power-up.png'],['Original Aura draft','aura-spiral.png']])await register(path.join(repo,'designs/animation-previews',file),`Archive/Fire-Water/${file}`,{title:name,elements:name.includes('Aura')?all:['Fire','Water'],category:'Original animations',status:'archive',metadata:{columns:4,rows:4,frameMs:125,animations:name.includes('Aura')?{Formation:range(8),Loop:range(4,8),Fizzle:range(4,12)}:{Fire:range(8),Water:range(8,8)}}});

for(const file of await readdir(path.join(repo,'designs/sprite-library-extras/archive'))){
  if(!file.endsWith('.png'))continue;
  await register(path.join(repo,'designs/sprite-library-extras/archive',file),'Archive/Custom-Drafts/'+file,{title:path.basename(file,'.png').replaceAll('-',' '),elements:[file.startsWith('water')?'Water':'Fire'],category:'Custom attack drafts',status:'archive',notes:'Historical generated source. Original sheet is preserved whole; grid was not remeasured for this archival backup.',metadata:{gridUnmeasured:true}});
}

// Exact Fire/Water companion UI, excluding maps, card illustrations and game files.
for(const[element,key]of[['Fire','fireFrame'],['Water','waterFrame']]){
  const r=ASSET_CROPS[key];await put(key,`${element}/Interface/stat-frame.png`,{id:element.toLowerCase()+'-stat-frame',title:element+' stat frame',elements:[element],category:'Interface',metadata:{columns:1,rows:1,frameRects:[{x:r.x,y:r.y,w:r.w,h:r.h}],animations:{Frame:[0]}}});
}
const enhanceRects=['enhanceFire','enhanceWater'].map(k=>{const r=ASSET_CROPS[k];return{x:r.x,y:r.y,w:r.w,h:r.h};});
await put('enhanceButtons','Shared/Fire-Water/enhancement-buttons.png',{title:'Fire / Water Enhancement buttons',elements:['Fire','Water'],category:'Interface',metadata:{columns:2,rows:1,frameRects:enhanceRects,animations:{Fire:[0],Water:[1]}}});
await put('auraButton','Shared/Interface/aura-button.png',{title:'Shared Aura button',elements:all,category:'Interface'});
const iconNames=['fire','water','heart','mana','shield','die'];
await put('battlePixelIcons','Shared/Interface/battle-icons.png',{title:'Element and battle status pixel icons',elements:all,category:'Icons',metadata:{columns:3,rows:2,frameRects:iconNames.map(k=>{const r=PIXEL_ICON_CROPS[k];return{x:r.x,y:r.y,w:r.w,h:r.h};}),animations:Object.fromEntries(iconNames.map((name,i)=>[name,[i]]))}});
await put('battleSwordIcon','Shared/Interface/sword-icon.png',{title:'Sword damage icon',elements:all,category:'Icons'});

// Register all earlier Earth/Air and current Golem sources from their manifests.
const eaRoot=path.join(repo,'designs/earth-air-previews');
const ea=JSON.parse(await readFile(path.join(eaRoot,'manifest.json'),'utf8'));
for(const[id,sheet]of Object.entries(ea.sheets)){
  const from=path.resolve(eaRoot,sheet.src||sheet.file);
  const dest=id==='sharedAura'?'Shared/Effects/earth-air-aura.png':id==='fireWaterWalk'?'Shared/Fire-Water/walk-reference.png':`Shared/Earth-Air/${path.basename(from)}`;
  await register(from,dest,{id:'ea-'+id,title:'Earth / Air '+sheet.title,elements:id==='sharedAura'?all:id==='fireWaterWalk'?['Fire','Water']:['Earth','Air'],category:id.includes('Projectiles')?'Effects':'Earth / Air sprites',status:id==='sharedAura'||id==='fireWaterWalk'?'reference':'preview',metadata:meta(sheet)});
}
const golemRoot=path.join(repo,'designs/earth-air-golem-review');
const golem=JSON.parse(await readFile(path.join(golemRoot,'manifest.json'),'utf8'));
for(const[id,sheet]of Object.entries(golem.sheets)){
  const from=path.resolve(golemRoot,sheet.src),isGolem=id.startsWith('golem');
  const dest=isGolem?'Golem/'+path.basename(from):id==='earthHeavyBoulder'?'Earth/Attacks/heavy-boulder.png':'Shared/Earth-Air/Interface/'+path.basename(from);
  await register(from,dest,{id:'eag-'+id,title:sheet.title,elements:isGolem?['Earth','Golem']:id==='earthHeavyBoulder'?['Earth']:['Earth','Air','Golem'],category:isGolem?'Golem sprites':id==='earthHeavyBoulder'?'Effects':'Interface',status:'preview',metadata:meta(sheet)});
}
// Record duplicate approved-review aliases without copying their PNG bytes again.
for(const file of await readdir(path.join(repo,'designs/animation-previews/v2-one-second'))){
  if(file.endsWith('.png'))await register(path.join(repo,'designs/animation-previews/v2-one-second',file),'Archive/Approved-Review/'+file,{title:'Approved one-second review: '+path.basename(file,'.png'),elements:['Fire','Water'],category:'Review source',status:'reference'});
}

function pathFromPreview(from,target){return path.posix.relative(from,target);}
async function canonical(file){const bytes=await readFile(file),asset=hashes.get(sha(bytes));if(!asset)throw Error('Preview source absent from library: '+file);return asset.file;}
function replaceEmbedded(html,name,object){const re=new RegExp('<script>window\\.'+name+'=[\\s\\S]*?;<\\/script>');if(!re.test(html))throw Error('Preview manifest missing '+name);return html.replace(re,()=>`<script>window.${name}=${safe(JSON.stringify(object))};</script>`);}
const packaged=path.resolve('/workspace/artifacts/earth-air-golem-pack');
try{await readFile(path.join(packaged,'manifest.json'));}catch(error){if(error.code==='ENOENT')throw Error('Create the earlier review first: node scripts/package-earth-air-golem-review.js '+packaged);throw error;}
if(new Set(assets.map(a=>a.id)).size!==assets.length)throw Error('Sprite asset IDs must be unique.');
const eag=JSON.parse(await readFile(path.join(packaged,'manifest.json'),'utf8'));
for(const sheet of Object.values(eag.sheets))sheet.src=pathFromPreview('Previews/Earth-Air-Golem',await canonical(path.join(packaged,sheet.src)));
for(const ref of Object.values(eag.references))ref.sheet.src=pathFromPreview('Previews/Earth-Air-Golem',await canonical(path.join(packaged,ref.sheet.src)));
eag.zip='../../Wizzy-Sprite-Library.zip';
let eagHtml=replaceEmbedded(await readFile(path.join(packaged,'index.html'),'utf8'),'WIZZY_EARTH_AIR_GOLEM_REVIEW',eag);
eagHtml=eagHtml.replaceAll('legacy-gallery/index.html','../Earth-Air/index.html');
files.set('Previews/Earth-Air-Golem/index.html',Buffer.from(eagHtml));
const old=JSON.parse(await readFile(path.join(packaged,'legacy-gallery/manifest.json'),'utf8'));
for(const sheet of Object.values(old.sheets))sheet.src=pathFromPreview('Previews/Earth-Air',await canonical(path.resolve(packaged,'legacy-gallery',sheet.src)));
old.zip='../../Wizzy-Sprite-Library.zip';
files.set('Previews/Earth-Air/index.html',Buffer.from(replaceEmbedded(await readFile(path.join(packaged,'legacy-gallery/index.html'),'utf8'),'WIZZY_EARTH_AIR_PREVIEW',old)));

// Original idle gallery, with its image URL pointing to the single shared copy.
const idleAsset=paths.get(path.join(repo,'designs/idle-previews/idle-wizards.png'));
let idleJs=await readFile(path.join(repo,'designs/idle-previews/viewer.js'),'utf8');
idleJs=idleJs.replace('const file = `./${encodeURIComponent(metadata.file)}`;', 'const file = metadata.file;');
const idleMetadata={...idle,file:pathFromPreview('Previews/Fire-Water-Idle',idleAsset.file)};
let idleHtml=(await readFile(path.join(repo,'designs/idle-previews/review.template.html'),'utf8')).replace('__IDLE_METADATA__',JSON.stringify(idleMetadata).replace(/</g,'\\u003c'));

const manifest={format:'wizzy-sprite-library',version:1,title:'Wizzy Sprite Library',sourceCommit:'5d9e357',pixelPreservation:'Original PNG bytes; no cropping, recoloring or re-encoding.',assets,rules:golem.rules,knownIssues:[{asset:'fire-xineoph-current',sourceFrame:15,issue:'Stray wizard hat in a repeated flight frame; original preserved and clean alternate effects included.'}],timing:{actorFrameMs:125,chargeHoldMs:1000,hitFlashMs:210,hitWindowMs:340,idleFrameMs:160},totalPngs:assets.length,totalPngBytes:assets.reduce((n,a)=>n+a.bytes,0)};
files.set('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
files.set('runtime-metadata.json',Buffer.from(JSON.stringify({ASSET_FILES,WIZARD_SPRITES,SPELL_ANIMATION_SHEETS,COMBAT_ANIMATION_SHEETS,LEGACY_XINEOPH_ANIMATION_SHEETS,CREATURE_ANIMATION_SHEETS,ASSET_CROPS,PIXEL_ICON_CROPS},null,2)+'\n'));

for(const element of all){
  const relevant=assets.filter(a=>a.elements.includes(element));
  const frameIndex=relevant.map(a=>({id:a.id,title:a.title,file:path.posix.relative(element,a.file),status:a.status,category:a.category,sha256:a.sha256,sourceWidth:a.width,sourceHeight:a.height,metadata:a.metadata,notes:a.notes}));
  files.set(`${element}/frame-index.json`,Buffer.from(JSON.stringify({element,assets:frameIndex},null,2)+'\n'));
  files.set(`${element}/README.md`,Buffer.from(`# ${element} sprites\n\nThis folder contains unique ${element} artwork. Paired atlases are stored once in Shared; frame-index.json links to them and preserves exact grids, source rectangles, frame order, anchors and timing.\n\n${relevant.map(a=>`- [${a.title}](${path.posix.relative(element,a.file)}) — ${a.status}; ${a.width}×${a.height}`).join('\n')}\n`));
}
const readme=`# Wizzy Sprite Library\n\nSave this entire extracted folder anywhere. Open index.html to browse it offline. All ${assets.length} PNG files preserve their original bytes and transparency. No game files or account data are included.\n\n## Folders\n\n- Fire and Water: unique characters, custom Phoenix/Dolphin animations and stat frames.\n- Earth, Air and Golem: new Golem assets and Earth attack; element frame-index.json files link to shared atlases.\n- Shared/Fire-Water and Shared/Earth-Air: paired sheets saved once, with the full color variants intact.\n- Shared/Effects and Shared/Interface: Aura, battle icons and controls.\n- Archive: earlier casting sheets and custom-animation drafts, clearly separated from current artwork.\n- Previews: offline Earth/Air/Golem and Earth/Air animation players.\n\nThe main manifest and each element's frame index document exact original files, hashes, grids, source rectangles, anchors and sequences. Paired sheets remain paired; no artwork was repainted or split.\n\n## Current, preview and archive\n\nCurrent Fire/Water sprites include walking, the approved one-second casting/particle holds, Shield, boosts, Enhancement, Aura, projectiles and the Phoenix/Dolphin custom attacks. The longer v2 hit-reaction sheet is retained as a reference; actual hits use the quicker 210 ms red flash and 340 ms impact window. Idle sheets and all Earth/Air/Golem assets are preview artwork. The archive preserves earlier versions and is not a recommendation to replace current art.\n\n## Known Xineoph source issue\n\nFire/Custom/Xineoph-current-deep-red.png is an exact current-source backup. Its source frame 15 includes a stray wizard hat in the flight crop, repeating near 2.5 and 2.9 seconds. This pack does not silently alter it. Fire/Custom/Xineoph-original-clean-flight.png preserves the earlier clean flight effects; that backup still has the earlier lighter caster palette.\n\n## Earth Golem design reference\n\nTransform at Shield 20 or higher. A fall to 19 or lower does not revert immediately; check at Earth's own end turn. Golem form grants +10 flat damage only to damaging Earth spells. These are design/preview rules; Earth and Air have not been integrated into live combat.\n\n## Portable use\n\nKeep the subfolders together so relative image links continue to work. No internet connection, installation, login or build command is required to browse this extracted library. You can also open any PNG directly.\n`;
files.set('README.md',Buffer.from(readme));
const browser=String.raw`(()=>{const m=window.WIZZY_SPRITE_LIBRARY,$=id=>document.getElementById(id);const list=m.assets;let chosen=null,seq='',index=0,playing=false,last=0;const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const state=a=>a.status==='known-issue'?'Known issue':a.status;function update(){const e=$('element').value,c=$('category').value,s=$('status').value,q=$('search').value.toLowerCase();const shown=list.filter(a=>(!e||a.elements.includes(e))&&(!c||a.category===c)&&(!s||a.status===s)&&(!q||(a.title+' '+a.file+' '+a.notes).toLowerCase().includes(q)));$('count').textContent=shown.length+' / '+list.length+' original PNGs';$('assets').innerHTML=shown.map(a=>'<article><a href="'+a.file+'" target="_blank" rel="noopener"><img src="'+a.file+'" loading="lazy" alt="'+escape(a.title)+'"></a><h2>'+escape(a.title)+'</h2><p>'+a.elements.join(' · ')+'<br>'+a.width+' × '+a.height+' · '+escape(a.category)+'</p><span class="tag '+a.status+'">'+state(a)+'</span>'+(a.notes?'<p class="notes">'+escape(a.notes)+'</p>':'')+'<div><button data-open="'+a.id+'">View frames</button><a href="'+a.file+'" download>PNG ↓</a></div></article>').join('');for(const b of document.querySelectorAll('[data-open]'))b.onclick=()=>open(list.find(a=>a.id===b.dataset.open));}function data(){const raw=chosen.metadata.animations[seq];return Array.isArray(raw)?{frames:raw,frameMs:chosen.metadata.frameMs||125}:raw||{frames:[0],frameMs:125};}function draw(){if(!chosen)return;const d=data(),f=d.frames[index],meta=chosen.metadata.sequenceSheets?.[seq]||chosen.metadata,cols=meta.columns||1,rows=meta.rows||1,r=meta.frameRects?.[f]||{x:f%cols*chosen.width/cols,y:Math.floor(f/cols)*chosen.height/rows,w:chosen.width/cols,h:chosen.height/rows};const scale=Math.min(2,340/r.w,300/r.h);Object.assign($('sprite').style,{width:r.w*scale+'px',height:r.h*scale+'px',backgroundImage:'url("'+chosen.file+'")',backgroundSize:chosen.width*scale+'px '+chosen.height*scale+'px',backgroundPosition:-r.x*scale+'px '+-r.y*scale+'px',clipPath:meta.frameClips?.[f]||''});$('frame').max=d.frames.length-1;$('frame').value=index;$('frame-label').textContent=(index+1)+' / '+d.frames.length+' · source '+f;$('play').textContent=playing?'Pause':'Play';$('frame-stage').dataset.frame=f;}function open(a){chosen=a;index=0;playing=false;last=performance.now();$('dialog-title').textContent=a.title;$('dialog-notes').textContent=a.notes;$('sequence').innerHTML=Object.keys(a.metadata.animations||{'Original image':[0]}).map(s=>'<option>'+escape(s)+'</option>').join('');const element=$('element').value.toLowerCase(),keys=Object.keys(a.metadata.animations||{'Original image':[0]});const preferred=element&&(keys.find(k=>k.toLowerCase()===element)||keys.find(k=>k.toLowerCase().startsWith(element+' '))||(['earth','air','golem'].includes(element)&&keys.find(k=>k.toLowerCase()==='shield')));if(preferred)$('sequence').value=preferred;seq=$('sequence').value;$('download').href=a.file;$('viewer').showModal();draw();}$('close').onclick=()=>{$('viewer').close();playing=false;};$('sequence').onchange=()=>{seq=$('sequence').value;index=0;draw();};$('frame').oninput=()=>{playing=false;index=Number($('frame').value);draw();};$('play').onclick=()=>{playing=!playing;last=performance.now();draw();};$('background').onchange=()=>{$('frame-stage').dataset.bg=$('background').value;};for(const id of['element','category','status','search'])$(id).addEventListener('input',update);$('category').innerHTML='<option value="">All kinds</option>'+[...new Set(list.map(a=>a.category))].sort().map(c=>'<option>'+escape(c)+'</option>').join('');if(location.protocol==='file:')$('download-all').hidden=true;update();function tick(now){if(playing&&chosen&&$('viewer').open){const ms=data().frameMs||125;if(now-last>=ms){index=(index+Math.floor((now-last)/ms))%data().frames.length;last=now;draw();}}requestAnimationFrame(tick);}requestAnimationFrame(tick);window.WIZZY_LIBRARY_REVIEW={openAsset:id=>open(list.find(a=>a.id===id)),get assets(){return list},pause(){playing=false;draw();}};})();`;
const css=`:root{font-family:Arial,sans-serif;color:#e9e4d5;background:#141d21;color-scheme:dark}*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:28px 18px}h1{font-size:clamp(30px,6vw,54px);margin:12px 0}p{line-height:1.6;color:#b8c6c1}nav,.filters,article>div,.controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center}a{color:#ead296}button,select,input,.button{font:700 12px monospace;padding:10px 12px;background:#30443a;border:1px solid #92a58c;color:#fff1d2;min-height:42px;border-radius:0}button,a.button{cursor:pointer}.button{text-decoration:none}.filters{margin:28px 0}.filters label{display:grid;gap:7px;font:12px monospace;flex:1;min-width:145px}.filters input,.filters select{min-width:0;width:100%;max-width:100%}h1,h2,p,a{overflow-wrap:anywhere}#assets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}article{min-width:0;padding:15px;border:1px solid #556f62;background:#20312d}article img{display:block;width:100%;height:230px;object-fit:contain;image-rendering:pixelated;background:#34473c}h2{font-size:17px;margin:14px 0 8px}article p{font-size:12px}article .notes{font-size:11px}.tag{display:inline-block;font:10px monospace;border:1px solid #728b77;padding:5px 7px}.known-issue{border-color:#d8a76b;color:#f7ca8d}.archive{color:#b4acbd}dialog{width:min(760px,95vw);background:#1c2c29;color:#efeadc;border:2px solid #a39b76;padding:20px}dialog::backdrop{background:#030c13cc}#frame-stage{height:335px;background:#334a3a;display:flex;justify-content:center;align-items:center;overflow:hidden;margin:14px 0;border:1px solid #7b927e}#frame-stage[data-bg=light]{background:#e3e5d8}#frame-stage[data-bg=checker]{background:repeating-conic-gradient(#aebead 0% 25%,#d4dccf 0% 50%) 50%/24px 24px}#sprite{display:block;background-repeat:no-repeat;image-rendering:pixelated}.controls{margin:15px 0}#frame{width:100%}#close{float:right}footer{margin:35px 0;font:11px monospace;color:#aab6ad}@media(max-width:800px){#assets{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){#assets{grid-template-columns:1fr}main{padding:20px 12px}.filters label{min-width:130px}}`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wizzy Sprite Library</title><style>${css}</style></head><body><main><header><p>WIZZY · ORGANIZED ORIGINAL ARTWORK</p><h1>Sprite Library</h1><p>Fire, Water, Earth, Air and Golem — walking, casts, projectiles, boosts, Enhancement, Aura, interfaces and archived drafts.</p><nav><a class="button" id="download-all" href="Wizzy-Sprite-Library.zip" download>Download complete folder ↓</a><a class="button" href="Previews/Earth-Air-Golem/index.html">Earth / Air / Golem player</a><a href="README.md">Folder guide</a><a href="manifest.json">Full file index</a></nav></header><div class="filters"><label>Element<select id="element"><option value="">All elements</option>${all.map(e=>'<option>'+e+'</option>').join('')}</select></label><label>Artwork<select id="category"></select></label><label>Version<select id="status"><option value="">All versions</option><option value="current">Current</option><option value="preview">Preview</option><option value="reference">Reference</option><option value="known-issue">Known issue</option><option value="archive">Archive</option></select></label><label>Search<input id="search" type="search" placeholder="Phoenix, shield, idle…"></label></div><p id="count"></p><section id="assets" aria-label="Original sprite sheets"></section><footer>Original PNG bytes and transparency preserved. Paired sheets are stored once under Shared. This is an artwork backup; no live game state is changed.</footer></main><dialog id="viewer"><button id="close" aria-label="Close frame viewer">×</button><h2 id="dialog-title"></h2><p id="dialog-notes"></p><div class="controls"><label>Sequence <select id="sequence"></select></label><label>Background <select id="background"><option value="dark">Dark</option><option value="light">Light</option><option value="checker">Checkerboard</option></select></label></div><div id="frame-stage"><span id="sprite"></span></div><input id="frame" type="range" min="0" max="0" value="0"><p id="frame-label"></p><div class="controls"><button id="play">Play</button><a id="download" download>Original PNG ↓</a></div></dialog><script>window.WIZZY_SPRITE_LIBRARY=${safe(JSON.stringify(manifest))};</script><script>${safe(browser)}</script></body></html>`;
files.set('index.html',Buffer.from(html));

// Finish the idle page after source text is loaded; preserve its exact sprite.
const idleCss=await readFile(path.join(repo,'designs/idle-previews/style.css'),'utf8');
idleHtml=(await readFile(path.join(repo,'designs/idle-previews/review.template.html'),'utf8')).replace('__IDLE_METADATA__',JSON.stringify(idleMetadata).replace(/</g,'\\u003c')).replace('<link rel="stylesheet" href="./style.css">',()=>`<style>${idleCss}</style>`).replace('<script src="./viewer.js" defer></script>','').replace('</body>',()=>`<script>${safe(idleJs)}</script></body>`).replace('href="./idle-wizard-preview.zip"','href="../../Wizzy-Sprite-Library.zip"');
files.set('Previews/Fire-Water-Idle/index.html',Buffer.from(idleHtml));

await mkdir(output,{recursive:true});
for(const[file,data]of files){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),data);}
const locals=[],directory=[];let position=0;
for(const[file,data]of files){
  const name=Buffer.from('Wizzy-Sprite-Library/'+file),checksum=crc32(data),local=Buffer.alloc(30),method=file.endsWith('.png')?0:8,compressed=method?deflateRawSync(data,{level:9}):data;
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,compressed);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt16LE(33,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(position,42);directory.push(central,name);position+=local.length+name.length+compressed.length;
}
const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(position,16);const zip=Buffer.concat([...locals,dir,end]);
if(zip.length>=64*1024*1024)throw Error('Sprite backup exceeds the 64 MiB upload target.');
await writeFile(path.join(output,'Wizzy-Sprite-Library.zip'),zip);
console.log(JSON.stringify({output,pngs:assets.length,originalPngBytes:manifest.totalPngBytes,zipBytes:zip.length,zipEntries:files.size,statusCounts:Object.fromEntries([...new Set(assets.map(a=>a.status))].map(s=>[s,assets.filter(a=>a.status===s).length])),liveGameChanged:false},null,2));
