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

function when(option: Option, tz?: string): string {
  const s = option.listing.schedule;
  if (s.kind === "fixed") {
    return option.end ? `${localTime(option.start, tz)} to ${localTime(option.end, tz)}` : `${localTime(option.start, tz)}`;
  }
  const usual = s.typicalMin ? ` · usual visit ${durationLabel(s.typicalMin)}` : "";
  return `Open ${localTime(option.start, tz)} to ${localTime(option.end ?? option.start, tz)}${usual}`;
}

export function OptionCard({ option, tz, picked, starred, locked, onPick, onStar }: Props) {
  const { listing } = option;
  const style = { "--chip": CATEGORY_COLOR[listing.category] } as CSSProperties;
  return (
    <article className="card option" style={style}>
      <span className="cat">{CATEGORY_LABELS[listing.category]}</span>
      <h3>
        {listing.url ? (
          <a href={listing.url} target="_blank" rel="noopener noreferrer">
            {listing.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          listing.title
        )}
      </h3>
      <p className="meta" style={{ margin: 0 }}>
        {when(option, tz)}
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        {listing.venue ? `${listing.venue}, ` : ""}
        near {option.stop}
        {option.region ? `, ${option.region}` : ""}
        {listing.cost === "free" && (
          <>
            {" · "}
            <span className="free">Free</span>
          </>
        )}
        {listing.cost === "ticketed" && " · Ticketed"}
      </p>
      {listing.notes && <p style={{ margin: 0 }}>{listing.notes}</p>}
      <p className="small muted" style={{ margin: 0 }}>
        Read from {host(listing.source)}
      </p>
      <div className="row">
        <button className="btn secondary" type="button" aria-pressed={starred} onClick={onStar}>
          <span aria-hidden="true">{starred ? "★" : "☆"}</span> Star
        </button>
        {!locked && (
          <button className="btn" type="button" onClick={onPick}>
            {picked ? "Remove from plan" : "Add to plan"}
          </button>
        )}
      </div>
    </article>
  );
}
