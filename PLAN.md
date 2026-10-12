# Plan

Road Trip follows the Montreal Weekend Board's model: a store of documents, a daily refresh that writes listings, and a board that reads them. The differences are that there are many boards (one per trip), each board covers a road and not a city, and a board stops being refreshed when its trip is over.

One slice per branch and pull request. Update this file when a slice answers an open question or changes a decision, and add the pull request to the slice when its number is known.

## Slices

| # | Slice | Delivers | Pull requests |
|---|---|---|---|
| 1 | Trips and lifecycle | Trip model and validation, one-way and round-trip legs, active/ended status, Redis store, passcode auth, trips API, health check | [#1](https://github.com/lifelike-and-believable/road-trip/pull/1) |
| 2 | Route corridor | Geocode the two places, fetch the driving route, and derive the towns and regions along it with an estimated pass-through window for each (an arrival time per leg, from the route's own duration) | |
| 3 | Event sources | From the corridor, build a list of sources per trip (tourism boards, municipal calendars, venue and festival pages, ticketing pages) and store it with the trip. The list is reviewed, not fixed: a later refresh may add to it | |
| 4 | Refresh | A scheduled job reads each source for active trips only, writes listings with their place along the route and the window in which the traveller is there, and skips and leaves alone any trip whose end has passed | |
| 5 | Trip board | The Montreal board's look: trip form, day sections that fold, category chips, sticky filters, free-or-ticketed marking, stars, and a picks itinerary | |
| 6 | PWA | Installable shell, service worker that never caches `/api`, safe-area handling | |

## Decisions and open questions

- Who reads the sources (slice 4). The Montreal board's refresh is one claude.ai routine, which suits one board. A routine cannot be created per trip from inside the app, so the default here is a server-side job that calls the Anthropic API with web search, holding `ANTHROPIC_API_KEY` as the Montreal board's poster reader does. Confirm before slice 4.
- Geocoding and routing (slice 2). Decided: OpenStreetMap's Nominatim and OSRM, which need no key but have usage policies meant for light use. Requests are paced and the app identifies itself. Replace with a keyed service if a trip count makes that unsuitable. The response shapes the code relies on were written from the services' documentation and are covered by tests with stubbed replies; they have not been run against the live services from a development environment.
- Schedule (slice 4). Daily on Vercel Cron, as the Montreal board runs daily. A trip made today should be refreshed once on creation so it is not empty until tomorrow.
- A listing is shown only if it falls in the window in which the traveller is passing that part of the road. The route's duration gives an estimate, and the estimate is labelled as one.
