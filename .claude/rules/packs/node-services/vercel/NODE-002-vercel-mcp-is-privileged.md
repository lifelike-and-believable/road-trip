---
id: NODE-002
title: Treat the Vercel MCP server as a privileged credential
level: MUST
scope: pack:node-services
verified-by: [hook]
check: "hook: rfr-core guard-mcp asks before Vercel MCP tools that deploy, change settings or environment variables, decrypt, delete, or purchase"
targets-failure: destructive-action
observed-on: []
rationale: The Vercel MCP server acts with the full access of the user's Vercel account, including deployments, secrets, deletions, and purchases.
sources: ["practices/postgres-on-vercel.md", "docs/research/notes/web_followup.md"]
---
Use the Vercel MCP server freely to read deployments, logs, and project settings. Ask before deploying, promoting, rolling back, changing environment variables or protection settings, deleting anything, or buying anything. Decrypt environment variable values only when the user asks for that specific value.
