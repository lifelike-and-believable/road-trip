import { expect, test, type Page } from '@playwright/test';

// While a trip is getting ready the board looks at the server every five seconds. A tab nobody is looking at
// should not keep asking, for up to half an hour; it looks again as soon as it is shown.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const trip = { id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(47), roundTrip: false, tz: 'America/Toronto', status: 'underway', legs: [] };

async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('stops looking for progress while the tab is hidden, and looks again when it is shown', async ({ page }) => {
  await page.clock.install();
  // Counted in the page as each look starts, so a look started by the fake clock is counted before the clock call returns.
  await page.addInitScript(() => {
    const w = window as unknown as { looks: number };
    w.looks = 0;
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input instanceof Request ? input.url : input).includes('/board')) w.looks++;
      return real(input, init);
    };
  });
  const looksSoFar = () => page.evaluate(() => (window as unknown as { looks: number }).looks);
  await page.route(`**/api/trips/${ID}/board`, (route) => {
    const now = new Date().toISOString();
    return route.fulfill({ json: { trip, corridor: null, sources: null, listings: null, prep: { tripId: ID, state: 'working', startedAt: now, updatedAt: now }, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } });
  });
  await page.route(`**/api/trips/${ID}/prepare`, (route) => route.fulfill({ status: 202, json: { started: true } }));
  await page.goto(`/trips/${ID}`);
  await expect(page.locator('.prep')).toBeVisible();

  // Shown: it keeps looking.
  const shown = await looksSoFar();
  await page.clock.runFor(11_000);
  await expect.poll(looksSoFar).toBeGreaterThan(shown);

  // Hidden: it does not.
  await setVisibility(page, 'hidden');
  const hidden = await looksSoFar();
  await page.clock.runFor(30_000);
  expect(await looksSoFar()).toBe(hidden);

  // Shown again: it looks at once.
  await setVisibility(page, 'visible');
  await expect.poll(looksSoFar).toBeGreaterThan(hidden);
});
