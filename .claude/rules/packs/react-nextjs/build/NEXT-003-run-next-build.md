---
id: NEXT-003
title: Run a production build before reporting done
level: MUST
scope: pack:react-nextjs
paths: ["**/app/**", "**/src/app/**", "**/next.config.*", "**/proxy.ts", "**/*.tsx"]
verified-by: [ci]
check: "ci: next build runs in the verify workflow"
targets-failure: unverified-claim
observed-on: []
rationale: Prerendering, caching, and static-to-dynamic errors appear only in `next build`, not in the dev server.
sources: ["practices/web-verification.md", "docs/research/notes/web_followup.md"]
---
Run `next build` (through the project's build script) before reporting a change as done, and include any route whose rendering changed between static and dynamic in your report. While iterating, `compile_route` and `get_compilation_issues` on the dev server's `/_next/mcp` endpoint are faster checks, but they do not replace the build.
