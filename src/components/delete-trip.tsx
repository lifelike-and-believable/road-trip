"use client";

import { useRef, useState } from "react";
import { call } from "./api";

type Props = {
  tripId: string;
  /** Names the trip for people using a screen reader, e.g. "Montréal to Plattsburgh". */
  name: string;
  /** The text on the first button; the list uses "Delete" and the board "Delete this trip". */
  label?: string;
  onDeleted: () => void;
};

/** Delete with a question first, since it removes the route, the sources, the listings and the plan, and cannot be undone. */
export function DeleteTrip({ tripId, name, label = "Delete", onDeleted }: Props) {
  const [step, setStep] = useState<"idle" | "asking" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  async function confirm() {
    setStep("working");
    setError(null);
    const r = await call<{ ok: true }>(`/api/trips/${tripId}`, { method: "DELETE" });
    if (r.ok) return onDeleted();
    setError(r.message);
    setStep("asking");
  }

  function cancel() {
    setStep("idle");
    setError(null);
    // The question took the button's place, so focus goes back to where it was.
    requestAnimationFrame(() => opener.current?.focus());
  }

  if (step === "idle") {
    return (
      <button ref={opener} type="button" className="btn secondary danger" aria-label={label === "Delete" ? `Delete ${name}` : label} onClick={() => setStep("asking")}>
        {label}
      </button>
    );
  }
  return (
    <div className="ask" role="group" aria-label={`Delete ${name}?`}>
      <p className="small" style={{ margin: 0 }}>
        Delete this trip and its plan? This cannot be undone.
      </p>
      {error && (
        <p className="alert" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn danger solid" disabled={step === "working"} onClick={() => void confirm()}>
          {step === "working" ? "Deleting…" : "Yes, delete it"}
        </button>
        <button type="button" className="btn secondary" disabled={step === "working"} onClick={cancel} autoFocus>
          Keep it
        </button>
      </div>
    </div>
  );
}
