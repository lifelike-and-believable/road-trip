import { expect, test } from '@playwright/test';

// While a trip is getting ready the board looks at the server every few seconds. The map must stay as it is
// through those looks: rebuilding it flickers, loses the traveller's pan and zoom, and fetches the tiles again.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const trip = { id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(47), roundTrip: false, tz: 'America/Toronto', status: 'underway', legs: [] };
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 45.5, lon: -73.6 }, to: { label: 'C', lat: 44.7, lon: -73.45 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' }, line: [[-73.6, 45.5], [-73.45, 44.7]],
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [{ name: 'Champlain', region: 'NY', lat: 45, lon: -73.4, km: 50, from: utc(14), until: utc(14) }] }],
};
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('keeps the same map while the board looks for progress', async ({ page }) => {
  let looks = 0;
  const now = () => new Date().toISOString();
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.route(`**/api/trips/${ID}/board`, (route) => {
    looks++;
    // A fresh copy each time, as the server sends: the same corridor, built at the same moment.
    return route.fulfill({
      json: { trip, corridor: JSON.parse(JSON.stringify(corridor)), sources: null, listings: null, prep: { tripId: ID, state: 'working', startedAt: now(), updatedAt: now() }, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } },
    });
  });
  await page.route(`**/api/trips/${ID}/prepare`, (route) => route.fulfill({ status: 202, json: { started: true } }));
  await page.goto(`/trips/${ID}`);
  await expect(page.locator('.leaflet-map-pane')).toBeAttached();
  await page.evaluate(() => {
    (window as unknown as { firstMap: Element | null }).firstMap = document.querySelector('.leaflet-map-pane');
  });
  const before = looks;
  await expect.poll(() => looks, { timeout: 15_000 }).toBeGreaterThan(before);
  // Let the reply from that look render.
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect(page.locator('.prep')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { firstMap: Element | null }).firstMap?.isConnected ?? false)).toBe(true);
});
