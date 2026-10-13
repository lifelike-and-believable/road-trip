import { expect, test, type Page, type Route } from '@playwright/test';

// What the board does when saving the plan fails, and that saves reach the server in the order they were made.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, km: number, hour: number) => ({ name, region: 'NY', lat: 0, lon: 0, km, from: utc(hour), until: utc(hour) });
const fixed = (id: string, stopName: string, title: string, startH: number) => ({
  id, stop: stopName, title, category: 'music', cost: 'free', source: 'https://events.example/list',
  schedule: { kind: 'fixed', start: utc(startH), durationMin: 60 },
});
const trip = {
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(23), roundTrip: false,
  tz: 'America/Toronto', status: 'underway', legs: [],
};
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 0, lon: 0 }, to: { label: 'C', lat: 0, lon: 0 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [stop('Champlain', 50, 13), stop('Plattsburgh', 100, 14)] }],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Champlain: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa1', 'Champlain', 'Farm market concert', 14)] },
    Plattsburgh: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa2', 'Plattsburgh', 'Lakeside play', 17)] },
  },
};

async function stubBoard(page: Page, onPlan: (route: Route) => Promise<void>) {
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({ json: { trip, corridor, sources: { count: 2 }, listings, prep: null, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] } } }),
  );
  await page.route(`**/api/trips/${ID}/plan`, onPlan);
}

const ok = (route: Route) => route.fulfill({ json: { tripId: ID, updatedAt: utc(11), ...route.request().postDataJSON() } });
const card = (page: Page, title: string) => page.locator('article', { hasText: title });
const add = (page: Page, title: string) => card(page, title).getByRole('button', { name: /^Add/ });

test.describe('saving the plan', () => {
  test('puts the board back and offers to try again when a save fails', async ({ page }) => {
    let fail = true;
    const sent: Array<Record<string, unknown>> = [];
    await stubBoard(page, async (route) => {
      sent.push(route.request().postDataJSON());
      if (fail) await route.fulfill({ status: 503, json: { code: 'store_error', error: 'the store did not answer' } });
      else await ok(route);
    });
    await page.goto(`/trips/${ID}`);
    await add(page, 'Farm market concert').click();

    const alert = page.getByRole('alert').filter({ hasText: 'was not saved' });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText('the store did not answer');
    await expect(add(page, 'Farm market concert')).toBeVisible();

    fail = false;
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(card(page, 'Farm market concert').getByRole('button', { name: /On the plan/ })).toBeVisible();
    await expect(alert).toHaveCount(0);
    expect(sent.at(-1)).toMatchObject({ picks: [{ id: 'aaaaaaaaaaa1' }] });
  });

  test('says the traveller has been signed out, with a way to sign in again', async ({ page }) => {
    await stubBoard(page, (route) => route.fulfill({ status: 401, json: { code: 'permission_denied', error: 'not signed in' } }));
    await page.goto(`/trips/${ID}`);
    await add(page, 'Farm market concert').click();
    const alert = page.getByRole('alert').filter({ hasText: 'signed out' });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/');
    await expect(add(page, 'Farm market concert')).toBeVisible();
  });

  test('sends one save at a time, so a slow earlier save cannot overwrite a later one', async ({ page }) => {
    let inFlight = 0;
    let most = 0;
    const sent: Array<Record<string, unknown>> = [];
    await stubBoard(page, async (route) => {
      inFlight++;
      most = Math.max(most, inFlight);
      sent.push(route.request().postDataJSON());
      // The first save is slow, as on a weak signal.
      if (sent.length === 1) await new Promise((r) => setTimeout(r, 500));
      inFlight--;
      await ok(route);
    });
    await page.goto(`/trips/${ID}`);
    await add(page, 'Farm market concert').click();
    await add(page, 'Lakeside play').click();
    await expect.poll(() => sent.length).toBeGreaterThanOrEqual(2);
    expect(most).toBe(1);
    expect(sent.at(-1)).toMatchObject({ picks: [{ id: 'aaaaaaaaaaa1' }, { id: 'aaaaaaaaaaa2' }] });
  });
});
