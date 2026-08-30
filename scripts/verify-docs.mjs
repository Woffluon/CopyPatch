import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const docsRoot = join(root, 'apps', 'site', 'src', 'content', 'docs');
const locales = ['en', 'tr'];
const requiredFields = ['title', 'description', 'group', 'order'];
const allowedGroups = new Set(['getting-started', 'framework-guides', 'editing-publishing', 'operations-security', 'api-reference']);

function fail(message) {
  process.stderr.write(`Documentation verification failed: ${message}\n`);
  process.exitCode = 1;
}

async function readDocs(locale) {
  const directory = join(docsRoot, locale);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.mdx')).sort();
  const documents = await Promise.all(files.map(async (file) => ({
    file,
    content: await readFile(join(directory, file), 'utf8'),
  })));
  return documents;
}

if (!existsSync(docsRoot)) {
  fail('apps/site/src/content/docs is missing');
} else {
  const [english, turkish] = await Promise.all(locales.map(readDocs));
  const englishNames = english.map((document) => document.file);
  const turkishNames = turkish.map((document) => document.file);

  if (JSON.stringify(englishNames) !== JSON.stringify(turkishNames)) {
    fail('English and Turkish MDX file sets differ');
  }

  const routes = new Set();
  for (const file of englishNames) {
    const slug = file.replace(/\.mdx$/, '');
    routes.add(slug === 'overview' ? '/docs' : `/docs/${slug}`);
    routes.add(slug === 'overview' ? '/tr/docs' : `/tr/docs/${slug}`);
  }

  for (const [locale, documents] of [['en', english], ['tr', turkish]]) {
    const positionKeys = new Set();
    for (const document of documents) {
      for (const field of requiredFields) {
        if (!new RegExp(`^${field}:`, 'm').test(document.content)) {
          fail(`${locale}/${document.file} is missing frontmatter field ${field}`);
        }
      }

      const group = document.content.match(/^group:\s*([^\r\n]+)/m)?.[1]?.trim();
      const order = document.content.match(/^order:\s*(\d+)/m)?.[1];
      if (!group || !allowedGroups.has(group)) fail(`${locale}/${document.file} has an unknown navigation group`);
      if (!order) fail(`${locale}/${document.file} has an invalid navigation order`);
      const positionKey = `${group}:${order}`;
      if (positionKeys.has(positionKey)) fail(`${locale} has duplicate navigation order ${positionKey}`);
      positionKeys.add(positionKey);

      for (const href of document.content.matchAll(/href=["'](\/(?:tr\/)?docs(?:\/[^"'#?]+)?)["']/g)) {
        if (!routes.has(href[1])) fail(`${locale}/${document.file} links to a missing documentation route: ${href[1]}`);
      }
    }
  }

  const requiredRoutes = [
    'apps/site/src/pages/docs/[...slug].astro',
    'apps/site/src/pages/tr/docs/[...slug].astro',
  ];
  for (const route of requiredRoutes) {
    if (!existsSync(join(root, route))) fail(`${route} is missing`);
  }

  const allContent = [...english, ...turkish].map((document) => document.content).join('\n');
  if (/64 KB/i.test(allContent)) fail('obsolete 64 KB text-limit claim is still present');
  if (!allContent.includes('100,000') || !allContent.includes('100.000')) {
    fail('documented hard text limit is missing in one locale');
  }
  if (!allContent.includes('"status": "ok"')) fail('health response reference is missing');

  const apiReference = english.find((document) => document.file === 'api-reference.mdx')?.content ?? '';
  const requiredPackageExports = [
    '@copypatch/core',
    '@copypatch/react',
    '@copypatch/backend',
    '@copypatch/storage-sqlite',
    '@copypatch/storage-postgres',
    '@copypatch/node',
    '@copypatch/next',
  ];
  for (const packageName of requiredPackageExports) {
    if (!apiReference.includes(packageName)) fail(`API reference is missing ${packageName}`);
  }
}

if (!process.exitCode) process.stdout.write('Documentation metadata, locale parity, and source-aligned claims verified.\n');
