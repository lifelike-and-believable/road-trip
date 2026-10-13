"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { withOffset } from "../lib/when";
import { post, type PresentedTrip } from "./api";

export function TripForm() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [stayHours, setStayHours] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const startAt = withOffset(start);
    const endAt = withOffset(end);
    const problems: string[] = [];
    if (!startAt) problems.push("Choose a start date and time.");
    if (!endAt) problems.push("Choose an end date and time.");
    const stayMin = roundTrip && stayHours.trim() ? Math.round(Number(stayHours) * 60) : undefined;
    if (stayMin !== undefined && !(stayMin > 0)) problems.push("Time at the destination must be more than zero.");
    // The server checks these too, but in its own words; here they are named as the form labels them.
    if (startAt && endAt) {
      const leave = Date.parse(startAt);
      const back = Date.parse(endAt);
      if (back <= leave) problems.push('"Back or arrive by" must be after "Leave".');
      else if (back <= Date.now()) problems.push('"Back or arrive by" has already passed.');
      else if (stayMin && stayMin * 60_000 >= back - leave) {
        problems.push('"Time at the destination" must be shorter than the time from "Leave" to "Back or arrive by".');
      }
    }
    if (problems.length) return setErrors(problems);

    setBusy(true);
    setErrors([]);
    const r = await post<PresentedTrip>("/api/trips", {
      from: { label: from },
      to: { label: to },
      start: startAt,
      end: endAt,
      roundTrip,
      ...(stayMin ? { stay: stayMin } : {}),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(false);
    if (r.ok) router.push(`/trips/${r.value.id}`);
    else if (r.status === 401) setErrors(["You have been signed out. Reload the page to sign in again."]);
    else if (r.status === 0) setErrors([r.message]);
    else setErrors(["The trip could not be made. Check the places and times, then try again."]);
  }

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="new-trip">
      <h2 id="new-trip">New trip</h2>
      <div className="grid2">
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" required autoComplete="off" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" required autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="start">Leave</label>
          <input id="start" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="end">Back or arrive by</label>
          <input id="end" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <input id="round" type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} style={{ width: 24, height: 24 }} />
        <label htmlFor="round">Round trip</label>
      </div>
      {roundTrip && (
        <div className="field">
          <label htmlFor="stay">Time at the destination, in hours</label>
          <input id="stay" aria-describedby="stay-hint" type="number" min="0" step="0.5" inputMode="decimal" value={stayHours} onChange={(e) => setStayHours(e.target.value)} />
          <span id="stay-hint" className="hint">Leave it empty to turn around at the middle of the trip.</span>
        </div>
      )}
      {errors.length > 0 && (
        <div className="alert" role="alert">
          {errors.map((m) => (
            <p key={m} style={{ margin: 0 }}>
              {m}
            </p>
          ))}
        </div>
      )}
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Making the trip…" : "Make the trip"}
        </button>
      </div>
    </form>
  );
}
