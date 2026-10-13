import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// A place that is open rather than timed: picked from one day's card it stays on that day, and the traveller can set its time.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
// Saturday 17 October 2026, midnight UTC; Toronto is UTC-4.
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();

const trip = (status: string) => ({
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Burlington' }, start: utc(11), end: utc(47), roundTrip: false,
  tz: 'America/Toronto', status, legs: [],
});
// In Burlington from 10 a.m. Saturday to 10 a.m. Sunday.
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 0, lon: 0 }, to: { label: 'C', lat: 0, lon: 0 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true,
    stops: [{ name: 'Burlington', region: 'VT', lat: 0, lon: 0, km: 100, from: utc(14), until: utc(38) }] }],
};
// Open 9 a.m. to 5 p.m. both days, a visit of about an hour and a half.
const museum = {
  id: 'aaaaaaaaaaa1', stop: 'Burlington', title: 'Lake Museum', category: 'museum', cost: 'ticketed', source: 'https://events.example/list',
  schedule: { kind: 'flexible', hours: [{ opens: utc(13), closes: utc(21) }, { opens: utc(37), closes: utc(45) }], typicalMin: 90 },
};
const listings = { tripId: ID, updatedAt: utc(10), stops: { Burlington: { refreshedAt: utc(10), listings: [museum] } } };

async function stubBoard(page: Page, status = 'underway', picks: object[] = []) {
  const saved: Array<{ picks: Array<Record<string, unknown>> }> = [];
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({ json: { trip: trip(status), corridor, sources: { count: 1 }, listings, prep: null, plan: { tripId: ID, updatedAt: null, picks, starred: [] } } }),
  );
  await page.route(`**/api/trips/${ID}/plan`, async (route) => {
    saved.push(route.request().postDataJSON());
    await route.fulfill({ json: { tripId: ID, updatedAt: utc(11), ...route.request().postDataJSON() } });
  });
  return saved;
}

const day = (page: Page, name: RegExp) => page.locator('.day', { has: page.getByRole('button', { name }) });
const drawer = (page: Page) => page.locator('#plan-body');
const timeField = (page: Page) => drawer(page).getByLabel('Start time for Lake Museum');

test.describe('a flexible pick', () => {
  test('stays on the day of the card it was picked from', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await day(page, /SUNDAY/i).getByRole('button', { name: /^Add Lake Museum/ }).click();
    await expect.poll(() => saved.at(-1)?.picks).toEqual([{ id: 'aaaaaaaaaaa1', day: '2026-10-18' }]);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await expect(drawer(page)).toContainText('Sunday');
    await expect(timeField(page)).toHaveValue('09:00');
  });

  test('takes a time the traveller sets, and goes back to the suggested time', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await day(page, /SUNDAY/i).getByRole('button', { name: /^Add Lake Museum/ }).click();
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await timeField(page).fill('11:30');
    await expect.poll(() => saved.at(-1)?.picks).toEqual([{ id: 'aaaaaaaaaaa1', day: '2026-10-18', at: '2026-10-18T15:30:00.000Z' }]);
    await expect(drawer(page).locator('.stime').first()).toHaveText('11:30 a.m.');
    await drawer(page).getByRole('button', { name: 'Use the suggested time for Lake Museum' }).click();
    await expect.poll(() => saved.at(-1)?.picks).toEqual([{ id: 'aaaaaaaaaaa1', day: '2026-10-18' }]);
    await expect(timeField(page)).toHaveValue('09:00');
  });

  test('says so when the time set is outside the opening hours', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await day(page, /SUNDAY/i).getByRole('button', { name: /^Add Lake Museum/ }).click();
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await timeField(page).fill('18:00');
    await expect(drawer(page)).toContainText('That time is outside its opening hours.');
  });

  test('offers no time to set once the trip is over', async ({ page }) => {
    await stubBoard(page, 'ended', [{ id: 'aaaaaaaaaaa1', day: '2026-10-18' }]);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await expect(drawer(page)).toContainText('Lake Museum');
    await expect(timeField(page)).toHaveCount(0);
  });

  test('has no accessibility violations with the time field showing', async ({ page }) => {
    await stubBoard(page, 'underway', [{ id: 'aaaaaaaaaaa1', day: '2026-10-18' }]);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await expect(timeField(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
