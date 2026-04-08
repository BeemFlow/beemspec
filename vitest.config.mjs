import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      '@beemspec/processflow': path.resolve(rootDir, './packages/processflow/src/index.ts'),
      '@beemspec/storymap': path.resolve(rootDir, './packages/storymap/src/index.ts'),
      '@beemspec/opencode/runtime': path.resolve(rootDir, './packages/opencode/src/runtime.ts'),
      '@beemspec/opencode': path.resolve(rootDir, './packages/opencode/src/index.ts'),
      '@beemspec/linear': path.resolve(rootDir, './packages/linear/src/index.ts'),
    },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.next/**', '**/*.integration.test.*'],
    coverage: {
      provider: 'v8',
      exclude: [
        'e2e/**',
        'node_modules/**',
        'dist/**',
        '.next/**',
        '**/*.integration.test.*',
        '**/*.test.*',
        '**/*.spec.*',
        'next.config.ts',
        'playwright.config.ts',
        'postcss.config.mjs',
        'vitest.config.mjs',
      ],
    },
  },
};
