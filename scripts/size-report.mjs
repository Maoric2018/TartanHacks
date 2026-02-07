import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const root = '/Users/eric/Desktop/th';
const targets = [
  path.join(root, 'neon-phases.html'),
  path.join(root, 'dist', 'neon-phases.min.html')
];

function fmt(bytes) { return `${bytes} B (${(bytes / 1024).toFixed(2)} KB)`; }

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const buf = fs.readFileSync(file);
  const gz = zlib.gzipSync(buf, { level: 9 });
  const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  console.log(`\n${path.basename(file)}`);
  console.log(`  raw:    ${fmt(buf.length)}`);
  console.log(`  gzip:   ${fmt(gz.length)}`);
  console.log(`  brotli: ${fmt(br.length)}`);
}
