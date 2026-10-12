---
id: WEB-004
title: Check UI changes in a real browser
level: SHOULD
scope: pack:web-platform
paths: ["**/*.tsx", "**/*.jsx", "**/*.astro", "**/*.html", "**/*.css", "**/*.vue", "**/*.svelte"]
verified-by: [review]
targets-failure: unverified-claim
observed-on: []
rationale: Type checks and unit tests do not show layout, focus, or rendering problems, and browser accessibility snapshots cost far fewer tokens than screenshots.
sources: ["practices/web-verification.md", "docs/research/notes/web_verification.md"]
---
After changing UI, load the affected page in a browser with the Playwright CLI (prefer it to the Playwright MCP server in long sessions, because it uses about a quarter of the tokens), exercise the changed interaction, and run axe on it. Report what you checked. Keep screenshots for visual questions; use accessibility snapshots otherwise.
