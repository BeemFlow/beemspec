import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      '@beemspec/storymap': path.resolve(rootDir, './packages/storymap/src/index.ts'),
      '@beemspec/opencode/runtime': path.resolve(rootDir, './packages/opencode/src/runtime.ts'),
      '@beemspec/opencode': path.resolve(rootDir, './packages/opencode/src/index.ts'),
      '@beemspec/linear': path.resolve(rootDir, './packages/linear/src/index.ts'),
    },
  },
};
