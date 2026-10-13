import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Pins for listings that carry coordinates: drawn, linked to their cards, and left out when hidden.
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
const museum = (id: string, stopName: string, title: string, coords?: { lat: number; lon: number }) => ({
  id, stop: stopName, title, category: 'museum', cost: 'ticketed', source: 'https://events.example/list',
  schedule: { kind: 'flexible', hours: [{ opens: utc(13), closes: utc(21) }] }, ...coords,
});
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Champlain: { refreshedAt: utc(10), listings: [museum('aaaaaaaaaaa1', 'Champlain', 'Maple Museum', { lat: 45.01, lon: -73.4 })] },
    Plattsburgh: { refreshedAt: utc(10), listings: [museum('aaaaaaaaaaa2', 'Plattsburgh', 'Harbour Gallery')] },
  },
};
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function stubBoard(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({ json: { trip, corridor, sources: { count: 3 }, listings, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } }),
  );
  await page.route(`**/api/trips/${ID}/plan`, (route) => route.fulfill({ json: { tripId: ID, updatedAt: utc(11), ...route.request().postDataJSON() } }));
}

const card = (page: Page, title: string) => page.locator('article', { hasText: title });
const pins = (page: Page) => page.getByRole('region', { name: 'Map of the route' }).locator('path.leaflet-interactive');

test.describe('listing pins on the map', () => {
  test('draws a pin only for a listing that has coordinates', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    // two towns and one listing
    await expect(pins(page)).toHaveCount(3);
  });

  test('offers a Map button only on a card whose listing has coordinates, and centres the map on it', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(card(page, 'Harbour Gallery').getByRole('button', { name: /on the map/ })).toHaveCount(0);
    await card(page, 'Maple Museum').getByRole('button', { name: 'Show Maple Museum on the map' }).click();
    await expect(page.locator('.leaflet-tooltip', { hasText: 'Maple Museum' })).toBeVisible();
  });

  test('takes the traveller to the card when its pin is chosen', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(pins(page)).toHaveCount(3);
    await pins(page).last().click({ force: true });
    await expect(card(page, 'Maple Museum')).toBeFocused();
    await expect(card(page, 'Maple Museum')).toHaveClass(/flash/);
  });

  test('takes a pin off the map when its listing is hidden', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(pins(page)).toHaveCount(3);
    await card(page, 'Maple Museum').getByRole('button', { name: 'Hide Maple Museum' }).click();
    // Its own pin goes, and so does Champlain's town pin, since nothing is left on the board there.
    await expect(pins(page)).toHaveCount(1);
  });

  // Titles come from web pages and town names from OpenStreetMap, so a tooltip shows them as text, never as markup.
  test('shows a title or town name that looks like markup as plain text', async ({ page }) => {
    const bait = '<img src=x onerror="window.__pwned=1">';
    await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
    const baited = {
      ...corridor,
      legs: [{ ...corridor.legs[0], stops: [{ ...corridor.legs[0].stops[0], region: bait }, corridor.legs[0].stops[1]] }],
    };
    const baitedListings = {
      ...listings,
      stops: { ...listings.stops, Champlain: { refreshedAt: utc(10), listings: [museum('aaaaaaaaaaa1', 'Champlain', `Maple ${bait}`, { lat: 45.01, lon: -73.4 })] } },
    };
    await page.route(`**/api/trips/${ID}/board`, (route) =>
      route.fulfill({ json: { trip, corridor: baited, sources: { count: 3 }, listings: baitedListings, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } }),
    );
    await page.goto(`/trips/${ID}`);
    await expect(pins(page)).toHaveCount(3);

    await card(page, 'Maple').getByRole('button', { name: /on the map/ }).click();
    await pins(page).first().dispatchEvent('mouseover');
    const tips = page.locator('.leaflet-tooltip');
    await expect(tips.filter({ hasText: `Maple ${bait}` })).toBeVisible();
    await expect(tips.filter({ hasText: `Champlain, ${bait}` })).toBeVisible();
    await expect(tips.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test('has no accessibility violations with the pins and buttons on the page', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(pins(page)).toHaveCount(3);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
