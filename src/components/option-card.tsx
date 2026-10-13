import { useId, type CSSProperties } from "react";
import type { Option } from "../lib/board";
import { localTime } from "../lib/board";
import { CATEGORY_LABELS } from "../lib/filters";
import { durationLabel } from "../lib/format";
import { CATEGORY_COLOR } from "./categories";

type Props = {
  option: Option;
  tz?: string;
  picked: boolean;
  starred: boolean;
  /** Hidden from the traveller's board, and shown only because the Hidden chip is on. */
  hidden: boolean;
  locked: boolean;
  onPick: () => void;
  onStar: () => void;
  /** When the traveller is at the listing's town that day, from the corridor's estimate. */
  passing: string | null;
  /** Given the Hide button, so the board can move focus on from the card that is leaving. */
  onHide: (from: HTMLElement) => void;
  onUnhide: () => void;
  /** Centre the map on this listing. Offered only when the listing has coordinates. */
  onMap?: () => void;
};

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A place that is open rather than timed: its hours that day, and how long a visit usually takes if known. */
function hours(option: Option, tz?: string): string {
  const s = option.listing.schedule;
  const usual = s.kind === "flexible" && s.typicalMin ? ` · usual visit ${durationLabel(s.typicalMin)}` : "";
  const periods = option.periods ?? [{ opens: option.start, closes: option.end ?? option.start }];
  return `Open ${periods.map((p) => `${localTime(p.opens, tz)} to ${localTime(p.closes, tz)}`).join(" and ")}${usual}`;
}

/** A scheduled event is a row with its time at the left; a place that is open is a card. */
export function OptionCard({ option, tz, passing, picked, starred, hidden, locked, onPick, onStar, onHide, onUnhide, onMap }: Props) {
  // A flexible listing has a card on each day it is open, so the heading's id is the card's own.
  const heading = useId();
  const { listing } = option;
  const style = { "--catc": CATEGORY_COLOR[listing.category] } as CSSProperties;
  const title = listing.url ? (
    <a href={listing.url} target="_blank" rel="noopener noreferrer">
      {listing.title}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    listing.title
  );
  const tags = (
    <>
      <span className="tag cat">{CATEGORY_LABELS[listing.category]}</span>
      {listing.cost === "free" && <span className="tag free">Free</span>}
      {listing.cost === "ticketed" && <span className="tag price">Ticketed</span>}
    </>
  );
  const where = (
    <p className="ev-venue">
      {listing.venue ? `${listing.venue}, ` : ""}
      near {option.stop}
      {option.region ? `, ${option.region}` : ""}
    </p>
  );
  const notes = (
    <>
      {passing && <p className="ev-note">{passing}</p>}
      {listing.notes && <p className="ev-note">{listing.notes}</p>}
    </>
  );
  const source = <p className="ev-note">Read from {host(listing.source)}</p>;
  const star = (
    <button type="button" className="starbtn" aria-pressed={starred} aria-label={`Star ${listing.title}`} title="I like this" onClick={onStar}>
      <span aria-hidden="true">{starred ? "★" : "☆"}</span>
    </button>
  );
  const hide = !locked && (
    <button type="button" className="hidebtn" aria-label={`Hide ${listing.title}`} title="Hide this" onClick={(e) => onHide(e.currentTarget)}>
      <span aria-hidden="true">✕</span>
    </button>
  );
  const bringBack = (
    <button type="button" className="restore" onClick={onUnhide}>
      Bring back<span className="sr-only"> {listing.title}</span>
    </button>
  );
  const controls = hidden ? (locked ? null : bringBack) : (
    <>
      {star}
      {hide}
    </>
  );
  const add = !locked && !hidden && (
    <button type="button" className="pickbtn" aria-pressed={picked} onClick={onPick}>
      {picked ? "On the plan" : "Add"}
      <span className="sr-only"> {listing.title}</span>
    </button>
  );
  const mapBtn = !hidden && onMap && listing.lat !== undefined && (
    <button type="button" className="pickbtn" onClick={onMap} aria-label={`Show ${listing.title} on the map`}>
      Map
    </button>
  );
  const acts = (add || mapBtn) && (
    <div className="acts">
      {add}
      {mapBtn}
    </div>
  );
  const state = `${picked ? " picked" : ""}${hidden ? " is-hidden" : ""}`;
  const hiddenNote = hidden && <p className="ev-note">Hidden from your board.</p>;

  if (option.kind === "flexible") {
    return (
      <article className={`run${state}`} style={style} data-listing={listing.id} tabIndex={-1} aria-labelledby={heading}>
        <div className="rhead">
          <h3 id={heading}>{title}</h3>
          <div className="ev-ctl">{controls}</div>
        </div>
        <p className="rmeta">{hours(option, tz)}</p>
        {where}
        {notes}
        {source}
        {hiddenNote}
        <div className="rfoot">
          {tags}
          {acts}
        </div>
      </article>
    );
  }

  return (
    <article className={`ev${state}`} style={style} data-listing={listing.id} tabIndex={-1} aria-labelledby={heading}>
      <div className="ev-when">{localTime(option.start, tz)}</div>
      <div className="ev-body">
        <div className="ev-title">
          <h3 id={heading}>{title}</h3>
          {tags}
        </div>
        {where}
        {option.end && <p className="ev-note">Until {localTime(option.end, tz)}</p>}
        {notes}
        {source}
        {hiddenNote}
        {acts}
      </div>
      <div className="ev-ctl">{controls}</div>
    </article>
  );
}
