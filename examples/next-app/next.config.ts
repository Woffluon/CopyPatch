import type { NextConfig } from 'next';

// CopyPatch is mounted by app/__copypatch/api/v2/[...path]/route.ts. There is
// deliberately no cross-origin rewrite: mutations are same-origin only.
const nextConfig: NextConfig = {
  // Native SQLite/Argon2 dependencies stay in the Node server bundle.
  serverExternalPackages: [
    '@copypatch/backend',
    '@copypatch/storage-sqlite',
    '@node-rs/argon2',
    '@node-rs/argon2-win32-x64-msvc',
    'better-sqlite3',
  ],
};

export default nextConfig;
