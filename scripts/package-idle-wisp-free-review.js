/** Isolated offline art review. Never imports or updates the game build. */
import {readFile, writeFile, mkdir, readdir, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32, deflateRawSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'designs/idle-wisp-free-review');
const packageName = 'Idle-Wisp-Free-Review';
const expectedPngs = ['art/fire-water-idle.png', 'art/earth-idle.png'];
const outputFiles = [...expectedPngs, 'metadata.json', 'index.html', 'README.md'];
const standaloneName = 'preview.html';
const zipName = `${packageName}.zip`;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const within = (base, target) => target === base || target.startsWith(base + path.sep);
const assert = (condition, message) => {if (!condition) throw new Error(message);};

async function guardOutput(output) {
  assert(!within(root, output) && !within(output, root), 'Choose an output folder outside the repository and its ancestors.');
  assert(output !== path.parse(output).root && output !== '/tmp' && output !== '/workspace', 'Choose a dedicated review output folder.');
  let current = output;
  while (current !== path.parse(current).root) {
    try {assert(!(await lstat(current)).isSymbolicLink(), `Output path may not contain a symbolic link: ${current}`);}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    current = path.dirname(current);
  }
  let entries;
  try {entries = await readdir(output, {recursive: true, withFileTypes: true});}
  catch (error) {if (error.code === 'ENOENT') return; throw error;}
  const allowed = new Set([...outputFiles, zipName, standaloneName]);
  for (const entry of entries) {
    const relative = path.relative(output, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    assert(!entry.isSymbolicLink(), `Refusing to overwrite a symbolic link: ${relative}`);
    assert(entry.isDirectory() ? relative === 'art' : allowed.has(relative), `Refusing to overwrite an unexpected output file: ${relative}`);
  }
}

function validateMetadata(metadata) {
  assert(metadata.previewOnly === true, 'metadata.json must be explicitly previewOnly.');
  assert(metadata.frameMs === 160 && metadata.framesPerCycle === 8 && metadata.targetBodyHeight === 144, 'Expected 160ms steps, eight frames per cycle and 144px body height.');
  assert(JSON.stringify(metadata.wizards?.map(wizard => wizard.id).sort()) === JSON.stringify(['earth', 'fire', 'water']), 'The viewer requires exactly Fire, Water and Earth.');
  assert(metadata.sheets && Object.keys(metadata.sheets).length === 2, 'The review requires exactly two source sheets.');
  const files = Object.values(metadata.sheets).map(sheet => sheet.file).sort();
  assert(JSON.stringify(files) === JSON.stringify([...expectedPngs].sort()), 'Unexpected source sheet file paths.');
  for (const [id, sheet] of Object.entries(metadata.sheets)) {
    assert(Number.isInteger(sheet.sourceWidth) && Number.isInteger(sheet.sourceHeight) && sheet.sourceWidth > 0 && sheet.sourceHeight > 0, `${id}: invalid source dimensions.`);
    const expectedRows = sheet.file === 'art/earth-idle.png' ? 2 : 4;
    assert(sheet.columns === 4 && sheet.rows === expectedRows, `${id}: expected a 4×${expectedRows} sheet.`);
    assert(sheet.frameAnchors?.length === sheet.columns * sheet.rows, `${id}: provide one anchor for every physical frame.`);
    for (const anchor of sheet.frameAnchors) assert(Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y) && anchor.x >= 0 && anchor.x <= 1 && anchor.y >= 0 && anchor.y <= 1, `${id}: anchors must use normalized cell coordinates.`);
  }
  for (const wizard of metadata.wizards) {
    const sheet = metadata.sheets[wizard.sheet];
    assert(sheet, `${wizard.id}: unknown sheet.`);
    const bodyHeight = wizard.sourceBodyHeight || sheet.sourceBodyHeight;
    assert(Number.isFinite(bodyHeight) && bodyHeight > 0 && bodyHeight <= sheet.sourceHeight / sheet.rows, `${wizard.id}: invalid measured source body height.`);
    assert(typeof wizard.name === 'string' && wizard.name.length > 0, `${wizard.id}: missing display name.`);
    const frameCount = sheet.columns * sheet.rows;
    assert(Array.isArray(wizard.sequence) && wizard.sequence.length === 16 && wizard.sequence.every(frame => Number.isInteger(frame) && frame >= 0 && frame < frameCount), `${wizard.id}: expected 16 valid physical frame indices.`);
    assert(Array.isArray(wizard.blinkFrames) && wizard.blinkFrames.length > 0 && wizard.blinkFrames.every(frame => Number.isInteger(frame) && frame >= 0 && frame < frameCount), `${wizard.id}: identify the physical closed-eye frame(s).`);
    assert(!wizard.sequence.slice(0, 8).some(frame => wizard.blinkFrames.includes(frame)), `${wizard.id}: first cycle may not contain closed eyes.`);
    assert(wizard.sequence.slice(8).filter(frame => wizard.blinkFrames.includes(frame)).length === 1, `${wizard.id}: second cycle must contain exactly one blink step.`);
  }
}

function makeZip(files) {
  const locals = [], directory = [];
  let offset = 0;
  for (const [file, bytes] of files) {
    const name = Buffer.from(`${packageName}/${file}`);
    const method = file.endsWith('.png') ? 0 : 8;
    const compressed = method ? deflateRawSync(bytes, {level: 9}) : bytes;
    const checksum = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8); local.writeUInt16LE(33, 12); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(method, 10); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, name); offset += local.length + name.length + compressed.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

export async function packageIdleWispFreeReview(outputDirectory = '/workspace/artifacts/Idle-Wisp-Free-Review') {
  const output = path.resolve(outputDirectory);
  await guardOutput(output);
  const metadata = JSON.parse(await readFile(path.join(source, 'metadata.json'), 'utf8'));
  validateMetadata(metadata);
  const files = new Map();
  for (const [id, sheet] of Object.entries(metadata.sheets)) {
    const bytes = await readFile(path.join(source, sheet.file));
    assert(bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `${id}: expected original PNG bytes.`);
    assert(bytes.readUInt32BE(16) === sheet.sourceWidth && bytes.readUInt32BE(20) === sheet.sourceHeight, `${id}: PNG dimensions do not match metadata.`);
    files.set(sheet.file, bytes);
    sheet.sha256 = sha256(bytes); sheet.bytes = bytes.length;
  }
  metadata.format = 'wizzy-idle-wisp-free-review'; metadata.version = 1; metadata.integration = 'preview-only';
  const metadataText = JSON.stringify(metadata, null, 2) + '\n';
  files.set('metadata.json', Buffer.from(metadataText));
  const [template, styles, viewer, readme] = await Promise.all(['index.html', 'style.css', 'viewer.js', 'README.md'].map(file => readFile(path.join(source, file), 'utf8')));
  for (const placeholder of ['__IDLE_REVIEW_METADATA__', '__IDLE_REVIEW_STYLE__', '__IDLE_REVIEW_VIEWER__']) assert(template.includes(placeholder), `Missing template placeholder ${placeholder}.`);
  assert(!/<\/script\s*>/i.test(viewer), 'The viewer contains an unsafe inline script delimiter.');
  const renderHtml = data => template.replace('__IDLE_REVIEW_METADATA__', () => JSON.stringify(data, null, 2).replace(/</g, '\\u003c'))
    .replace('__IDLE_REVIEW_STYLE__', () => styles).replace('__IDLE_REVIEW_VIEWER__', () => viewer);
  const html = renderHtml(metadata);
  files.set('index.html', Buffer.from(html)); files.set('README.md', Buffer.from(readme));
  const zip = makeZip(files);
  const standaloneMetadata = structuredClone(metadata);
  for (const sheet of Object.values(standaloneMetadata.sheets)) sheet.dataUrl = 'data:image/png;base64,' + files.get(sheet.file).toString('base64');
  const standalone = Buffer.from(renderHtml(standaloneMetadata));
  for (const [file, bytes] of files) {await mkdir(path.dirname(path.join(output, file)), {recursive: true}); await writeFile(path.join(output, file), bytes);}
  await writeFile(path.join(output, zipName), zip);
  await writeFile(path.join(output, standaloneName), standalone);
  const result = {output, standalone: path.join(output, standaloneName), standaloneBytes: standalone.length, zip: path.join(output, zipName), zipBytes: zip.length, entries: files.size, wizards: metadata.wizards.map(wizard => wizard.id), previewOnly: true};
  console.log(JSON.stringify(result, null, 2));
  return {...result, metadata};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length <= 3, 'Usage: node scripts/package-idle-wisp-free-review.js [OUTPUT_FOLDER]');
  await packageIdleWispFreeReview(process.argv[2]);
}
