import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'designs/idle-previews');
export async function packageIdleReview(outputDirectory = 'dist/previews/idle-wizards') {
const output = path.resolve(root, outputDirectory);
if (output === root || output === source) throw new Error('Choose a separate output folder for the idle preview.');

const originalMetadata = JSON.parse(await readFile(path.join(source, 'metadata.json'), 'utf8'));
const filename = originalMetadata.file || 'idle-wizards.png';
if (path.basename(filename) !== filename || !filename.endsWith('.png')) throw new Error('The sprite sheet must be a PNG filename in the preview folder.');
const png = await readFile(path.join(source, filename));
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${filename}`);
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== originalMetadata.sourceWidth || height !== originalMetadata.sourceHeight) throw new Error('PNG dimensions do not match metadata.json.');
const { columns, rows, displayScale, frameAnchors, animations } = originalMetadata;
if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1
  || !Number.isFinite(displayScale) || displayScale <= 0 || frameAnchors?.length !== columns * rows) {
  throw new Error('Invalid sprite geometry in metadata.json.');
}
for (const anchor of frameAnchors) {
  if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.y)
    || anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) throw new Error('Frame anchors must be normalized cell coordinates.');
}
for (const element of ['fire', 'water']) {
  const frames = animations?.[element];
  if (!Array.isArray(frames) || !frames.length || frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= columns * rows)) {
    throw new Error(`Invalid ${element} frame sequence in metadata.json.`);
  }
}
const metadata = {
  ...originalMetadata,
  file: filename,
  format: 'wizzy-idle-review',
  version: 1,
  integration: 'preview-only',
  frameMs: originalMetadata.frameMs || 160,
  sha256: createHash('sha256').update(png).digest('hex'),
  bytes: png.length,
};
if (!Number.isFinite(metadata.frameMs) || metadata.frameMs <= 0) throw new Error('frameMs must be positive.');
const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
await mkdir(output, { recursive: true });
await copyFile(path.join(source, filename), path.join(output, filename));
await writeFile(path.join(output, 'metadata.json'), metadataText);
const template = await readFile(path.join(source, 'review.template.html'), 'utf8');
if (!template.includes('__IDLE_METADATA__')) throw new Error('Missing metadata placeholder in review.template.html.');
await writeFile(path.join(output, 'index.html'), template.replace('__IDLE_METADATA__', metadataText.replace(/</g, '\\u003c')));
for (const file of ['viewer.js', 'style.css', 'README.md']) await copyFile(path.join(source, file), path.join(output, file));

// Store the original compressed PNG bytes in a deterministic ZIP. No image
// encoding or third-party dependencies are involved in preview packaging.
const files = [filename, 'metadata.json', 'index.html', 'viewer.js', 'style.css', 'README.md'];
const localRecords = [];
const directoryRecords = [];
let offset = 0;
for (const file of files) {
  const bytes = await readFile(path.join(output, file));
  const name = Buffer.from(file);
  const checksum = crc32(bytes);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(33, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  localRecords.push(local, name, bytes);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(33, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(bytes.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  directoryRecords.push(central, name);
  offset += local.length + name.length + bytes.length;
}
const directory = Buffer.concat(directoryRecords);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...localRecords, directory, end]);
await writeFile(path.join(output, 'idle-wizard-preview.zip'), zip);
console.log(`Packaged preview-only idle wizards: ${width}×${height}, ${animations.fire.length} frames per wizard, ${metadata.frameMs}ms per frame; ZIP ${zip.length} bytes. Output: ${output}`);
return { output, zip: path.join(output, 'idle-wizard-preview.zip'), metadata };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let outputArgument = 'dist/previews/idle-wizards';
  let hasOutput = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: node scripts/package-idle-review.js [--output DIRECTORY]');
      process.exit(0);
    }
    if (argument === '--output') {
      if (!args[index + 1] || args[index + 1].startsWith('--') || hasOutput) {
        throw new Error('Provide exactly one output directory after --output.');
      }
      outputArgument = args[++index];
      hasOutput = true;
    } else if (!argument.startsWith('-') && !hasOutput) {
      outputArgument = argument;
      hasOutput = true;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  await packageIdleReview(outputArgument);
}
