---
id: WEB-003
title: Stay within the performance budgets
level: MUST
scope: pack:web-platform
paths: ["**/*.tsx", "**/*.jsx", "**/*.astro", "**/*.html", "**/*.css", "**/package.json", "**/next.config.*", "**/astro.config.*"]
verified-by: [ci]
check: "ci: Lighthouse CI (median of 3 runs) on the preview deployment; size-limit per-route JavaScript budgets"
targets-failure: performance-regression
observed-on: []
rationale: Core Web Vitals thresholds are the project's performance definition, and regressions are cheapest to catch per change.
sources: ["practices/web-verification.md", "docs/research/findings.md"]
---
Keep pages within LCP 2.5 s, INP 200 ms, and CLS 0.1 at the 75th percentile, and within the JavaScript budgets in the project's size-limit config. Give images explicit dimensions and modern formats, lazy-load content below the fold, and avoid adding client-side JavaScript or dependencies for what HTML and CSS can do. When a change adds weight, report the size difference.
