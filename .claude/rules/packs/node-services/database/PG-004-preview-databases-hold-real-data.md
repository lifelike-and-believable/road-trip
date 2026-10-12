---
id: PG-004
title: Treat preview database branches as production data
level: SHOULD
scope: pack:node-services
paths: ["**/prisma/**", "**/drizzle/**", "**/migrations/**", "**/*.sql", "**/drizzle.config.*", "**/schema.prisma", "**/db/**"]
verified-by: [review]
targets-failure: secret-exposure
observed-on: []
rationale: Neon preview branches copy the parent branch's data by default, so a preview deployment can contain real users' records.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
Assume preview and branch databases contain production data unless the project states they are schema-only or seeded. Do not print, export, or copy their rows into logs, fixtures, or reports.
