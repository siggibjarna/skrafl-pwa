import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

async function total(directory: string): Promise<number> {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) bytes += await total(path);
    else if (entry.name.endsWith('.js')) bytes += gzipSync(await readFile(path)).byteLength;
  }
  return bytes;
}

const bytes = await total('dist');
console.log(`JavaScript gzip (including worker/service worker, excluding dictionary): ${bytes} bytes`);
if (bytes > 150 * 1024) console.warn('::warning::JavaScript exceeds 150 KB gzip');
