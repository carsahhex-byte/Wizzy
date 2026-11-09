import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import path from 'node:path';

// Distribution only: this experiment never imports the Wizzy runtime.
const source = path.resolve(import.meta.dirname, '../prototypes/glyph-duel');
const output = path.resolve(process.argv[2] || 'dist/prototypes/glyph-duel');
const [template, css, rules, app, readme] = await Promise.all(
  ['index.html', 'style.css', 'rules.js', 'app.js', 'README.md'].map(file => readFile(path.join(source, file), 'utf8')),
);
const safe = text => text.replace(/<\/script/gi, '<\\/script');
let html = template.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
  .replace('<script defer src="rules.js"></script>', '')
  .replace('<script defer src="app.js"></script>', '');
html = html.replace('</footer>', ' <span aria-hidden="true">·</span> <a href="spell-sketch.html" download="spell-sketch.html">Save offline copy</a></footer>');
html = html.replace('</body>', () => `<script>${safe(rules)}</script>\n<script>${safe(app)}</script>\n</body>`);
if (/<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\.\/|rules\.js|app\.js|style\.css)/i.test(html)) {
  throw new Error('The standalone experiment must not depend on external scripts or styles.');
}
const files = new Map([
  ['index.html', Buffer.from(html)], ['spell-sketch.html', Buffer.from(html)], ['README.md', Buffer.from(readme)],
]);
const metadata = {
  format: 'spell-sketch-standalone', version: 1, integration: 'independent-prototype',
  entry: './index.html', offline: './spell-sketch.html', zip: './spell-sketch.zip',
  networkRequired: false, accountsRequired: false, localModes: ['pass-and-play', 'practice'],
  shapes: ['circle', 'square', 'star'], grid: 24,
  defaults: { studySeconds: 3, startSeconds: 12, minSeconds: 4, decrement: 1, basePower: 30, hp: 100, inkPercent: 115, tolerance: 1 },
  files: Object.fromEntries([...files].map(([file, bytes]) => [file, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }])),
};
files.set('prototype-info.json', Buffer.from(JSON.stringify(metadata, null, 2) + '\n'));
await mkdir(output, { recursive: true });
for (const [file, bytes] of files) await writeFile(path.join(output, file), bytes);

// Tiny dependency-free stored ZIP: the HTML itself works as one offline file.
const locals = [], directory = []; let position = 0;
for (const [file, bytes] of files) {
  const name = Buffer.from(file), checksum = crc32(bytes), local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(33, 12); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  locals.push(local, name, bytes);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(33, 14); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(bytes.length, 20);
  central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(position, 42);
  directory.push(central, name); position += local.length + name.length + bytes.length;
}
const central = Buffer.concat(directory), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
end.writeUInt32LE(central.length, 12); end.writeUInt32LE(position, 16);
const zip = Buffer.concat([...locals, central, end]);
await writeFile(path.join(output, 'spell-sketch.zip'), zip);
console.log(`Packaged independent Spell Sketch: ${Buffer.byteLength(html)}-byte offline HTML; ${zip.length}-byte ZIP. Output: ${output}`);
