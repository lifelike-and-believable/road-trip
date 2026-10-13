"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { BAND_LABELS, boardDays, buildItinerary, groupDay, localDay, localTime, type Pick } from "../lib/board";
import type { Category, Listing } from "../lib/listing";
import { CATEGORY_LABELS, categoriesIn, filterDays, type Filters } from "../lib/filters";
import { dateRangeLabel, dayLabel, dayParts } from "../lib/format";
import { call, post, put, type BoardData, type Reply } from "./api";
import { CATEGORY_COLOR } from "./categories";
import { ItineraryView } from "./itinerary-view";
import { OptionCard } from "./option-card";

type Load = { kind: "loading" } | { kind: "error"; status: number; message: string } | { kind: "ready"; data: BoardData };
type Plan = { picks: Pick[]; starred: string[] };

const NO_FILTERS: Filters = { categories: new Set(), freeOnly: false, starredOnly: false };

export function BoardScreen() {
  const { id } = useParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [plan, setPlan] = useState<Plan>({ picks: [], starred: [] });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [working, setWorking] = useState<"route" | "sources" | null>(null);
  const [workError, setWorkError] = useState<string | null>(null);
  // A day the traveller has opened or folded by hand; a day that is already past starts folded.
  const [folds, setFolds] = useState<Record<string, boolean>>({});

  const apply = useCallback((r: Reply<BoardData>) => {
    if (r.ok) {
      setLoad({ kind: "ready", data: r.value });
      setPlan({ picks: r.value.plan.picks, starred: r.value.plan.starred });
    } else {
      setLoad({ kind: "error", status: r.status, message: r.message });
    }
  }, []);

  // Loaded once the trip's id is known; a late reply for a trip the traveller has left is dropped.
  useEffect(() => {
    let live = true;
    void call<BoardData>(`/api/trips/${id}/board`).then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [id, apply]);

  const refresh = async () => apply(await call<BoardData>(`/api/trips/${id}/board`));

  const data = load.kind === "ready" ? load.data : null;
  const tz = data?.trip.tz;
  const locked = data?.trip.status === "ended";

  const days = useMemo(() => (data?.corridor ? boardDays(data.corridor, data.listings, tz) : []), [data, tz]);
  const starredSet = useMemo(() => new Set(plan.starred), [plan.starred]);
  const shown = useMemo(() => filterDays(days, filters, starredSet), [days, filters, starredSet]);
  const categories = useMemo(() => categoriesIn(days), [days]);
  const byId = useMemo(() => {
    const m = new Map<string, { listing: Listing; stop: string }>();
    for (const [stop, entry] of Object.entries(data?.listings?.stops ?? {})) for (const listing of entry.listings) m.set(listing.id, { listing, stop });
    return m;
  }, [data]);
  const itinerary = useMemo(
    () => (data?.corridor ? buildItinerary(plan.picks, byId, data.corridor) : { items: [], gaps: [], missing: [] }),
    [plan.picks, byId, data],
  );

  async function save(next: Plan) {
    setPlan(next);
    const r = await put(`/api/trips/${id}/plan`, next);
    setSaveError(r.ok ? null : r.message);
  }

  const togglePick = (listingId: string) =>
    void save({
      ...plan,
      picks: plan.picks.some((p) => p.id === listingId) ? plan.picks.filter((p) => p.id !== listingId) : [...plan.picks, { id: listingId }],
    });
  const toggleStar = (listingId: string) =>
    void save({ ...plan, starred: starredSet.has(listingId) ? plan.starred.filter((s) => s !== listingId) : [...plan.starred, listingId] });
  const clearMissing = () => void save({ ...plan, picks: plan.picks.filter((p) => !itinerary.missing.includes(p.id)) });

  async function build(what: "route" | "sources") {
    setWorking(what);
    setWorkError(null);
    const r = await post(`/api/trips/${id}/${what === "route" ? "corridor" : "sources"}`);
    setWorking(null);
    if (!r.ok) setWorkError(r.message);
    await refresh();
  }

  if (load.kind === "loading") {
    return (
      <main className="shell">
        <p role="status" className="muted">
          Loading the trip…
        </p>
      </main>
    );
  }
  if (load.kind === "error") {
    return (
      <main className="shell stack">
        <p className="alert" role="alert">
          {load.status === 401 ? "You are signed out." : load.status === 404 ? "There is no such trip." : load.message}
        </p>
        <p>
          <Link href="/">Back to your trips</Link>
        </p>
      </main>
    );
  }

  const { trip, corridor, sources, listings } = load.data;
  const today = localDay(new Date().toISOString(), tz);
  const total = days.reduce((n, d) => n + d.options.length, 0);
  const count = shown.reduce((n, d) => n + d.options.length, 0);
  const filtering = filters.categories.size > 0 || filters.freeOnly || filters.starredOnly;
  const toggleCategory = (c: Category) =>
    setFilters((f) => {
      const next = new Set(f.categories);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { ...f, categories: next };
    });

  return (
    <>
      <header className="top">
        <div className="inner">
          <div className="brand">
            <p className="kicker">
              <Link href="/">All trips</Link>
            </p>
            <h1>
              {trip.from.label} <span className="em">to</span> {trip.to.label}
            </h1>
            <p className="dateline">
              {dateRangeLabel(localDay(trip.start, tz), localDay(trip.end, tz))} · {trip.roundTrip ? "Round trip" : "One way"} ·{" "}
              <span className="badge">{trip.status}</span>
            </p>
          </div>
          {listings && (
            <div className="stamp">
              Listings last read {dayLabel(localDay(listings.updatedAt, tz))}, {localTime(listings.updatedAt, tz)}
              <br />
              Times are in {tz ?? "UTC"}
            </div>
          )}
        </div>
      </header>
      <main className="shell">
        <div className="stack">
          {locked && <p className="note">This trip is over. The board is read-only.</p>}
          {saveError && (
            <p className="alert" role="alert">
              Your last change was not saved: {saveError}
            </p>
          )}
          {workError && (
            <p className="alert" role="alert">
              {workError}
            </p>
          )}
          {!corridor && !locked && (
            <section className="note stack" aria-label="Route">
              <p style={{ margin: 0 }}>The route has not been worked out yet. It is built once a day, or you can build it now.</p>
              <div>
                <button className="btn" type="button" disabled={working !== null} onClick={() => void build("route")}>
                  {working === "route" ? "Building the route…" : "Build the route now"}
                </button>
              </div>
            </section>
          )}
          {corridor && !sources && !locked && (
            <section className="note stack" aria-label="Sources">
              <p style={{ margin: 0 }}>The route is ready. Next, the pages that list events along it are found, once a day or now.</p>
              <div>
                <button className="btn" type="button" disabled={working !== null} onClick={() => void build("sources")}>
                  {working === "sources" ? "Finding sources…" : "Find sources now"}
                </button>
              </div>
            </section>
          )}
          {corridor && sources && !listings && (
            <p className="note">
              {sources.count} {sources.count === 1 ? "page" : "pages"} found. No listings yet: they are read from those pages each day for the
              times you will be at each place.
            </p>
          )}
        </div>

        {corridor && total > 0 && (
          <div className="filters" role="group" aria-label="Filters">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={filters.categories.has(c)}
                style={{ "--catc": CATEGORY_COLOR[c] } as CSSProperties}
                onClick={() => toggleCategory(c)}
              >
                <span className="dot" aria-hidden="true" />
                {CATEGORY_LABELS[c]}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={filters.freeOnly} onClick={() => setFilters((f) => ({ ...f, freeOnly: !f.freeOnly }))}>
              Free only
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={filters.starredOnly}
              onClick={() => setFilters((f) => ({ ...f, starredOnly: !f.starredOnly }))}
            >
              <span aria-hidden="true">★</span> Starred
            </button>
            {filtering && (
              <button type="button" className="chip" onClick={() => setFilters(NO_FILTERS)}>
                Clear filters
              </button>
            )}
            <span className="small muted" role="status">
              {count} of {total} shown
            </span>
          </div>
        )}

        {corridor && (
          <div className="layout">
            <section aria-labelledby="options-title">
              <h2 id="options-title" className="sr-only">
                What is on along the road
              </h2>
              {total === 0 && sources && listings && <p className="note">Nothing found yet for the times you will be at each place.</p>}
              {total > 0 && count === 0 && <p className="note">Nothing matches these filters.</p>}
              {shown.map((d) => {
                const folded = folds[d.day] ?? d.day < today;
                const { weekday, date } = dayParts(d.day);
                const groups = groupDay(d.options, tz);
                const card = (o: (typeof d.options)[number]) => (
                  <OptionCard
                    key={`${d.day}:${o.id}`}
                    option={o}
                    tz={tz}
                    picked={plan.picks.some((p) => p.id === o.id)}
                    starred={starredSet.has(o.id)}
                    locked={locked}
                    onPick={() => togglePick(o.id)}
                    onStar={() => toggleStar(o.id)}
                  />
                );
                return (
                  <section key={d.day} className={`day${folded ? " is-folded" : ""}`}>
                    <button
                      type="button"
                      className="day-head"
                      aria-expanded={!folded}
                      aria-controls={`day-${d.day}`}
                      onClick={() => setFolds((f) => ({ ...f, [d.day]: !folded }))}
                    >
                      <span className="dnum">{weekday}</span>{" "}
                      <span className="dsub">
                        {date} · {d.options.length === 1 ? "1 listing" : `${d.options.length} listings`}
                      </span>
                      <svg className="day-fold" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div className="day-body" id={`day-${d.day}`}>
                      {groups.open.length > 0 && (
                        <div className="band">
                          <h3 className="band-label">
                            Open today <span className="bct">{groups.open.length}</span>
                          </h3>
                          <div className="runs" style={{ marginTop: 12 }}>
                            {groups.open.map(card)}
                          </div>
                        </div>
                      )}
                      {groups.bands.map((b) => (
                        <div key={b.band} className="band">
                          <h3 className="band-label">
                            {BAND_LABELS[b.band]} <span className="bct">{b.options.length}</span>
                          </h3>
                          {b.options.map(card)}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </section>
            <section className="plan card stack" aria-labelledby="plan-title">
              <h2 id="plan-title">
                Your plan {plan.picks.length > 0 && <span className="dcount">{plan.picks.length}</span>}
              </h2>
              <ItineraryView itinerary={itinerary} tz={tz} routing={corridor.sources.routing} locked={locked} onRemove={togglePick} onClearMissing={clearMissing} />
            </section>
          </div>
        )}
      </main>
    </>
  );
}
