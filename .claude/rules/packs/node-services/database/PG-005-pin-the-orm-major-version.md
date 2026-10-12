---
id: PG-005
title: Check the installed ORM version before running migration commands
level: SHOULD
scope: pack:node-services
paths: ["**/prisma/**", "**/drizzle/**", "**/migrations/**", "**/*.sql", "**/drizzle.config.*", "**/schema.prisma", "**/db/**"]
verified-by: [review]
targets-failure: stale-knowledge
observed-on: []
rationale: Prisma 7 and Prisma 8 use different migration commands, and Prisma 8 is the npm default while still a release candidate.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
Read the installed ORM version from the lockfile before running any migration or schema command, and use that version's commands. Prisma 7 applies migrations with `prisma migrate deploy`; Prisma 8 uses `prisma db migrate`, `prisma migration plan`, and `prisma migration check`. Do not upgrade the ORM's major version as part of another change.
