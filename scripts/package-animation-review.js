import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import path from 'node:path';

const source = path.resolve(import.meta.dirname,'../designs/animation-previews/v2-one-second');
const output = path.resolve(process.argv[2] || 'dist/previews/combat-linger-v2');
const definitions = [
  ['enhancement-fire-water','Enhancement jump','Gather, jump into circling sparks, then land.'],
  ['aura-spiral','Aura spiral','Expand underfoot, sparkle while active, then fade at expiry.'],
  ['basic-attack-fire-water','Basic attack','Gather a small elemental shot, hold its charge, then release.'],
  ['simple-cast-fire-water','Simple cast','Prepare an orb, hold its moving particles, then cast.'],
  ['large-cast-fire-water','Large cast','Exaggerated charge with a full second of moving elemental energy.'],
  ['shield-fire-water','Elemental shield','Form a barrier, hold its sparkle, then fizzle out.'],
  ['power-up-fire-water','Power-up','Gather energy, hold the surrounding sparks, then return to idle.'],
  ['basic-projectiles','Basic projectiles','Small fireball and water bolt with active flight and impact frames.'],
  ['large-projectiles','Large projectiles','Downward Fire meteor and leftward Water wave with active particles.'],
  ['hit-reactions-fire-water','Hit reactions','Recoil, linger with a gentle red glow and particles, then recover.'],
];
const sequence = start => Array.from({length:8},(_,index)=>start+index);
const windup = [0,1,2,3], linger = sequence(4), recovery = [12,13,14,15];
const offsets = {
  'enhancement-fire-water':{
    fire:{0:[0,-11],1:[0,-11],2:[0,-13],3:[0,-11],4:[0,-.25],5:[0,-.25],6:[0,-.25],7:[0,-.25],8:[0,.5],9:[0,.5],10:[0,.5],11:[0,.5],12:[0,11.25],13:[0,9.25],14:[0,7.25],15:[0,7.25]},
    water:{0:[0,-7],1:[0,-6],2:[0,-6],3:[0,-8],4:[0,-13.25],5:[0,-13.25],6:[0,-13.25],7:[0,-13.25],8:[0,3.5],9:[0,3.5],10:[0,3.5],11:[0,3.5],12:[0,6.25],13:[0,2.25],14:[0,4.25],15:[0,4.25]},
  },
  'aura-spiral':{
    aura:Object.fromEntries(linger.map((frame,index)=>[frame,[[4.25,-.25,.25,.25,-.25,-.25,.25,.25][index],[-.5,-3,0,0,9,9,9,9][index]]])),
  },
};
await mkdir(output,{recursive:true});
const sheets=[];
for(const [id,title,description] of definitions){
  const file=`${id}.png`,bytes=await readFile(path.join(source,file));
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error(`Invalid PNG: ${file}`);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),columns=4,rows=id==='aura-spiral'?4:8;
  if(width*rows!==height*columns)throw new Error(`Expected square cells in ${file}`);
  await copyFile(path.join(source,file),path.join(output,file));
  const elements=id==='aura-spiral'?['aura']:['fire','water'];
  sheets.push({id,title,description,file,width,height,columns,rows,frameCount:columns*rows,
    sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
    sequences:elements.map((element,index)=>({element,firstFrame:index*16,frameCount:16,
      phases:{windup:{frames:windup,frameMs:125},linger:{frames:linger,frameMs:125,durationMs:1000},recovery:{frames:recovery,frameMs:125}},
      previewOffsets:offsets[id]?.[element]||{},
    })),
  });
}
const manifest={format:'wizzy-animation-review',version:2,integration:'approved-live',
  frameRate:8,frameMs:125,lingerMs:1000,sequenceMs:2000,
  aura:'The linger loop repeats while Aura is active through three subsequent owner turns, excluding activation.',
  alignment:'Preview offsets are source pixels relative to each cell, preserving the original PNGs and the Enhancement jump.',sheets};
const manifestText=JSON.stringify(manifest,null,2)+'\n';
await writeFile(path.join(output,'manifest.json'),manifestText);
const template=await readFile(path.join(source,'review.template.html'),'utf8');
await writeFile(path.join(output,'index.html'),template.replace('__WIZZY_REVIEW_MANIFEST__',manifestText.replace(/</g,'\\u003c')));
for(const file of ['viewer.js','style.css','README.md'])await copyFile(path.join(source,file),path.join(output,file));

// A deterministic, dependency-free ZIP. PNGs are already compressed; store the
// original bytes so every downloaded sheet matches its reviewed SHA-256.
const files=[...sheets.map(sheet=>sheet.file),'manifest.json','index.html','viewer.js','style.css','README.md'];
const locals=[],directory=[];let position=0;
for(const file of files){
  const bytes=await readFile(path.join(output,file)),name=Buffer.from(file),crc=crc32(bytes);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);
  local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
  locals.push(local,name,bytes);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);
  central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(position,42);
  directory.push(central,name);position+=local.length+name.length+bytes.length;
}
const directoryBytes=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directoryBytes.length,12);end.writeUInt32LE(position,16);
const zip=Buffer.concat([...locals,directoryBytes,end]);await writeFile(path.join(output,'sprite-sheets.zip'),zip);
console.log(`Packaged ${sheets.length} review sheets (${sheets.reduce((sum,sheet)=>sum+sheet.frameCount,0)} frames); 1000 ms linger loops; ZIP ${zip.length} bytes.`);
