import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkSources, collectSources, inspectSource, isAllowed, MAX_FILE_BYTES } from './release-lib.mjs';
import { configureRepository } from './configure-repository.mjs';

test('publication allowlist excludes credentials, dependencies, binaries and database dumps', () => {
  for (const file of ['.env', '.env.production', 'web/node_modules/x.js', 'web/dist/app.js', 'notes.txt', 'docs/customer.dump', 'server.exe', 'examples/erp/private.pem']) assert.equal(isAllowed(file), false, file);
  for (const file of ['LICENSE', '.env.example', 'pkg/worker/reporter.go', 'internal/store/schema.sql', 'docs/screenshots/erp-workflow.png']) assert.equal(isAllowed(file), true, file);
});

test('staged checks read the Git index and reject tracked local configuration', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'flowforge-release-test-'));
  try {
    await mkdir(path.join(root, 'web'), { recursive: true });
    await writeFile(path.join(root, 'go.mod'), 'module github.com/example/workflows\n\ngo 1.25.0\n');
    await writeFile(path.join(root, 'LICENSE'), 'MIT License\n');
    await writeFile(path.join(root, 'web/package-lock.json'), '{}\n');
    const secret = 'local-credential-' + 'b'.repeat(32);
    await writeFile(path.join(root, '.env'), 'FLOWFORGE_API_TOKEN=' + secret + '\n');
    await writeFile(path.join(root, 'README.md'), secret);
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['add', 'README.md'], { cwd: root, stdio: 'ignore' });
    await writeFile(path.join(root, 'README.md'), '# clean working copy\n');
    assert.ok((await checkSources(root, { staged: true })).errors.some(e => e.includes('local credential')));
    execFileSync('git', ['add', 'README.md', '.env'], { cwd: root, stdio: 'ignore' });
    assert.ok((await checkSources(root, { staged: true })).errors.some(e => e.includes('tracking: .env')));
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('flowforge-release-test-'));
    await rm(root, { recursive: true, force: true });
  }
});
test('source checks reject local credentials and oversized files', () => {
  const secret = 'local-' + 'a'.repeat(32);
  assert.ok(inspectSource('README.md', Buffer.from(secret), [secret]).length);
  assert.ok(inspectSource('README.md', Buffer.alloc(MAX_FILE_BYTES + 1)).length);
  assert.ok(inspectSource('docs/screenshots/broken.png', Buffer.from('not an image')).length);
});
test('repository configuration updates source imports without including local files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'flowforge-release-test-'));
  try {
    await mkdir(path.join(root, 'pkg'), { recursive: true });
    await writeFile(path.join(root, 'go.mod'), 'module example.local/workflows\n\ngo 1.25.0\n');
    await writeFile(path.join(root, 'pkg', 'sample.go'), 'package sample\nimport "example.local/workflows/pkg/worker"\n');
    await writeFile(path.join(root, '.env'), 'PRIVATE=not-for-publication\n');
    assert.equal(await configureRepository(root, 'https://github.com/example/workflows'), 'github.com/example/workflows');
    assert.match(await readFile(path.join(root, 'pkg', 'sample.go'), 'utf8'), /github.com\/example\/workflows\/pkg\/worker/);
    assert.equal((await collectSources(root)).includes('.env'), false);
    await assert.rejects(configureRepository(root, 'https://example.com/owner/repo'));
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('flowforge-release-test-'));
    await rm(root, { recursive: true, force: true });
  }
});
