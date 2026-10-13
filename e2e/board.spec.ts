import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The board in a real browser against stubbed API replies, so it needs no database or sign-in.
// The same specs run against a Vercel preview, since the stubbing happens in the browser.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, km: number, hour: number, kind: string) => ({
  name, region: 'NY', lat: 0, lon: 0, kind, km, from: utc(hour), until: utc(hour),
});
const fixed = (id: string, stopName: string, title: string, category: string, cost: string, startH: number, durationMin: number) => ({
  id, stop: stopName, title, category, cost, source: 'https://events.example/list',
  schedule: { kind: 'fixed', start: utc(startH), durationMin }, notes: `About ${title}.`,
});
const flexible = (id: string, stopName: string, title: string, category: string, cost: string, open: number, close: number, typicalMin?: number) => ({
  id, stop: stopName, title, category, cost, source: 'https://events.example/list',
  schedule: { kind: 'flexible', hours: [{ opens: utc(open), closes: utc(close) }], ...(typicalMin ? { typicalMin } : {}) },
});

const trip = (status: string) => ({
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(23), roundTrip: false,
  tz: 'America/Toronto', status, legs: [],
});
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 0, lon: 0 }, to: { label: 'C', lat: 0, lon: 0 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [stop('Alburgh', 0, 12, 'origin'), stop('Champlain', 50, 13, 'along'), stop('Plattsburgh', 100, 14, 'destination')] }],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Alburgh: { refreshedAt: utc(10), listings: [flexible('aaaaaaaaaaa1', 'Alburgh', 'Maple Museum', 'museum', 'ticketed', 13, 21, 90)] },
    Champlain: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa2', 'Champlain', 'Farm market concert', 'music', 'free', 14, 60)] },
    Plattsburgh: {
      refreshedAt: utc(10),
      listings: [fixed('aaaaaaaaaaa3', 'Plattsburgh', 'Lakeside play', 'theatre', 'ticketed', 16.5, 120), flexible('aaaaaaaaaaa4', 'Plattsburgh', 'Riverside Park', 'outdoors', 'free', 12, 23)],
    },
  },
};

async function stubBoard(page: Page, opts: { status?: string; data?: object } = {}) {
  const saved: unknown[] = [];
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({
      json: { trip: trip(opts.status ?? 'underway'), corridor, sources: { count: 3 }, listings, plan: { tripId: ID, updatedAt: null, picks: [], starred: [] }, ...opts.data },
    }),
  );
  await page.route(`**/api/trips/${ID}/plan`, async (route) => {
    saved.push(route.request().postDataJSON());
    await route.fulfill({ json: { tripId: ID, updatedAt: utc(11), ...route.request().postDataJSON() } });
  });
  return saved;
}

test.describe('the home page', () => {
  test('asks for the passcode when signed out, and shows the trips once signed in', async ({ page }) => {
    let authed = false;
    await page.route('**/api/session', (route) => route.fulfill({ json: { authed } }));
    await page.route('**/api/login', (route) => {
      authed = true;
      return route.fulfill({ json: { ok: true } });
    });
    await page.route('**/api/trips', (route) => route.fulfill({ json: { trips: [trip('upcoming')] } }));
    await page.goto('/');
    await page.getByLabel('Passcode').fill('open sesame');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('link', { name: 'Montréal to Plattsburgh' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New trip' })).toBeVisible();
  });

  test('sends a wrong passcode back with a message', async ({ page }) => {
    await page.route('**/api/session', (route) => route.fulfill({ json: { authed: false } }));
    await page.route('**/api/login', (route) => route.fulfill({ status: 401, json: { code: 'bad_passcode', error: 'no' } }));
    await page.goto('/');
    await page.getByLabel('Passcode').fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'passcode' })).toHaveText("That passcode doesn't match.");
  });
});

test.describe('the board', () => {
  test('shows the day, the options in time order, and what each costs', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.getByRole('heading', { name: 'Montréal to Plattsburgh' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Saturday 17 October/ })).toBeVisible();
    const titles = await page.locator('article h3').allTextContents();
    // by start: the park opens at 8:00, the museum at 9:00
    expect(titles).toEqual(['Riverside Park', 'Maple Museum', 'Farm market concert', 'Lakeside play']);
    await expect(page.locator('article', { hasText: 'Farm market concert' })).toContainText('Free');
    await expect(page.locator('article', { hasText: 'Lakeside play' })).toContainText('Ticketed');
    await expect(page.getByText('4 of 4 shown')).toBeVisible();
  });

  test('builds the plan in time order with the gap and the estimated drive between picks, and saves it', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await page.locator('article', { hasText: 'Lakeside play' }).getByRole('button', { name: /^Add/ }).click();
    await page.locator('article', { hasText: 'Farm market concert' }).getByRole('button', { name: /^Add/ }).click();
    const plan = page.getByRole('region', { name: 'Your plan' });
    await expect(plan.locator('.item strong')).toHaveText(['Farm market concert', 'Lakeside play']);
    // 11:00 to 12:30 is 90 minutes; Champlain to Plattsburgh is 50 km, about an hour
    await expect(plan.locator('.gap')).toHaveText('1 h 30 min free · about 1 h drive');
    await expect(plan).toContainText('estimates from OSRM demo server, without traffic');
    expect(saved.at(-1)).toMatchObject({ picks: [{ id: 'aaaaaaaaaaa3' }, { id: 'aaaaaaaaaaa2' }], starred: [] });
  });

  test('warns when the drive is longer than the time between two picks', async ({ page }) => {
    // 30 minutes between the end of one show and the start of the next, and an hour's drive between the places
    const tight = {
      tripId: ID, updatedAt: utc(10),
      stops: {
        Champlain: { refreshedAt: utc(10), listings: [fixed('bbbbbbbbbbb1', 'Champlain', 'Early show', 'music', 'free', 14, 30)] },
        Plattsburgh: { refreshedAt: utc(10), listings: [fixed('bbbbbbbbbbb2', 'Plattsburgh', 'Late show', 'music', 'free', 15, 30)] },
      },
    };
    await stubBoard(page, { data: { listings: tight } });
    await page.goto(`/trips/${ID}`);
    await page.locator('article', { hasText: 'Early show' }).getByRole('button', { name: /^Add/ }).click();
    await page.locator('article', { hasText: 'Late show' }).getByRole('button', { name: /^Add/ }).click();
    await expect(page.getByRole('region', { name: 'Your plan' }).locator('.gap.warn')).toHaveText(
      '30 min between them, but the drive is about 1 h',
    );
  });

  test('says so when a flexible pick cannot be fitted around the others', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await page.locator('article', { hasText: 'Farm market concert' }).getByRole('button', { name: /^Add/ }).click();
    await page.locator('article', { hasText: 'Maple Museum' }).getByRole('button', { name: /^Add/ }).click();
    const plan = page.getByRole('region', { name: 'Your plan' });
    await expect(plan).toContainText('It cannot be fitted within its opening hours alongside your other picks.');
    await expect(plan.locator('.gap')).toHaveCount(0);
  });

  test('filters by category, free only and starred, and says how many are shown', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Music' }).click();
    await expect(page.locator('article h3')).toHaveText(['Farm market concert']);
    await expect(page.getByText('1 of 4 shown')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('button', { name: 'Free only' }).click();
    await expect(page.locator('article h3')).toHaveText(['Riverside Park', 'Farm market concert']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.locator('article', { hasText: 'Lakeside play' }).getByRole('button', { name: /Star/ }).click();
    await page.getByRole('button', { name: /Starred/ }).click();
    await expect(page.locator('article h3')).toHaveText(['Lakeside play']);
  });

  test('stars toggle and are saved', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const star = page.locator('article', { hasText: 'Maple Museum' }).getByRole('button', { name: /Star/ });
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(saved.at(-1)).toMatchObject({ starred: ['aaaaaaaaaaa1'] });
  });

  test('is read-only once the trip is over', async ({ page }) => {
    await stubBoard(page, { status: 'ended' });
    await page.goto(`/trips/${ID}`);
    await expect(page.getByText('This trip is over')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add/ })).toHaveCount(0);
  });

  test('says what is still to come when the route, sources or listings are missing', async ({ page }) => {
    await page.route(`**/api/trips/${ID}/prepare`, (route) => route.fulfill({ status: 202, json: { started: true } }));
    await stubBoard(page, { data: { corridor: null, sources: null, listings: null } });
    await page.goto(`/trips/${ID}`);
    // The steps are shown and the work starts by itself, with no button to build the route by hand.
    await expect(page.getByRole('region', { name: 'Getting this trip ready' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Build the route now' })).toHaveCount(0);
  });

  test('has no accessibility violations and never hides a focused control behind the filter bar', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.getByText('4 of 4 shown')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const hidden = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && top !== el && !el.contains(top) && /fixed|sticky/.test(getComputedStyle(top).position);
      });
      expect(hidden).toBe(false);
    }
  });
});
