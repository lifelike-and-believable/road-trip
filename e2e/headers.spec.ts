import { expect, test } from '@playwright/test';

// The content security policy: scripts and requests stay on this site, the map's tiles come from OpenStreetMap,
// and nothing frames the app. It has to leave the board, the map and the sign-in page working.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const trip = {
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(23), roundTrip: false,
  tz: 'America/Toronto', status: 'underway', legs: [],
};
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 45.5, lon: -73.6 }, to: { label: 'C', lat: 44.7, lon: -73.45 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  line: [[-73.6, 45.5], [-73.45, 44.7]],
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true,
    stops: [{ name: 'Champlain', region: 'NY', lat: 45.0, lon: -73.43, km: 50, from: utc(13), until: utc(13) }] }],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: { Champlain: { refreshedAt: utc(10), listings: [{
    id: 'aaaaaaaaaaa1', stop: 'Champlain', title: 'Maple Museum', category: 'museum', cost: 'ticketed', source: 'https://events.example/list',
    schedule: { kind: 'flexible', hours: [{ opens: utc(13), closes: utc(21) }] }, lat: 45.01, lon: -73.4,
  }] } },
};
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test.describe('security headers', () => {
  test('pages carry a content security policy that keeps scripts and requests on this site', async ({ request }) => {
    for (const path of ['/', `/trips/${ID}`]) {
      const res = await request.get(path);
      const csp = res.headers()['content-security-policy'] ?? '';
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(res.headers()['x-content-type-options']).toBe('nosniff');
    }
  });

  test('the board, its map and its tiles load without breaking the policy', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
    });
    await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
    await page.route(`**/api/trips/${ID}/board`, (route) =>
      route.fulfill({ json: { trip, corridor, sources: { count: 1 }, listings, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } }),
    );
    await page.goto(`/trips/${ID}`);
    await expect(page.getByRole('region', { name: 'Map of the route' }).locator('path.leaflet-interactive')).toHaveCount(2);
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('the sign-in page loads without breaking the policy', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
    });
    await page.goto('/');
    await expect(page.getByLabel(/passcode/i)).toBeVisible();
    expect(violations).toEqual([]);
  });
});
