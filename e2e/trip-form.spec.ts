import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The New trip form: what it sends, and that a mistake is named in the form's own words, never the server's.
test.use({ timezoneId: 'America/Toronto' });

const ID = '11111111-1111-1111-1111-111111111111';

async function signedIn(page: Page, onCreate?: (body: Record<string, unknown>) => { status: number; json: object }) {
  const sent: Array<Record<string, unknown>> = [];
  await page.route('**/api/session', (route) => route.fulfill({ json: { authed: true } }));
  await page.route('**/api/trips', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { trips: [] } });
    const body = route.request().postDataJSON();
    sent.push(body);
    const reply = onCreate?.(body) ?? { status: 201, json: { id: ID } };
    return route.fulfill(reply);
  });
  await page.route(`**/api/trips/${ID}/board`, (route) => route.fulfill({ status: 404, json: { code: 'not_found', error: 'no such trip' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New trip' })).toBeVisible();
  return sent;
}

async function fill(page: Page, v: { leave: string; back: string; round?: boolean; stay?: string }) {
  await page.getByLabel('From').fill('Montréal');
  await page.getByLabel('To').fill('Plattsburgh');
  await page.getByLabel('Leave').fill(v.leave);
  await page.getByLabel('Back or arrive by').fill(v.back);
  if (v.round) await page.getByLabel('Round trip').check();
  if (v.stay) await page.getByLabel(/Time at the destination/).fill(v.stay);
  await page.getByRole('button', { name: 'Make the trip' }).click();
}

const alert = (page: Page) => page.getByRole('form', { name: 'New trip' }).getByRole('alert');

test.describe('the New trip form', () => {
  test('sends the times with the traveller\'s offset and the stay in minutes, then opens the board', async ({ page }) => {
    const sent = await signedIn(page);
    await fill(page, { leave: '2030-10-18T09:00', back: '2030-10-20T18:00', round: true, stay: '24' });
    await expect(page).toHaveURL(new RegExp(`/trips/${ID}$`));
    expect(sent[0]).toMatchObject({
      from: { label: 'Montréal' }, to: { label: 'Plattsburgh' },
      start: '2030-10-18T09:00:00-04:00', end: '2030-10-20T18:00:00-04:00', roundTrip: true, stay: 1440,
    });
  });

  test('names the fields when the return is not after leaving, without asking the server', async ({ page }) => {
    const sent = await signedIn(page);
    await fill(page, { leave: '2030-10-20T09:00', back: '2030-10-18T18:00' });
    await expect(alert(page)).toHaveText('"Back or arrive by" must be after "Leave".');
    expect(sent).toHaveLength(0);
  });

  test('says when the return time has already passed', async ({ page }) => {
    const sent = await signedIn(page);
    await fill(page, { leave: '2020-10-18T09:00', back: '2020-10-20T18:00' });
    await expect(alert(page)).toHaveText('"Back or arrive by" has already passed.');
    expect(sent).toHaveLength(0);
  });

  test('says when the time at the destination does not fit in the trip', async ({ page }) => {
    const sent = await signedIn(page);
    await fill(page, { leave: '2030-10-18T09:00', back: '2030-10-18T18:00', round: true, stay: '9' });
    await expect(alert(page)).toHaveText('"Time at the destination" must be shorter than the time from "Leave" to "Back or arrive by".');
    expect(sent).toHaveLength(0);
  });

  test('shows a plain message, not the server\'s, when the server refuses the trip', async ({ page }) => {
    await signedIn(page, () => ({ status: 400, json: { code: 'bad_trip', errors: ['tz must be an IANA time zone name'] } }));
    await fill(page, { leave: '2030-10-18T09:00', back: '2030-10-20T18:00' });
    await expect(alert(page)).toHaveText('The trip could not be made. Check the places and times, then try again.');
  });

  test('says when the traveller has been signed out', async ({ page }) => {
    await signedIn(page, () => ({ status: 401, json: { code: 'permission_denied', error: 'not signed in' } }));
    await fill(page, { leave: '2030-10-18T09:00', back: '2030-10-20T18:00' });
    await expect(alert(page)).toHaveText('You have been signed out. Reload the page to sign in again.');
  });

  test('has no accessibility violations with a message showing', async ({ page }) => {
    await signedIn(page);
    await fill(page, { leave: '2030-10-20T09:00', back: '2030-10-18T18:00' });
    await expect(alert(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
