/** Package the Earth spellbook/art draft without importing live combat code. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32,deflateRawSync} from 'node:zlib';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'designs/earth-spell-drafts');
const output=path.resolve(process.argv[2]||'/workspace/artifacts/Earth-Spell-Drafts');
if(output===source||output===root)throw Error('Choose a separate artifact output folder.');
const draft=JSON.parse(await readFile(path.join(source,'spellbook.json'),'utf8'));
if(draft.cards.length!==5)throw Error('Expected five Earth spell drafts.');
const files=new Map();
for(const card of draft.cards){
  if(!/^art\/earth-[1-5]\.png$/.test(card.art))throw Error('Unexpected illustration path.');
  const from=path.join(source,card.art);let bytes;
  try{bytes=await readFile(from);}catch{throw Error(`Missing illustration for ${card.id}: ${from}`);}
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected original PNG: '+card.art);
  card.artMetadata={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  files.set(card.art,bytes);
}
const json=JSON.stringify(draft,null,2)+'\n';
const template=await readFile(path.join(source,'index.html'),'utf8');
const html=template.replace('__EARTH_SPELLBOOK__',()=>json.replace(/</g,'\\u003c'));
files.set('index.html',Buffer.from(html));files.set('spellbook.json',Buffer.from(json));files.set('README.md',await readFile(path.join(source,'README.md')));
await mkdir(path.join(output,'art'),{recursive:true});
for(const[name,bytes]of files)await writeFile(path.join(output,name),bytes);

const locals=[],directory=[];let position=0;
for(const[file,bytes]of files){
  const name=Buffer.from('Earth-Spell-Drafts/'+file),method=file.endsWith('.png')?0:8,data=method?deflateRawSync(bytes,{level:9}):bytes,checksum=crc32(bytes),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,data);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt16LE(33,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(position,42);directory.push(central,name);position+=local.length+name.length+data.length;
}
const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(position,16);
const zip=Buffer.concat([...locals,central,end]);await writeFile(path.join(output,'Earth-Spell-Drafts.zip'),zip);
console.log(JSON.stringify({output,illustrations:draft.cards.length,zipBytes:zip.length,zipEntries:files.size,reviewOnly:true},null,2));
