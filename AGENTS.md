<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Road Trip

Given a start and end location, a start and end time, and whether the trip is a round trip or one way, Road Trip lists events and activities along the road between the two points, for the dates and times of the trip. It is for people planning a drive who want to know what is on along the way. The look and the behaviour of the list follow the Montreal Weekend Board (the lifelike-and-believable/montreal-weekend-board repository).

## Commands

- Verify (run before reporting work as done, and include its output): `npm run verify`
- Dev server: `npm run dev` (check for one already running first)

## Project decisions

- Next.js 16, React, TypeScript, Node runtime on Vercel. No relational database until a feature needs one; record the choice here when it does.
- Input: start place, end place, start date and time, end date and time, and a one-way or round-trip choice. A round trip lists the outbound and return legs separately, and the return leg uses the return times.
- Output: events and activities near the route, grouped by day and ordered by time, so a listing is shown only if it falls inside the window in which the traveller is passing that part of the road.
- Style carried over from the Montreal Weekend Board: day sections that fold, category chips, a sticky filter bar, a star on each entry that means "I like this" without claiming attendance, a picks itinerary that reports the gap between consecutive picks, free-or-ticketed marking, and an installable PWA with safe-area handling for standalone mode.
- Where the Montreal board says only what it knows (it never invents a distance or journey time), Road Trip does the same. Show a detour or drive time only when a routing service supplied it, and label what it was supplied by.
- Trips are stored in Redis (Upstash, via Vercel Storage) as `trips/<id>`, reached over its REST interface with `fetch`, the way the Montreal board's store module does. Settings: `AUTH_SECRET`, `APP_PASSCODE` (one shared passcode and a signed cookie), `DOC_SALT`, `REFRESH_SECRET` (bearer token for the refresh job), `KV_REST_API_URL`, `KV_REST_API_TOKEN`. The health route reports which are present.
- Times are instants. The form sends them with the traveller's offset; the server rejects a time with no offset. `tz` is kept for display only.
- A round trip has an outbound and a return leg, split at `turnaround` when given and at the midpoint of the window when not.
- A trip is active from the moment it is made until its end instant (`isActive` in `src/lib/trip.ts`). Only active trips are refreshed. An ended trip is never changed again but stays readable, with `status: "ended"`.
- Listings, geocoding, and routing come from services chosen in a later slice (see `PLAN.md`). Record each choice and its API key variable here when made.
- Canadian English in all user-facing text.

Rules for this project are in `.claude/rules/`. Leave any tool-managed blocks in this file (such as the Next.js `nextjs-agent-rules` markers) as they are.
