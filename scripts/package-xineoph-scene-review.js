/** Package a single Xineoph scene draft; never changes live artwork. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32,deflateRawSync} from 'node:zlib';
import path from 'node:path';
import {SPELL_CATALOG} from '../src/spells.js';

const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'designs/xineoph-scene-reimagining');
const output=path.resolve(process.argv[2]||'/workspace/artifacts/Xineoph-Scene-Reimagining');
if(output===source||output===root)throw Error('Choose a separate review output folder.');
const files=new Map(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function addPng(from,file){
  let bytes;try{bytes=await readFile(from);}catch{throw Error('Missing illustration: '+from);}
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected original PNG: '+from);
  files.set(file,bytes);return{file,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length,sha256:sha(bytes)};
}
const artwork=await addPng(path.join(source,'art/xineoph.png'),'art/xineoph.png');
const previous=await addPng(path.join(source,'art/previous-emblem.png'),'references/previous-xineoph.png');
const styleReference=await addPng(path.join(root,'designs/earth-spell-drafts/art/earth-5.png'),'references/earth-5-golem.png');
const spell=SPELL_CATALOG['Fire-11'];
const manifest={format:'wizzy-xineoph-scene-review',version:1,status:'draft-review-only',gameplayChanges:false,description:'A new phoenix scene using the Golem illustration style, rather than a floating emblem.',spell:{id:spell.id,name:spell.name,manaCost:spell.manaCost,effectText:spell.effectText},artwork,previous,styleReference,pixelPreservation:'Original PNG bytes preserved unchanged.'};
const json=JSON.stringify(manifest,null,2)+'\n';
files.set('manifest.json',Buffer.from(json));files.set('README.md',await readFile(path.join(source,'README.md')));
files.set('index.html',Buffer.from((await readFile(path.join(source,'index.html'),'utf8')).replace('__XINEOPH_SCENE_REVIEW__',()=>json.replace(/</g,'\\u003c'))));
for(const[file,bytes]of files){await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);}
const locals=[],directory=[];let position=0;
for(const[file,bytes]of files){
  const name=Buffer.from('Xineoph-Scene-Reimagining/'+file),method=file.endsWith('.png')?0:8,data=method?deflateRawSync(bytes,{level:9}):bytes,checksum=crc32(bytes),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,data);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt16LE(33,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(position,42);directory.push(central,name);position+=local.length+name.length+data.length;
}
const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(position,16);
const zip=Buffer.concat([...locals,central,end]);await writeFile(path.join(output,'Xineoph-Scene-Reimagining.zip'),zip);
console.log(JSON.stringify({output,illustrations:3,zipBytes:zip.length,zipEntries:files.size,reviewOnly:true},null,2));
