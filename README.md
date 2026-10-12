# Road Trip

Enter a start and end location, a start and end time, and whether the trip is one way or a round trip. Road Trip lists the events and activities along the road between the two places, in the style of the Montreal Weekend Board.

Status: scaffold. The project is set up with the rules-for-robots web-app template (Next.js 16, TypeScript, Vitest, Playwright, axe, Lighthouse CI, bundle budgets). The trip form and the listings are not built yet.

## Commands

    npm run dev        development server
    npm run verify     typecheck, lint, unit tests, build

## Setup that remains

- Connect the repository to Vercel.
- Add the `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret if deployment protection is on.
- Create a `tests-reviewed` label.
- In Claude Code, accept the project's `rfr-core` plugin when prompted.

Project decisions are in [AGENTS.md](AGENTS.md).
