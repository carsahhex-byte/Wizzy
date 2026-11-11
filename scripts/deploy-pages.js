/** Publish only the static build, preserving the source checkout and its index. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist');
const publish = process.argv.includes('--publish');
const git = (args, options = {}) => {
  const result = execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options });
  return typeof result === 'string' ? result.trim() : '';
};

const origin = new URL(git(['remote', 'get-url', 'origin']));
if (origin.hostname !== 'github.com' || origin.pathname.replace(/\.git$/, '').toLowerCase() !== '/carsahhex-byte/wizzy') {
  throw new Error('Refusing to publish to an unexpected repository. Check origin.');
}
await stat(path.join(output, 'index.html'));
await stat(path.join(output, '.nojekyll'));
const files = await readdir(output);
if (files.includes('wizzy.html')) throw new Error('Use npm run build:production before deployment.');
const info = JSON.parse(await readFile(path.join(output, 'build-info.json'), 'utf8'));
if (info.distribution !== 'game-only' || files.includes('previews') || files.includes('prototypes')) {
  throw new Error('Use npm run build:production before deployment to upload the game without optional review galleries.');
}

const remoteLine = git(['ls-remote', '--heads', 'origin', 'refs/heads/gh-pages']);
const parent = remoteLine ? remoteLine.split(/\s/)[0] : null;
if (parent) git(['fetch', '--no-tags', 'origin', 'refs/heads/gh-pages']);

// Keep previously shared launch URLs usable. A new network request to any old
// launch path receives the current HTML; cached copies use the release checker
// to find the latest uniquely named entry. Only small HTML aliases are retained.
if (parent) {
  const aliases = git(['ls-tree', '--name-only', parent]).split('\n')
    .filter(filename => /^wizzy-[a-f0-9]{12}\.html$/.test(filename));
  if (aliases.length) {
    const currentHtml = await readFile(path.join(output, 'index.html'));
    for (const filename of aliases) await writeFile(path.join(output, filename), currentHtml);
  }
}

const temporary = await mkdtemp(path.join(tmpdir(), 'wizzy-pages-'));
try {
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, 'index') };
  const buildGit = args => git([`--git-dir=${gitDir}`, `--work-tree=${output}`, ...args], { cwd: output, env });
  buildGit(['read-tree', '--empty']);
  buildGit(['add', '--all', '--force', '.']);
  // Art reviews and the sprite-library download have independent, immutable
  // URLs. A game-only release must not remove those previously shared files.
  const preserved = parent ? git(['ls-tree','-r','-z',parent,'--','previews/']).split('\0').filter(Boolean) : [];
  for (const entry of preserved) {
    const tab=entry.indexOf('\t'), metadata=entry.slice(0,tab).split(' '), filename=entry.slice(tab+1);
    if (tab<0 || metadata[1]!=='blob' || !filename.startsWith('previews/')) throw new Error('Unexpected review entry.');
    buildGit(['update-index','--add','--cacheinfo',metadata[0],metadata[2],filename]);
  }
  const tree = buildGit(['write-tree']);
  for (const entry of preserved) {
    const tab=entry.indexOf('\t'), filename=entry.slice(tab+1), blob=entry.slice(0,tab).split(' ')[2];
    if(git(['rev-parse',`${tree}:${filename}`])!==blob)throw new Error(`Review file changed: ${filename}`);
  }
  if (parent && git(['rev-parse', `${parent}^{tree}`]) === tree) {
    console.log('The published branch already contains this exact build.');
    process.exitCode = 0;
  } else {
    const source = git(['rev-parse', '--short', 'HEAD']);
    const args = ['-c', 'user.name=Wizzy Deployment', '-c', 'user.email=noreply@openai.com', 'commit-tree', tree];
    if (parent) args.push('-p', parent);
    const commit = git(args, { input: `Publish Wizzy web build from ${source}\n` });
    git(['update-ref', 'refs/wizzy/prepared-pages', commit]);
    console.log(`Prepared static deployment ${commit}. Source branch and index are unchanged.`);
    if (publish) {
      git(['push', 'origin', `${commit}:refs/heads/gh-pages`], { stdio: ['ignore', 'inherit', 'inherit'] });
      console.log('Uploaded static game to the gh-pages branch. GitHub Pages must be enabled separately.');
    } else {
      console.log('No remote changes made. Add --publish to upload this build.');
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
