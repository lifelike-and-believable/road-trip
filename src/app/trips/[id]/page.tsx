import { Suspense } from "react";
import { BoardScreen } from "../../../components/board-screen";

// The trip's id is read in the browser, so this page never reads the route's params itself.
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="shell">
          <p role="status" className="muted">
            Loading the trip…
          </p>
        </main>
      }
    >
      <BoardScreen />
    </Suspense>
  );
}
