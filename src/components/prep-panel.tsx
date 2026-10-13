import type { Step, StepState } from "../lib/prep";

const MARK: Record<StepState, string> = { done: "✓", working: "…", waiting: "○", failed: "⚠" };
const WORD: Record<StepState, string> = { done: "done", working: "in progress", waiting: "waiting", failed: "did not finish" };

type Props = {
  steps: Step[];
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
};

/** Where getting a trip ready stands: the route, the pages, the places. It follows itself, so there is nothing to start by hand. */
export function PrepPanel({ steps, canRetry, retrying, onRetry }: Props) {
  return (
    <section className="note stack prep" aria-label="Getting this trip ready">
      <p style={{ margin: 0 }}>
        <strong>Getting this trip ready.</strong> This happens by itself and the board fills in as it goes.
      </p>
      <div role="status">
        <ol className="prep-steps">
          {steps.map((s) => (
            <li key={s.key} className={`prep-step ${s.state}`}>
              <span className="prep-mark" aria-hidden="true">
                {MARK[s.state]}
              </span>
              <span>
                {s.label}
                <span className="sr-only">: {WORD[s.state]}</span>
                {s.note && <span className="prep-note small muted"> {s.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {canRetry && (
        <div>
          <button className="btn" type="button" disabled={retrying} onClick={onRetry}>
            {retrying ? "Starting…" : "Try again"}
          </button>
        </div>
      )}
    </section>
  );
}
