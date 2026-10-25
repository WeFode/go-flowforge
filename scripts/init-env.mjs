import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env', import.meta.url));
const text = `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nFLOWFORGE_API_TOKEN=${randomBytes(32).toString('hex')}\nFLOWFORGE_PUBLIC_URL=http://localhost:8088\nFLOWFORGE_DEMO=false\n`;
try {
  await writeFile(target, text, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with random credentials. Keep this file private.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; existing credentials were preserved.');
}
