import { localTime, type Itinerary } from "../lib/board";
import { describeGap, durationLabel } from "../lib/format";

type Props = {
  itinerary: Itinerary;
  tz?: string;
  routing: string;
  locked: boolean;
  onRemove: (id: string) => void;
  onClearMissing: () => void;
};

/** The picks in time order with the gap between each. A drive time is the route's own estimate, never invented. */
export function ItineraryView({ itinerary, tz, routing, locked, onRemove, onClearMissing }: Props) {
  const { items, gaps, missing } = itinerary;
  if (items.length === 0 && missing.length === 0) {
    return <p className="note">Add one or two stops from the list and they land here in order, with the time between them.</p>;
  }
  const placedCount = items.filter((i) => i.placed !== "unplaceable").length;
  return (
    <div className="stack">
      <ol className="itinerary">
        {items.flatMap((item, i) => {
          const rows = [
            <li key={item.id} className="item">
              <span className="mono small">
                {item.startAt
                  ? `${localTime(item.startAt, tz)}${item.endAt ? ` to ${localTime(item.endAt, tz)}` : ""}`
                  : "No time that fits"}
              </span>
              <strong>{item.title}</strong>
              <span className="small muted">
                near {item.stop}
                {item.placed === "auto" && item.endAt ? ` · about ${durationLabel((Date.parse(item.endAt) - Date.parse(item.startAt!)) / 60000)} there` : ""}
              </span>
              {item.placed === "unplaceable" && (
                <span className="small" style={{ color: "var(--brick)" }}>
                  It cannot be fitted within its opening hours alongside your other picks.
                </span>
              )}
              {item.warning === "outside-hours" && <span className="small" style={{ color: "var(--brick)" }}>That time is outside its opening hours.</span>}
              {!locked && (
                <span>
                  <button className="btn secondary" type="button" onClick={() => onRemove(item.id)}>
                    Remove<span className="sr-only"> {item.title}</span>
                  </button>
                </span>
              )}
            </li>,
          ];
          const gap = i < placedCount - 1 ? gaps[i] : undefined;
          if (gap) {
            const d = describeGap(gap);
            rows.push(
              <li key={`${item.id}-gap`} className={d.warn ? "gap warn" : "gap"}>
                {d.text}
              </li>,
            );
          }
          return rows;
        })}
      </ol>
      {missing.length > 0 && (
        <p className="note">
          {missing.length === 1 ? "One pick is" : `${missing.length} picks are`} no longer listed.{" "}
          {!locked && (
            <button className="btn secondary" type="button" onClick={onClearMissing}>
              Clear {missing.length === 1 ? "it" : "them"}
            </button>
          )}
        </p>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Drive times are estimates from {routing}, without traffic. They are shown only between stops on the same leg of the trip.
      </p>
    </div>
  );
}
