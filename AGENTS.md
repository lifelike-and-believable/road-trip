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
- Live check against the real map and Claude services (not part of verify): `npm run live`; add `LIVE_SOURCES=1` to also find sources, which spends money. Never run it unprompted.

## Project decisions

- Next.js 16, React, TypeScript, Node runtime on Vercel. No relational database until a feature needs one; record the choice here when it does.
- Input: start place, end place, start date and time, end date and time, and a one-way or round-trip choice. A round trip lists the outbound and return legs separately, and the return leg uses the return times.
- Output: events and activities near the route, grouped by day and ordered by time, so a listing is shown only if it falls inside the window in which the traveller is passing that part of the road.
- Style carried over from the Montreal Weekend Board: day sections that fold, category chips, a sticky filter bar, a star on each entry that means "I like this" without claiming attendance, a picks itinerary that reports the gap between consecutive picks, free-or-ticketed marking, and an installable PWA with safe-area handling for standalone mode.
- Where the Montreal board says only what it knows (it never invents a distance or journey time), Road Trip does the same. Show a detour or drive time only when a routing service supplied it, and label what it was supplied by.
- Trips are stored in Redis (Upstash, via Vercel Storage) as `trips/<id>`, reached over its REST interface with `fetch`, the way the Montreal board's store module does. Settings: `AUTH_SECRET`, `APP_PASSCODE` (one shared passcode and a signed cookie), `DOC_SALT`, `REFRESH_SECRET` (bearer token for the refresh job), `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `ANTHROPIC_API_KEY`, and optionally `ANTHROPIC_MODEL` (default `claude-opus-5-5`). The health route reports which are present.
- Times are instants. The form sends them with the traveller's offset; the server rejects a time with no offset. `tz` is kept for display only.
- A round trip has an outbound and a return leg. The return begins at `turnaround` (an instant) when given, or at outbound arrival plus `stay` (minutes at the destination) when that is given instead; the two are exclusive. With neither, the split is the midpoint of the window. Arrival depends on the drive time, which only the route knows, so with a `stay` the outbound end and return start are null (`legsOf` in `src/lib/trip.ts`) until the corridor resolves them.
- A trip is active from the moment it is made until its end instant (`isActive` in `src/lib/trip.ts`). Only active trips are refreshed. An ended trip is never changed again but stays readable, with `status: "ended"`.
- Geocoding and routing use OpenStreetMap's public services: Nominatim to find places and name the towns along the road, and OSRM's demo server for the driving route (`src/lib/osm.ts`). Neither needs a key. They are meant for light use, so Nominatim requests are paced at one every 1.1 seconds and the app identifies itself in the user agent; set `OSM_CONTACT` to an email address or URL for that. Replace them with a keyed service if volume outgrows them.
- The corridor (`src/lib/corridor.ts`) is stored as `corridors/<id>` and built once per trip, only while the trip is active. The return leg of a round trip reuses the outbound road in reverse, and the corridor is where a `stay` becomes times: the destination is held from arrival for the stay and the return starts then. Passing times are the route's driving time spread evenly over its length, without traffic or stops, and the corridor says so in `sources.timing`; show them as estimates.
- Event sources (`src/lib/sources.ts`, `src/lib/anthropic.ts`) are found by Claude with web search, through Anthropic's official TypeScript SDK, from the corridor's stops in groups of five. A source is a listing page, never a single event, and records the stops it covers and whether it covers fixed activities (concerts, plays: a set start time), flexible ones (museums, parks: visited within opening hours), or both. The model's reply is built from web pages and is treated as untrusted: only https URLs on real hosts survive, with the query string removed, and only known kinds and stops that were asked about. The list is stored as `sources/<id>`, built once per active trip, and either every request succeeds or nothing is stored.
- Listings (slice 4) carry a timing kind. A fixed listing has a start time and a length. A flexible listing has opening hours and a typical visit length. The trip board (slice 5) offers a larger set of options along the road, from which the traveller picks one or two stops, and builds an itinerary like the Montreal board's: picks in time order, the gap between picks, overlaps flagged, with a fixed pick anchoring the day and a flexible pick placed within its hours. Gaps use the corridor's drive times; a detour is shown only when a routing service supplied it.
- Canadian English in all user-facing text.

Rules for this project are in `.claude/rules/`. Leave any tool-managed blocks in this file (such as the Next.js `nextjs-agent-rules` markers) as they are.
