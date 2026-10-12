---
id: TS-002
title: Use the project's package manager and scripts
level: SHOULD
scope: pack:typescript
paths: ["**/package.json", "**/*.ts", "**/*.tsx"]
verified-by: [review]
targets-failure: convention-drift
observed-on: []
rationale: Mixing npm, pnpm, and yarn creates conflicting lockfiles, and calling tools directly skips the project's configured flags.
sources: ["practices/web-verification.md"]
---
Use the package manager that matches the lockfile (`package-lock.json`: npm, `pnpm-lock.yaml`: pnpm, `yarn.lock`: yarn, `bun.lock`: bun). Run tools through the project's `package.json` scripts where one exists rather than calling them directly.
