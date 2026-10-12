---
id: NODE-003
title: Redeploy before testing environment variable changes
level: SHOULD
scope: pack:node-services
paths: ["**/app/api/**", "**/src/app/api/**", "**/api/**", "**/vercel.json", "**/vercel.ts", "**/next.config.*", "**/server/**"]
verified-by: [review]
targets-failure: unverified-claim
observed-on: []
rationale: Vercel applies environment variable changes only to new deployments, so testing an existing preview checks the old values.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
After changing an environment variable on Vercel, trigger a new deployment and test that deployment. Mark variables holding secrets as sensitive so their values cannot be read back.
