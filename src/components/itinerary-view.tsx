import { useEffect, useRef } from "react";
import { clockTime, itineraryDays, localTime, type Itinerary } from "../lib/board";
import { dayLabel, describeGap, durationLabel } from "../lib/format";

type Props = {
  itinerary: Itinerary;
  tz?: string;
  routing: string;
  locked: boolean;
  onRemove: (id: string) => void;
  /** Called when the last pick is removed from here, so the board can put focus somewhere that stays. */
  onEmptied: () => void;
  /** Set a flexible pick's start on its day; an empty time goes back to the suggested one. */
  onSetTime: (id: string, day: string, time: string) => void;
  onClearMissing: () => void;
};

/** The picks in time order with the gap between each. A drive time is the route's own estimate, never invented. */
export function ItineraryView({ itinerary, tz, routing, locked, onRemove, onEmptied, onSetTime, onClearMissing }: Props) {
  const { items, missing } = itinerary;
  const list = useRef<HTMLDivElement>(null);
  // Where focus goes once the removed item's button has left the page.
  const focusAfter = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    target?.focus();
  });
  // Removing an item moves focus to the next item's Remove button, or the one before, or off the list when it empties.
  const remove = (id: string, from: HTMLElement) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLElement>(".xbtn") ?? [])];
    const at = buttons.indexOf(from);
    const next = buttons[at + 1] ?? buttons[at - 1] ?? null;
    if (next) focusAfter.current = next;
    else onEmptied();
    onRemove(id);
  };
  if (items.length === 0 && missing.length === 0) {
    return <p className="note">Add one or two stops from the list and they land here in order, with the time between them.</p>;
  }
  return (
    <div className="stack" ref={list}>
      {itineraryDays(itinerary, tz).map(({ day, rows }) => (
        <section key={day ?? "unplaced"} className="iday" aria-label={day ? dayLabel(day) : "Not fitted yet"}>
          <h3 className="iday-head">{day ? dayLabel(day) : "Not fitted yet"}</h3>
          <ol className="itinerary">
            {rows.flatMap(({ item, gap }) => {
              const length = item.startAt && item.endAt ? (Date.parse(item.endAt) - Date.parse(item.startAt)) / 60000 : null;
              const out = [
                <li key={item.id} className="item slot">
                  <span className="stime">{item.startAt ? localTime(item.startAt, tz) : "No time"}</span>
                  <div className="sbody">
                    <strong>{item.title}</strong>
                    <span className="swhere">
                      near {item.stop}
                      {item.endAt ? ` · until ${localTime(item.endAt, tz)}` : ""}
                      {item.placed === "auto" && length !== null ? ` · about ${durationLabel(length)} there` : ""}
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
                    <button type="button" className="xbtn" aria-label={`Remove ${item.title} from your plan`} onClick={(e) => remove(item.id, e.currentTarget)}>
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </li>,
              ];
              if (gap) {
                const d = describeGap(gap);
                out.push(
                  <li key={`${item.id}-gap`} className={d.warn ? "gap warn" : "gap"}>
                    {d.text}
                  </li>,
                );
              }
              return out;
            })}
          </ol>
        </section>
      ))}
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
