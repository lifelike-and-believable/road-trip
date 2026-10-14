import { defineConfig } from 'vitest/config';

// Unit and component tests only; Playwright specs in e2e/ run with `npm run test:e2e`.
export default defineConfig({
  // Next resolves server-only to an empty module in a server build; tests run outside one, so they get the same.
  resolve: { alias: { 'server-only': 'next/dist/compiled/server-only/empty.js' } },
  test: {
    exclude: ['e2e/**', 'node_modules/**', '.next/**', 'dist/**'],
  },
});
