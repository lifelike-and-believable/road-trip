---
id: TS-001
title: Fix type errors instead of silencing them
level: MUST
scope: pack:typescript
paths: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"]
verified-by: [ci]
check: "ci: tsc --noEmit with strict; ESLint no-explicit-any and ban-ts-comment"
targets-failure: test-gaming
observed-on: []
rationale: Casting to any or adding ts-ignore makes the type checker pass while the defect stays, the same pattern as editing a failing test.
sources: ["practices/web-verification.md"]
---
When the type checker reports an error, fix the types or the code. Do not add `any`, `as unknown as`, non-null assertions (`!`), `@ts-ignore`, or `@ts-expect-error` to make an error go away. For data from outside the program, type it as `unknown` and narrow it with a schema or type guard. If a suppression is genuinely needed, add a comment giving the reason and mention it in your report.
