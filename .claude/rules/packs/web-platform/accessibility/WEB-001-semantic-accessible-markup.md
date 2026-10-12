---
id: WEB-001
title: Build interfaces from semantic, labelled elements
level: MUST
scope: pack:web-platform
paths: ["**/*.tsx", "**/*.jsx", "**/*.astro", "**/*.html", "**/*.vue", "**/*.svelte"]
verified-by: [ci]
check: "ci: axe (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, target-size enabled) on the preview deployment"
targets-failure: accessibility-regression
observed-on: []
rationale: The project targets WCAG 2.2 AA, and most automatically detectable failures (missing names, low contrast, non-semantic controls) come from markup choices.
sources: ["practices/web-verification.md", "docs/research/findings.md"]
---
Use native elements for their purpose: `button` for actions, `a` with `href` for navigation, `label` tied to each form control, headings in order. Give every interactive element an accessible name and every meaningful image `alt` text (empty `alt` for decorative ones). Keep text contrast at 4.5:1 or higher (3:1 for large text). Add ARIA only when no native element fits.
