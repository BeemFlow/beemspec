import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
};
