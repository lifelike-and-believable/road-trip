import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'America/Toronto' });

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const utc = (h: number) => new Date(Date.UTC(2026, 9, 17) + h * 3_600_000).toISOString();
const trip = (id: string, from: string, to: string) => ({
  id, createdAt: utc(0), from: { label: from }, to: { label: to }, start: utc(11), end: utc(47), roundTrip: false, tz: 'America/Toronto', status: 'upcoming', legs: [],
});

async function stubHome(page: Page, deleted: string[]) {
  let trips = [trip(A, 'Montréal', 'Plattsburgh'), trip(B, 'Ottawa', 'Kingston')];
  await page.route('**/api/session', (route) => route.fulfill({ json: { authed: true } }));
  await page.route('**/api/trips', (route) => route.fulfill({ json: { trips } }));
  await page.route(/\/api\/trips\/[0-9a-f-]{36}$/, (route) => {
    if (route.request().method() === 'DELETE') {
      const id = route.request().url().split('/').pop()!;
      deleted.push(id);
      trips = trips.filter((t) => t.id !== id);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });
}

test.describe('deleting a trip from the list', () => {
  test('asks first, and then removes only that trip', async ({ page }) => {
    const deleted: string[] = [];
    await stubHome(page, deleted);
    await page.goto('/');
    const row = page.locator('li', { hasText: 'Montréal to Plattsburgh' });
    await row.getByRole('button', { name: 'Delete Montréal to Plattsburgh' }).click();
    await expect(row.getByText('Delete this trip and its plan?')).toBeVisible();
    expect(deleted).toEqual([]);
    await row.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(page.locator('li', { hasText: 'Montréal to Plattsburgh' })).toHaveCount(0);
    await expect(page.locator('li', { hasText: 'Ottawa to Kingston' })).toBeVisible();
    expect(deleted).toEqual([A]);
  });

  test('keeps the trip when the traveller changes their mind', async ({ page }) => {
    const deleted: string[] = [];
    await stubHome(page, deleted);
    await page.goto('/');
    const row = page.locator('li', { hasText: 'Ottawa to Kingston' });
    await row.getByRole('button', { name: 'Delete Ottawa to Kingston' }).click();
    await row.getByRole('button', { name: 'Keep it' }).click();
    await expect(row.getByText('Delete this trip and its plan?')).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Delete Ottawa to Kingston' })).toBeFocused();
    expect(deleted).toEqual([]);
  });

  test('says so when the delete fails, and keeps the trip', async ({ page }) => {
    await stubHome(page, []);
    await page.route(/\/api\/trips\/[0-9a-f-]{36}$/, (route) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 503, json: { error: 'the store is down' } }) : route.fallback(),
    );
    await page.goto('/');
    const row = page.locator('li', { hasText: 'Ottawa to Kingston' });
    await row.getByRole('button', { name: 'Delete Ottawa to Kingston' }).click();
    await row.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(row.getByRole('alert')).toContainText('the store is down');
    await expect(row).toBeVisible();
  });

  test('has no accessibility violations while asking', async ({ page }) => {
    await stubHome(page, []);
    await page.goto('/');
    await page.getByRole('button', { name: 'Delete Ottawa to Kingston' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('deleting a trip from its board', () => {
  test('goes back to the list afterwards', async ({ page }) => {
    const deleted: string[] = [];
    await stubHome(page, deleted);
    await page.route(`**/api/trips/${A}/board`, (route) =>
      route.fulfill({ json: { trip: trip(A, 'Montréal', 'Plattsburgh'), corridor: null, sources: null, listings: null, plan: { tripId: A, updatedAt: null, picks: [], starred: [] } } }),
    );
    await page.goto(`/trips/${A}`);
    await page.getByRole('button', { name: 'Delete this trip' }).click();
    await page.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(page).toHaveURL('/');
    expect(deleted).toEqual([A]);
  });
});
