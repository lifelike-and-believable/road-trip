import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Getting a trip ready shows itself, starts by itself, and says what failed. Replies are stubbed.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const now = () => new Date().toISOString();
const trip = { id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(47), roundTrip: false, tz: 'America/Toronto', status: 'underway', legs: [] };
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 45.5, lon: -73.6 }, to: { label: 'C', lat: 44.7, lon: -73.45 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [{ name: 'Champlain', region: 'NY', lat: 45, lon: -73.4, km: 50, from: utc(14), until: utc(14) }] }],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: { Champlain: { refreshedAt: utc(10), listings: [{ id: 'aaaaaaaaaaa1', stop: 'Champlain', title: 'Farm market concert', category: 'music', cost: 'free', source: 'https://events.example/list', schedule: { kind: 'fixed', start: utc(14.5) } }] } },
};
const prep = (over: Record<string, unknown> = {}) => ({ tripId: ID, state: 'working', startedAt: now(), updatedAt: now(), ...over });
const plan = { tripId: ID, updatedAt: null, picks: [], starred: [] };
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

type Reply = { corridor?: unknown; sources?: unknown; listings?: unknown; prep?: unknown };

/** Serves the board replies in order, repeating the last one, and counts the calls to /prepare. */
async function stub(page: Page, replies: Reply[]) {
  const started = { n: 0 };
  let i = 0;
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.route(`**/api/trips/${ID}/board`, (route) => {
    const r = replies[Math.min(i++, replies.length - 1)];
    return route.fulfill({ json: { trip, corridor: r.corridor ?? null, sources: r.sources ?? null, listings: r.listings ?? null, prep: r.prep ?? null, plan } });
  });
  await page.route(`**/api/trips/${ID}/prepare`, (route) => {
    started.n++;
    return route.fulfill({ status: 202, json: { started: true, prep: prep() } });
  });
  return started;
}
const panel = (page: Page) => page.getByRole('region', { name: 'Getting this trip ready' });

test.describe('getting a trip ready', () => {
  test('starts by itself for a trip that was never started, and shows the steps', async ({ page }) => {
    const started = await stub(page, [{}]);
    await page.goto(`/trips/${ID}`);
    await expect(panel(page).getByText('Work out the route')).toBeVisible();
    await expect(panel(page).getByText('Find pages that list things to do')).toBeVisible();
    await expect(panel(page).getByText('Read those pages for what is on')).toBeVisible();
    await expect.poll(() => started.n).toBe(1);
    await expect(page.getByRole('button', { name: /Build the route|Find sources/ })).toHaveCount(0);
  });

  test('does not start a second run when one is already under way', async ({ page }) => {
    const started = await stub(page, [{ prep: prep() }]);
    await page.goto(`/trips/${ID}`);
    await expect(panel(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(started.n).toBe(0);
  });

  test('follows the work, and goes away once the places are there', async ({ page }) => {
    await page.clock.install();
    await stub(page, [
      { prep: prep() },
      { prep: prep(), corridor },
      { prep: prep({ state: 'done', routine: { fired: true } }), corridor, sources: { count: 3 } },
      { prep: prep({ state: 'done', routine: { fired: true } }), corridor, sources: { count: 3 }, listings },
    ]);
    await page.goto(`/trips/${ID}`);
    await expect(panel(page).locator('li').first()).toContainText('Work out the route: in progress');
    await page.clock.runFor(5100);
    await expect(panel(page).locator('li').first()).toContainText('Work out the route: done');
    await page.clock.runFor(5100);
    await expect(panel(page).locator('li').nth(2)).toContainText('few minutes');
    await page.clock.runFor(5100);
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator('article', { hasText: 'Farm market concert' })).toBeVisible();
  });

  test('says which step failed and starts again on Try again', async ({ page }) => {
    const started = await stub(page, [{ corridor, prep: prep({ state: 'failed', corridor: 'built', sources: 'failed' }) }]);
    await page.goto(`/trips/${ID}`);
    await expect(panel(page).locator('li').nth(1)).toContainText('Find pages that list things to do: did not finish');
    await panel(page).getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => started.n).toBe(1);
  });

  test('says which place the map could not find, with no Try again', async ({ page }) => {
    await stub(page, [{ prep: prep({ state: 'failed', corridor: 'failed', sources: 'skipped', problem: { code: 'not_found', place: 'to' } }) }]);
    await page.goto(`/trips/${ID}`);
    await expect(panel(page).locator('li').first()).toContainText('"To" could not be found on the map');
    await expect(panel(page).getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('explains when the routine was not set up to start by itself', async ({ page }) => {
    await stub(page, [{ corridor, sources: { count: 2 }, prep: prep({ state: 'done', corridor: 'built', sources: 'built', routine: { fired: false, reason: 'not_configured' } }) }]);
    await page.goto(`/trips/${ID}`);
    await expect(panel(page)).toContainText('next daily run');
    await expect(panel(page).getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('has no accessibility violations', async ({ page }) => {
    await stub(page, [{ corridor, prep: prep({ state: 'failed', corridor: 'built', sources: 'failed' }) }]);
    await page.goto(`/trips/${ID}`);
    await expect(panel(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
