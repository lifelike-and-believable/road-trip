import { clockTime, localDay, localTime, type Itinerary } from "../lib/board";
import { dayLabel, describeGap, durationLabel } from "../lib/format";

type Props = {
  itinerary: Itinerary;
  tz?: string;
  routing: string;
  locked: boolean;
  onRemove: (id: string) => void;
  /** Set a flexible pick's start on its day; an empty time goes back to the suggested one. */
  onSetTime: (id: string, day: string, time: string) => void;
  onClearMissing: () => void;
};

/** The picks in time order with the gap between each. A drive time is the route's own estimate, never invented. */
export function ItineraryView({ itinerary, tz, routing, locked, onRemove, onSetTime, onClearMissing }: Props) {
  const { items, gaps, missing } = itinerary;
  if (items.length === 0 && missing.length === 0) {
    return <p className="note">Add one or two stops from the list and they land here in order, with the time between them.</p>;
  }
  const placedCount = items.filter((i) => i.placed !== "unplaceable").length;
  return (
    <div className="stack">
      <ol className="itinerary">
        {items.flatMap((item, i) => {
          const day = item.day ?? (item.startAt ? localDay(item.startAt, tz) : undefined);
          const rows = [
            <li key={item.id} className="item slot">
              <span className="stime">{item.startAt ? localTime(item.startAt, tz) : "No time"}</span>
              <div className="sbody">
                <strong>{item.title}</strong>
                <span className="swhere">
                  {day ? `${dayLabel(day)} · ` : ""}near {item.stop}
                  {item.endAt ? ` · until ${localTime(item.endAt, tz)}` : ""}
                  {item.placed === "auto" && item.endAt ? ` · about ${durationLabel((Date.parse(item.endAt) - Date.parse(item.startAt!)) / 60000)} there` : ""}
                </span>
                {item.placed === "unplaceable" && (
                  <span className="sclash">It cannot be fitted within its opening hours alongside your other picks.</span>
                )}
                {item.warning === "outside-hours" && <span className="sclash">That time is outside its opening hours.</span>}
                {item.kind === "flexible" && item.day && !locked && (
                  <TimeSetter id={item.id} title={item.title} day={item.day} value={item.startAt ? clockTime(item.startAt, tz) : ""} chosen={item.placed === "chosen"} onSetTime={onSetTime} />
                )}
              </div>
              {!locked && (
                <button type="button" className="xbtn" aria-label={`Remove ${item.title} from your plan`} onClick={() => onRemove(item.id)}>
                  <span aria-hidden="true">×</span>
                </button>
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

type SetterProps = { id: string; title: string; day: string; value: string; chosen: boolean; onSetTime: Props["onSetTime"] };

/** The start of a place that is open rather than timed: suggested to begin with, or a time the traveller sets on its day. */
function TimeSetter({ id, title, day, value, chosen, onSetTime }: SetterProps) {
  const field = `start-${id}`;
  return (
    <span className="ssetter">
      <label htmlFor={field}>
        Start time<span className="sr-only"> for {title}</span>
      </label>
      <input id={field} type="time" className="stimefield" value={value} onChange={(e) => onSetTime(id, day, e.target.value)} />
      {chosen && (
        <button type="button" className="btn secondary" aria-label={`Use the suggested time for ${title}`} onClick={() => onSetTime(id, day, "")}>
          Use the suggested time
        </button>
      )}
    </span>
  );
}
