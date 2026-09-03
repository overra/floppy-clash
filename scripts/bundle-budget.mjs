import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'dist', 'assets');
const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
let total = 0;
for (const file of files) {
  total += gzipSync(readFileSync(join(dir, file))).length;
}
const kb = total / 1024;
console.log(`gzip bundle ${kb.toFixed(1)} KB (budget 700)`);
if (kb > 700) {
  console.error(`Bundle ${kb.toFixed(1)} KB gzip exceeds the 700 KB PLAN budget`);
  process.exit(1);
}
