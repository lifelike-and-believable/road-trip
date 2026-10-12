import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WEB-001: axe with WCAG 2.2 AA tags. target-size is the only WCAG 2.2 rule in axe-core
// and is off by default, so it is enabled explicitly and checked to have run.
const pages = ['/'];

for (const route of pages) {
  test(`no axe violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
    const ran = [...results.passes, ...results.incomplete, ...results.inapplicable].some(r => r.id === 'target-size');
    expect(ran).toBe(true);
  });

  // WEB-002 (2.4.11): a focused element is never fully hidden by sticky or fixed content.
  test(`focus is not obscured on ${route}`, async ({ page }) => {
    await page.goto(route);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const hidden = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && top !== el && !el.contains(top) && getComputedStyle(top).position.match(/fixed|sticky/) !== null;
      });
      expect(hidden).toBe(false);
    }
  });
}
