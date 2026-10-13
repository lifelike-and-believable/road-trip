import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The route map and the row of stops, against stubbed API replies and stubbed map tiles.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, lat: number, lon: number, km: number, hour: number) => ({ name, region: 'NY', lat, lon, km, from: utc(hour), until: utc(hour) });
const fixed = (id: string, stopName: string, title: string, startH: number) => ({
  id, stop: stopName, title, category: 'music', cost: 'free', source: 'https://events.example/list',
  schedule: { kind: 'fixed', start: utc(startH), durationMin: 60 },
});

const trip = {
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(23), roundTrip: false,
  tz: 'America/Toronto', status: 'underway', legs: [],
};
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 45.5, lon: -73.6 }, to: { label: 'C', lat: 44.7, lon: -73.45 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  line: [[-73.6, 45.5], [-73.5, 45.1], [-73.4, 44.9], [-73.45, 44.7]],
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [stop('Champlain', 45.0, -73.43, 50, 13), stop('Plattsburgh', 44.7, -73.45, 100, 14)] }],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Champlain: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa2', 'Champlain', 'Farm market concert', 14)] },
    Plattsburgh: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa3', 'Plattsburgh', 'Lakeside play', 16.5), fixed('aaaaaaaaaaa4', 'Plattsburgh', 'Harbour jazz', 15)] },
  },
};

// A one-pixel PNG for every tile, so the specs never reach the real tile server.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function stubBoard(page: Page, withLine = true) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
  const c = withLine ? corridor : { ...corridor, line: undefined };
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({ json: { trip, corridor: c, sources: { count: 3 }, listings, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } }),
  );
  await page.route(`**/api/trips/${ID}/plan`, (route) => route.fulfill({ json: { tripId: ID, updatedAt: utc(11), ...route.request().postDataJSON() } }));
}

test.describe('the route map', () => {
  test('draws the road and a pin for each town, with the attribution the tiles need', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const map = page.getByRole('region', { name: 'Map of the route' });
    await expect(map).toBeVisible();
    await expect(map.locator('path.route-line')).toHaveCount(1);
    await expect(map.locator('path.leaflet-interactive:not(.route-line)')).toHaveCount(2);
    await expect(map.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  });

  test('draws no road when the corridor has none, and still shows the towns', async ({ page }) => {
    await stubBoard(page, false);
    await page.goto(`/trips/${ID}`);
    const map = page.getByRole('region', { name: 'Map of the route' });
    await expect(map.locator('path.leaflet-interactive')).toHaveCount(2);
    await expect(map.locator('path.route-line')).toHaveCount(0);
  });

  test('lists the stops with how many listings are near each, and limits the board to one when it is chosen', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const stops = page.getByRole('group', { name: 'Stops along the road' });
    await expect(stops.getByRole('button', { name: /Champlain/ })).toContainText('1');
    await expect(stops.getByRole('button', { name: /Plattsburgh/ })).toContainText('2');
    await expect(page.getByText('3 of 3 shown')).toBeVisible();

    await stops.getByRole('button', { name: /Plattsburgh/ }).click();
    await expect(page.locator('article h3')).toHaveText(['Harbour jazz', 'Lakeside play']);
    await expect(page.getByText('2 of 3 shown')).toBeVisible();
    await expect(stops.getByRole('button', { name: /Plattsburgh/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('3 of 3 shown')).toBeVisible();
  });

  test('limits the board to a town when its pin is clicked', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const pins = page.getByRole('region', { name: 'Map of the route' }).locator('path.leaflet-interactive:not(.route-line)');
    await expect(pins).toHaveCount(2);
    await pins.first().click({ force: true });
    await expect(page.locator('article h3')).toHaveText(['Farm market concert']);
  });

  test('has no accessibility violations with the map on the page', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.getByRole('region', { name: 'Map of the route' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
