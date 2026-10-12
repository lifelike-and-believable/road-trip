# Road Trip

Enter a start and end location, a start and end time, and whether the trip is one way or a round trip. Road Trip lists the events and activities along the road between the two places, in the style of the Montreal Weekend Board.

Status: early. Trips can be created, listed, read and deleted through the API, and a trip stops being active when its end time passes. The route, the event sources, the refresh and the board are not built yet. [PLAN.md](PLAN.md) sequences them.

## Commands

    npm run dev        development server
    npm run verify     typecheck, lint, unit tests, build

## API

All routes except `/api/health` and `/api/login` need the session cookie or the refresh job's bearer token.

    POST   /api/login          {passcode}; sets the cookie. DELETE clears it
    GET    /api/session        {authed}
    GET    /api/health         which settings are present, as booleans
    GET    /api/trips          trips, soonest first, each with status and legs
    POST   /api/trips          {from, to, start, end, roundTrip, turnaround?, tz?}
    GET    /api/trips/<id>
    DELETE /api/trips/<id>

Times carry an offset (`2026-10-16T10:00:00-04:00`). `status` is `upcoming`, `underway` or `ended`; only the first two are refreshed.

## Settings

`AUTH_SECRET`, `APP_PASSCODE`, `DOC_SALT`, `REFRESH_SECRET`, and the Upstash Redis variables `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

## Setup that remains

- Connect the repository to Vercel.
- Add the `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret if deployment protection is on.
- Create a `tests-reviewed` label.
- In Claude Code, accept the project's `rfr-core` plugin when prompted.

Project decisions are in [AGENTS.md](AGENTS.md).
