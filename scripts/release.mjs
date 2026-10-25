import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { checkSources } from './release-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const command = process.argv[2] || 'check';
if (!['check', 'manifest', 'pack'].includes(command)) throw new Error('Usage: node scripts/release.mjs check [--staged] | manifest | pack');
const result = await checkSources(root, { staged: process.argv.includes('--staged') });
for (const warning of result.warnings) console.error('Note: ' + warning);
if (result.errors.length) { for (const error of result.errors) console.error(error); process.exit(1); }
if (command === 'manifest') {
  console.log(JSON.stringify(result.files, null, 2));
} else if (command === 'pack') {
  const output = path.join(root, 'dist', 'flowforge-source.tar.gz');
  await mkdir(path.dirname(output), { recursive: true });
  const staging = await mkdtemp(path.join(tmpdir(), 'flowforge-package-'));
  try {
    const manifest = path.join(staging, 'files.txt'); await writeFile(manifest, result.files.join('\n') + '\n');
    execFileSync('tar', ['-czf', output, '-C', root, '-T', manifest], { stdio: 'inherit' });
    const sha = createHash('sha256').update(await readFile(output)).digest('hex');
    await writeFile(output + '.sha256', sha + '  flowforge-source.tar.gz\n');
    console.log('Created dist/flowforge-source.tar.gz (' + result.files.length + ' files).');
  } finally {
    if (path.dirname(path.resolve(staging)) !== path.resolve(tmpdir()) || !path.basename(staging).startsWith('flowforge-package-')) throw new Error('Temporary directory is outside the packaging workspace');
    await rm(staging, { recursive: true, force: true });
  }
} else {
  console.log('Publication checks passed: ' + result.files.length + ' files, ' + result.bytes + ' source bytes.');
}
