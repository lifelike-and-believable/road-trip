# Road Trip

Enter a start and end location, a start and end time, and whether the trip is one way or a round trip. Road Trip lists the events and activities along the road between the two places, in the style of the Montreal Weekend Board.

Status: early. Trips can be created, listed, read and deleted through the API, and a trip stops being active when its end time passes. A trip's route corridor (the towns along the road, with estimated passing times) can be built from OpenStreetMap data, and event sources for those towns can be found with Claude. The refresh and the board are not built yet. [PLAN.md](PLAN.md) sequences them.

## Commands

    npm run dev        development server
    npm run verify     typecheck, lint, unit tests, build

## API

All routes except `/api/health` and `/api/login` need the session cookie or the refresh job's bearer token.

    POST   /api/login          {passcode}; sets the cookie. DELETE clears it
    GET    /api/session        {authed}
    GET    /api/health         which settings are present, as booleans
    GET    /api/trips          trips, soonest first, each with status and legs
    POST   /api/trips          {from, to, start, end, roundTrip, turnaround? | stay?, tz?}
    GET    /api/trips/<id>
    DELETE /api/trips/<id>     also removes the trip's corridor and sources
    POST   /api/trips/<id>/corridor   build the route corridor once (active trips only)
    GET    /api/trips/<id>/corridor   the stored corridor
    POST   /api/trips/<id>/sources    find event sources for the corridor's stops once (needs the corridor)
    GET    /api/trips/<id>/sources    the stored list

Times carry an offset (`2026-10-16T10:00:00-04:00`). On a round trip, `turnaround` is the instant the return begins; `stay` is instead the minutes to spend at the destination after arriving (give one, not both), and the return's start is then worked out once the route is known. `status` is `upcoming`, `underway` or `ended`; only the first two are refreshed.

## Settings

`AUTH_SECRET`, `APP_PASSCODE`, `DOC_SALT`, `REFRESH_SECRET`, and the Upstash Redis variables `KV_REST_API_URL` and `KV_REST_API_TOKEN`. `ANTHROPIC_API_KEY` is needed to find sources. Optional: `ANTHROPIC_MODEL` (default `claude-opus-5-5`; a cheaper model lowers the cost of each trip), `OSM_CONTACT`, an email address or URL that OpenStreetMap's services can reach you at, sent in the user agent as their usage policy asks.

## Setup that remains

- Connect the repository to Vercel.
- Add the `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret if deployment protection is on.
- Create a `tests-reviewed` label.
- In Claude Code, accept the project's `rfr-core` plugin when prompted.

Project decisions are in [AGENTS.md](AGENTS.md).
