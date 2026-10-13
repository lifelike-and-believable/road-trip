import { expect, test, type Page } from '@playwright/test';

// A town gets a pin and a chip only when something has been found there.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, lat: number, lon: number, km: number, hour: number) => ({ name, region: 'NY', lat, lon, km, from: utc(hour), until: utc(hour) });
const trip = {
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(23), roundTrip: false,
  tz: 'America/Toronto', status: 'underway', legs: [],
};
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 45.5, lon: -73.6 }, to: { label: 'C', lat: 44.7, lon: -73.45 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  line: [[-73.6, 45.5], [-73.4, 44.9], [-73.45, 44.7]],
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [stop('Champlain', 45.0, -73.43, 50, 13), stop('Plattsburgh', 44.7, -73.45, 100, 14)] }],
};
const found = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Champlain: { refreshedAt: utc(10), listings: [{ id: 'aaaaaaaaaaa1', stop: 'Champlain', title: 'Farm market concert', category: 'music', cost: 'free', source: 'https://events.example/list', schedule: { kind: 'fixed', start: utc(14) } }] },
    Plattsburgh: { refreshedAt: utc(10), listings: [] },
  },
};
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function stubBoard(page: Page, listings: unknown) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({ json: { trip, corridor, sources: { count: 3 }, listings, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } }),
  );
}
const map = (page: Page) => page.getByRole('region', { name: 'Map of the route' });

test('a town with nothing found has no pin and no chip', async ({ page }) => {
  await stubBoard(page, found);
  await page.goto(`/trips/${ID}`);
  await expect(map(page).locator('path.route-line')).toHaveCount(1);
  await expect(map(page).locator('path.leaflet-interactive:not(.route-line)')).toHaveCount(1);
  const stops = page.getByRole('group', { name: 'Stops along the road' });
  await expect(stops.getByRole('button')).toHaveCount(1);
  await expect(stops.getByRole('button', { name: /Champlain/ })).toBeVisible();
  await expect(stops.getByRole('button', { name: /Plattsburgh/ })).toHaveCount(0);
});

test('before anything is found the map shows the road and no pins', async ({ page }) => {
  await stubBoard(page, null);
  await page.goto(`/trips/${ID}`);
  await expect(map(page).locator('path.route-line')).toHaveCount(1);
  await expect(map(page).locator('path.leaflet-interactive:not(.route-line)')).toHaveCount(0);
});
