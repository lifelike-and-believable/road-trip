---
id: NEXT-001
title: Work from the installed Next.js docs and current defaults
level: SHOULD
scope: pack:react-nextjs
paths: ["**/app/**", "**/src/app/**", "**/next.config.*", "**/proxy.ts", "**/middleware.ts", "**/*.tsx"]
verified-by: [review]
targets-failure: stale-knowledge
observed-on: []
rationale: Next.js 16 changed defaults that models trained on older versions get wrong, and version-matched docs ship inside the package.
sources: ["practices/web-verification.md", "docs/research/notes/web_followup.md", "evals/results/2026-10-05-phase8/report.md"]
---
Keep the `nextjs-agent-rules` block that `next dev` writes into `AGENTS.md`, and follow it: before using a Next.js API, read its page in `node_modules/next/dist/docs/` for the installed version. Current defaults to remember: request interception lives in `proxy.ts` (`middleware.ts` is deprecated but still needed for the Edge runtime); `fetch` is not cached unless you opt in; `use cache` requires `cacheComponents` in `next.config`; request APIs such as `cookies()`, `headers()`, and `params` are async.
