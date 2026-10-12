# Road Trip

Enter a start and end location, a start and end time, and whether the trip is one way or a round trip. Road Trip lists the events and activities along the road between the two places, in the style of the Montreal Weekend Board.

Status: early. Trips can be created, listed, read and deleted through the API, and a trip stops being active when its end time passes. The route corridor, the event sources and the listings can be built, and a daily job (Vercel Cron) keeps the listings of active trips up to date. The trip board is not built yet. [PLAN.md](PLAN.md) sequences the rest.

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
    DELETE /api/trips/<id>     also removes the trip's corridor, sources and listings
    POST   /api/trips/<id>/corridor   build the route corridor once (active trips only)
    GET    /api/trips/<id>/corridor   the stored corridor
    POST   /api/trips/<id>/sources    find event sources for the corridor's stops once (needs the corridor)
    GET    /api/trips/<id>/sources    the stored list
    POST   /api/trips/<id>/listings   read the places that are due for events (needs corridor and sources); ?force=1 reads recent ones too
    GET    /api/trips/<id>/listings   the stored listings
    PUT    /api/trips/<id>/listings   the routine posts the listings it read, place by place (REFRESH_SECRET only; see docs/routine-prompt.md)
    GET    /api/refresh        the daily job, called by Vercel Cron with CRON_SECRET; POST runs it by hand with REFRESH_SECRET. It builds each active trip's corridor and sources; it reads the listings itself only when LISTINGS_BY is "cron"

Times carry an offset (`2026-10-16T10:00:00-04:00`). On a round trip, `turnaround` is the instant the return begins; `stay` is instead the minutes to spend at the destination after arriving (give one, not both), and the return's start is then worked out once the route is known. `status` is `upcoming`, `underway` or `ended`; only the first two are refreshed.

## Settings

`AUTH_SECRET`, `BOARD_PASSCODE`, `DOC_SALT`, `REFRESH_SECRET`, `CRON_SECRET` (the same value as `REFRESH_SECRET`; Vercel's scheduler sends it), and the Upstash Redis variables `KV_REST_API_URL` and `KV_REST_API_TOKEN`. `ANTHROPIC_API_KEY` is needed to find sources. Optional: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`; `claude-opus-5-5` costs about twice as much per token, and a model that does not support the effort setting, such as an older generation, is refused), `LISTINGS_BY` (`routine`, the default, or `cron`; see below), `OSM_CONTACT`, an email address or URL that OpenStreetMap's services can reach you at, sent in the user agent as their usage policy asks.

## Finishing setup

The Vercel project exists and is connected to this repository. What is left, in order:

1. **Add the settings** under the Vercel project's Settings, Environment Variables, for Production and Preview. Generate the secrets on your own machine and keep them out of chat and out of the repository. `.env.example` lists every name.

   | Setting | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | Already set |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `BOARD_PASSCODE` | The passcode you will type to sign in |
   | `DOC_SALT` | `openssl rand -hex 16` |
   | `REFRESH_SECRET` | `openssl rand -base64 32` |
   | `CRON_SECRET` | The same value as `REFRESH_SECRET`; Vercel's scheduler sends it when it runs the daily refresh |
   | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Added for you by the Upstash Redis integration (step 2) |

2. **Add Redis.** In the project's Storage tab, add the Upstash Redis integration and connect it to the project.
3. **Redeploy.** New settings apply only to deployments made after they are added.
4. **Check the settings arrived.** Open `/api/health` on the deployment. Every entry under `config` should read `true`. It shows presence only, never a value.
5. **Deployment Protection.** If Vercel Authentication is on, the deployment redirects to a Vercel sign-in page before the app's own passcode. The Montreal Weekend Board turns it off for its project for the same reason. If you keep it on, add the `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret so the preview checks can reach the app.
6. **Repository.** Create a `tests-reviewed` label (a reviewer adds it when a change to an existing test is intended), and in Claude Code accept the project's `rfr-core` plugin when prompted.

## Who reads the listings

Like the Montreal Weekend Board, Road Trip's listings are read by a claude.ai routine, which uses the account's routine allowance and not metered API billing. The routine's instructions are in [docs/routine-prompt.md](docs/routine-prompt.md). Each day it lists the active trips, reads the sources of the places that are due, and posts what it found to `PUT /api/trips/<id>/listings`, which checks the text the same way a read made by this server is checked. The daily cron job still builds each trip's corridor and finds its sources (the second uses the Anthropic API once per trip). Set `LISTINGS_BY=cron` to have the cron job read the listings as well, with the Anthropic API, and leave the routine off. `/api/health` reports which is set.

## Checking against the real services

`npm run live` builds a trip's route corridor from OpenStreetMap and prints the towns along the road with their estimated times. It costs nothing. `LIVE_SOURCES=1 npm run live` also finds event sources with Claude and prints each source, the places left without one, the tokens used, and how many web searches ran. `LIVE_LISTINGS=1 npm run live` goes on to read the first three places (`LIVE_MAX_STOPS` changes that) and prints what it found at each, split into fixed and flexible. Both spend money, so they only run when asked. Set `ANTHROPIC_API_KEY` in your shell first. The trip defaults to Montréal to New York City with a two-day stay; `LIVE_FROM`, `LIVE_TO` and `LIVE_STAY_MIN` change it, and `LIVE_PRICE_PER_MTOK=input,output` adds a token cost using the model's current prices. The full result is also written to `live-output/`, which git ignores. See the header of `live/check.live.ts`.

Project decisions are in [AGENTS.md](AGENTS.md).
