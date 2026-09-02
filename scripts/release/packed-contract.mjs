import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

export const PACKAGE_EXPORT_ALLOWLIST = {
  '@copypatch/core': ['dist/index.js', 'dist/index.d.ts'],
  '@copypatch/react': ['dist/index.js', 'dist/index.d.ts', 'dist/editor/index.js', 'dist/editor/index.d.ts'],
  '@copypatch/backend': ['dist/index.js', 'dist/index.d.ts'],
  '@copypatch/node': ['dist/index.js', 'dist/index.d.ts', 'dist/cli/index.js', 'dist/cli/index.d.ts', 'dist/cli/bin.js'],
  '@copypatch/next': ['dist/index.js', 'dist/index.d.ts', 'dist/server.js', 'dist/server.d.ts'],
  '@copypatch/storage-sqlite': ['dist/index.js', 'dist/index.d.ts'],
  '@copypatch/storage-postgres': ['dist/index.js', 'dist/index.d.ts'],
};

export const PACKAGE_EXPORT_SNAPSHOT = {
  '@copypatch/core': { '.': { default: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' } },
  '@copypatch/react': {
    '.': { default: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' },
    './editor': { default: './dist/editor/index.js', import: './dist/editor/index.js', types: './dist/editor/index.d.ts' },
  },
  '@copypatch/backend': { '.': { default: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' } },
  '@copypatch/node': {
    '.': { default: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' },
    './cli': { default: './dist/cli/index.js', import: './dist/cli/index.js', types: './dist/cli/index.d.ts' },
  },
  '@copypatch/next': {
    '.': { default: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' },
    './server': { default: './dist/server.js', import: './dist/server.js', types: './dist/server.d.ts' },
  },
  '@copypatch/storage-sqlite': { '.': { default: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' } },
  '@copypatch/storage-postgres': { '.': { default: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' } },
};

export const PACKAGE_BIN_SNAPSHOT = {
  '@copypatch/node': { copypatch: './dist/cli/bin.js' },
};

export const PACKAGE_RUNTIME_EXPORT_SNAPSHOT = {
  '@copypatch/core': ['API_BASE_PATH', 'CONTENT_KEY_REGEX', 'CSRF_HEADER_NAME', 'DEFAULT_MAX_TEXT_LENGTH', 'HARD_MAX_TEXT_LENGTH', 'LOCALE_REGEX', 'RevisionConflictError', 'isValidContentKey', 'isValidLocale', 'normalizeText'],
  '@copypatch/react': ['CopyPatchProvider', 'EditableText', 'useCopyPatch', 'useCopyPatchStore', 'useEditableText'],
  '@copypatch/react/editor': ['CopyPatchEditor'],
  '@copypatch/backend': ['createCopyPatchBackend'],
  '@copypatch/node': ['createHonoHandler', 'createNodeHandler', 'expressMiddleware', 'fastifyCopyPatchHandler', 'fastifyCopyPatchPlugin', 'handleNodeRequest', 'toRequest', 'writeNodeResponse'],
  '@copypatch/node/cli': ['createInitFiles', 'runCli'],
  '@copypatch/next': ['CopyPatchProvider', 'EditableText', 'NextCopyPatchProvider', 'useCopyPatch', 'useCopyPatchStore', 'useEditableText'],
  '@copypatch/next/server': ['createCopyPatchRouteHandlers', 'readPublishedSnapshot'],
  '@copypatch/storage-sqlite': ['SQLitePersistence', 'createSQLitePersistence'],
  '@copypatch/storage-postgres': ['createPostgresPersistence'],
};

export const PACKAGE_DECLARATION_EXPORT_SNAPSHOT = {
  '@copypatch/core': ['API_BASE_PATH', 'ApiErrorResponse', 'CONTENT_KEY_REGEX', 'CSRF_HEADER_NAME', 'ContentChange', 'ContentSnapshot', 'CopyPatchAuthAdapter', 'CopyPatchHandleContext', 'CopyPatchPersistence', 'CopyPatchPrincipal', 'CopyPatchRequestHandler', 'CopyPatchRole', 'DEFAULT_MAX_TEXT_LENGTH', 'DiscardDraftsCommand', 'DiscardDraftsResult', 'EditorSnapshot', 'ErrorCode', 'HARD_MAX_TEXT_LENGTH', 'LOCALE_REGEX', 'PersistenceHealth', 'PersistenceMutationResult', 'PublishDraftsCommand', 'PublishDraftsResult', 'PublishRequest', 'PublishResponse', 'PublishedSnapshotReader', 'PublishingMode', 'RateLimitDecision', 'RateLimitInput', 'RevisionConflictError', 'RevisionConflictResponse', 'SaveChangesRequest', 'SaveChangesResponse', 'SaveDraftsCommand', 'SaveDraftsResult', 'SessionAuthResponse', 'SessionTouch', 'StoredSession', 'isValidContentKey', 'isValidLocale', 'normalizeText'],
  '@copypatch/react': ['CopyPatchProvider', 'CopyPatchProviderProps', 'CopyPatchStoreApi', 'CopyPatchStoreState', 'EditableText', 'EditableTextProps', 'UseEditableTextOptions', 'UseEditableTextReturn', 'useCopyPatch', 'useCopyPatchStore', 'useEditableText'],
  '@copypatch/react/editor': ['CopyPatchEditor', 'CopyPatchEditorProps'],
  '@copypatch/backend': ['CopyPatchBackend', 'createCopyPatchBackend'],
  '@copypatch/node': ['ExpressNext', 'ExpressRequest', 'FastifyReplyLike', 'FastifyRequestLike', 'HonoContextLike', 'NodeHandlerOptions', 'createHonoHandler', 'createNodeHandler', 'expressMiddleware', 'fastifyCopyPatchHandler', 'fastifyCopyPatchPlugin', 'handleNodeRequest', 'toRequest', 'writeNodeResponse'],
  '@copypatch/node/cli': ['CliDependencies', 'CliResult', 'Framework', 'InitFile', 'Storage', 'createInitFiles', 'runCli'],
  '@copypatch/next': ['CopyPatchProvider', 'EditableText', 'NextCopyPatchProvider', 'useCopyPatch', 'useCopyPatchStore', 'useEditableText'],
  '@copypatch/next/server': ['CopyPatchRouteHandler', 'CopyPatchRouteHandlerOptions', 'CopyPatchRouteHandlers', 'ReadPublishedSnapshotOptions', 'createCopyPatchRouteHandlers', 'readPublishedSnapshot'],
  '@copypatch/storage-sqlite': ['SQLitePersistence', 'SQLitePersistenceOptions', 'createSQLitePersistence'],
  '@copypatch/storage-postgres': ['PgClientLike', 'PgPoolLike', 'PgQueryResult', 'PgQueryable', 'PostgresPersistence', 'PostgresPersistenceOptions', 'StoredSession', 'createPostgresPersistence'],
};

export function listTarEntries(archive) {
  const tar = gunzipSync(archive); const entries = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString('utf8').replace(/\0.*$/, ''); if (!name) break;
    const size = Number.parseInt(tar.subarray(offset + 124, offset + 136).toString('ascii').replace(/\0.*$/, '').trim() || '0', 8);
    const start = offset + 512; entries.set(name, tar.subarray(start, start + size)); offset = start + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function exportTargets(exports) {
  if (typeof exports === 'string') return [exports];
  if (!exports || typeof exports !== 'object') return [];
  return Object.values(exports).flatMap(exportTargets);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function assertNamedExports(kind, specifier, actual, snapshot) {
  const expected = snapshot[specifier];
  if (!expected) throw new Error(`No ${kind} export snapshot exists for ${specifier}.`);
  if (stableJson([...actual].sort()) !== stableJson([...expected].sort())) {
    throw new Error(`${specifier} ${kind} named exports do not match the canonical public API snapshot.`);
  }
}

export function assertPackedExports(manifest, entries) {
  const allowed = PACKAGE_EXPORT_ALLOWLIST[manifest.name];
  if (!allowed) throw new Error(`No packed export allowlist exists for ${manifest.name}.`);
  const files = new Set(entries.map((entry) => entry.replace(/^package\//, '')));
  const targets = [...new Set(exportTargets(manifest.exports))].map((target) => target.replace(/^\.\//, ''));
  for (const target of targets) {
    if (!allowed.includes(target)) throw new Error(`${manifest.name} exports undeclared runtime/type target ${target}.`);
    if (!files.has(target)) throw new Error(`${manifest.name} export target is absent from tarball: ${target}.`);
  }
  if (manifest.bin) for (const target of Object.values(manifest.bin)) {
    const normalized = target.replace(/^\.\//, '');
    if (!allowed.includes(normalized) || !files.has(normalized)) throw new Error(`${manifest.name} bin target is not allowlisted: ${normalized}.`);
  }
  const expectedExports = PACKAGE_EXPORT_SNAPSHOT[manifest.name];
  if (stableJson(manifest.exports) !== stableJson(expectedExports)) {
    throw new Error(`${manifest.name} export API snapshot does not match the canonical public contract.`);
  }
  const expectedBin = PACKAGE_BIN_SNAPSHOT[manifest.name];
  if (stableJson(manifest.bin) !== stableJson(expectedBin)) {
    throw new Error(`${manifest.name} bin API snapshot does not match the canonical public contract.`);
  }
  return true;
}

export async function readPackedManifest(tarball) {
  const entries = listTarEntries(await readFile(tarball));
  const manifestBytes = entries.get('package/package.json');
  if (!manifestBytes) throw new Error(`Tarball is missing package/package.json: ${tarball}`);
  return { entries: [...entries.keys()], manifest: JSON.parse(manifestBytes.toString('utf8')) };
}
