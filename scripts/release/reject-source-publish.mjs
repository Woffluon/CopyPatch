console.error('Direct publishing from a package source directory is forbidden. Build canonical tarballs with `pnpm release:pack`, then publish through `scripts/release/publish-packages.mjs`.');
process.exitCode = 1;
