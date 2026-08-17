# CopyPatch

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/woffluon/CopyPatch/actions/workflows/ci.yml/badge.svg)](https://github.com/woffluon/CopyPatch/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

A lightweight, self-hosted inline copy editing system designed specifically for React and Next.js applications.

CopyPatch allows developers to mark text surfaces in React as editable. An authorized client or content editor opens the live website with `?copypatch=1`, clicks directly into the text, types naturally with native caret preservation, and publishes changes in real time. HTML layout, CSS rules, and React component code remain untouched.

```text
+-------------------------------------------------------------------------+
| Developer Marks Text In React:                                          |
| <EditableText contentKey="home.hero.title">Build fast.</EditableText>  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Editor Opens Live URL: https://mysite.com?copypatch=1                   |
| 1. Argon2id Passphrase Modal -> 2. In-Memory Edit Plane Lazy-Loads      |
| 3. Caret Placed Inline -> 4. Edit Plain String -> 5. Click Save (Cmd+S) |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| SQLite Persistence (WAL Mode) + Atomic In-Memory Snapshot Cache         |
| Public visitors receive instant sub-millisecond reads (< 1 kB runtime)  |
+-------------------------------------------------------------------------+
```

---

## Architectural Comparison

| Dimension | CopyPatch | Traditional Headless CMS | Visual Page Builder |
| :--- | :--- | :--- | :--- |
| **Editing Workflow** | Inline directly on live website (`?copypatch=1`) | Disconnected admin dashboard | Drag-and-drop visual canvas |
| **Code Ownership** | 100% developer React & CSS code | Rigid schema bindings | Proprietary exported markup |
| **Visitor Bundle** | **< 1 kB gzip** (0.2 kB core runtime) | 15-50 kB CMS SDK | 150-500+ kB script runtime |
| **Security Invariant** | Strict plain text (0% Stored XSS) | HTML/Markdown injection risks | Arbitrary script risks |
| **Data Sovereignty** | Self-hosted SQLite file | Third-party vendor SaaS lock-in | Hosted vendor cloud |
| **Licensing** | 100% Free & MIT Open-Source | Monthly seat / bandwidth fees | Domain subscription fees |

---

## Core Invariants

1. **Strict Plain-Text Invariant**: CopyPatch persists only plain strings. HTML tags, scripts, JSX, and markdown are rejected on both client and server, guaranteeing Stored XSS immunity.
2. **Zero Hydration Mismatch**: `@copypatch/next` pre-renders published snapshots on the server via React Server Components (RSC) to ensure instant SEO indexing and 0ms hydration drift.
3. **Lazy-Loaded Editor Plane**: The floating editing toolbar and authentication modal (~12 kB gzip) load dynamically only when `?copypatch=1` is explicitly present in the URL.
4. **Optimistic Concurrency**: Revisions are tracked per locale (`publishedRevision`, `draftRevision`). Conflicting concurrent edits fail safely with HTTP `409 Conflict`.
5. **Deterministic Self-Hosting**: Operates on a single-file SQLite database with Write-Ahead Logging (WAL) and zero external database dependencies.

---

## Package Architecture

| Package | Version | Description | Target Environment |
| :--- | :--- | :--- | :--- |
| [`@copypatch/react`](packages/react) | `0.1.0` | React provider, `<EditableText>`, and hooks | React / Vite / Next.js Client |
| [`@copypatch/core`](packages/core) | `0.1.0` | Shared types, validation, and constants | Universal (Node / Browser) |
| [`@copypatch/next`](packages/next) | `0.1.0` | Next.js App Router RSC snapshot pre-rendering | Next.js Server & Client |
| [`@copypatch/server`](packages/server) | `0.1.0` | Hono HTTP server, SQLite WAL storage, and CLI | Node.js Server (`>= 20`) |

---

## Installation

```bash
# In your React / Next.js project:
pnpm add @copypatch/react @copypatch/core

# For Next.js App Router (RSC) support:
pnpm add @copypatch/next

# For standalone server & CLI:
pnpm add @copypatch/server
```

---

## Quick Start (React & Vite)

### 1. Initialize SQLite Database & Editor Passphrase

```bash
npx copypatch init --db ./copypatch.sqlite
```

### 2. Start Standalone CopyPatch Server

```bash
npx copypatch serve --port 4040 --db ./copypatch.sqlite --origin http://localhost:5173
```

### 3. Wrap App with `CopyPatchProvider` and Use `<EditableText>`

```tsx
import React, { useState } from 'react';
import { CopyPatchProvider, EditableText, useCopyPatch } from '@copypatch/react';

export function App() {
  const [locale, setLocale] = useState<'en' | 'tr'>('en');

  // Dynamic button label via hook
  const ctaLabel = useCopyPatch('home.cta.button', 'Get Started');

  return (
    <CopyPatchProvider locale={locale} apiBase="/__copypatch/api/v1">
      <header>
        <EditableText contentKey="nav.brand" as="span">
          My Website
        </EditableText>
      </header>

      <main>
        {/* Rendered as <h1> with native caret editing in edit mode */}
        <EditableText contentKey="home.hero.title" as="h1">
          Build something people actually use.
        </EditableText>

        {/* Multiline text with line breaks allowed */}
        <EditableText
          contentKey="home.hero.subtitle"
          as="p"
          allowLineBreaks={true}
        >
          A fast, reliable product description that editors can refine inline.
        </EditableText>

        <button type="button">{ctaLabel}</button>
      </main>
    </CopyPatchProvider>
  );
}
```

### 4. Activate Edit Mode

Open `http://localhost:5173?copypatch=1` in your browser, enter your configured editor passphrase, and click directly into any text to edit.

---

## Next.js App Router (SSR) Integration

```tsx
// app/[locale]/page.tsx (Server Component)
import { NextCopyPatchProvider, EditableText } from '@copypatch/next';
import { fetchServerSnapshot } from '@copypatch/next/server';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Page({ params }: PageProps) {
  const { locale } = await params;

  // Pre-fetch published snapshot on server for zero-hydration mismatch
  const snapshot = await fetchServerSnapshot(locale, {
    apiBaseUrl: process.env.COPYPATCH_INTERNAL_URL || 'http://127.0.0.1:4040',
  });

  return (
    <NextCopyPatchProvider
      locale={locale}
      apiBase="/__copypatch/api/v1"
      initialSnapshot={snapshot}
    >
      <main>
        <EditableText contentKey="hero.title" as="h1">
          Server Pre-Rendered Headline
        </EditableText>
      </main>
    </NextCopyPatchProvider>
  );
}
```

---

## CLI Command Suite

```bash
# Initialize SQLite database schema and set editor passphrase
npx copypatch init --db ./copypatch.sqlite

# Start the high-performance HTTP API server
npx copypatch serve --port 4040 --db ./copypatch.sqlite --origin "http://localhost:5173,https://my-site.com" --mode direct

# Invalidate all active sessions and rotate administrative passphrase
npx copypatch password --db ./copypatch.sqlite

# Apply any pending database schema migrations
npx copypatch migrate --db ./copypatch.sqlite
```

---

## Security Invariants & Cryptography

- **Passphrase Hashing**: Argon2id (RFC 9106 recommended parameters: 19 MiB RAM, 2 iterations, 1 lane, 256-bit salt).
- **Session Tokens**: 256-bit entropy generated with `crypto.randomBytes(32)`, stored hashed with SHA-256 in SQLite, transmitted via `HttpOnly`, `SameSite=Strict`, and `Secure` cookies with `__Host-` prefixes in production.
- **Dual-Token CSRF**: Mutating endpoints verify both the session cookie and a memory-only `x-copypatch-csrf` header.
- **Origin Isolation**: Mutating endpoints strictly validate `Origin` and `Referer` headers against the server allowlist.

---

## Documentation

- [System Architecture](docs/architecture.md)
- [Threat Model & Security](docs/threat-model.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)

---

## License

MIT License (c) 2026 Efe Arabaci.
