import { expect, test, type Page } from '@playwright/test';

// Accessibility checks the desktop specs cannot make: a phone's width, 400% zoom, where focus goes after an
// entry leaves the page, Escape from anywhere, page titles, and the contrast of a field's edge.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, km: number, hour: number) => ({ name, region: 'NY', lat: 0, lon: 0, km, from: utc(hour), until: utc(hour) });
const fixed = (id: string, stopName: string, title: string, category: string, startH: number) => ({
  id, stop: stopName, title, category, cost: 'free', source: 'https://events.example/list',
  schedule: { kind: 'fixed', start: utc(startH), durationMin: 60 }, notes: `About ${title}.`,
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
const titles = ['Farm market concert', 'Lakeside play', 'Harbour jazz', 'Fiddle night', 'Street dance', 'Film in the park'];
const categories = ['music', 'theatre', 'music', 'music', 'dance', 'film'];
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Champlain: { refreshedAt: utc(10), listings: titles.slice(0, 3).map((t, i) => fixed(`aaaaaaaaaaa${i + 1}`, 'Champlain', t, categories[i], 13 + i)) },
    Plattsburgh: { refreshedAt: utc(10), listings: titles.slice(3).map((t, i) => fixed(`aaaaaaaaaab${i + 1}`, 'Plattsburgh', t, categories[i + 3], 14 + i)) },
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

/** Tab through the page and fail if a focused control is ever under something fixed or sticky. */
async function neverObscured(page: Page, presses = 40) {
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab');
    const hidden = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top && top !== el && !el.contains(top) && /fixed|sticky/.test(getComputedStyle(top).position) ? el.outerHTML.slice(0, 120) : null;
    });
    expect(hidden).toBeNull();
  }
}

const card = (page: Page, title: string) => page.locator('article', { hasText: title });
const position = (page: Page, selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).position);

test.describe('the board on a phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('keeps every focused control in view, with the itinerary closed and open', async ({ page }) => {
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }, { id: 'aaaaaaaaaab1' }]);
    await page.goto(`/trips/${ID}`);
    await expect(card(page, 'Film in the park')).toBeVisible();
    await neverObscured(page);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await page.locator('main').focus();
    await neverObscured(page);
  });

  test('lets the last card be scrolled clear of the plan bar', async ({ page }) => {
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }]);
    await page.goto(`/trips/${ID}`);
    await expect(card(page, 'Film in the park')).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const last = await card(page, 'Film in the park').boundingBox();
    const bar = await page.locator('.drawer').boundingBox();
    expect(last && bar && last.y + last.height <= bar.y).toBe(true);
  });

  test('does not pin the filter bar, which wraps to several rows this narrow', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    expect(await position(page, '.filters')).toBe('static');
  });
});

test.describe('the board at 400% zoom', () => {
  // A 1280 by 1024 window at 400% zoom lays out as 320 by 256.
  test.use({ viewport: { width: 320, height: 256 } });

  test('pins nothing, so nothing can cover what has focus', async ({ page }) => {
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }]);
    await page.goto(`/trips/${ID}`);
    await expect(card(page, 'Film in the park')).toBeAttached();
    expect(await position(page, '.filters')).toBe('static');
    expect(await position(page, '.drawer')).toBe('static');
    await neverObscured(page);
  });
});

test.describe('focus on the board', () => {
  test('moves to the next entry when one is hidden', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await card(page, 'Farm market concert').getByRole('button', { name: 'Hide Farm market concert' }).click();
    await expect(card(page, 'Fiddle night')).toBeFocused();
  });

  test('moves to the entry before when the last one is hidden', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await card(page, 'Film in the park').getByRole('button', { name: 'Hide Film in the park' }).click();
    await expect(card(page, 'Street dance')).toBeFocused();
  });

  test('moves to the Hidden chip, where entries come back, when nothing is left to show', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    for (const t of titles) await card(page, t).getByRole('button', { name: `Hide ${t}` }).click();
    await expect(page.getByRole('button', { name: '6 hidden' })).toBeFocused();
  });

  test('moves to the next item, then to the itinerary button, when picks are removed from the itinerary', async ({ page }) => {
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }, { id: 'aaaaaaaaaaa2' }]);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await page.getByRole('button', { name: 'Remove Farm market concert from your plan' }).click();
    await expect(page.getByRole('button', { name: 'Remove Lakeside play from your plan' })).toBeFocused();
    await page.getByRole('button', { name: 'Remove Lakeside play from your plan' }).click();
    await expect(page.getByRole('button', { name: 'Hide itinerary' })).toBeFocused();
  });

  test('closes the itinerary with Escape wherever focus is, and leaves focus where it was', async ({ page }) => {
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }]);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    const star = card(page, 'Lakeside play').getByRole('button', { name: /Star Lakeside play/ });
    await star.focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#plan-body')).toBeHidden();
    await expect(star).toBeFocused();
  });

  test('takes focus back to the itinerary button when Escape closes it from inside', async ({ page }) => {
    await stubBoard(page, [{ id: 'aaaaaaaaaaa1' }]);
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await page.getByRole('button', { name: 'Remove Farm market concert from your plan' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Show itinerary' })).toBeFocused();
  });

  test('names the page after the trip', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page).toHaveTitle('Montréal to Plattsburgh · Road Trip');
  });
});

test.describe('names on the board', () => {
  test('gives each stop button a unit for its count, each card its title, and the map a note on its keys', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const stops = page.getByRole('group', { name: 'Stops along the road' });
    await expect(stops.getByRole('button', { name: 'Champlain 3 listings' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Lakeside play' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Map of the route' })).toHaveAccessibleDescription(/arrow keys/i);
  });
});

test.describe('the New trip form', () => {
  test('ties the hint to the time at the destination', async ({ page }) => {
    await page.route('**/api/session', (route) => route.fulfill({ json: { authed: true } }));
    await page.route('**/api/trips', (route) => route.fulfill({ json: { trips: [] } }));
    await page.goto('/');
    await page.getByLabel('Round trip').check();
    await expect(page.getByLabel(/Time at the destination/)).toHaveAccessibleDescription(/middle of the trip/);
  });
});

test.describe('the home page', () => {
  async function home(page: Page, authed: boolean) {
    let signedIn = authed;
    await page.route('**/api/session', (route) => route.fulfill({ json: { authed: signedIn } }));
    await page.route('**/api/login', (route) => {
      signedIn = true;
      return route.fulfill({ json: { ok: true } });
    });
    await page.route('**/api/trips', (route) => route.fulfill({ json: { trips: [] } }));
    await page.goto('/');
  }

  test('moves focus to the trips once the passcode is accepted, and names the page for each state', async ({ page }) => {
    await home(page, false);
    await expect(page).toHaveTitle('Sign in · Road Trip');
    await page.getByLabel('Passcode').fill('open sesame');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Your trips' })).toBeFocused();
    await expect(page).toHaveTitle('Your trips · Road Trip');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`gives each field an edge of at least 3:1 against the form in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await home(page, true);
      const ratio = await page.getByLabel('From').evaluate((el) => {
        const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        let bgEl: Element | null = el.parentElement;
        let bg = 'rgba(0, 0, 0, 0)';
        while (bgEl && /rgba\(.*, 0\)|transparent/.test((bg = getComputedStyle(bgEl).backgroundColor))) bgEl = bgEl.parentElement;
        const [a, b] = [lum(rgb(getComputedStyle(el).borderTopColor)), lum(rgb(bg))];
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  }
});
