import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const locales = ['en', 'tr'];
const requiredFields = ['title', 'description', 'group', 'order'];
const allowedGroups = new Set(['getting-started', 'framework-guides', 'editing-publishing', 'operations-security', 'api-reference']);
const REQUIRED_MDX_TYPECHECK_SNIPPETS = new Set(['customAuthAdapter', 'routeHandler', 'serverPage']);

export function extractCanonicalSnippets(content) {
  return [...content.matchAll(/^```(ts|tsx|typescript)\s+canonical\r?\n([\s\S]*?)^```\s*$/gm)].map((match) => ({ language: match[1] === 'typescript' ? 'ts' : match[1], code: match[2] }));
}

export function extractMdxSnippetConstants(content, source = 'documentation.mdx') {
  return [...content.matchAll(/^export const ([A-Za-z_$][\w$]*)\s*=\s*`([\s\S]*?)`;/gm)].map((match) => ({
    source,
    name: match[1],
    code: match[2].replaceAll('\\`', '`').replaceAll('\\${', '${'),
  }));
}

export function extractRequiredMdxSnippetConstants(content, source = 'documentation.mdx') {
  return extractMdxSnippetConstants(content, source).filter((snippet) => REQUIRED_MDX_TYPECHECK_SNIPPETS.has(snippet.name));
}

export async function collectSourceContracts(root, files = [
  { file: 'packages/core/src/index.ts', kind: 'core' },
  { file: 'packages/node/src/cli/index.ts', kind: 'node-cli' },
  { file: 'packages/node/src/cli/templates.ts', kind: 'templates' },
]) {
  const source = await Promise.all(files.map(async ({ file, kind }) => ({ file, kind, content: await readFile(join(root, file), 'utf8') })));
  const core = source.find((item) => item.kind === 'core' || item.file.endsWith('core/src/index.ts'))?.content ?? '';
  const errorBody = core.match(/export type ErrorCode\s*=([\s\S]*?);/)?.[1] ?? '';
  const errorCodes = [...errorBody.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  const env = [...new Set(source.flatMap(({ content }) => [...content.matchAll(/\bCOPYPATCH_[A-Z0-9_]+\b/g)].map((match) => match[0])))].sort();
  const paths = [...new Set(source.flatMap(({ content }) => [...content.matchAll(/\b[A-Z0-9_]*PATH\s*=\s*['"](\/[^'"]+)['"]/g)].map((match) => match[1])))].sort();
  const localePattern = core.match(/export const LOCALE_REGEX\s*=\s*(\/[^;]+\/\w*);/)?.[1];
  const localePatterns = localePattern ? [localePattern] : [];
  return { errorCodes, env, paths, localePatterns };
}

export async function typecheckCanonicalSnippets(snippets, root) {
  return typecheckDocumentationSnippets(snippets.map((snippet, index) => ({
    source: 'canonical documentation block',
    name: `snippet-${index + 1}`,
    code: snippet.code,
  })), root);
}

export async function typecheckDocumentationSnippets(snippets, root) {
  if (!snippets.length) throw new Error('Documentation snippet typecheck has no snippets to compile.');
  const temporaryParent = join(root, 'tmp');
  await mkdir(temporaryParent, { recursive: true });
  const directory = await mkdtemp(join(temporaryParent, 'copypatch-doc-snippets-'));
  try {
    const files = [];
    for (const [index, snippet] of snippets.entries()) {
      const file = `snippet-${index + 1}.tsx`;
      files.push(file);
      const code = snippet.code.replaceAll(/from\s+['"](?:\.\/lib\/copypatch|@\/lib\/copypatch)['"]/g, "from 'copypatch-doc-host'");
      await writeFile(join(directory, file), `// ${snippet.source}: ${snippet.name}\n${code}\n`, 'utf8');
    }
    await writeFile(join(directory, 'copypatch-doc-host.d.ts'), [
      "declare module 'copypatch-doc-host' {",
      "  import type { CopyPatchBackend } from '@copypatch/backend';",
      '  export const copypatch: CopyPatchBackend;',
      '}',
    ].join('\n'), 'utf8');
    await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        skipLibCheck: false,
        jsx: 'react-jsx',
        types: ['node', 'react', 'react-dom'],
        typeRoots: [
          join(root, 'node_modules', '@types'),
          join(root, 'packages', 'react', 'node_modules', '@types'),
        ],
        baseUrl: root,
        paths: {
          'react/jsx-runtime': ['packages/react/node_modules/@types/react/jsx-runtime.d.ts'],
          '@copypatch/core': ['packages/core/dist/index.d.ts'],
          '@copypatch/react': ['packages/react/dist/index.d.ts'],
          '@copypatch/react/editor': ['packages/react/dist/editor/index.d.ts'],
          '@copypatch/backend': ['packages/backend/dist/index.d.ts'],
          '@copypatch/node': ['packages/node/dist/index.d.ts'],
          '@copypatch/node/cli': ['packages/node/dist/cli/index.d.ts'],
          '@copypatch/next': ['packages/next/dist/index.d.ts'],
          '@copypatch/next/server': ['packages/next/dist/server.d.ts'],
          '@copypatch/storage-sqlite': ['packages/storage-sqlite/dist/index.d.ts'],
          '@copypatch/storage-postgres': ['packages/storage-postgres/dist/index.d.ts'],
        },
      },
      files: ['copypatch-doc-host.d.ts', ...files],
    }), 'utf8');
    const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
    const result = spawnSync(process.execPath, [tsc, '--project', join(directory, 'tsconfig.json')], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`Documentation snippet typecheck failed: ${result.stderr || result.stdout}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

function assertionValues(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...content.matchAll(new RegExp(`<!--\\s*copypatch-contract:${escaped}=([^>]+)-->`, 'g'))].flatMap((match) => match[1].split(',').map((value) => value.trim()).filter(Boolean));
}

function assertSourceDerivedContracts(content, contracts) {
  const expected = {
    error: contracts.errorCodes,
    env: contracts.env,
    path: contracts.paths,
    locale: contracts.localePatterns,
  };
  for (const [kind, values] of Object.entries(expected)) {
    for (const value of assertionValues(content, kind)) if (!values.includes(value)) throw new Error(`Documentation asserts an unknown ${kind} contract: ${value}`);
  }
}

async function readDocs(docsRoot, locale) {
  const directory = join(docsRoot, locale);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.mdx')).sort();
  return Promise.all(files.map(async (file) => ({ file, content: await readFile(join(directory, file), 'utf8') })));
}

export async function verifyDocs(root = process.cwd()) {
  const docsRoot = join(root, 'apps', 'site', 'src', 'content', 'docs');
  if (!existsSync(docsRoot)) throw new Error('apps/site/src/content/docs is missing');
  const [english, turkish] = await Promise.all(locales.map((locale) => readDocs(docsRoot, locale)));
  const englishNames = english.map((document) => document.file); const turkishNames = turkish.map((document) => document.file);
  if (JSON.stringify(englishNames) !== JSON.stringify(turkishNames)) throw new Error('English and Turkish MDX file sets differ');
  const routes = new Set();
  for (const file of englishNames) { const slug = file.replace(/\.mdx$/, ''); routes.add(slug === 'overview' ? '/docs' : `/docs/${slug}`); routes.add(slug === 'overview' ? '/tr/docs' : `/tr/docs/${slug}`); }
  const contracts = await collectSourceContracts(root);
  const snippets = [];
  for (const [locale, documents] of [['en', english], ['tr', turkish]]) {
    const positionKeys = new Set();
    for (const document of documents) {
      for (const field of requiredFields) if (!new RegExp(`^${field}:`, 'm').test(document.content)) throw new Error(`${locale}/${document.file} is missing frontmatter field ${field}`);
      const group = document.content.match(/^group:\s*([^\r\n]+)/m)?.[1]?.trim(); const order = document.content.match(/^order:\s*(\d+)/m)?.[1];
      if (!group || !allowedGroups.has(group)) throw new Error(`${locale}/${document.file} has an unknown navigation group`);
      if (!order) throw new Error(`${locale}/${document.file} has an invalid navigation order`);
      const positionKey = `${group}:${order}`; if (positionKeys.has(positionKey)) throw new Error(`${locale} has duplicate navigation order ${positionKey}`); positionKeys.add(positionKey);
      for (const href of document.content.matchAll(/href=["'](\/(?:tr\/)?docs(?:\/[^"'#?]+)?)["']/g)) if (!routes.has(href[1])) throw new Error(`${locale}/${document.file} links to a missing documentation route: ${href[1]}`);
      assertSourceDerivedContracts(document.content, contracts);
      snippets.push(
        ...extractCanonicalSnippets(document.content).map((snippet, index) => ({
          source: `${locale}/${document.file}`,
          name: `canonical-${index + 1}`,
          code: snippet.code,
        })),
        ...extractRequiredMdxSnippetConstants(document.content, `${locale}/${document.file}`),
      );
    }
  }
  await typecheckDocumentationSnippets(snippets, root);
  for (const route of ['apps/site/src/pages/docs/[...slug].astro', 'apps/site/src/pages/tr/docs/[...slug].astro']) if (!existsSync(join(root, route))) throw new Error(`${route} is missing`);
  const allContent = [...english, ...turkish].map((document) => document.content).join('\n');
  if (/64 KB/i.test(allContent)) throw new Error('obsolete 64 KB text-limit claim is still present');
  if (!allContent.includes('100,000') || !allContent.includes('100.000')) throw new Error('documented hard text limit is missing in one locale');
  if (!allContent.includes('"status": "ok"')) throw new Error('health response reference is missing');
  const apiReference = english.find((document) => document.file === 'api-reference.mdx')?.content ?? '';
  for (const packageName of ['@copypatch/core', '@copypatch/react', '@copypatch/backend', '@copypatch/storage-sqlite', '@copypatch/storage-postgres', '@copypatch/node', '@copypatch/next']) if (!apiReference.includes(packageName)) throw new Error(`API reference is missing ${packageName}`);
}

async function main() { await verifyDocs(); console.log('Documentation metadata, snippets, locale parity, and source-aligned claims verified.'); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`Documentation verification failed: ${error.message}`); process.exitCode = 1; });
