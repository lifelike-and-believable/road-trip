---
id: PG-001
title: Generate migrations; never push schema changes to shared databases
level: MUST
scope: pack:node-services
paths: ["**/prisma/**", "**/drizzle/**", "**/migrations/**", "**/*.sql", "**/drizzle.config.*", "**/schema.prisma", "**/db/**"]
verified-by: [hook]
check: "hook: rfr-core guard-commands asks before drizzle-kit push or --force, prisma migrate dev/reset, and prisma db push/migrate"
targets-failure: data-loss
observed-on: []
rationale: These commands apply changes, including destructive ones, directly to whatever database the environment points at; Prisma 8 applies destructive operations without asking.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
Change the schema by generating a migration file (`drizzle-kit generate`, or the Prisma migration command for the installed major version) and leave applying it to the reviewed pipeline. Do not run `drizzle-kit push`, `--force`, `prisma db push`, `prisma migrate dev`, or `prisma migrate reset` against preview, staging, or production databases. Use them only against a local database the user has confirmed is disposable.
