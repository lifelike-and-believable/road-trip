---
id: PG-003
title: Run migrations over a direct connection in a gated step
level: SHOULD
scope: pack:node-services
paths: ["**/prisma/**", "**/drizzle/**", "**/migrations/**", "**/*.sql", "**/drizzle.config.*", "**/schema.prisma", "**/db/**"]
verified-by: [review]
targets-failure: data-loss
observed-on: []
rationale: Poolers in transaction mode break migrations, and migrations in the Vercel build command also run on production builds.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
Use the direct (unpooled) database URL for migrations and the pooled URL for the application. Apply production migrations in a separate, gated pipeline step, not in the build command.
