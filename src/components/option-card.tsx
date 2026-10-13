import type { CSSProperties } from "react";
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
  locked: boolean;
  onPick: () => void;
  onStar: () => void;
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
  return `Open ${localTime(option.start, tz)} to ${localTime(option.end ?? option.start, tz)}${usual}`;
}

/** A scheduled event is a row with its time at the left; a place that is open is a card. */
export function OptionCard({ option, tz, picked, starred, locked, onPick, onStar }: Props) {
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
  const notes = listing.notes && <p className="ev-note">{listing.notes}</p>;
  const source = <p className="ev-note">Read from {host(listing.source)}</p>;
  const star = (
    <button type="button" className="starbtn" aria-pressed={starred} aria-label={`Star ${listing.title}`} title="I like this" onClick={onStar}>
      <span aria-hidden="true">{starred ? "★" : "☆"}</span>
    </button>
  );
  const add = !locked && (
    <button type="button" className="pickbtn" aria-pressed={picked} onClick={onPick}>
      {picked ? "On the plan" : "Add"}
      <span className="sr-only"> {listing.title}</span>
    </button>
  );

  if (option.kind === "flexible") {
    return (
      <article className={`run${picked ? " picked" : ""}`} style={style}>
        <div className="rhead">
          <h3>{title}</h3>
          {star}
        </div>
        <p className="rmeta">{hours(option, tz)}</p>
        {where}
        {notes}
        {source}
        <div className="rfoot">
          {tags}
          {add}
        </div>
      </article>
    );
  }

  return (
    <article className={`ev${picked ? " picked" : ""}`} style={style}>
      <div className="ev-when">{localTime(option.start, tz)}</div>
      <div className="ev-body">
        <div className="ev-title">
          <h3>{title}</h3>
          {tags}
        </div>
        {where}
        {option.end && <p className="ev-note">Until {localTime(option.end, tz)}</p>}
        {notes}
        {source}
        {add}
      </div>
      <div className="ev-ctl">{star}</div>
    </article>
  );
}
