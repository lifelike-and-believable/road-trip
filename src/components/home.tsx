"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { statusLabel } from "../lib/format";
import { call, type PresentedTrip } from "./api";
import { DeleteTrip } from "./delete-trip";
import { Gate } from "./gate";
import { TripForm } from "./trip-form";

type Session = "loading" | "in" | "out";

function TripList() {
  const [trips, setTrips] = useState<PresentedTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void call<{ trips: PresentedTrip[] }>("/api/trips").then((r) => {
      if (!live) return;
      if (r.ok) setTrips(r.value.trips);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, []);

  if (error) return <p className="alert" role="alert">{error}</p>;
  if (!trips) return <p role="status" className="muted">Loading your trips…</p>;
  if (trips.length === 0) return <p className="note">No trips yet. Make one below.</p>;
  return (
    <ul className="triplist">
      {trips.map((t) => (
        <li key={t.id} className="card">
          <h3>
            <Link href={`/trips/${t.id}`}>
              {t.from.label} to {t.to.label}
            </Link>
          </h3>
          <p className="muted small" style={{ margin: "0.25rem 0 0.6rem" }}>
            {t.roundTrip ? "Round trip" : "One way"} · <span className="badge">{statusLabel(t.status)}</span>
          </p>
          <DeleteTrip tripId={t.id} name={`${t.from.label} to ${t.to.label}`} onDeleted={() => setTrips((all) => all && all.filter((x) => x.id !== t.id))} />
        </li>
      ))}
    </ul>
  );
}

export function Home() {
  const [session, setSession] = useState<Session>("loading");
  // Set when the passcode was just accepted: the field that had focus is gone, so focus moves to the trips.
  const [justSignedIn, setJustSignedIn] = useState(false);
  const tripsTitle = useRef<HTMLHeadingElement>(null);

  // Each state names the page, so a tab or a screen reader says where the traveller is.
  useEffect(() => {
    if (session !== "loading") document.title = session === "in" ? "Your trips · Road Trip" : "Sign in · Road Trip";
  }, [session]);
  useEffect(() => {
    if (session === "in" && justSignedIn) tripsTitle.current?.focus();
  }, [session, justSignedIn]);

  useEffect(() => {
    let live = true;
    void call<{ authed: boolean }>("/api/session").then((r) => {
      if (live) setSession(r.ok && r.value.authed ? "in" : "out");
    });
    return () => {
      live = false;
    };
  }, []);

  if (session === "loading") return <p role="status" className="muted">Loading…</p>;
  if (session === "out")
    return (
      <Gate
        onSignedIn={() => {
          setJustSignedIn(true);
          setSession("in");
        }}
      />
    );
  return (
    <div className="stack">
      <section aria-labelledby="trips-title" className="stack">
        <h2 id="trips-title" ref={tripsTitle} tabIndex={-1}>
          Your trips
        </h2>
        <TripList />
      </section>
      <TripForm />
    </div>
  );
}
