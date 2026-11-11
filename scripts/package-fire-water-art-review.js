/** Package an isolated Fire/Water illustration review; never changes live art. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32,deflateRawSync} from 'node:zlib';
import path from 'node:path';
import {ASSET_FILES,SPELL_ART} from '../src/assets.js';
import {getActiveSpells} from '../src/spellbooks.js';

const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'designs/fire-water-art-reimagining');
const output=path.resolve(process.argv[2]||'/workspace/artifacts/Fire-Water-Art-Reimagining');
if(output===source||output===root)throw Error('Choose a separate artifact folder.');
const files=new Map(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const concepts={
  'Fire-2':'A faceted firestone with curling flames and floating embers.',
  'Fire-15':'A smaller ember-crystal heart in a compact flame burst, with a subtle Mana glint.',
  'Fire-6':'A diagonal flaming sword with a dark grip, gold guard and chunky fire.',
  'Fire-11':'A golden energy phoenix flying right with tapered flame arcs and sparkles.',
  'Fire-14':'A dramatic sun or fireball partly impacting the ocean, framed by dark mountains.',
  'Water-2':'A compressed spiral water bolt with ivory foam and droplets.',
  'Water-0':'A magical waterfall pouring into a clear pool, with a small Mana glimmer.',
  'Water-12':'A luminous jellyfish among swirling currents and coral reef shapes.',
  'Water-9':'A magical dolphin leaping through a curling wave.',
  'Water-14':'A golden trident rising from a pounding whirlpool beneath a stormy sky.',
};
const notes={
  'Fire-14':'Revisits your earlier sun-impacting-the-ocean and foreground-mountains concept.',
  'Water-14':'Revisits your earlier golden-trident-in-a-pounding-whirlpool concept.',
};
async function addPng(from,file){
  const bytes=await readFile(from);
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected PNG: '+from);
  files.set(file,bytes);return{file,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length,sha256:sha(bytes)};
}
const cards=[];
for(const spell of getActiveSpells().filter(card=>card.category!=='Fate')){
  if(!Object.hasOwn(concepts,spell.id))throw Error('Unexpected active spell: '+spell.id);
  const art='art/'+spell.id.toLowerCase()+'.png';
  let artMetadata;
  try{artMetadata=await addPng(path.join(source,art),art);}catch(error){throw Error(`Missing/invalid draft for ${spell.name}: ${error.message}`);}
  const crop=SPELL_ART[spell.id],oldFile='originals/'+crop.asset+'.png';
  const old=await addPng(path.join(root,'public/graphics',ASSET_FILES[crop.asset]),oldFile);
  if(crop.x<0||crop.y<0||crop.x+crop.w>old.width+.01||crop.y+crop.h>old.height+.01)throw Error('Invalid current-art crop: '+spell.id);
  cards.push({id:spell.id,name:spell.name,element:spell.element,manaCost:spell.manaCost,effectText:spell.effectText,art,artMetadata,concept:concepts[spell.id],note:notes[spell.id]||'',original:{...old,source:'public/graphics/'+ASSET_FILES[crop.asset],crop}});
}
if(cards.length!==10||new Set(cards.map(card=>card.id)).size!==10)throw Error('Expected exactly ten unique current spell illustrations.');
const references=[];
for(const n of[2,5])references.push({...await addPng(path.join(root,`designs/earth-spell-drafts/art/earth-${n}.png`),`references/earth-${n}.png`),title:'Earth-'+n+' style reference'});
const manifest={format:'wizzy-fire-water-art-review',version:1,status:'draft-review-only',integration:'art-review-only',title:'Fire & Water, reimagined',gameplayChanges:false,pixelPreservation:'Original PNG bytes preserved; current artwork is selected using runtime crop metadata.',cards,references};
const json=JSON.stringify(manifest,null,2)+'\n',template=await readFile(path.join(source,'index.html'),'utf8');
files.set('manifest.json',Buffer.from(json));files.set('README.md',await readFile(path.join(source,'README.md')));
files.set('index.html',Buffer.from(template.replace('__FIRE_WATER_ART_REVIEW__',()=>json.replace(/</g,'\\u003c'))));
for(const[file,bytes]of files){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);}
const locals=[],directory=[];let position=0;
for(const[file,bytes]of files){
  const name=Buffer.from('Fire-Water-Art-Reimagining/'+file),method=file.endsWith('.png')?0:8,data=method?deflateRawSync(bytes,{level:9}):bytes,checksum=crc32(bytes),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,data);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt16LE(33,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(position,42);directory.push(central,name);position+=local.length+name.length+data.length;
}
const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(position,16);
const zip=Buffer.concat([...locals,central,end]);await writeFile(path.join(output,'Fire-Water-Art-Reimagining.zip'),zip);
console.log(JSON.stringify({output,newIllustrations:cards.length,currentSourcePngs:new Set(cards.map(card=>card.original.file)).size,styleReferences:references.length,zipBytes:zip.length,zipEntries:files.size,reviewOnly:true},null,2));
