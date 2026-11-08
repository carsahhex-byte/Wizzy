import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ASSET_FILES } from '../src/assets.js';
import { OPTIMIZED_ART } from '../src/optimized-art.js';

const webOnly = process.argv.includes('--web');
// Dependencies precede their importers in both the hosted and standalone builds.
const moduleNames = ['optimized-art.js', 'spells.js', 'decks.js', 'effects.js', 'game.js', 'asset-url.js', 'pixel-icons.js', 'slab-text.js', 'assets.js', 'spell-visuals.js', 'battle-scene.js', 'spell-animation.js', 'health-bars.js', 'hub-storage.js', 'hub.js', 'multiplayer.js', 'accounts.js', 'main.js'];
const styleNames = ['style.css', 'hub.css', 'multiplayer.css', 'accounts.css'];
for (const filename of moduleNames) execFileSync(process.execPath, ['--check', `src/${filename}`], { stdio: 'inherit' });
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
// Review-only sprites are delivered separately. The game does not register,
// request or play these sheets until their later approved integration.
execFileSync(process.execPath,['scripts/package-animation-review.js','dist/previews/combat-linger-v2'],{stdio:'inherit'});
await writeFile('dist/.nojekyll', '');

if (webOnly) {
  // Hash every module after rewriting its dependency paths. Hashing only the
  // entry point would still let a browser reuse stale imported modules.
  const emitted = new Map();
  for (const filename of moduleNames) {
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
  const stylesheets = [];
  for (const filename of styleNames) {
    const css = await readFile(`src/${filename}`, 'utf8');
    const cssHash = createHash('sha256').update(css).digest('hex').slice(0, 12);
    const outputName = filename.replace(/\.css$/, `.${cssHash}.css`);
    await writeFile(`dist/src/${outputName}`, css);
    stylesheets.push(`./src/${outputName}`);
  }
  const stylesheet = stylesheets[0];
  const entry = `./src/${emitted.get('main.js')}`;
  const releaseCheck = await readFile('scripts/release-check.js', 'utf8');
  execFileSync(process.execPath, ['--check', 'scripts/release-check.js'], { stdio: 'inherit' });
  let html = await readFile('index.html', 'utf8');
  const id = createHash('sha256').update(html).update(entry).update(stylesheets.join('\n')).update(releaseCheck).digest('hex').slice(0, 12);
  const launch = `./wizzy-${id}.html`;
  styleNames.forEach((filename, index) => { html = html.replace(`href="./src/${filename}"`, `href="${stylesheets[index]}"`); });
  html = html.replace('<script type="module" src="./src/main.js"></script>', () => `<script>${releaseCheck.replace(/<\/script/gi, '<\\/script')}</script>\n    <script type="module" src="${entry}"></script>`)
    .replace('name="wizzy-build" content="development"', `name="wizzy-build" content="${id}"`)
    .replace('Development · portrait layout', `Build ${id} · portrait layout`);
  await writeFile('dist/index.html', html);
  // A new pathname avoids reusing a previously cached index document. Both
  // entries live at the project root, so asset paths and hash navigation agree.
  await writeFile(`dist/${launch.slice(2)}`, html);
  await writeFile('dist/build-info.json', JSON.stringify({ id, launch, layout: 'portrait-1024x1536', screens: ['title', 'home', 'character', 'friends', 'decks', 'online', 'account', 'battle'], entry, stylesheet, stylesheets }, null, 2) + '\n');
  console.log(`Built hosted game ${id} with content-hashed modules, styles, and artwork.`);
  process.exit(0);
}

// A self-contained edition lets players open the prototype without a server.
let html = await readFile('index.html', 'utf8');
const standaloneAssets = {};
for (const [key, filename] of Object.entries(ASSET_FILES)) {
  standaloneAssets[key] = `data:image/png;base64,${(await readFile(`public/graphics/${filename}`)).toString('base64')}`;
}
// Keep each module's scope intact so private helpers in the hub, deck builder,
// and battle engine can share names. The project uses only local named imports
// and named exports; reject unsupported forms rather than silently misbundle.
const bundleModule = (filename, source) => {
  const names = new Set();
  let body = source.replace(/^import\s+(\{[\s\S]*?\})\s+from\s+(['"])(\.\/[^'"]+)\2;?\s*/gm, (match, bindings, quote, specifier) => {
    const dependency = specifier.slice(2);
    if (moduleNames.indexOf(dependency) >= moduleNames.indexOf(filename) || !moduleNames.includes(dependency)) {
      throw new Error(`Emit dependency ${specifier} before ${filename}`);
    }
    return `const ${bindings.replace(/\bas\b/g, ':')} = __wizzyModules[${JSON.stringify(dependency)}];\n`;
  });
  body = body.replace(/^export\s*\{([^}]+)\};?\s*/gm, (match, exports) => {
    for (const item of exports.split(',')) {
      const name = item.trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`Unsupported export in ${filename}: ${name}`);
      names.add(name);
    }
    return '';
  }).replace(/^export\s+(const|let|function)\s+([A-Za-z_$][\w$]*)/gm, (match, kind, name) => {
    names.add(name);
    return `${kind} ${name}`;
  });
  if (/^\s*(?:import|export)\s/m.test(body)) throw new Error(`Unsupported module syntax in ${filename}`);
  return `__wizzyModules[${JSON.stringify(filename)}] = (() => {\n${body}\nreturn { ${[...names].join(', ')} };\n})();`;
};
const code = 'const __wizzyModules = Object.create(null);\n' + (await Promise.all(moduleNames.map(async filename => bundleModule(filename, await readFile(`src/${filename}`, 'utf8'))))).join('\n');
await writeFile('dist/.standalone-check.mjs', code);
try {
  execFileSync(process.execPath, ['--check', 'dist/.standalone-check.mjs'], { stdio: 'inherit' });
} finally {
  await rm('dist/.standalone-check.mjs', { force: true });
}
const favicon = `data:image/svg+xml;base64,${(await readFile('public/art/favicon.svg')).toString('base64')}`;
html = html.replace('./public/art/favicon.svg', favicon);
for (const filename of styleNames) {
  const css = await readFile(`src/${filename}`, 'utf8');
  html = html.replace(`<link rel="stylesheet" href="./src/${filename}" />`, () => `<style>${css}</style>`);
}
const safeScript = (source) => source.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/, () => `<script>globalThis.WIZZY_ASSET_URLS=${JSON.stringify(standaloneAssets)};</script>\n<script type="module">${safeScript(code)}</script>`);
await writeFile('dist/wizzy.html', html);
console.log('Built static site to dist/ and a standalone game at dist/wizzy.html.');
