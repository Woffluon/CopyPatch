import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const DEFAULT_BUDGETS = { initialGzip: 10 * 1024, initialBrotli: 9 * 1024, lazyGzip: 30 * 1024, lazyBrotli: 26 * 1024 };

function importedOutputs(outputs, entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const imported of outputs[file]?.imports ?? []) if (imported.kind !== 'dynamic-import' && outputs[imported.path]) visit(imported.path);
  };
  visit(entry);
  return seen;
}

export function collectBundleAssets(outputs) {
  const initialEntry = Object.entries(outputs).find(([, output]) => output.entryPoint === 'public' || output.entryPoint?.endsWith('/react/dist/index.js'))?.[0];
  const lazyEntry = Object.entries(outputs).find(([, output]) => output.entryPoint === 'editor' || output.entryPoint?.endsWith('/react/dist/editor/index.js'))?.[0];
  if (!initialEntry || !lazyEntry) throw new Error('esbuild metafile is missing public or editor entry output.');
  const initial = importedOutputs(outputs, initialEntry);
  const editorClosure = importedOutputs(outputs, lazyEntry);
  return { initial: [...initial], lazy: [...editorClosure].filter((file) => !initial.has(file)) };
}

export function parseBudgets(args, defaults = DEFAULT_BUDGETS) {
  const budgets = { ...defaults };
  const options = new Map([['--initial-gzip', 'initialGzip'], ['--initial-brotli', 'initialBrotli'], ['--lazy-gzip', 'lazyGzip'], ['--lazy-brotli', 'lazyBrotli']]);
  for (const argument of args) {
    const [flag, value] = argument.split('=', 2); const key = options.get(flag);
    if (!key) throw new Error(`Unknown bundle option: ${argument}`);
    const bytes = Number(value);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error(`${flag} must be a non-negative integer byte budget.`);
    budgets[key] = bytes;
  }
  return budgets;
}

function compressed(bytes) { return { raw: bytes.length, gzip: zlib.gzipSync(bytes).length, brotli: zlib.brotliCompressSync(bytes).length }; }

async function measureFiles(outputDirectory, files) {
  const result = { raw: 0, gzip: 0, brotli: 0, files: [] };
  for (const file of files.sort()) {
    const contents = await readFile(path.resolve(outputDirectory, path.basename(file)));
    const sizes = compressed(contents);
    result.raw += sizes.raw; result.gzip += sizes.gzip; result.brotli += sizes.brotli;
    result.files.push({ file, ...sizes });
  }
  return result;
}

function formatBytes(bytes) { return `${(bytes / 1024).toFixed(2)} kB`; }

function report(name, result, budgets) {
  console.log(`${name}: raw ${formatBytes(result.raw)}, gzip ${formatBytes(result.gzip)}, brotli ${formatBytes(result.brotli)}`);
  for (const item of result.files) console.log(`  ${item.file}: ${formatBytes(item.raw)} raw`);
  const failures = [['gzip', result.gzip, budgets.gzip], ['brotli', result.brotli, budgets.brotli]].filter(([, actual, budget]) => actual > budget);
  if (failures.length) console.error(`${name} budget exceeded: ${failures.map(([kind, actual, budget]) => `${kind} ${formatBytes(actual)} > ${formatBytes(budget)}`).join(', ')}`);
  return failures.length === 0;
}

export async function measureBundle({ repoRoot = process.cwd(), budgets = DEFAULT_BUDGETS, build } = {}) {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'copypatch-bundle-'));
  try {
    const esbuild = build ? { build } : await import('esbuild');
    const result = await esbuild.build({
      absWorkingDir: repoRoot,
      entryPoints: { public: 'packages/react/dist/index.js', editor: 'packages/react/dist/editor/index.js' },
      outdir: outputDirectory, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['es2020'], minify: true, metafile: true, write: true,
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'react-dom/server'], logLevel: 'silent',
    });
    const assets = collectBundleAssets(result.metafile.outputs);
    const initial = await measureFiles(outputDirectory, assets.initial);
    const lazy = await measureFiles(outputDirectory, assets.lazy);
    return { initial, lazy, metafile: result.metafile, passed: initial.gzip <= budgets.initialGzip && initial.brotli <= budgets.initialBrotli && lazy.gzip <= budgets.lazyGzip && lazy.brotli <= budgets.lazyBrotli };
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
}

export async function main(args = process.argv.slice(2)) {
  const budgets = parseBudgets(args);
  const result = await measureBundle({ budgets });
  console.log('CopyPatch esbuild split bundle measurement');
  const initialPassed = report('Public initial', result.initial, { gzip: budgets.initialGzip, brotli: budgets.initialBrotli });
  const lazyPassed = report('Lazy editor incremental', result.lazy, { gzip: budgets.lazyGzip, brotli: budgets.lazyBrotli });
  console.log(`Metafile: ${Object.keys(result.metafile.inputs).length} inputs, ${Object.keys(result.metafile.outputs).length} outputs`);
  if (!initialPassed || !lazyPassed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
