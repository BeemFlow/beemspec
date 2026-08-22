import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
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
