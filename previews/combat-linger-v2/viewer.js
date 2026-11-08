const manifest=JSON.parse(document.querySelector('#review-manifest').textContent);
const container=document.querySelector('#sheets'),tiles=[];
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode='full',elapsed=0,lastTime=null;
const playToggle=document.querySelector('#play-toggle');
function textNode(tag,text,className=''){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;}
for(const sheet of manifest.sheets){
  const card=document.createElement('article');card.className='sheet';card.dataset.sheetId=sheet.id;
  card.append(textNode('h2',sheet.title),textNode('p',sheet.description),textNode('p',`${sheet.width} × ${sheet.height} · ${sheet.columns} × ${sheet.rows} · ${sheet.frameCount} frames`,'sheet-meta'));
  const previews=document.createElement('div');previews.className=`previews${sheet.sequences.length===1?' single':''}`;
  for(const sequence of sheet.sequences){
    const tile=document.createElement('section');tile.className=`tile ${sequence.element}`;tile.append(textNode('h3',sequence.element));
    const stage=document.createElement('div');stage.className='stage';stage.setAttribute('role','img');stage.setAttribute('aria-label',`${sequence.element} ${sheet.title} frame preview`);
    const sprite=document.createElement('div');sprite.className='sprite';sprite.style.backgroundImage=`url("./${sheet.file}")`;sprite.style.backgroundSize=`${sheet.columns*100}% ${sheet.rows*100}%`;stage.append(sprite);
    const state=textNode('span','Loading frame…','frame-state');tile.append(stage,state);previews.append(tile);tiles.push({sheet,sequence,stage,sprite,state});
  }
  const links=document.createElement('nav');
  for(const [label,download] of [['View full sheet',false],['Download PNG',true]]){const link=textNode('a',label);link.href=`./${sheet.file}`;if(download)link.download=sheet.file;else{link.target='_blank';link.rel='noopener';}links.append(link);}
  card.append(previews,links);container.append(card);
}
function paint(){
  const inSequence=elapsed%2500;
  const relative=mode==='linger'?4+Math.floor((elapsed%1000)/125):Math.min(15,Math.floor(inSequence/125));
  const phase=mode==='linger'?'linger':inSequence>=2000?'ready':relative<4?'windup':relative<12?'linger':'finish';
  for(const tile of tiles){
    const frame=tile.sequence.firstFrame+relative;
    const x=frame%tile.sheet.columns,y=Math.floor(frame/tile.sheet.columns);
    tile.sprite.style.backgroundPosition=`${x/(tile.sheet.columns-1)*100}% ${y/(tile.sheet.rows-1)*100}%`;
    const [offsetX,offsetY]=tile.sequence.previewOffsets[relative]||[0,0];
    tile.sprite.style.transform=`translate(${offsetX/(tile.sheet.width/tile.sheet.columns)*100}%,${offsetY/(tile.sheet.height/tile.sheet.rows)*100}%)`;
    Object.assign(tile.stage.dataset,{frame:String(frame),relativeFrame:String(relative),phase,lingerMs:String(tile.sequence.phases.linger.durationMs)});
    tile.state.textContent=`${phase.toUpperCase()} · frame ${relative+1}/16${phase==='linger'?' · 1 second':''}`;
  }
}
function syncPlay(){playToggle.textContent=playing?'Pause previews':'Play previews';playToggle.setAttribute('aria-pressed',String(playing));lastTime=null;}
playToggle.addEventListener('click',()=>{playing=!playing;syncPlay();});
document.querySelector('#mode').addEventListener('change',event=>{mode=event.target.value;elapsed=0;lastTime=null;paint();});
document.querySelector('#restart').addEventListener('click',()=>{elapsed=0;lastTime=null;paint();});
document.addEventListener('visibilitychange',()=>{lastTime=null;});
function tick(time){if(playing&&!document.hidden){if(lastTime!==null)elapsed+=Math.max(0,time-lastTime);lastTime=time;paint();}else lastTime=null;requestAnimationFrame(tick);}
syncPlay();paint();requestAnimationFrame(tick);
