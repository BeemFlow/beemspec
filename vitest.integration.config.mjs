import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const { loadEnvConfig } = nextEnv;

loadEnvConfig(rootDir);

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
    include: ['src/**/*.integration.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.next/**'],
    fileParallelism: false,
  },
};
