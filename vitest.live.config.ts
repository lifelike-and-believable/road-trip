import { defineConfig } from "vitest/config";

// Live checks call real services, so they are never part of `npm test`.
// Run them with `npm run live`; see README.md.
export default defineConfig({
  // Next resolves server-only to an empty module in a server build; tests run outside one, so they get the same.
  resolve: { alias: { "server-only": "next/dist/compiled/server-only/empty.js" } },
  test: {
    include: ["live/**/*.live.ts"],
    testTimeout: 600_000,
    fileParallelism: false,
    // The report is printed with console.log, which a passing test would otherwise hide.
    silent: false,
  },
});
