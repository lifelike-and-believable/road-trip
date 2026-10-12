import { Home } from "../components/home";

export default function Page() {
  return (
    <>
      <header className="masthead">
        <div className="inner">
          <h1>Road Trip</h1>
          <p>What is on along the road, for the times you will be passing through.</p>
        </div>
      </header>
      <main className="shell">
        <Home />
      </main>
    </>
  );
}
