# CopyPatch Agent Guide

CopyPatch is a pnpm monorepo for secure inline copy editing. Public npm packages are:

- `@copypatch/core`: contracts, validation, and shared constants
- `@copypatch/react`: provider, hooks, editable components, and editor runtime
- `@copypatch/backend`: storage-independent backend runtime and auth contract
- `@copypatch/storage-sqlite`: SQLite persistence adapter
- `@copypatch/storage-postgres`: PostgreSQL persistence adapter
- `@copypatch/node`: Node/Express/Fastify/Hono adapters and project CLI
- `@copypatch/next`: Next.js App Router routes and snapshot integration

`apps/site` is the private Astro documentation/demo site. `examples/` contains integration examples; neither is published to npm.

## Runtime and install

- Use Node.js `>=20`; CI/release runs Node 24.
- Use pnpm `11.10.0`, declared by the root `packageManager` field.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Do not edit `pnpm-lock.yaml` unless a dependency change requires it.

## Commands

Run these from the repository root:

```bash
pnpm build          # build all publishable packages
pnpm typecheck      # packages, examples, and site
pnpm test           # Vitest suite plus release-contract tests
pnpm build:site     # build the Astro site
pnpm test:e2e       # Playwright Chromium acceptance tests
node scripts/measure-bundle.mjs
pnpm release:verify # validate current lockstep manifests
pnpm release:check  # validate lockstep manifests and first-parent history
```

For a package-local change, run its build/typecheck first, then the narrowest relevant test. Before a release commit, run `pnpm build`, `pnpm typecheck`, `pnpm test`, and `git diff --check`. Run the site build/E2E suite when changing the site, examples, browser behavior, or integration boundaries.

## Package boundaries

- Keep framework-agnostic types and validation in `packages/core`.
- `packages/react` may depend on `core`; it must not import server-only code.
- `packages/next` may depend on `core` and `react`; preserve its explicit client/server exports.
- `packages/backend` owns storage-independent HTTP behavior, authentication, and authorization. `packages/storage-*` own persistence; `packages/node` owns runtime adapters and the CLI. Do not leak these dependencies into browser packages.
- Preserve ESM-only package output and the declared `exports` map. Do not add CommonJS support unless explicitly requested.
- Publishable code belongs in `dist`; package manifests intentionally publish only built artifacts plus npm-required metadata files.

## Changes and tests

- Make surgical changes. Preserve existing API names, exports, configuration defaults, and error behavior unless the task requires a breaking change.
- Add or update tests when behavior changes. Do not change tests merely to conceal a regression.
- Do not commit generated runtime state, local databases, `.env` files, tokens, OTP values, or npm credentials.
- Treat security-sensitive server changes as requiring focused tests for origin validation, authentication, CSRF, session handling, and rate limits when relevant.

## Git and release contract

Use Conventional Commits. The release policy is lockstep across the root manifest and all seven public packages:

| Commit type | Version effect |
| --- | --- |
| `feat!` or `BREAKING CHANGE:` | major |
| `feat` | minor |
| `fix`, `perf`, `refactor`, `build`, `security` | patch |
| `docs`, `ci`, `test`, `chore` | no version bump |

Before committing a versioned change, prepare the exact message first:

```bash
pnpm release:prepare -- "feat!: replace standalone server with embedded multi-framework backend"
```

This updates all lockstep manifests atomically. Commit with the exact same full Conventional Commit message passed to `release:prepare`; CI validates the first-parent history. Prefer squash merges with a valid Conventional Commit message. GitHub's default `Merge pull request ...` message does not satisfy the contract.

Never reuse or alter a published `name@version`. Never manually rewrite `workspace:*` ranges in source manifests; the release packer converts them to exact release versions in temporary tarballs.

## npm publishing and GitHub Actions

- The first publication of all seven packages is a maintainer-controlled, interactive npm 2FA bootstrap.
- After each package has a GitHub trusted publisher configured for `.github/workflows/publish.yml`, later releases use GitHub OIDC. Do not add `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `.npmrc` credentials, or long-lived registry tokens to this repository or workflow.
- The publish workflow is deliberately idempotent: it skips exact versions already on npm, fails on partial first bootstrap, and creates the immutable GitHub tag/release only after the registry state is valid.
- Keep workflow permissions minimal. The publish job needs `id-token: write`; the release job alone needs `contents: write`.
- Pin third-party GitHub Actions to immutable commit SHAs, including an explanatory version comment.
- Before publishing, inspect generated tarballs. They must contain only expected package files, `README.md`, `LICENSE`, and a workspace-protocol-free manifest.

## Documentation

- Package README files are npm landing pages: keep install instructions, minimal valid usage, exports, runtime requirements, and links correct.
- Keep the root README and site documentation aligned with public API and release behavior when the relevant surface changes.
- Documentation intentionally removed by a maintainer must stay removed unless explicitly requested again.
- `docs/architecture.md` is the architecture map. `docs/threat-model.md` records security status and design history. Do not restore the deliberate delete-zone files `docs/npm-publishing.md` or `docs/npm-readiness-audit-2026-08-24.md`.
