/** Separate art-review packaging. No production writes, builds or publication. */
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32,deflateRawSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {IDLE_ANIMATION_SHEETS} from '../src/idle-sprites.js';
import {COMBAT_ANIMATION_SHEETS,EARTH_ANIMATION_SHEETS,GOLEM_ANIMATION_SHEETS,ASSET_FILES} from '../src/assets.js';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'designs/overnight-graphics-review');
const packageName='Wizzy-Graphics-Review';
const groupNames=['Fire-Effects','Water-Effects','Earth-Effects','Fate-Effects','UI-Frames-Props'];
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const within=(base,target)=>target===base||target.startsWith(base+path.sep);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalized=file=>file.split(path.sep).join('/');
const expectedSpellIds=['Fire-2','Fire-15','Fire-6','Fire-14','Water-2','Water-0','Water-12','Water-14','Earth-1','Earth-2','Earth-3','Earth-4','Earth-5','FAT-001','FAT-002','FAT-003'];

function safeRelative(file){
  assert(typeof file==='string'&&file.startsWith('art/')&&!file.includes('\\')&&!file.split('/').includes('..')&&!path.isAbsolute(file),`Invalid art path: ${file}`);
  return file;
}
async function collectArt(directory=path.join(source,'art')){
  const found=[];
  let entries=[];
  try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return found;throw error;}
  for(const entry of entries){
    const full=path.join(directory,entry.name);
    assert(!entry.isSymbolicLink(),`Unexpected source symlink: ${full}`);
    if(entry.isDirectory())found.push(...await collectArt(full));
    else if(entry.name.toLowerCase().endsWith('.png'))found.push(normalized(path.relative(source,full)));
  }
  return found.sort();
}
function pngMetadata(bytes,file){
  assert(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a',`Expected PNG: ${file}`);
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length,sha256:hash(bytes)};
}
async function guardOutput(output,files){
  assert(!within(root,output)&&!within(output,root),'Choose a dedicated output folder outside the repository and its ancestors.');
  assert(!['/','/tmp','/workspace'].includes(output),'Choose a dedicated output folder.');
  for(let current=output;current!==path.parse(current).root;current=path.dirname(current)){
    try{assert(!(await lstat(current)).isSymbolicLink(),`Output path may not contain a symlink: ${current}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const allowed=new Set([...files,'preview.html',`${packageName}.zip`,...groupNames.map(name=>`Wizzy-${name}.zip`)]);
  // Files from an earlier generated draft remain safe only if its ownership
  // manifest explicitly lists them. Unrelated files are never overwritten.
  try{
    const old=JSON.parse(await readFile(path.join(output,'manifest.json'),'utf8'));
    if(old.format==='wizzy-graphics-review'&&old.previewOnly===true){for(const file of Object.keys(old.assets||{}))allowed.add(safeRelative(file));}
  }catch(error){if(error.code!=='ENOENT')throw error;}
  let entries=[];
  try{entries=await readdir(output,{recursive:true,withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  const allowedDirs=new Set();
  for(const file of allowed){let parent=path.posix.dirname(file);while(parent!=='.'){allowedDirs.add(parent);parent=path.posix.dirname(parent);}}
  for(const entry of entries){
    const relative=normalized(path.relative(output,path.join(entry.parentPath,entry.name)));
    assert(!entry.isSymbolicLink(),`Refusing to overwrite symlink: ${relative}`);
    assert(entry.isDirectory()?allowedDirs.has(relative):allowed.has(relative),`Refusing to overwrite unexpected output: ${relative}`);
  }
}
function zipFiles(files,folderName=packageName){
  const locals=[],directory=[];let offset=0;
  assert(files.size<65536,'ZIP entry count exceeds the simple format limit.');
  for(const[file,bytes]of files){
    const name=Buffer.from(`${folderName}/${file}`),method=file.endsWith('.png')?0:8;
    const compressed=method?deflateRawSync(bytes,{level:9}):bytes,checksum=crc32(bytes);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt16LE(33,12);
    local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
    locals.push(local,name,compressed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt16LE(33,14);
    central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    directory.push(central,name);offset+=local.length+name.length+compressed.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}
function uniqueItems(items,type){
  const seen=new Set();return items.map(item=>{
    assert(item&&typeof item.name==='string'&&typeof item.file==='string',`${type} items require name and file.`);
    safeRelative(item.file);const id=item.id||item.file;assert(!seen.has(id),`Duplicate ${type}: ${id}`);seen.add(id);return {...item,id};
  });
}
async function assembleManifest({draft=false}={}){
  const spells=[],screens=[],graphics=[],fragments=[];
  const directory=path.join(source,'manifests');
  const fragmentNames=(await readdir(directory)).filter(file=>file.endsWith('.json')).sort();
  for(const filename of fragmentNames){
    const fragment=JSON.parse(await readFile(path.join(directory,filename),'utf8'));fragments.push(filename);
    spells.push(...fragment.spells||[]);screens.push(...fragment.screens||[]);
    for(const key of ['assets','graphics','frames','props']){
      const collection=fragment[key];
      if(Array.isArray(collection))graphics.push(...collection);
      else if(collection&&typeof collection==='object')for(const[id,value]of Object.entries(collection))graphics.push(typeof value==='string'?{id,name:id,file:value}:{id,name:value.name||id,...value});
    }
    if(fragment.buttons)graphics.push({id:'navigation-buttons',name:'Navigation button states',...fragment.buttons});
  }
  const manifest={format:'wizzy-graphics-review',version:1,previewOnly:true,integration:'not-installed',title:'Wizzy rough pixel graphics review',fragments,
    proposedNames:{'Earth-1':'OffoDefo','Earth-2':'Bengal Shield','Earth-3':'Earthbound','Earth-4':'Merciful','Earth-5':'Tectonic','Water-12':'Carbonate'},
    preservedAnimations:['Fire-11','Water-9'],timing:{formationMs:500,lingerMs:1000,travelMs:1000,impactMs:340,hitFlashMs:210,fateMs:600},
    spells:uniqueItems(spells,'spell'),screens:uniqueItems(screens,'screen'),graphics:uniqueItems(graphics,'graphic'),assets:{},references:{},draft};
  const seenSpellIds=manifest.spells.map(spell=>spell.id);
  for(const spell of manifest.spells){
    assert(expectedSpellIds.includes(spell.id),`Unexpected spell: ${spell.id}`);
    assert(Number.isInteger(spell.columns)&&spell.columns>0&&Number.isInteger(spell.rows)&&spell.rows>0,`${spell.id}: invalid atlas grid.`);
    assert(spell.columns*spell.rows>=(spell.id.startsWith('FAT-')?1:4),`${spell.id}: need valid effect cells.`);
    if(manifest.proposedNames[spell.id])spell.name=manifest.proposedNames[spell.id];
    spell.element=(spell.element||spell.id.split('-')[0]).toLowerCase();
    if(spell.id.startsWith('FAT-')){spell.kind='fate';spell.target='dice';}
    if(spell.id==='Earth-4'){spell.kind='persistent';spell.target='caster';spell.loopFrames=spell.loopFrames||[4,5,6,7,8,9,10,11];spell.persistsUntil='end-of-opponent-next-turn';}
    spell.frameMs=spell.frameMs||100;
  }
  if(!draft){
    assert(expectedSpellIds.every(id=>seenSpellIds.includes(id)),`Missing spell sheets: ${expectedSpellIds.filter(id=>!seenSpellIds.includes(id)).join(', ')}`);
    assert(manifest.screens.length===4,'Expected four separate screen concepts.');
  }
  return manifest;
}
async function addReferences(manifest,files){
  const idle=JSON.parse(await readFile(path.join(root,'designs/idle-wisp-free-review/metadata.json'),'utf8'));
  const copyRef=async(key,filename,sheet={})=>{
    const file=`art/references/${key}.png`,bytes=await readFile(path.join(root,'public/graphics',filename));
    files.set(file,bytes);manifest.assets[file]={file,...pngMetadata(bytes,file),referenceOnly:true};
    manifest.references[key]={...sheet,file};return manifest.references[key];
  };
  for(const wizard of idle.wizards){
    const sheet=idle.sheets[wizard.sheet],reference=IDLE_ANIMATION_SHEETS[wizard.id];
    const key=wizard.sheet==='fireWater'?'fireWaterIdle':'earthIdle';
    if(!manifest.references[key])await copyRef(key,wizard.sheet==='fireWater'?'Wizzy Idle Fire Water Clean.png':'Wizzy Idle Earth Clean.png',sheet);
    manifest.references[wizard.id]={...reference,file:manifest.references[key].file,sequence:wizard.sequence};
  }
  await copyRef('golem','Wizzy Golem Poses.png',{...GOLEM_ANIMATION_SHEETS.poses,nativeFacing:'right',sequence:[0,1,2,3]});
  await copyRef('fireWaterCast',ASSET_FILES[COMBAT_ANIMATION_SHEETS.basicAttack.asset],COMBAT_ANIMATION_SHEETS.basicAttack);
  await copyRef('earthCast',ASSET_FILES[EARTH_ANIMATION_SHEETS.basicAttack.asset],EARTH_ANIMATION_SHEETS.basicAttack);
  await copyRef('forest','Forest Background.png');
}

export async function packageOvernightGraphicsReview(outputDirectory='/workspace/artifacts/Wizzy-Graphics-Review',options={}){
  const output=path.resolve(outputDirectory),manifest=await assembleManifest(options),files=new Map();
  for(const file of await collectArt()){
    const bytes=await readFile(path.join(source,file));files.set(file,bytes);manifest.assets[file]={file,...pngMetadata(bytes,file)};
  }
  await addReferences(manifest,files);
  const listed=[...manifest.spells,...manifest.screens,...manifest.graphics];
  for(const item of listed){
    assert(manifest.assets[item.file],`Missing art file: ${item.file}`);const asset=manifest.assets[item.file];item.width=asset.width;item.height=asset.height;
    if(item.columns&&item.rows){
      const count=item.columns*item.rows;
      for(const key of ['frames','holdFrames','loopFrames'])if(item[key])assert(Array.isArray(item[key])&&item[key].every(frame=>Number.isInteger(frame)&&frame>=0&&frame<count),`${item.id}: ${key} contains an out-of-range physical frame.`);
      if(item.sourceWidth)assert(item.sourceWidth===asset.width,`${item.id}: source width does not match PNG.`);
      if(item.sourceHeight)assert(item.sourceHeight===asset.height,`${item.id}: source height does not match PNG.`);
    }
  }
  const listedFiles=new Set(listed.map(item=>item.file));
  for(const[file,asset]of Object.entries(manifest.assets))if(!asset.referenceOnly&&!listedFiles.has(file))manifest.graphics.push({id:file,name:path.basename(file,'.png').replace(/[-_]/g,' '),file,width:asset.width,height:asset.height,description:'Additional original review artwork.'});
  const[textTemplate,styles,viewer,readme]=await Promise.all(['index.template.html','style.css','viewer.js','README.md'].map(file=>readFile(path.join(source,file),'utf8')));
  for(const placeholder of ['__GRAPHICS_REVIEW_METADATA__','__GRAPHICS_REVIEW_STYLE__','__GRAPHICS_REVIEW_VIEWER__'])assert(textTemplate.includes(placeholder),`Missing template token ${placeholder}`);
  assert(!/<\/script\s*>/i.test(viewer),'Unsafe inline script delimiter.');
  const render=data=>textTemplate.replace('__GRAPHICS_REVIEW_METADATA__',()=>JSON.stringify(data).replace(/</g,'\\u003c')).replace('__GRAPHICS_REVIEW_STYLE__',()=>styles).replace('__GRAPHICS_REVIEW_VIEWER__',()=>viewer);
  const manifestText=JSON.stringify(manifest,null,2)+'\n';
  files.set('manifest.json',Buffer.from(manifestText));files.set('index.html',Buffer.from(render(manifest)));files.set('README.md',Buffer.from(readme));
  const standaloneManifest=structuredClone(manifest);
  for(const[file,asset]of Object.entries(standaloneManifest.assets))asset.dataUrl='data:image/png;base64,'+files.get(file).toString('base64');
  const standalone=Buffer.from(render(standaloneManifest)),zip=zipFiles(files);
  await guardOutput(output,files.keys());
  for(const[file,bytes]of files){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);}
  await writeFile(path.join(output,'preview.html'),standalone);await writeFile(path.join(output,`${packageName}.zip`),zip);
  const groupZips=[];
  for(const name of groupNames){
    const element=name.split('-')[0].toLowerCase(),items=name==='UI-Frames-Props'?[...manifest.screens,...manifest.graphics]:manifest.spells.filter(spell=>spell.element===element);
    if(!items.length)continue;
    const groupFiles=new Map(),groupAssets={};
    for(const item of items){groupFiles.set(item.file,files.get(item.file));groupAssets[item.file]=manifest.assets[item.file];}
    groupFiles.set('manifest.json',Buffer.from(JSON.stringify({format:'wizzy-graphics-review-group',version:1,previewOnly:true,integration:'not-installed',group:name,items,assets:groupAssets,timing:manifest.timing},null,2)+'\n'));
    groupFiles.set('README.md',Buffer.from(`# Wizzy ${name.replace(/-/g,' ')}\n\nOriginal review artwork only. Nothing is installed in the game. PNG bytes are unchanged. See manifest.json for names, source dimensions, frame order and SHA-256 checksums.\n\nUse the complete Wizzy-Graphics-Review package for the animated offline preview. This smaller archive contains only this group’s original sheets and metadata.\n`));
    const filename=`Wizzy-${name}.zip`,bytes=zipFiles(groupFiles,`Wizzy-${name}`);await writeFile(path.join(output,filename),bytes);groupZips.push({group:name,file:path.join(output,filename),bytes:bytes.length,artFiles:Object.keys(groupAssets).length});
  }
  // The source manifest is assembled review metadata, never consumed by the game.
  await writeFile(path.join(source,'manifest.json'),manifestText);
  const result={output,standalone:path.join(output,'preview.html'),standaloneBytes:standalone.length,zip:path.join(output,`${packageName}.zip`),zipBytes:zip.length,groupZips,spells:manifest.spells.length,screens:manifest.screens.length,graphics:manifest.graphics.length,assets:Object.keys(manifest.assets).length,draft:manifest.draft,previewOnly:true};
  console.log(JSON.stringify(result,null,2));return {...result,manifest};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),draft=args.includes('--draft'),paths=args.filter(value=>value!=='--draft');
  assert(paths.length<=1,'Usage: node scripts/package-overnight-graphics-review.js [OUTPUT_FOLDER] [--draft]');
  await packageOvernightGraphicsReview(paths[0],{draft});
}
