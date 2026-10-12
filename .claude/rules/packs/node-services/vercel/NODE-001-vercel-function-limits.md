---
id: NODE-001
title: Design server code within Vercel function limits
level: SHOULD
scope: pack:node-services
paths: ["**/app/api/**", "**/src/app/api/**", "**/api/**", "**/vercel.json", "**/vercel.ts", "**/next.config.*", "**/server/**"]
verified-by: [review]
targets-failure: project-decision
observed-on: []
rationale: These are the limits agents most often hit on Vercel, and raising them is rarely the right fix.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
Keep request and response bodies under 4.5 MB and work under the default 300-second function duration. Send large files through Vercel Blob and long jobs through a queue or workflow rather than raising limits. Use the Node.js runtime unless the project has chosen Edge. Share one database pool per function instance with a short idle timeout.
