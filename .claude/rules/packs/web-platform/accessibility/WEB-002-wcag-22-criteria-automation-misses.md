---
id: WEB-002
title: Cover the WCAG 2.2 criteria that automated tools miss
level: SHOULD
scope: pack:web-platform
paths: ["**/*.tsx", "**/*.jsx", "**/*.astro", "**/*.html", "**/*.css", "**/*.vue", "**/*.svelte"]
verified-by: [test, review]
targets-failure: accessibility-regression
observed-on: []
rationale: axe-core checks only one WCAG 2.2 criterion (target size, off by default), and automated tools find only 20 to 30% of success criteria.
sources: ["practices/web-verification.md", "docs/research/notes/web_followup.md"]
---
For UI you change, make sure that:

- a focused element is never fully hidden by sticky headers, footers, or overlays (2.4.11);
- pointer targets are at least 24 by 24 CSS pixels or spaced so they do not overlap (2.5.8);
- anything done by dragging also works with a single click or tap (2.5.7);
- login and verification fields allow paste and password managers, with no puzzle-only checks (3.3.8);
- everything works with the keyboard alone, with a visible focus indicator.

Add a Playwright test for these when the component is interactive.
