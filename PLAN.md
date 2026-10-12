# Plan

Road Trip follows the Montreal Weekend Board's model: a store of documents, a daily refresh that writes listings, and a board that reads them. The differences are that there are many boards (one per trip), each board covers a road and not a city, and a board stops being refreshed when its trip is over.

One slice per branch and pull request. Update this file when a slice answers an open question or changes a decision, and add the pull request to the slice when its number is known.

## Slices

| # | Slice | Delivers | Pull requests |
|---|---|---|---|
| 1 | Trips and lifecycle | Trip model and validation, one-way and round-trip legs, active/ended status, Redis store, passcode auth, trips API, health check | [#1](https://github.com/lifelike-and-believable/road-trip/pull/1) |
| 2 | Route corridor | Geocode the two places, fetch the driving route, and derive the towns and regions along it with an estimated pass-through window for each (an arrival time per leg, from the route's own duration) | [#3](https://github.com/lifelike-and-believable/road-trip/pull/3) |
| 3 | Event sources | From the corridor, find the listing pages worth reading near each stop (tourism boards, municipal calendars, venue and festival pages, ticketing pages, museum pages) with Claude and web search, mark whether each covers fixed or flexible activities, and store the list with the trip. Reviewed, not fixed: a later refresh may add to it | [#5](https://github.com/lifelike-and-believable/road-trip/pull/5) |
| 4 | Refresh | Listings with a timing kind (fixed or flexible), read by Claude from each stop's sources for the times the traveller is there, and a daily job that keeps the listings of active trips up to date, builds a trip's missing corridor and sources, skips places already passed, and never touches an ended trip | |
| 5 | Trip board | The Montreal board's look: trip form, day sections that fold, category chips, sticky filters, free-or-ticketed marking, stars, and an itinerary. The board offers a larger set of options along the road and the traveller picks one or two stops. The itinerary lists picks in time order with the gap between them and flags overlaps; a fixed pick anchors the day and a flexible pick is placed within its opening hours | |
| 6 | PWA | Installable shell, service worker that never caches `/api`, safe-area handling | |

## Decisions and open questions

- Who reads the sources (slice 4). The Montreal board's refresh is one claude.ai routine, which suits one board. A routine cannot be created per trip from inside the app, so the default here is a server-side job that calls the Anthropic API with web search, holding `ANTHROPIC_API_KEY` as the Montreal board's poster reader does. Confirm before slice 4.
- Geocoding and routing (slice 2). Decided: OpenStreetMap's Nominatim and OSRM, which need no key but have usage policies meant for light use. Requests are paced and the app identifies itself. Replace with a keyed service if a trip count makes that unsuitable. The clients are covered by tests with stubbed replies and were also run once against the live services: a Montréal to Québec round trip with a one-night stay built in about 8 seconds and listed the towns on the Montréal to Québec autoroute in order.
- Schedule (slice 4). Daily on Vercel Cron, as the Montreal board runs daily. A trip made today should be refreshed once on creation so it is not empty until tomorrow.
- A listing is shown only if it falls in the window in which the traveller is passing that part of the road. The route's duration gives an estimate, and the estimate is labelled as one.
- Calling Claude (slice 3). Decided: the official `@anthropic-ai/sdk` with the `web_search_20260209` tool on `claude-opus-5-5`, the default for new Claude work, with server-side refusal fallbacks on. `ANTHROPIC_MODEL` overrides it, since the Montreal board runs on a cheaper model and the cost of a trip scales with its number of stops. Each trip makes one request per five stops, run side by side, each limited to six searches. Not yet measured: the cost of a trip, and the quality of the sources found.
- Reading the sources (slice 4). Decided: one request per place, with the web search and web fetch tools, so the model reads the pages named for that place and may search for more there. A daily job reads each place once a day while the traveller has yet to pass it. Not yet measured: the cost of a refresh, which scales with the number of places, and how good the listings are. `LIVE_LISTINGS=1 npm run live` reads three places so both can be judged before the job is turned on. The schedule is `0 10 * * *` UTC, once a day like the Montreal board's refresh. Vercel's limits on cron frequency for the project's plan were not checked. The 300 second function limit set on the sources, listings and refresh routes has been accepted by Vercel's builds.
