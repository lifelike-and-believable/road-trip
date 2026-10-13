import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The plan as a drawer fixed to the bottom, the days in columns, and the folds kept in the browser.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, km: number, hour: number) => ({ name, region: 'NY', lat: 44.8, lon: -73.4, km, from: utc(hour), until: utc(hour) });
const fixed = (id: string, stopName: string, title: string, startH: number) => ({
  id, stop: stopName, title, category: 'music', cost: 'free', source: 'https://events.example/list',
  schedule: { kind: 'fixed', start: utc(startH), durationMin: 60 },
});

const trip = {
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(47), roundTrip: false,
  tz: 'America/Toronto', status: 'underway', legs: [],
};
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 0, lon: 0 }, to: { label: 'C', lat: 0, lon: 0 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [stop('Champlain', 50, 14), stop('Plattsburgh', 100, 38)] }],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Champlain: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa2', 'Champlain', 'Farm market concert', 14.5)] },
    Plattsburgh: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa3', 'Plattsburgh', 'Lakeside play', 38.5)] },
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

const drawer = (page: Page) => page.getByRole('region', { name: /^Your plan/ });

test.describe('the plan drawer', () => {
  test('is a bar at the bottom, closed to begin with, that opens to show the itinerary and closes with Escape', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const open = page.getByRole('button', { name: 'Show itinerary' });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('aria-expanded', 'false');

    await page.locator('article', { hasText: 'Farm market concert' }).getByRole('button', { name: /^Add/ }).click();
    await expect(drawer(page).locator('.dcount')).toHaveText('1');
    await expect(drawer(page).locator('.item strong')).toBeHidden();

    await open.click();
    await expect(page.getByRole('button', { name: 'Hide itinerary' })).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer(page).locator('.item strong')).toHaveText(['Farm market concert']);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Show itinerary' })).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer(page).locator('.item strong')).toBeHidden();
  });

  test('stays at the bottom of the screen and leaves the end of the page clear of it', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.getByRole('button', { name: 'Show itinerary' })).toBeVisible();
    // The page can still grow after it first renders (cards, the map), so scroll to the end again on each look
    // and judge only once the layout has stopped moving.
    const viewport = page.viewportSize();
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const box = await drawer(page).boundingBox();
        return !!(box && viewport && Math.abs(box.y + box.height - viewport.height) < 2);
      })
      .toBe(true);
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const box = await drawer(page).boundingBox();
        const last = await page.locator('article').last().boundingBox();
        return !!(box && last && last.y + last.height <= box.y);
      })
      .toBe(true);
  });

  test('has no accessibility violations with the drawer open', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await page.locator('article', { hasText: 'Farm market concert' }).getByRole('button', { name: /^Add/ }).click();
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('the days', () => {
  test('sit side by side on a wide screen and stack on a phone', async ({ page }) => {
    await stubBoard(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/trips/${ID}`);
    const days = page.locator('section.day');
    await expect(days).toHaveCount(2);
    const boxes = async () => [await days.nth(0).boundingBox(), await days.nth(1).boundingBox()] as const;
    await expect.poll(async () => { const [a, b] = await boxes(); return !!(a && b && Math.abs(a.y - b.y) < 2 && b.x > a.x); }).toBe(true);

    // The layout follows the resize a moment later, so wait for it.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(async () => { const [c, d] = await boxes(); return !!(c && d && d.y > c.y && Math.abs(d.x - c.x) < 2); }).toBe(true);
  });

  test('remember which were folded, for the next visit to the same trip', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const saturday = page.getByRole('button', { name: /Saturday/ });
    await expect(saturday).toHaveAttribute('aria-expanded', 'true');
    await saturday.click();
    await expect(saturday).toHaveAttribute('aria-expanded', 'false');
    await page.reload();
    await expect(page.getByRole('button', { name: /Saturday/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /Sunday/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('start open when the browser will not keep anything', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    const saturday = page.getByRole('button', { name: /Saturday/ });
    await expect(saturday).toHaveAttribute('aria-expanded', 'true');
    await saturday.click();
    await expect(saturday).toHaveAttribute('aria-expanded', 'false');
  });
});
