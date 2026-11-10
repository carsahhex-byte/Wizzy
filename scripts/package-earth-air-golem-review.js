/** Package an isolated Earth/Air/Golem art review. Never imports live game code. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'designs/earth-air-golem-review');
const output=path.resolve(process.argv[2]||'/workspace/artifacts/earth-air-golem-pack');
if(output===source||output===root)throw Error('Choose a separate review output directory.');
const config=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const jobs=[];
for(const[id,input]of Object.entries(config.sheets)){
  const from=path.resolve(source,input.src),bytes=await readFile(from);
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Not a PNG: ${id}`);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(input.sourceWidth&&input.sourceWidth!==width||input.sourceHeight&&input.sourceHeight!==height)throw Error(`Wrong dimensions: ${id}`);
  if(!Number.isInteger(input.columns)||!Number.isInteger(input.rows)||input.columns<1||input.rows<1)throw Error(`Invalid sprite grid: ${id}`);
  for(const[name,raw]of Object.entries(input.animations||{})){
    const frames=Array.isArray(raw)?raw:raw.frames;
    if(!Array.isArray(frames)||!frames.length||frames.some(f=>!Number.isInteger(f)||f<0||f>=input.columns*input.rows))throw Error(`Invalid frame sequence: ${id}/${name}`);
  }
  if(input.frameRects)for(const r of input.frameRects)if(!r||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>width||r.y+r.h>height)throw Error(`Invalid crop: ${id}`);
  const filename=path.basename(from),target=`art/${filename}`;
  jobs.push({from,bytes,target,sheet:{...input,id,filename,src:target,sourceWidth:width,sourceHeight:height,sha256:digest(bytes),bytes:bytes.length}});
}
await mkdir(path.join(output,'art'),{recursive:true});
// Existing paired wizard PNGs and their measured anchors are reused unchanged.
execFileSync(process.execPath,[path.join(root,'scripts/package-earth-air-review.js'),path.join(output,'legacy-gallery')],{cwd:root,stdio:'inherit'});
const legacyFolder=path.join(output,'legacy-gallery');
const legacy=JSON.parse(await readFile(path.join(legacyFolder,'manifest.json'),'utf8'));
legacy.zip='../sprite-sheets.zip';
const legacyPaths=new Set(Object.values(legacy.sheets).map(s=>s.src));
const boulder=jobs.find(j=>j.sheet.id==='earthHeavyBoulder')?.sheet;
if(boulder)legacy.sheets.earthHeavyBoulder={...boulder,src:`../${boulder.src}`,file:`../${boulder.src}`,displayScale:.8,facing:{earth:'right'},animations:{earth:Array.from({length:16},(_,i)=>i)}};
const safe=text=>text.replace(/<\/script/gi,'<\\/script');
const legacyJson=JSON.stringify(legacy,null,2)+'\n';
const replaceLegacy=(html,manifest)=>html.replace(/<script>window\.WIZZY_EARTH_AIR_PREVIEW=[\s\S]*?;<\/script>/,()=>`<script>window.WIZZY_EARTH_AIR_PREVIEW=${safe(JSON.stringify(manifest))};</script>`);
let legacyHtml=await readFile(path.join(legacyFolder,'index.html'),'utf8');
// Route the new Earth boulder only inside this delivered review. The earlier
// viewer source and all previous Earth/Air PNGs stay byte-for-byte unchanged.
const originalLegacyJs=await readFile(path.join(legacyFolder,'preview.js'),'utf8');
let legacyJs=originalLegacyJs;
const replaceOnce=(before,after)=>{if(legacyJs.split(before).length!==2)throw Error('Earlier viewer changed; review the boulder-only patch.');legacyJs=legacyJs.replace(before,after);};
replaceOnce("sheets[definition.projectileSheet || (definition.large ? 'largeProjectiles' : 'basicProjectiles')]", "sheets[definition.large && element === 'earth' && sheets.earthHeavyBoulder ? 'earthHeavyBoulder' : definition.projectileSheet || (definition.large ? 'largeProjectiles' : 'basicProjectiles')]");
replaceOnce("const own = isCaster(element) ? sheets.basicProjectiles : null;", "const own = element === 'earth' && activeDefinition().large && sheets.earthHeavyBoulder ? sheets.earthHeavyBoulder : isCaster(element) ? sheets.basicProjectiles : null;");
replaceOnce("{ x: target.x, y: arena.impactY }, { mirror: impact.mirror", "{ x: target.x, y: activeDefinition().large && casterElement() === 'earth' ? arena.feetY : arena.impactY }, { mirror: impact.mirror");
replaceOnce("projectileVisible: String(Boolean(projectile)),", "projectileVisible: String(Boolean(projectile)), projectileSheet: projectile?.sheet?.id || '', impactSheet: impact?.sheet?.id || '',");
legacyHtml=legacyHtml.replace(`<script>${safe(originalLegacyJs)}</script>`,()=>`<script>${safe(legacyJs)}</script>`);
legacyHtml=replaceLegacy(legacyHtml,legacy);
await writeFile(path.join(legacyFolder,'index.html'),legacyHtml);
await writeFile(path.join(legacyFolder,'preview.js'),legacyJs);
await writeFile(path.join(legacyFolder,'manifest.json'),legacyJson);
await writeFile(path.join(legacyFolder,'manifest.js'),`window.WIZZY_EARTH_AIR_PREVIEW=${safe(legacyJson)};\n`);
const references={};
for(const[element,key,frame]of[['fire','fireWaterWalk',8],['water','fireWaterWalk',20],['earth','walk',8],['air','walk',20]]){
  const sheet=legacy.sheets[key];references[element]={frame,sheet:{...sheet,src:`legacy-gallery/${sheet.src}`}};
}
const manifest={...config,sheets:Object.fromEntries(jobs.map(j=>[j.sheet.id,j.sheet])),references,counts:{newPngs:jobs.length,earlierPngs:legacyPaths.size,newSourceFrames:jobs.reduce((n,j)=>n+j.sheet.columns*j.sheet.rows,0),earlierEarthAirFrames:legacy.newFrames,referenceFrames:legacy.referenceFrames},integration:'preview-only',zip:'sprite-sheets.zip'};
const [template,css,js,readme]=await Promise.all(['index.html','preview.css','preview.js','README.md'].map(f=>readFile(path.join(source,f),'utf8')));
const files=new Map([['preview.css',Buffer.from(css)],['preview.js',Buffer.from(js)],['README.md',Buffer.from(readme)],['manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')],['manifest.js',Buffer.from(`window.WIZZY_EARTH_AIR_GOLEM_REVIEW=${safe(JSON.stringify(manifest))};\n`)]]);
const inline=(html,m)=>html.replace('<link rel="stylesheet" href="preview.css">',()=>`<style>${css}</style>`).replace('<script src="manifest.js"></script>',()=>`<script>window.WIZZY_EARTH_AIR_GOLEM_REVIEW=${safe(JSON.stringify(m))};</script>`).replace('<script src="preview.js"></script>',()=>`<script>${safe(js)}</script>`);
files.set('index.html',Buffer.from(inline(template,manifest)));
for(const job of jobs){await copyFile(job.from,path.join(output,job.target));files.set(job.target,job.bytes);}
for(const name of ['index.html','preview.css','preview.js','manifest.json','manifest.js','README.md'])files.set(`legacy-gallery/${name}`,await readFile(path.join(legacyFolder,name)));
for(const name of legacyPaths)files.set(`legacy-gallery/${name}`,await readFile(path.join(legacyFolder,name)));
for(const[name,bytes]of files)await writeFile(path.join(output,name),bytes);

// A self-contained copy includes the earlier player in srcdoc and all images
// as data URLs. The ordinary ZIP retains original PNGs once, without this copy.
const dataUrl=bytes=>`data:image/png;base64,${bytes.toString('base64')}`;
const embedded=structuredClone(manifest);
// Store each original image only once, including Fire/Water references shared
// by the comparison and the earlier player. The viewer resolves these locally.
embedded.embeddedImages=Object.fromEntries([...files].filter(([name])=>name.endsWith('.png')).map(([name,bytes])=>[name,dataUrl(bytes)]));
embedded.legacyManifest=structuredClone(legacy);embedded.legacyManifest.zip='';
embedded.legacyTemplate=legacyHtml;
embedded.standalone=true;
// Avoid loading a relative iframe while the larger embedded manifest parses.
// The standalone viewer assigns its fully embedded srcdoc after hydration.
const standaloneTemplate=template.replace('src="legacy-gallery/index.html"','');
await writeFile(path.join(output,'preview.html'),inline(standaloneTemplate,embedded));

const locals=[],directory=[];let position=0;
for(const[file,bytes]of files){
  const name=Buffer.from(file),crc=crc32(bytes),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,bytes);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(position,42);directory.push(central,name);position+=local.length+name.length+bytes.length;
}
const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(position,16);
const zip=Buffer.concat([...locals,central,end]);await writeFile(path.join(output,'sprite-sheets.zip'),zip);
console.log(JSON.stringify({output,originalPngs:jobs.length+legacyPaths.size,zipEntries:files.size,zipBytes:zip.length,standaloneBytes:Buffer.byteLength(inline(standaloneTemplate,embedded)),previewOnly:true},null,2));
