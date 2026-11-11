/** Repackage the approved draft without altering PNGs or any live game file. */
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32,deflateRawSync} from 'node:zlib';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const source=path.resolve('/workspace/artifacts/Wizzy-Graphics-Review');
const output=path.resolve(process.argv[2]||'/workspace/artifacts/Wizzy-Graphics-Review-Small');
const limit=10_000_000;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const within=(base,target)=>target===base||target.startsWith(base+path.sep);
assert(!within(root,output)&&!within(output,root)&&!within(source,output)&&!within(output,source),'Choose a separate output folder outside the repository and original review.');
assert(!['/','/workspace','/tmp'].includes(output),'Choose a dedicated output folder.');
for(let current=output;current!==path.parse(current).root;current=path.dirname(current)){
  try{assert(!(await lstat(current)).isSymbolicLink(),`Output cannot contain a symlink: ${current}`);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const original=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
assert(original.format==='wizzy-graphics-review'&&original.previewOnly===true,'Expected the separate graphics review.');
const [template,style,sourceViewer]=await Promise.all(['index.template.html','style.css','viewer.js'].map(file=>readFile(path.join(root,'designs/overnight-graphics-review',file),'utf8')));
function replaceExactly(text,from,to){assert(text.includes(from),`Review template changed: ${from.slice(0,60)}`);return text.replace(from,to);}
// The smaller animation previews show the new effects without importing large
// contextual caster/forest sheets. All original context PNGs are in pack 07.
let viewer=replaceExactly(sourceViewer,"data.references.forest.file","data.references.forest?.file");
viewer=replaceExactly(viewer,"await selectSpell(data.spells[0]?.id);requestAnimationFrame(tick);",`if(data.spells.length){await selectSpell(data.spells[0].id);requestAnimationFrame(tick);}
      else{ready=true;document.documentElement.dataset.previewReady='true';}`);
viewer=replaceExactly(viewer,"complete graphics draft","complete small pack");
assert(!/<\/script\s*>/i.test(viewer),'Unsafe inline script delimiter.');

const groups=[
  ['01-Fire','Fire spell effects',file=>file.startsWith('art/fire/')],
  ['02-Water','Water spell effects',file=>file.startsWith('art/water/')],
  ['03-Earth','Earth spell effects',file=>file.startsWith('art/earth/')],
  ['04-Fate','Fate symbols and animations',file=>file.startsWith('art/fate/')],
  ['05-Screens','Deck, Character, Friends and Battle screens',file=>original.screens.some(item=>item.file===file)],
  ['06-Buttons-Frames-Props','Buttons, stat frames, Spell Tower and Discard Pile',file=>file.startsWith('art/frames/')||file.startsWith('art/props/')||file==='art/ui/navigation-buttons.png'],
  ['07-Reference-Art','Original wizard, Golem and forest reference artwork',file=>file.startsWith('art/references/')],
];
function zipFiles(files,folder){
  const locals=[],directory=[];let offset=0;
  for(const[file,bytes]of files){
    const name=Buffer.from(`${folder}/${file}`),method=file.endsWith('.png')?0:8;
    const compressed=method?deflateRawSync(bytes,{level:9}):bytes,checksum=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt16LE(33,12);
    local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
    locals.push(local,name,compressed);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt16LE(33,14);
    central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    directory.push(central,name);offset+=local.length+name.length+compressed.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}
const outputFiles=new Map(),reports=[],seen=new Set();
for(const[slug,title,matches]of groups){
  const files=new Map(),assets={};
  for(const[file,metadata]of Object.entries(original.assets)){
    if(!matches(file))continue;
    assert(file.startsWith('art/')&&!file.split('/').includes('..')&&!file.includes('\\'),'Invalid original art path.');
    assert(!seen.has(file),`Duplicate graphic: ${file}`);seen.add(file);
    const bytes=await readFile(path.join(source,file));
    assert(createHash('sha256').update(bytes).digest('hex')===metadata.sha256,`Original image hash mismatch: ${file}`);
    files.set(file,bytes);assets[file]={...metadata};
  }
  const data={...original,title,assets,references:{},spells:original.spells.filter(item=>matches(item.file)),screens:original.screens.filter(item=>matches(item.file)),graphics:original.graphics.filter(item=>matches(item.file)),smallPack:slug};
  if(slug==='07-Reference-Art')data.graphics=Object.values(assets).map(item=>({id:item.file,name:path.basename(item.file,'.png'),file:item.file,width:item.width,height:item.height,description:'Unchanged contextual artwork from the complete review.'}));
  let html=replaceExactly(template,'<option value="forest">Forest</option>','');
  html=replaceExactly(html,'Spellcraft & rough pixel interface',title);
  html=replaceExactly(html,'New screen concepts, controls, stat frames, battle props and individual spell effects. Original PNG sheets are included unchanged.',`Small pack ${slug.slice(0,2)} of 07. Unzip this folder and open index.html. All included PNGs are unchanged. ${data.spells.length?'Lightweight effects-only playback; wizard and forest reference art is in pack 07.':'This gallery opens independently of the other packs.'}`);
  if(!data.spells.length)html=replaceExactly(html,'id="animation-section" class="panel"','id="animation-section" class="panel" hidden');
  if(!data.screens.length)html=replaceExactly(html,'id="screens-section" class="panel"','id="screens-section" class="panel" hidden');
  if(!data.graphics.length)html=replaceExactly(html,'id="graphics-section" class="panel"','id="graphics-section" class="panel" hidden');
  if(!data.spells.length)html=replaceExactly(html,'id="source-section" class="panel"','id="source-section" class="panel" hidden');
  const links=[data.spells.length?'<a href="#animation-section">Animations</a>':'',data.screens.length?'<a href="#screens-section">Screens</a>':'',data.graphics.length?'<a href="#graphics-section">Artwork</a>':'',data.spells.length?'<a href="#source-section">Source sheets</a>':''].join('');
  html=html.replace(/<nav class="section-links"[^>]*>.*?<\/nav>/,`<nav class="section-links" aria-label="Review sections">${links}</nav>`);
  html=html.replace('__GRAPHICS_REVIEW_METADATA__',()=>JSON.stringify(data).replace(/</g,'\\u003c')).replace('__GRAPHICS_REVIEW_STYLE__',()=>style).replace('__GRAPHICS_REVIEW_VIEWER__',()=>viewer);
  const readme=`# Wizzy ${title}\n\nPack ${slug.slice(0,2)} of 07. Both this folder and its ZIP are under 10,000,000 bytes (10 MB).\n\nUnzip, then open index.html in Safari or another browser. Keep the art folder next to index.html. This pack opens independently; no other download is required.\n\n${data.spells.length?'The animation player shows the isolated new effects. Wizard, Golem and forest context artwork is available separately in pack 07. Play, step, mirror and inspect the original sheets. Merciful retains its simulated next-turn controls; Fate effects play above the dice.':'Use the gallery to inspect each original PNG at full size.'}\n\nAll original PNG bytes and dimensions are preserved. This is a graphics-only review. Nothing is installed or published, and saved decks and combat rules are unchanged.\n\nIncluded PNGs:\n${[...files.keys()].map(file=>'- '+file).join('\n')}\n`;
  files.set('index.html',Buffer.from(html));files.set('manifest.json',Buffer.from(JSON.stringify(data,null,2)+'\n'));files.set('README.md',Buffer.from(readme));
  const folderBytes=[...files.values()].reduce((sum,bytes)=>sum+bytes.length,0),folder=`Wizzy-${slug}`,zipName=`${folder}.zip`,zip=zipFiles(files,folder);
  assert(folderBytes<limit&&zip.length<limit,`${slug} exceeds 10 MB.`);
  for(const[file,bytes]of files)outputFiles.set(`${folder}/${file}`,bytes);
  outputFiles.set(zipName,zip);
  reports.push({number:slug.slice(0,2),title,folder,zip:zipName,folderBytes,zipBytes:zip.length,pngFiles:Object.keys(assets).length,spellEffects:data.spells.length});
}
assert(seen.size===Object.keys(original.assets).length,'Every original PNG must be included exactly once.');
const report={format:'wizzy-small-graphics-packs',limitBytes:limit,previewOnly:true,originalPngs:seen.size,packs:reports};
outputFiles.set('manifest.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));
outputFiles.set('README.md',Buffer.from(`# Wizzy graphics: downloads below 10 MB\n\nDownload any numbered ZIP, unzip it, and open index.html inside its folder. Each folder opens independently and contains its original PNGs. Both the extracted folders and ZIP files are below 10,000,000 bytes.\n\n${reports.map(pack=>`${pack.number}. ${pack.title}: ${(pack.zipBytes/1e6).toFixed(2)} MB — ${pack.zip}`).join('\n')}\n\nAll 28 original PNGs are included exactly once across the seven packs. No image resizing, edits or game changes. The oversized combined preview.html is intentionally excluded.\n`));
outputFiles.set('index.html',Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wizzy small graphics packs</title><style>body{font:18px system-ui;max-width:760px;margin:40px auto;padding:20px;background:#101927;color:#f9edcd}a{color:#ffda73}li{margin:18px 0}</style><h1>Wizzy graphics — small downloads</h1><p>Each ZIP and extracted folder is under 10 MB. Unzip a pack and open its index.html. Every pack works independently.</p><ol>${reports.map(pack=>`<li><a href="${pack.zip}" download>${pack.title} — ${(pack.zipBytes/1e6).toFixed(2)} MB</a> · <a href="${pack.folder}/index.html">Preview folder</a></li>`).join('')}</ol><p>Graphics review only. The live game is unchanged.</p></html>`));
// Never overwrite unrelated existing files or follow symlinks in the output.
let existing=[];try{existing=await readdir(output,{recursive:true,withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
const directories=new Set();for(const file of outputFiles.keys()){let parent=path.posix.dirname(file);while(parent!=='.'){directories.add(parent);parent=path.posix.dirname(parent);}}
for(const entry of existing){const relative=path.relative(output,path.join(entry.parentPath,entry.name)).split(path.sep).join('/');assert(!entry.isSymbolicLink()&&(entry.isDirectory()?directories.has(relative):outputFiles.has(relative)),`Refusing to overwrite unrelated output: ${relative}`);}
for(const[file,bytes]of outputFiles){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);}
console.log(JSON.stringify({output,...report},null,2));
