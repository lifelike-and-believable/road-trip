import { Home } from "../components/home";

export default function Page() {
  return (
    <>
      <header className="top">
        <div className="inner">
          <div className="brand">
            <p className="kicker">Along the road</p>
            <h1>Road Trip</h1>
            <p className="dateline">What is on along the road, for the times you will be passing through.</p>
          </div>
        </div>
      </header>
      <main className="shell">
        <Home />
      </main>
    </>
  );
}
