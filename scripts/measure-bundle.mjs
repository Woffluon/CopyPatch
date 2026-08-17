import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function measureGzip(filePath) {
  if (!fs.existsSync(filePath)) return { raw: 0, gzip: 0 };
  const content = fs.readFileSync(filePath);
  const gzip = zlib.gzipSync(content);
  return {
    raw: content.length,
    gzip: gzip.length,
  };
}

console.log('=== CopyPatch Bundle Size Measurement ===\n');

const reactDist = path.resolve('packages/react/dist');
const coreDist = path.resolve('packages/core/dist');

const reactIndex = measureGzip(path.join(reactDist, 'index.js'));
const coreIndex = measureGzip(path.join(coreDist, 'index.js'));
const editorIndex = measureGzip(path.join(reactDist, 'editor/index.js'));

console.log(`@copypatch/core (index.js):`);
console.log(`  Raw: ${(coreIndex.raw / 1024).toFixed(2)} kB`);
console.log(`  Gzip: ${(coreIndex.gzip / 1024).toFixed(2)} kB\n`);

console.log(`@copypatch/react Public Runtime (index.js):`);
console.log(`  Raw: ${(reactIndex.raw / 1024).toFixed(2)} kB`);
console.log(`  Gzip: ${(reactIndex.gzip / 1024).toFixed(2)} kB`);
console.log(`  Budget Status: ${reactIndex.gzip <= 10 * 1024 ? '✓ PASSED (<= 10 kB)' : '✗ FAILED (> 10 kB)'}\n`);

console.log(`@copypatch/react Lazy Editor Runtime (editor/index.js):`);
console.log(`  Raw: ${(editorIndex.raw / 1024).toFixed(2)} kB`);
console.log(`  Gzip: ${(editorIndex.gzip / 1024).toFixed(2)} kB`);
console.log(`  Budget Status: ${editorIndex.gzip <= 30 * 1024 ? '✓ PASSED (<= 30 kB)' : '✗ FAILED (> 30 kB)'}\n`);
