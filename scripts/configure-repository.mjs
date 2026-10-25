import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectSources } from './release-lib.mjs';

export async function configureRepository(root, address) {
  const url = new URL(address);
  const segments = url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '').split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.search || url.hash || segments.length !== 2 || segments.some(v => !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v))) throw new Error('Use an HTTPS GitHub repository URL: https://github.com/owner/repository');
  const modulePath = 'github.com/' + segments.join('/');
  const mod = await readFile(path.join(root, 'go.mod'), 'utf8'); const oldModule = mod.match(/^module\s+(\S+)/m)?.[1];
  if (!oldModule) throw new Error('go.mod has no module declaration');
  for (const file of await collectSources(root)) {
    if (file.endsWith('.png')) continue;
    const full = path.join(root, file); const text = await readFile(full, 'utf8');
    if (text.includes(oldModule)) await writeFile(full, text.replaceAll(oldModule, modulePath));
  }
  return modulePath;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/configure-repository.mjs https://github.com/owner/repository');
  const root = fileURLToPath(new URL('..', import.meta.url));
  console.log('Configured Go module and imports: ' + await configureRepository(root, process.argv[2]));
}
