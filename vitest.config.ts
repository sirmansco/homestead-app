import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/._*', '**/node_modules/**'],
    environment: 'node',
    globals: false,
  },
});
