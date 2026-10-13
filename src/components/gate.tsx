"use client";

import { useState, type FormEvent } from "react";
import { post } from "./api";

/** One shared passcode, as on the Montreal board. */
export function Gate({ onSignedIn }: { onSignedIn: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post("/api/login", { passcode });
    setBusy(false);
    if (r.ok) onSignedIn();
    else setError(r.status === 401 ? "That passcode doesn't match." : r.message);
  }

  return (
    <form className="gate" onSubmit={submit} aria-labelledby="gate-title">
      <h2 id="gate-title">Road Trip</h2>
      <p>Enter the passcode to load your trips and picks. This device stays signed in.</p>
      <div className="field">
        <label htmlFor="passcode">Passcode</label>
        <input id="passcode" type="password" autoComplete="current-password" required autoFocus value={passcode} onChange={(e) => setPasscode(e.target.value)} />
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </div>
    </form>
  );
}
