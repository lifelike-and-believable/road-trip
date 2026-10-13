"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BAND_LABELS, boardDays, buildItinerary, groupDay, instantIn, localDay, localTime, passingNote, placesOf, stopSummaries, type Pick } from "../lib/board";
import type { Category, Listing } from "../lib/listing";
import { CATEGORY_LABELS, categoriesIn, filterDays, withoutHidden, type Filters } from "../lib/filters";
import { dateRangeLabel, dayLabel, dayParts, durationLabel, statusLabel, zoneName } from "../lib/format";
import { browserStorage, readFolds, writeFolds, type Folds } from "../lib/folds";
import { planText } from "../lib/plan-text";
import { describePrep } from "../lib/prep";
import { call, post, put, type BoardData, type Reply } from "./api";
import { CATEGORY_COLOR } from "./categories";
import { DeleteTrip } from "./delete-trip";
import { ItineraryView } from "./itinerary-view";
import { OptionCard } from "./option-card";
import { PrepPanel } from "./prep-panel";
import { useToast } from "./toast";

// Leaflet reads the window when it loads, so the map is left out of the server's render and loaded on its own.
const RouteMap = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => (
    <p className="muted small" role="status">
      Loading the map…
    </p>
  ),
});

type Load = { kind: "loading" } | { kind: "error"; status: number; message: string } | { kind: "ready"; data: BoardData };
type Plan = { picks: Pick[]; starred: string[]; hidden: string[] };

const PREP_POLL_MS = 5000;

/** How many places have been found, counting each listing once. */
function placeCount(data: BoardData): number {
  return Object.values(data.listings?.stops ?? {}).reduce((n, e) => n + e.listings.length, 0);
}

const NO_FILTERS: Filters = { categories: new Set(), freeOnly: false, starredOnly: false };

export function BoardScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [plan, setPlan] = useState<Plan>({ picks: [], starred: [], hidden: [] });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // A save the server refused: its status, and the plan to send again on Try again.
  const [saveFailure, setSaveFailure] = useState<{ status: number; plan: Plan } | null>(null);
  // The plan as the server last confirmed it, which a failed save puts back on screen.
  const savedPlan = useRef<Plan>({ picks: [], starred: [], hidden: [] });
  // Saves go one at a time and the newest waiting one is sent next, so a slow save cannot land after a later one.
  const sending = useRef(false);
  const waiting = useRef<Plan | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  // The time the panel judges "taking too long" against; moved on with each look at the server.
  const [now, setNow] = useState(() => new Date());
  const startedPrep = useRef(false);
  // A day the traveller has opened or folded by hand; a day that is already past starts folded.
  const [folds, setFolds] = useState<Folds>(() => readFolds(browserStorage(), id));
  const [planOpen, setPlanOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const drawerToggle = useRef<HTMLButtonElement>(null);
  const hiddenChip = useRef<HTMLButtonElement>(null);
  // Where focus goes once the next render has taken away the control that had it.
  const focusAfter = useRef<HTMLElement | "hidden-chip" | "drawer-toggle" | "copy-box" | null>(null);
  const copyBox = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const named = { "hidden-chip": hiddenChip.current, "drawer-toggle": drawerToggle.current, "copy-box": copyBox.current };
    (typeof target === "string" ? named[target] : target)?.focus();
  });
  const [showHidden, setShowHidden] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const mapBlock = useRef<HTMLDivElement>(null);
  // The plan's text, shown for the traveller to copy by hand when the browser would not let it be copied.
  const [copyText, setCopyText] = useState<string | null>(null);
  // The picks Clear took away, kept so the plan bar can offer to put them back until something new is picked.
  const [cleared, setCleared] = useState<Pick[] | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  // Clear leaves the page when the plan empties, so focus moves to the button that replaces it.
  useEffect(() => {
    if (cleared) undoButton.current?.focus();
  }, [cleared]);
  const { toast, show } = useToast();

  const apply = useCallback((r: Reply<BoardData>) => {
    if (r.ok) {
      setLoad({ kind: "ready", data: r.value });
      const loaded = { picks: r.value.plan.picks, starred: r.value.plan.starred, hidden: r.value.plan.hidden ?? [] };
      savedPlan.current = loaded;
      setPlan(loaded);
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

  // A look at the server that leaves the traveller's own plan alone, so it can never undo a pick that is still being saved.
  const look = useCallback(async () => {
    const r = await call<BoardData>(`/api/trips/${id}/board`);
    if (r.ok) setLoad({ kind: "ready", data: r.value });
    setNow(new Date());
  }, [id]);

  const data = load.kind === "ready" ? load.data : null;
  const tz = data?.trip.tz;
  const locked = data?.trip.status === "ended";

  const days = useMemo(() => (data?.corridor ? boardDays(data.corridor, data.listings, tz) : []), [data, tz]);
  const starredSet = useMemo(() => new Set(plan.starred), [plan.starred]);
  const hiddenSet = useMemo(() => new Set(plan.hidden), [plan.hidden]);
  // What the traveller has hidden is left out, unless the Hidden chip is on to bring entries back.
  const visibleDays = useMemo(() => (showHidden ? days : withoutHidden(days, hiddenSet)), [days, hiddenSet, showHidden]);
  const shown = useMemo(() => filterDays(visibleDays, filters, starredSet), [visibleDays, filters, starredSet]);
  const categories = useMemo(() => categoriesIn(visibleDays), [visibleDays]);
  const byId = useMemo(() => {
    const m = new Map<string, { listing: Listing; stop: string }>();
    for (const [stop, entry] of Object.entries(data?.listings?.stops ?? {})) for (const listing of entry.listings) m.set(listing.id, { listing, stop });
    return m;
  }, [data]);
  const places = useMemo(() => placesOf(shown, plan.picks), [shown, plan.picks]);
  const stops = useMemo(
    () => (data?.corridor ? stopSummaries(data.corridor, visibleDays, plan.picks, byId) : []),
    [data, visibleDays, plan.picks, byId],
  );
  const itinerary = useMemo(
    () => (data?.corridor ? buildItinerary(plan.picks, byId, data.corridor, tz) : { items: [], gaps: [], missing: [] }),
    [plan.picks, byId, data, tz],
  );

  const prepView = useMemo(
    () => (data ? describePrep(data.prep, {
      corridor: !!data.corridor, sources: !!data.sources, listings: placeCount(data),
      stops: data.corridor?.legs.reduce((n, l) => n + l.stops.length, 0),
    }, now) : null),
    [data, now],
  );
  const preparing = !!data && !locked && !!prepView && placeCount(data) === 0;

  useEffect(() => {
    if (data) document.title = `${data.trip.from.label} to ${data.trip.to.label} · Road Trip`;
  }, [data]);

  // Escape closes the itinerary wherever focus is; from inside it, focus goes back to its button.
  useEffect(() => {
    if (!planOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drawer.current?.contains(document.activeElement)) focusAfter.current = "drawer-toggle";
      setPlanOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [planOpen]);

  // The page keeps room for the plan bar at its measured height, which grows when it wraps on a phone or opens.
  const hasDrawer = !!data?.corridor;
  useEffect(() => {
    const el = drawer.current;
    if (!hasDrawer || !el) return;
    const root = document.documentElement;
    const watch = new ResizeObserver(() => root.style.setProperty("--drawer-h", `${el.offsetHeight}px`));
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty("--drawer-h");
    };
  }, [hasDrawer]);

  // A trip that was never started (made before trips started themselves) is started when its board opens.
  useEffect(() => {
    if (!preparing || !prepView?.needsStart || startedPrep.current) return;
    startedPrep.current = true;
    void startPrep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing, prepView?.needsStart]);

  // While the work is going on, look again every few seconds.
  useEffect(() => {
    if (!preparing || prepView?.settled) return;
    const timer = setInterval(() => void look(), PREP_POLL_MS);
    return () => clearInterval(timer);
  }, [preparing, prepView?.settled, look]);

  async function save(next: Plan) {
    setPlan(next);
    if (next.picks.length > 0) setCleared(null);
    setSaveFailure(null);
    waiting.current = next;
    if (sending.current) return;
    sending.current = true;
    while (waiting.current) {
      const attempt = waiting.current;
      waiting.current = null;
      const r = await put(`/api/trips/${id}/plan`, attempt);
      if (r.ok) {
        savedPlan.current = attempt;
        continue;
      }
      // Anything waiting was made on top of the refused plan, so it is offered again as one.
      setSaveFailure({ status: r.status, plan: waiting.current ?? attempt });
      waiting.current = null;
      setPlan(savedPlan.current);
      show("Not saved");
    }
    sending.current = false;
  }

  // A flexible pick carries the day of the card it came from, so the itinerary keeps it on that day.
  const togglePick = (listingId: string, day?: string) => {
    const on = plan.picks.some((p) => p.id === listingId);
    const added: Pick = day ? { id: listingId, day } : { id: listingId };
    void save({ ...plan, picks: on ? plan.picks.filter((p) => p.id !== listingId) : [...plan.picks, added] });
    show(on ? "Removed from your plan" : "Added to your plan");
  };
  // A time set in the itinerary is read on the pick's day in the trip's zone; an empty one goes back to the suggested time.
  const setPickTime = (listingId: string, day: string, time: string) => {
    const at = time ? instantIn(day, time, tz) : null;
    if (time && !at) return show("That time does not exist that day");
    const picks = plan.picks.map((p) => {
      if (p.id !== listingId) return p;
      const kept: Pick = p.day ? { id: p.id, day: p.day } : { id: p.id };
      return at ? { ...kept, at } : kept;
    });
    void save({ ...plan, picks });
  };
  const toggleStar = (listingId: string) =>
    void save({ ...plan, starred: starredSet.has(listingId) ? plan.starred.filter((s) => s !== listingId) : [...plan.starred, listingId] });
  // Hiding also takes the entry off the plan, since a plan should not hold something that is out of sight.
  const hide = (listingId: string, from: HTMLElement) => {
    // The card leaves the page unless hidden entries are showing, so focus moves to the next entry that day,
    // or the one before, or to the Hidden chip that brings entries back.
    const article = from.closest("article");
    if (showHidden) focusAfter.current = article;
    else {
      const cards = [...(from.closest(".day")?.querySelectorAll<HTMLElement>("article[data-listing]") ?? [])];
      const at = article ? cards.indexOf(article) : -1;
      const other = (list: HTMLElement[]) => list.find((c) => c.dataset.listing !== listingId);
      focusAfter.current = other(cards.slice(at + 1)) ?? other(cards.slice(0, Math.max(at, 0)).reverse()) ?? "hidden-chip";
    }
    void save({ ...plan, picks: plan.picks.filter((p) => p.id !== listingId), hidden: [...plan.hidden, listingId] });
    show("Hidden. Bring it back from the filter bar.");
  };
  const unhide = (listingId: string) => {
    const hidden = plan.hidden.filter((h) => h !== listingId);
    void save({ ...plan, hidden });
    if (hidden.length === 0) setShowHidden(false);
    show("Back on the board");
  };
  const clearPlan = () => {
    setCleared(plan.picks);
    void save({ ...plan, picks: [] });
    setCopyText(null);
    show("Plan cleared");
  };
  const undoClear = () => {
    if (!cleared) return;
    // Anything hidden since stays off the plan, as hiding always takes it off.
    void save({ ...plan, picks: cleared.filter((p) => !hiddenSet.has(p.id)) });
    show("Plan put back");
  };
  async function copyPlan(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyText(null);
      show("Plan copied");
    } catch {
      // The text goes in the plan, which may be closed, so it opens and the text is ready to select.
      setCopyText(text);
      setPlanOpen(true);
      focusAfter.current = "copy-box";
      show("Copy failed. Select the text below.");
    }
  }
  const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const showOnMap = (listingId: string) => {
    setFocus((f) => ({ id: listingId, n: (f?.n ?? 0) + 1 }));
    mapBlock.current?.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
  };
  // A pin was chosen on the map: take the traveller to its card and mark it for a moment.
  const showCard = (listingId: string) => {
    const all = [...document.querySelectorAll<HTMLElement>(`[data-listing="${listingId}"]`)];
    const el = all.find((c) => !c.closest(".day.is-folded")) ?? all[0];
    if (!el) return;
    // Its only card is in a folded day: open the day, and focus the card once it shows.
    const day = el.closest<HTMLElement>(".day.is-folded")?.dataset.day;
    if (day) {
      toggleFold(day, true);
      focusAfter.current = el;
      return;
    }
    el.scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  };
  const toggleFold = (day: string, folded: boolean) => {
    const next = { ...folds, [day]: !folded };
    setFolds(next);
    writeFolds(browserStorage(), id, next);
  };
  const clearMissing = () => void save({ ...plan, picks: plan.picks.filter((p) => !itinerary.missing.includes(p.id)) });

  async function startPrep() {
    setRetrying(true);
    setWorkError(null);
    const r = await post(`/api/trips/${id}/prepare`);
    setRetrying(false);
    if (!r.ok) setWorkError(r.message);
    await look();
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
        <p className="row">
          {load.status === 401 ? (
            <Link href="/">Sign in again</Link>
          ) : (
            <>
              {load.status !== 404 && (
                <button type="button" className="btn" onClick={() => void call<BoardData>(`/api/trips/${id}/board`).then(apply)}>
                  Try again
                </button>
              )}
              <Link href="/">Back to your trips</Link>
            </>
          )}
        </p>
      </main>
    );
  }

  const { trip, corridor, sources, listings } = load.data;
  const today = localDay(new Date().toISOString(), tz);
  const total = visibleDays.reduce((n, d) => n + d.options.length, 0);
  const found = days.reduce((n, d) => n + d.options.length, 0);
  const count = shown.reduce((n, d) => n + d.options.length, 0);
  const filtering = filters.categories.size > 0 || filters.freeOnly || filters.starredOnly || filters.stop !== undefined;
  const toggleStop = (name: string) => setFilters((f) => ({ ...f, stop: f.stop === name ? undefined : name }));
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
              <span className="badge">{statusLabel(trip.status)}</span>
            </p>
            <div className="trip-actions">
              <DeleteTrip tripId={trip.id} name={`${trip.from.label} to ${trip.to.label}`} label="Delete this trip" onDeleted={() => router.push("/")} />
            </div>
          </div>
          {listings && (
            <div className="stamp">
              Listings last read {dayLabel(localDay(listings.updatedAt, tz))}, {localTime(listings.updatedAt, tz)}
              <br />
              Times are in {zoneName(tz, trip.start)}
            </div>
          )}
        </div>
      </header>
      <main className={`shell${corridor ? " has-drawer" : ""}`}>
        <div className="stack">
          {locked && <p className="note">This trip is over. The board is read-only.</p>}
          {corridor?.legs
            .filter((l) => !l.fits)
            .map((l) => (
              <p key={l.id} className="note">
                {l.id === "back"
                  ? `The drive back takes about ${durationLabel(l.driveMinutes)}, longer than the time you gave for it, so the times on the way back may not work.`
                  : `The drive there takes about ${durationLabel(l.driveMinutes)}, longer than the time you gave for it, so the times on the way may not work.`}
              </p>
            ))}
          {saveFailure && (
            <p className="alert" role="alert">
              {saveFailure.status === 401 ? (
                <>
                  Your last change was not saved because you have been signed out. <Link href="/">Sign in again</Link>
                </>
              ) : saveFailure.status === 409 ? (
                "Your last change was not saved because this trip is over."
              ) : (
                <>
                  Your last change was not saved. The board shows your plan as it was.{" "}
                  <button type="button" className="btn secondary" onClick={() => void save(saveFailure.plan)}>
                    Try again
                  </button>
                </>
              )}
            </p>
          )}
          {workError && (
            <p className="alert" role="alert">
              {workError}
            </p>
          )}
          {preparing && prepView && <PrepPanel steps={prepView.steps} canRetry={prepView.canRetry} retrying={retrying} onRetry={() => void startPrep()} />}
        </div>

        {corridor && found > 0 && (
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
            {plan.hidden.length > 0 && (
              <button type="button" className="chip" ref={hiddenChip} aria-pressed={showHidden} onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? `Showing ${plan.hidden.length} hidden` : `${plan.hidden.length} hidden`}
              </button>
            )}
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
              {(stops.length > 0 || corridor.line) && (
                <div className="mapblock" ref={mapBlock}>
                  <RouteMap
                    corridor={corridor}
                    stops={stops}
                    selected={filters.stop ?? null}
                    onSelect={toggleStop}
                    places={places}
                    focus={focus}
                    onPlace={showCard}
                  />
                  {stops.length > 0 && (
                    <div className="stops" role="group" aria-label="Stops along the road">
                      {stops.map((s) => (
                        <button key={s.name} type="button" className="chip" aria-pressed={filters.stop === s.name} onClick={() => toggleStop(s.name)}>
                          {s.name} <span className="bct">{s.count}</span>
                          <span className="sr-only">{s.count === 1 ? " listing" : " listings"}</span>
                          {s.picked && <span className="sr-only"> (has a pick on your plan)</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {found > 0 && <p className="small muted">{corridor.sources.timing}</p>}
              {found === 0 && sources && listings && <p className="note">Nothing found yet for the times you will be at each place.</p>}
              {found > 0 && total === 0 && <p className="note">Everything found is hidden. Use the hidden chip above to bring entries back.</p>}
              {total > 0 && count === 0 && <p className="note">Nothing matches these filters.</p>}
              <div className="days">
              {shown.map((d) => {
                const folded = folds[d.day] ?? d.day < today;
                const { weekday, date } = dayParts(d.day);
                const groups = groupDay(d.options, tz);
                const card = (o: (typeof d.options)[number]) => (
                  <OptionCard
                    key={`${d.day}:${o.id}`}
                    option={o}
                    tz={tz}
                    passing={passingNote(corridor, o.stop, d.day, tz)}
                    picked={plan.picks.some((p) => p.id === o.id)}
                    starred={starredSet.has(o.id)}
                    hidden={hiddenSet.has(o.id)}
                    locked={locked}
                    onPick={() => togglePick(o.id, o.kind === "flexible" ? d.day : undefined)}
                    onStar={() => toggleStar(o.id)}
                    onHide={(from) => hide(o.id, from)}
                    onUnhide={() => unhide(o.id)}
                    onMap={() => showOnMap(o.id)}
                  />
                );
                return (
                  <section key={d.day} data-day={d.day} className={`day${folded ? " is-folded" : ""}`}>
                    <button
                      type="button"
                      className="day-head"
                      aria-expanded={!folded}
                      aria-controls={`day-${d.day}`}
                      onClick={() => toggleFold(d.day, folded)}
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
              </div>
            </section>
          </div>
        )}
      </main>
      {corridor && (
        <section className="drawer" ref={drawer} aria-labelledby="plan-title">
          <div className="drawer-bar">
            <h2 id="plan-title">
              Your plan {plan.picks.length > 0 && <span className="dcount">{plan.picks.length}</span>}
            </h2>
            <div className="dbtns">
              {itinerary.items.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => void copyPlan(planText(`${trip.from.label} to ${trip.to.label}`, itinerary, byId, tz))}
                  >
                    Copy plan
                  </button>
                  {!locked && (
                    <button type="button" className="btn secondary" onClick={clearPlan}>
                      Clear
                    </button>
                  )}
                </>
              )}
              {cleared && plan.picks.length === 0 && !locked && (
                <button type="button" className="btn secondary" ref={undoButton} onClick={undoClear}>
                  Undo clear
                </button>
              )}
              <button type="button" className="btn" ref={drawerToggle} aria-expanded={planOpen} aria-controls="plan-body" onClick={() => setPlanOpen((o) => !o)}>
                {planOpen ? "Hide itinerary" : "Show itinerary"}
              </button>
            </div>
          </div>
          <div id="plan-body" className="drawer-body" hidden={!planOpen}>
            <ItineraryView
              itinerary={itinerary}
              tz={tz}
              routing={corridor.sources.routing}
              locked={locked}
              onRemove={(id) => togglePick(id)}
              onEmptied={() => (focusAfter.current = "drawer-toggle")}
              onSetTime={setPickTime}
              onClearMissing={clearMissing}
            />
            {copyText !== null && (
              <textarea className="copybox" ref={copyBox} readOnly value={copyText} aria-label="The plan as text, to copy" onFocus={(e) => e.currentTarget.select()} />
            )}
          </div>
        </section>
      )}
      {toast}
    </>
  );
}
