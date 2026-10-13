import { expect, test } from '@playwright/test';

test.describe('the installable app', () => {
  test('links a manifest that names the app, and the icons it lists load', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(href!)).json();
    expect(manifest).toMatchObject({ name: 'Road Trip', display: 'standalone', start_url: '/' });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThan(0);
  });

  test('registers a service worker that stays out of /api', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const status = await page.evaluate(async () => (await fetch('/api/health')).status);
    expect(status).toBe(200);
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname);
      return urls;
    });
    expect(cached.some((u) => u.startsWith('/api'))).toBe(false);
    expect(cached).toContain('/offline.html');
  });

  test('shows the offline page, not a browser error, when a page is opened without a connection', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    // Chromium applies the offline setting to the worker's own requests a moment after the page's, so try again until it has.
    await expect(async () => {
      await page.goto('/trips/anything');
      await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await context.setOffline(false);
  });

  test('the offline page has no accessibility violations', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    await page.goto('/offline.html');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
