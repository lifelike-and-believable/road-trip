---
id: NEXT-002
title: Keep the server and client boundary deliberate
level: SHOULD
scope: pack:react-nextjs
paths: ["**/app/**", "**/src/app/**", "**/components/**", "**/*.tsx"]
verified-by: [review]
targets-failure: security-regression
observed-on: []
rationale: Marking components as client components by reflex ships more JavaScript and can leak server-only data to the browser.
sources: ["practices/web-verification.md"]
---
Leave components as Server Components unless they need state, effects, event handlers, or browser APIs. Put `'use client'` on the smallest component that needs it. Pass only serializable props across the boundary. Keep secrets, database access, and environment variables without the `NEXT_PUBLIC_` prefix in server-only modules, and import `server-only` in modules that must never reach the client.
