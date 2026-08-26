import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/{core,react,backend,node,next,storage-sqlite,storage-postgres}/src/**/*.{ts,tsx}',
      ],
      exclude: ['packages/**/src/**/*.d.ts', 'packages/node/src/cli/bin.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
