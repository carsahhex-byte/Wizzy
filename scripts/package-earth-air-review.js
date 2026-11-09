import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import vm from 'node:vm';
import path from 'node:path';

// This isolated gallery has no dependency on the live game or asset registry.
const source = path.resolve(import.meta.dirname, '../designs/earth-air-previews');
const args = process.argv.slice(2);
let output = path.resolve('dist/previews/earth-air'), manifestFile = path.join(source, 'manifest.js');
let usedOutput = false;
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === '--manifest' && args[index + 1]) manifestFile = path.resolve(args[++index]);
  else if (value === '--output' && args[index + 1]) { output = path.resolve(args[++index]); usedOutput = true; }
  else if (!value.startsWith('-') && !usedOutput) { output = path.resolve(value); usedOutput = true; }
  else throw new Error(`Usage: node scripts/package-earth-air-review.js [output-directory] [--manifest manifest.js|manifest.json]. Unexpected argument: ${value}`);
}
if (output === source) throw new Error('Choose a separate output directory so the root-owned source manifest and artwork remain unchanged.');

const manifestSource = await readFile(manifestFile, 'utf8');
let original;
if (path.extname(manifestFile) === '.json') original = JSON.parse(manifestSource);
else {
  const globals = {};
  vm.runInNewContext(manifestSource, { window: globals, globalThis: globals }, { timeout: 1000, filename: manifestFile });
  original = globals.WIZZY_EARTH_AIR_PREVIEW;
}
if (!original || typeof original !== 'object' || !original.sheets) throw new Error('The preview manifest must define WIZZY_EARTH_AIR_PREVIEW with sheets metadata.');
const manifest = JSON.parse(JSON.stringify(original));
const sourceSheets = Array.isArray(manifest.sheets)
  ? Object.fromEntries(manifest.sheets.map(sheet => [sheet.id, sheet])) : manifest.sheets;
const copyJobs = new Map(), outputNames = new Set();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = {};
for (const [id, sheet] of Object.entries(sourceSheets)) {
  const reference = sheet.src || sheet.file || sheet.url;
  if (typeof reference !== 'string' || !reference) throw new Error(`Missing original PNG source for ${id}.`);
  if (/^(?:https?:|data:|blob:)/i.test(reference)) throw new Error(`Use a local original PNG for ${id}; the review pack must work offline.`);
  const filename = path.resolve(path.dirname(manifestFile), reference);
  const bytes = await readFile(filename);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`The original sheet is not a PNG: ${reference}`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if ((sheet.sourceWidth || sheet.width || width) !== width || (sheet.sourceHeight || sheet.height || height) !== height) throw new Error(`Sheet dimensions disagree with the original PNG: ${id}.`);
  if (sheet.sha256 && sheet.sha256 !== sha256(bytes)) throw new Error(`Original PNG integrity verification failed: ${id}.`);
  if (!Number.isSafeInteger(sheet.columns) || !Number.isSafeInteger(sheet.rows) || sheet.columns < 1 || sheet.rows < 1) throw new Error(`Invalid grid dimensions: ${id}.`);
  if (sheet.frameAnchors && (sheet.frameAnchors.length !== sheet.columns * sheet.rows || sheet.frameAnchors.some(anchor => {
    const x = Array.isArray(anchor) ? anchor[0] : anchor?.x, y = Array.isArray(anchor) ? anchor[1] : anchor?.y;
    return !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1;
  }))) throw new Error(`Frame anchors must be normalized to each cell: ${id}.`);
  let target = copyJobs.get(filename)?.target;
  if (!target) {
    const base = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '-');
    target = `art/${base}`;
    if (outputNames.has(target)) target = `art/${id.replace(/[^A-Za-z0-9_-]/g, '-')}-${base}`;
    outputNames.add(target); copyJobs.set(filename, { target, bytes });
  }
  entries[id] = { ...sheet, id, src: target, file: target, sourceWidth: width, sourceHeight: height,
    sha256: sha256(bytes), bytes: bytes.length };
}
manifest.sheets = entries; manifest.zip = 'sprite-sheets.zip'; manifest.integration = 'preview-only';

// Read/validate everything before writing the output directory. Source art and
// root-owned manifest remain unchanged, including every transparent gutter.
const [template, css, javascript, readme] = await Promise.all([
  readFile(path.join(source, 'index.html'), 'utf8'), readFile(path.join(source, 'preview.css'), 'utf8'),
  readFile(path.join(source, 'preview.js'), 'utf8'), readFile(path.join(source, 'README.md'), 'utf8'),
]);
const json = JSON.stringify(manifest, null, 2) + '\n';
const safeScript = text => text.replace(/<\/script/gi, '<\\/script');
let html = template.replace('<link rel="stylesheet" href="preview.css">', () => `<style>${css}</style>`);
html = html.replace('<script defer src="manifest.js"></script>', () => `<script>window.WIZZY_EARTH_AIR_PREVIEW=${safeScript(json)};</script>`);
html = html.replace('<script defer src="preview.js"></script>', () => `<script>${safeScript(javascript)}</script>`);
// Inline classic scripts run after their DOM, including when opened in Safari
// directly from disk. No module imports or fetch(file://...) are required.
const scripts = [...html.matchAll(/<script>[\s\S]*?<\/script>/g)].map(match => match[0]);
html = html.replace(/<script>[\s\S]*?<\/script>\s*/g, '').replace('</body>', () => `${scripts.join('\n')}\n</body>`);
await mkdir(path.join(output, 'art'), { recursive: true });
for (const [filename, job] of copyJobs) await copyFile(filename, path.join(output, job.target));
const files = new Map([
  ['index.html', Buffer.from(html)], ['preview.css', Buffer.from(css)], ['preview.js', Buffer.from(javascript)],
  ['manifest.json', Buffer.from(json)], ['manifest.js', Buffer.from(`window.WIZZY_EARTH_AIR_PREVIEW=${safeScript(json)};\n`)],
  ['README.md', Buffer.from(readme)],
  ...[...copyJobs.values()].map(job => [job.target, job.bytes]),
]);
for (const [name, bytes] of files) await writeFile(path.join(output, name), bytes);

// Deterministic stored ZIP: the original PNG bytes are already compressed.
const locals = [], directory = []; let position = 0;
for (const [file, bytes] of files) {
  const name = Buffer.from(file), crc = crc32(bytes), local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  locals.push(local, name, bytes);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(position, 42);
  directory.push(central, name); position += local.length + name.length + bytes.length;
}
const centralBytes = Buffer.concat(directory), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(position, 16);
const zip = Buffer.concat([...locals, centralBytes, end]);
await writeFile(path.join(output, 'sprite-sheets.zip'), zip);
console.log(`Packaged isolated Earth/Air review: ${Object.keys(entries).length} original PNG sheets; ${files.size} ZIP entries; ${zip.length} bytes. Output: ${output}`);
