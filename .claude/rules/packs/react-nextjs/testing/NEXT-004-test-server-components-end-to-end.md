---
id: NEXT-004
title: Test async Server Components end to end
level: SHOULD
scope: pack:react-nextjs
paths: ["**/*.test.*", "**/*.spec.*", "**/e2e/**", "**/tests/**"]
verified-by: [review]
targets-failure: test-gaming
observed-on: []
rationale: Vitest cannot render async Server Components, so unit tests for them end up mocking away the behaviour under test.
sources: ["practices/web-verification.md", "docs/research/notes/web_followup.md"]
---
Test async Server Components and route handlers with Playwright against a running build. Use Vitest and Testing Library for client components and plain functions. Disable animations and wait for fonts before visual comparisons, and update visual baselines only when the user agrees the change is intended.
