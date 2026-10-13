import { expect, test, type Page } from '@playwright/test';

// The usability fixes from the review: the plan by day, when the traveller passes each town, a leg that does not
// fit, plain status and zone names, a pin whose card is folded away, a failed copy, a failed load, and the head-back time.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
// Saturday 17 October 2026, midnight UTC; Toronto is UTC-4.
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, km: number, hour: number) => ({ name, region: 'NY', lat: 45 - km / 100, lon: -73.4, km, from: utc(hour), until: utc(hour) });
const fixed = (id: string, stopName: string, title: string, startH: number, lat: number) => ({
  id, stop: stopName, title, category: 'music', cost: 'free', source: 'https://events.example/list',
  schedule: { kind: 'fixed', start: utc(startH), durationMin: 60 }, lat, lon: -73.4,
});

const trip = {
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(41), roundTrip: true,
  tz: 'America/Toronto', status: 'underway', legs: [],
};
// Out on Saturday morning, back on Sunday afternoon; the return was given too little time for its drive.
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 45.5, lon: -73.6 }, to: { label: 'C', lat: 44.7, lon: -73.45 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'Passing times are estimates: the route\'s driving time spread evenly over its length, without traffic or stops.' },
  legs: [
    { id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(15), fits: true, stops: [stop('Champlain', 50, 13), stop('Plattsburgh', 100, 14)] },
    { id: 'back', distanceKm: 100, driveMinutes: 300, arriveAt: utc(44), fits: false, stops: [stop('Plattsburgh', 0, 38), stop('Champlain', 50, 40.5)] },
  ],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Champlain: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa1', 'Champlain', 'Farm market concert', 13.5, 44.45)] },
    Plattsburgh: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa2', 'Plattsburgh', 'Lakeside play', 15, 44.05), fixed('aaaaaaaaaaa3', 'Plattsburgh', 'Sunday jazz', 38.5, 44.15)] },
  },
};
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function stubBoard(page: Page, picks: object[] = []) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({ json: { trip, corridor, sources: { count: 2 }, listings, prep: null, plan: { tripId: ID, updatedAt: null, picks, starred: [] } } }),
  );
  await page.route(`**/api/trips/${ID}/plan`, (route) => route.fulfill({ json: { tripId: ID, updatedAt: utc(11), ...route.request().postDataJSON() } }));
}

const card = (page: Page, title: string) => page.locator('article', { hasText: title });

test.describe('the board', () => {
  test('groups the plan by day and reports no free time across the night', async ({ page }) => {
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }, { id: 'aaaaaaaaaaa2' }, { id: 'aaaaaaaaaaa3' }]);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    const body = page.locator('#plan-body');
    await expect(body.getByRole('heading', { level: 3 })).toHaveText(['Saturday 17 October', 'Sunday 18 October']);
    await expect(body.locator('.gap')).toHaveCount(1);
  });

  test('says when the traveller passes each town, and that the times are estimates', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(card(page, 'Farm market concert')).toContainText('You pass Champlain about 9:00 a.m. (estimated)');
    await expect(card(page, 'Sunday jazz')).toContainText('You pass Plattsburgh about 10:00 a.m. (estimated)');
    await expect(page.getByText(/Passing times are estimates/)).toHaveCount(1);
  });

  test('warns when the drive does not fit the time given for a leg', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.getByText('The drive back takes about 5 h, longer than the time you gave for it, so the times on the way back may not work.')).toBeVisible();
  });

  test('names the trip\'s state and time zone in plain words', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.locator('.badge')).toHaveText('On the road');
    await expect(page.locator('.stamp')).toContainText('Times are in Eastern Daylight Time');
  });

  test('opens a folded day to show the card whose pin was chosen', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await page.locator('.day-head', { hasText: /SUNDAY/i }).click();
    await expect(card(page, 'Sunday jazz')).toBeHidden();
    const pins = page.getByRole('region', { name: 'Map of the route' }).locator('path.leaflet-interactive:not(.route-line)');
    await expect(pins).toHaveCount(5);
    // Choosing a pin is what the map's click handler does; the listing pins are drawn after the town pins, in board order.
    await pins.nth(4).click({ force: true });
    await expect(card(page, 'Sunday jazz')).toBeVisible();
    await expect(card(page, 'Sunday jazz')).toBeFocused();
  });

  test('opens the plan and selects the text when the browser will not copy it', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
    });
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }]);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Copy plan' }).click();
    await expect(page.locator('#plan-body')).toBeVisible();
    await expect(page.getByLabel('The plan as text, to copy')).toBeFocused();
  });

  test('offers to try again when the board could not be loaded', async ({ page }) => {
    let fail = true;
    await page.route(`**/api/trips/${ID}/board`, (route) =>
      fail
        ? route.fulfill({ status: 503, json: { code: 'store_error', error: 'the store did not answer' } })
        : route.fulfill({ json: { trip, corridor, sources: { count: 2 }, listings, prep: null, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } }),
    );
    await page.goto(`/trips/${ID}`);
    await expect(page.getByText('the store did not answer')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(card(page, 'Farm market concert')).toBeVisible();
  });

  test('offers to sign in again when the traveller has been signed out', async ({ page }) => {
    await page.route(`**/api/trips/${ID}/board`, (route) => route.fulfill({ status: 401, json: { code: 'permission_denied', error: 'not signed in' } }));
    await page.goto(`/trips/${ID}`);
    await expect(page.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/');
  });
});

test.describe('the New trip form', () => {
  async function signedIn(page: Page) {
    const sent: Array<Record<string, unknown>> = [];
    await page.route('**/api/session', (route) => route.fulfill({ json: { authed: true } }));
    await page.route('**/api/trips', (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { trips: [] } });
      sent.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id: ID } });
    });
    await page.route(`**/api/trips/${ID}/board`, (route) => route.fulfill({ status: 404, json: { code: 'not_found', error: 'no such trip' } }));
    await page.goto('/');
    await page.getByLabel('From').fill('Montréal');
    await page.getByLabel('To').fill('Plattsburgh');
    await page.getByLabel('Leave').fill('2030-10-18T18:00');
    await page.getByLabel('Back or arrive by').fill('2030-10-20T22:00');
    await page.getByLabel('Round trip').check();
    return sent;
  }

  test('can take the time to head back instead of the hours at the destination', async ({ page }) => {
    const sent = await signedIn(page);
    await page.getByLabel('Head back at a set time').check();
    await page.getByLabel('Head back at', { exact: true }).fill('2030-10-20T13:00');
    await page.getByRole('button', { name: 'Make the trip' }).click();
    await expect.poll(() => sent[0]).toMatchObject({ roundTrip: true, turnaround: '2030-10-20T13:00:00-04:00' });
    expect(sent[0]).not.toHaveProperty('stay');
  });

  test('says when the time to head back is outside the trip', async ({ page }) => {
    const sent = await signedIn(page);
    await page.getByLabel('Head back at a set time').check();
    await page.getByLabel('Head back at', { exact: true }).fill('2030-10-21T13:00');
    await page.getByRole('button', { name: 'Make the trip' }).click();
    await expect(page.getByRole('form', { name: 'New trip' }).getByRole('alert')).toHaveText('"Head back at" must be between "Leave" and "Back or arrive by".');
    expect(sent).toHaveLength(0);
  });

  test('takes hours at the destination in quarters as well as halves', async ({ page }) => {
    const sent = await signedIn(page);
    await page.getByLabel(/Time at the destination/).fill('1.25');
    await page.getByRole('button', { name: 'Make the trip' }).click();
    await expect.poll(() => sent[0]).toMatchObject({ stay: 75 });
  });
});
