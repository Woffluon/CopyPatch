# Contributing to CopyPatch

Thank you for your interest in contributing to **CopyPatch**!

## Development Setup

1. Prerequisites:
   - Node.js >= 20 (Node.js 24 LTS recommended)
   - `pnpm` >= 10.0.0

2. Clone repository & install dependencies:
   ```bash
   git clone https://github.com/woffluon/CopyPatch.git
   cd CopyPatch
   pnpm install
   ```

3. Build all workspace packages:
   ```bash
   pnpm build
   ```

4. Run unit and integration tests:
   ```bash
   pnpm test
   ```

5. Run Playwright E2E browser tests:
   ```bash
   pnpm test:e2e
   ```

## Code Quality & Philosophy

- **Small Surface, Serious Quality**: Always choose simple, robust primitives over heavy generalized abstractions.
- **Strict Invariant**: CopyPatch stores only plain text. Never introduce rich text, markdown, or HTML persistence.
- **Security-First**: Keep session cookies `HttpOnly`, require CSRF & Origin checks for all state-changing endpoints.
