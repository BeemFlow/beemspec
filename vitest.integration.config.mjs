import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import nextEnv from '@next/env';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const { loadEnvConfig } = nextEnv;

// Integration tests are destructive and must target the Dockerized project in
// .env.local. Vitest loads .env first, so Next's loader will not overwrite the
// already-populated production values unless we apply the local file explicitly.
const localEnvPath = path.join(rootDir, '.env.local');
if (existsSync(localEnvPath)) {
  const localEnv = parseEnv(readFileSync(localEnvPath, 'utf8'));
  for (const [name, value] of Object.entries(localEnv)) {
    process.env[name] = value;
  }
} else {
  loadEnvConfig(rootDir);
}

export default {
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    include: ['src/**/*.integration.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.next/**'],
    fileParallelism: false,
  },
};
