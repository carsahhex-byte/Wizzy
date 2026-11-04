import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ASSET_FILES } from '../src/assets.js';
import { OPTIMIZED_ART } from '../src/optimized-art.js';

const webOnly = process.argv.includes('--web');
for (const file of ['src/optimized-art.js', 'src/assets.js', 'src/game.js', 'src/main.js']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'src']) await cp(file, `dist/${file}`, { recursive: true });
if (webOnly) {
  // A hosted game loads separate cacheable images, without unused artwork or
  // a second copy embedded in a large downloadable HTML file.
  await mkdir('dist/public/optimized', { recursive: true });
  await mkdir('dist/public/art', { recursive: true });
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const [key, filename] of Object.entries(ASSET_FILES)) {
    const optimized = OPTIMIZED_ART[key];
    if (!optimized || sha(await readFile(`public/graphics/${filename}`)) !== optimized.sourceSha256) {
      throw new Error(`Artwork changed for ${key}; run npm run optimize:art before building.`);
    }
    const assetPath = `public/optimized/${optimized.file}`;
    if (sha(await readFile(assetPath)) !== optimized.optimizedSha256) {
      throw new Error(`Optimized artwork failed integrity verification: ${key}`);
    }
    await cp(assetPath, `dist/${assetPath}`);
  }
  await cp('public/art/favicon.svg', 'dist/public/art/favicon.svg');
} else {
  await cp('public', 'dist/public', { recursive: true });
}
await writeFile('dist/.nojekyll', '');

if (webOnly) {
  // Hash every module after rewriting its dependency paths. Hashing only the
  // entry point would still let a browser reuse stale imported modules.
  const emitted = new Map();
  for (const filename of ['optimized-art.js', 'game.js', 'assets.js', 'main.js']) {
    const original = await readFile(`src/${filename}`, 'utf8');
    const code = original.replace(/(from\s+)(['"])(\.\/[^'"]+)\2/g, (match, prefix, quote, specifier) => {
      const dependency = emitted.get(specifier.slice(2));
      if (!dependency) throw new Error(`Emit dependency ${specifier} before ${filename}`);
      return `${prefix}${quote}./${dependency}${quote}`;
    });
    const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
    const outputName = filename.replace(/\.js$/, `.${hash}.js`);
    await writeFile(`dist/src/${outputName}`, code);
    emitted.set(filename, outputName);
  }
  const css = await readFile('src/style.css', 'utf8');
  const cssHash = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const stylesheet = `./src/style.${cssHash}.css`;
  const entry = `./src/${emitted.get('main.js')}`;
  await writeFile(`dist/src/style.${cssHash}.css`, css);
  let html = await readFile('index.html', 'utf8');
  const id = createHash('sha256').update(html).update(entry).update(stylesheet).digest('hex').slice(0, 12);
  html = html.replace('href="./src/style.css"', `href="${stylesheet}"`)
    .replace('src="./src/main.js"', `src="${entry}"`)
    .replace('name="wizzy-build" content="development"', `name="wizzy-build" content="${id}"`)
    .replace('Development · portrait layout', `Build ${id} · portrait layout`);
  await writeFile('dist/index.html', html);
  await writeFile('dist/build-info.json', JSON.stringify({ id, layout: 'portrait-1024x1536', entry, stylesheet }, null, 2) + '\n');
  console.log(`Built hosted game ${id} with content-hashed modules, styles, and artwork.`);
  process.exit(0);
}

// A self-contained edition lets players open the prototype without a server.
let html = await readFile('index.html', 'utf8');
const css = await readFile('src/style.css', 'utf8');
const standaloneAssets = {};
for (const [key, filename] of Object.entries(ASSET_FILES)) {
  standaloneAssets[key] = `data:image/png;base64,${(await readFile(`public/graphics/${filename}`)).toString('base64')}`;
}
const stripModuleSyntax = (source) => source
  .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*/gm, '')
  .replace(/^export\s+/gm, '');
const code = (await Promise.all(['src/optimized-art.js', 'src/assets.js', 'src/game.js', 'src/main.js'].map(async file => stripModuleSyntax(await readFile(file, 'utf8'))))).join('\n');
await writeFile('dist/.standalone-check.mjs', code);
try {
  execFileSync(process.execPath, ['--check', 'dist/.standalone-check.mjs'], { stdio: 'inherit' });
} finally {
  await rm('dist/.standalone-check.mjs', { force: true });
}
const favicon = `data:image/svg+xml;base64,${(await readFile('public/art/favicon.svg')).toString('base64')}`;
html = html.replace('./public/art/favicon.svg', favicon);
html = html.replace(/<link\s+rel="stylesheet"\s+href="\.\/src\/style\.css"\s*\/>/, () => `<style>${css}</style>`);
const safeScript = (source) => source.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/, () => `<script>globalThis.WIZZY_ASSET_URLS=${JSON.stringify(standaloneAssets)};</script>\n<script type="module">${safeScript(code)}</script>`);
await writeFile('dist/wizzy.html', html);
console.log('Built static site to dist/ and a standalone game at dist/wizzy.html.');
