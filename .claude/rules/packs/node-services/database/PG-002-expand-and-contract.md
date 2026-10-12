---
id: PG-002
title: Ship breaking schema changes in expand-and-contract steps
level: MUST
scope: pack:node-services
paths: ["**/prisma/**", "**/drizzle/**", "**/migrations/**", "**/*.sql", "**/drizzle.config.*", "**/schema.prisma", "**/db/**"]
verified-by: [ci]
check: "ci: squawk lints new migration SQL; drizzle-kit check or prisma migration check runs in the verify workflow"
targets-failure: data-loss
observed-on: []
rationale: A single migration that drops or renames columns breaks the running version of the app during deploys and can lose data.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
Make breaking changes in separate deploys: add the new column or table, backfill and switch reads and writes, then remove the old one in a later migration. Avoid `DROP COLUMN`, `DROP TABLE`, renames, and validated constraints in the same release that stops using them. Create indexes concurrently where the database supports it.
