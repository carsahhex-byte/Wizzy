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
  console.log('Built hosted game to dist/ with separate assets and project-subpath support.');
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
