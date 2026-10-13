import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Hiding entries, the Hidden chip, the toast and Copy plan, against stubbed API replies.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const stop = (name: string, km: number, hour: number) => ({ name, region: 'NY', lat: 0, lon: 0, km, from: utc(hour), until: utc(hour) });
const fixed = (id: string, stopName: string, title: string, category: string, cost: string, startH: number, durationMin: number) => ({
  id, stop: stopName, title, category, cost, source: 'https://events.example/list', url: `https://events.example/${id}`,
  schedule: { kind: 'fixed', start: utc(startH), durationMin }, notes: `About ${title}.`,
});
const flexible = (id: string, stopName: string, title: string, category: string, cost: string, open: number, close: number) => ({
  id, stop: stopName, title, category, cost, source: 'https://events.example/list',
  schedule: { kind: 'flexible', hours: [{ opens: utc(open), closes: utc(close) }] },
});

const trip = (status: string) => ({
  id: ID, createdAt: utc(0), from: { label: 'Montréal' }, to: { label: 'Plattsburgh' }, start: utc(11), end: utc(23), roundTrip: false,
  tz: 'America/Toronto', status, legs: [],
});
const corridor = {
  tripId: ID, builtAt: utc(0), from: { label: 'A', lat: 0, lon: 0 }, to: { label: 'C', lat: 0, lon: 0 },
  sources: { geocoding: 'Nominatim', routing: 'OSRM demo server', timing: 'estimates' },
  legs: [{ id: 'out', distanceKm: 100, driveMinutes: 120, arriveAt: utc(14), fits: true, stops: [stop('Alburgh', 0, 12), stop('Champlain', 50, 13), stop('Plattsburgh', 100, 14)] }],
};
const listings = {
  tripId: ID, updatedAt: utc(10),
  stops: {
    Alburgh: { refreshedAt: utc(10), listings: [flexible('aaaaaaaaaaa1', 'Alburgh', 'Maple Museum', 'museum', 'ticketed', 13, 21)] },
    Champlain: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa2', 'Champlain', 'Farm market concert', 'music', 'free', 14, 60)] },
    Plattsburgh: { refreshedAt: utc(10), listings: [fixed('aaaaaaaaaaa3', 'Plattsburgh', 'Lakeside play', 'theatre', 'ticketed', 16.5, 120)] },
  },
};

async function stubBoard(page: Page, opts: { status?: string; plan?: object } = {}) {
  const saved: Array<Record<string, unknown>> = [];
  await page.route(`**/api/trips/${ID}/board`, (route) =>
    route.fulfill({
      json: { trip: trip(opts.status ?? 'underway'), corridor, sources: { count: 3 }, listings, plan: { tripId: ID, updatedAt: null, picks: [], starred: [], ...opts.plan } },
    }),
  );
  await page.route(`**/api/trips/${ID}/plan`, async (route) => {
    saved.push(route.request().postDataJSON());
    await route.fulfill({ json: { tripId: ID, updatedAt: utc(11), ...route.request().postDataJSON() } });
  });
  return saved;
}

const card = (page: Page, title: string) => page.locator('article', { hasText: title });

test.describe('hiding entries', () => {
  test('hides an entry, says so, keeps it out of the counts, and saves the hidden list', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.getByText('3 of 3 shown')).toBeVisible();
    await card(page, 'Lakeside play').getByRole('button', { name: 'Hide Lakeside play' }).click();
    await expect(card(page, 'Lakeside play')).toHaveCount(0);
    await expect(page.getByText('2 of 2 shown')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Hidden. Bring it back from the filter bar.' })).toBeAttached();
    expect(saved.at(-1)).toMatchObject({ hidden: ['aaaaaaaaaaa3'] });
  });

  test('brings a hidden entry back through the Hidden chip', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await card(page, 'Lakeside play').getByRole('button', { name: 'Hide Lakeside play' }).click();
    await page.getByRole('button', { name: '1 hidden' }).click();
    const hidden = card(page, 'Lakeside play');
    await expect(hidden).toContainText('Hidden from your board.');
    await expect(hidden.getByRole('button', { name: /^Add/ })).toHaveCount(0);
    await hidden.getByRole('button', { name: /Bring back/ }).click();
    await expect(page.getByRole('button', { name: /hidden/ })).toHaveCount(0);
    await expect(card(page, 'Lakeside play').getByRole('button', { name: /^Add/ })).toBeVisible();
    expect(saved.at(-1)).toMatchObject({ hidden: [] });
  });

  test('takes a hidden entry off the plan', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await card(page, 'Lakeside play').getByRole('button', { name: /^Add/ }).click();
    expect(saved.at(-1)).toMatchObject({ picks: [{ id: 'aaaaaaaaaaa3' }] });
    await card(page, 'Lakeside play').getByRole('button', { name: 'Hide Lakeside play' }).click();
    expect(saved.at(-1)).toMatchObject({ picks: [], hidden: ['aaaaaaaaaaa3'] });
  });

  test('starts with the entries a plan already hides left out', async ({ page }) => {
    await stubBoard(page, { plan: { hidden: ['aaaaaaaaaaa2'] } });
    await page.goto(`/trips/${ID}`);
    await expect(card(page, 'Farm market concert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '1 hidden' })).toBeVisible();
  });

  test('keeps the Hidden chip, and says why the board is empty, when everything is hidden', async ({ page }) => {
    await stubBoard(page, { plan: { hidden: ['aaaaaaaaaaa1', 'aaaaaaaaaaa2', 'aaaaaaaaaaa3'] } });
    await page.goto(`/trips/${ID}`);
    await expect(page.getByText('Everything found is hidden.')).toBeVisible();
    await expect(page.getByText(/Nothing found yet/)).toHaveCount(0);
    await page.getByRole('button', { name: '3 hidden' }).click();
    await expect(card(page, 'Lakeside play')).toContainText('Hidden from your board.');
  });

  test('offers no hide control once the trip is over', async ({ page }) => {
    await stubBoard(page, { status: 'ended' });
    await page.goto(`/trips/${ID}`);
    await expect(page.getByText('This trip is over')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Hide / })).toHaveCount(0);
  });

  test('has no accessibility violations with an entry hidden and shown again', async ({ page }) => {
    await stubBoard(page, { plan: { hidden: ['aaaaaaaaaaa2'] } });
    await page.goto(`/trips/${ID}`);
    await page.getByRole('button', { name: '1 hidden' }).click();
    await expect(card(page, 'Farm market concert')).toContainText('Hidden from your board.');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('the plan text', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('copies the plan as text and says so, and Clear empties it', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await expect(page.getByRole('button', { name: 'Copy plan' })).toHaveCount(0);
    await card(page, 'Farm market concert').getByRole('button', { name: /^Add/ }).click();
    await page.getByRole('button', { name: 'Copy plan' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Plan copied' })).toBeAttached();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('MY ROAD TRIP: MONTRÉAL TO PLATTSBURGH');
    expect(text).toContain('SATURDAY 17 OCTOBER');
    expect(text).toContain('Farm market concert');
    expect(text).toContain('https://events.example/aaaaaaaaaaa2');
    await page.getByRole('button', { name: 'Clear' }).click();
    expect(saved.at(-1)).toMatchObject({ picks: [] });
    await page.getByRole('button', { name: 'Show itinerary' }).click();
    await expect(page.getByText('Add one or two stops from the list')).toBeVisible();
  });

  test('puts back a cleared plan with Undo clear', async ({ page }) => {
    const saved = await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await card(page, 'Farm market concert').getByRole('button', { name: /^Add/ }).click();
    await card(page, 'Lakeside play').getByRole('button', { name: /^Add/ }).click();
    await page.getByRole('button', { name: 'Clear' }).click();
    expect(saved.at(-1)).toMatchObject({ picks: [] });
    const undo = page.getByRole('button', { name: 'Undo clear' });
    await expect(undo).toBeFocused();
    await undo.click();
    await expect.poll(() => saved.at(-1)).toMatchObject({ picks: [{ id: 'aaaaaaaaaaa2' }, { id: 'aaaaaaaaaaa3' }] });
    await expect(undo).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
  });

  test('stops offering Undo clear once something new is added', async ({ page }) => {
    await stubBoard(page);
    await page.goto(`/trips/${ID}`);
    await card(page, 'Farm market concert').getByRole('button', { name: /^Add/ }).click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await card(page, 'Lakeside play').getByRole('button', { name: /^Add/ }).click();
    await expect(page.getByRole('button', { name: 'Undo clear' })).toHaveCount(0);
  });
});
