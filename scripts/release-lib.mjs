import { readdir, readFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SCREENSHOT_BYTES = 1024 * 1024;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const topFiles = new Set([
  '.gitignore', '.dockerignore', '.editorconfig', '.gitattributes', '.env.example',
  'README.md', 'README.en.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md',
  'go.mod', 'go.sum', 'go.work', 'go.work.sum', 'Dockerfile', 'compose.yaml', 'compose.demo.yaml', 'config.example.yaml',
  'web/package.json', 'web/package-lock.json', 'web/tsconfig.json', 'web/vite.config.ts', 'web/index.html', '.githooks/pre-commit',
]);
const roots = ['cmd', 'internal', 'pkg', 'examples', 'scripts', '.github', '.githooks', 'docs', 'web/src'];
const textExtensions = new Set(['.go', '.mjs', '.cjs', '.js', '.ts', '.tsx', '.css', '.html', '.json', '.yaml', '.yml', '.md', '.ps1', '.sh', '.svg']);
const excludedSegments = new Set(['node_modules', 'dist', 'bin', 'test-results', 'playwright-report', '.git', '.cache', 'data', 'volumes', 'tmp']);

export function isAllowed(file) {
  if (file.includes('\\') || file.includes('\n') || file.includes('\r') || file.split('/').some(p => p === '..' || !p)) return false;
  if (file.split('/').some(p => excludedSegments.has(p) || /^\.env(?:\.|$)/.test(p) && p !== '.env.example')) return false;
  if (topFiles.has(file)) return true;
  if (file === 'internal/store/schema.sql' || /^internal\/store\/migrations\/[^/]+\.sql$/.test(file)) return true;
  if (file.startsWith('docs/screenshots/') && path.posix.extname(file) === '.png') return true;
  return roots.some(root => file.startsWith(root + '/')) && textExtensions.has(path.posix.extname(file));
}

export async function collectSources(root) {
  const files = new Set();
  async function walk(relative) {
    const full = path.join(root, relative);
    let stat; try { stat = await lstat(full); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    if (stat.isSymbolicLink()) throw new Error('Symlinks are not allowed in the source package: ' + relative);
    if (stat.isFile()) { if (isAllowed(relative)) files.add(relative); return; }
    if (!stat.isDirectory()) return;
    for (const item of await readdir(full)) if (!excludedSegments.has(item)) await walk(relative + '/' + item);
  }
  for (const file of topFiles) await walk(file);
  for (const directory of roots) await walk(directory);
  return [...files].sort();
}

export async function localSecrets(root) {
  let text; try { text = await readFile(path.join(root, '.env'), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return [...text.matchAll(/^(?:POSTGRES_PASSWORD|FLOWFORGE_API_TOKEN|FLOWFORGE_SECRET_[A-Z0-9_]+)=(.+)$/gm)]
    .map(m => m[1].trim().replace(/^["']|["']$/g, '')).filter(v => v.length >= 12);
}

export function inspectSource(file, data, secrets = []) {
  const errors = [];
  if (!isAllowed(file)) return ['File is outside the publishable source list: ' + file];
  const png = file.endsWith('.png');
  if (data.length > (png ? MAX_SCREENSHOT_BYTES : MAX_FILE_BYTES)) errors.push('File exceeds its publication size limit: ' + file);
  if (png) {
    if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) errors.push('Invalid PNG: ' + file);
    return errors;
  }
  const text = data.toString('utf8');
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text) || /\bghp_[A-Za-z0-9]{36}\b/.test(text) || /\bgithub_pat_[A-Za-z0-9_]{30,}\b/.test(text)) errors.push('Credential pattern detected: ' + file);
  if (secrets.some(value => text.includes(value))) errors.push('A local credential appears in source: ' + file);
  if (/\b[A-Za-z]:[\\/](?:[^\\/\s]+[\\/])/.test(text) || /\/(?:Users|home)\/[^\s"'<>/]+\//.test(text)) errors.push('Machine-specific absolute path detected: ' + file);
  if (file.endsWith('.json')) { try { JSON.parse(text); } catch { errors.push('Invalid JSON: ' + file); } }
  return errors;
}

export function gitRoot(root) {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

export async function checkSources(root, { staged = false } = {}) {
  const files = await collectSources(root); const errors = []; const warnings = []; const secrets = await localSecrets(root);
  const repository = gitRoot(root);
  if (repository && path.resolve(repository).toLowerCase() !== path.resolve(root).toLowerCase()) errors.push('The project must be the root of its own Git repository.');
  if (staged && !repository) errors.push('Staged checks require an initialized standalone Git repository.');
  let checked = files; let index = false;
  if (repository && path.resolve(repository).toLowerCase() === path.resolve(root).toLowerCase()) {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const file of tracked) if (!isAllowed(file)) errors.push('Remove this non-source file from Git tracking: ' + file);
    if (staged) { checked = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean); index = true; }
  }
  let bytes = 0;
  for (const file of checked) {
    if (!isAllowed(file)) { errors.push('File is outside the publishable source list: ' + file); continue; }
    if (index) {
      const size = Number(execFileSync('git', ['cat-file', '-s', ':' + file], { cwd: root, encoding: 'utf8' }));
      if (size > (file.endsWith('.png') ? MAX_SCREENSHOT_BYTES : MAX_FILE_BYTES)) { errors.push('Staged file exceeds its publication size limit: ' + file); continue; }
    }
    const data = index ? execFileSync('git', ['show', ':' + file], { cwd: root, maxBuffer: MAX_FILE_BYTES * 2 }) : await readFile(path.join(root, file));
    bytes += data.length; errors.push(...inspectSource(file, data, secrets));
    if (file.endsWith('.md')) {
      for (const match of data.toString('utf8').matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const resolved = path.resolve(root, path.dirname(file), decodeURIComponent(target));
        if (!resolved.startsWith(path.resolve(root) + path.sep)) { errors.push('Documentation link leaves the project: ' + file); continue; }
        try { await lstat(resolved); } catch { errors.push('Broken documentation link in ' + file + ': ' + target); }
      }
    }
  }
  if (bytes > MAX_SOURCE_BYTES) errors.push('The source package exceeds 20 MiB.');
  for (const required of ['README.md', 'LICENSE', 'go.mod', 'web/package-lock.json']) if (!files.includes(required)) errors.push('Required publication file is missing: ' + required);
  const moduleText = await readFile(path.join(root, 'go.mod'), 'utf8');
  if (!/^module github\.com\//m.test(moduleText)) warnings.push('Set the public Go module path with scripts/configure-repository.mjs before publishing the worker SDK.');
  return { files, bytes, errors: [...new Set(errors)], warnings };
}
