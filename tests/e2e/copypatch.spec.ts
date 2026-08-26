import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const passphrase = 'copypatch-e2e-passphrase';
const apiPath = '/__copypatch/api/v2';

function heroTitle(page: Page) {
  return page.locator('[data-copypatch="hero.title"]');
}

function toolbar(page: Page) {
  return page.getByRole('complementary', { name: 'CopyPatch Edit Toolbar' });
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/?copypatch=1');
  await expect(page.getByRole('dialog', { name: 'CopyPatch Editor' })).toBeVisible();

  const sessionResponse = page.waitForResponse((response) =>
    response.url().endsWith(`${apiPath}/session`) && response.request().method() === 'POST',
  );
  await page.getByLabel('Passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock Editor' }).click();

  const response = await sessionResponse;
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
  await expect(toolbar(page)).toBeVisible();
}

async function replaceHeroTitle(page: Page, text: string): Promise<void> {
  const title = heroTitle(page);
  await title.click();
  await title.fill(text);
  await title.blur();
  await expect(toolbar(page)).toContainText('1 unsaved edit');
}

async function saveDraft(page: Page, expectedStatus = 200): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/editor/en/changes') && response.request().method() === 'PUT',
  );
  await toolbar(page).getByRole('button', { name: 'Save Draft' }).click();
  expect((await responsePromise).status()).toBe(expectedStatus);
}

async function publishDraft(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/editor/en/publish') && response.request().method() === 'POST',
  );
  await toolbar(page).getByRole('button', { name: 'Publish' }).click();
  expect((await responsePromise).status()).toBe(200);
}

async function visitorPage(context: BrowserContext, suffix: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/?e2e=${suffix}`);
  return page;
}

test.describe('CopyPatch v2 same-origin editing', () => {
  test('serves a public snapshot without loading editor controls', async ({ page }) => {
    await page.goto('/');

    await expect(heroTitle(page)).toBeVisible();
    await expect(page.locator('#copypatch-portal-root')).toHaveCount(0);
  });

  test('authenticates on the host origin, saves a draft, and publishes it', async ({ page, context }) => {
    const publishedText = `Published through v2 ${Date.now()}`;
    await openEditor(page);
    await replaceHeroTitle(page, publishedText);
    await saveDraft(page);
    await expect(toolbar(page)).toContainText('1 saved draft');

    const beforePublish = await visitorPage(context, 'before-publish');
    await expect(heroTitle(beforePublish)).not.toHaveText(publishedText);

    await publishDraft(page);
    const published = await visitorPage(context, 'after-publish');
    await expect(heroTitle(published)).toHaveText(publishedText);
  });

  test('keeps markup-like copy inert after publishing', async ({ page, context }) => {
    const inertText = '<script>window.__copypatchXss = true</script>';
    await openEditor(page);
    await replaceHeroTitle(page, inertText);
    await saveDraft(page);
    await publishDraft(page);

    const visitor = await visitorPage(context, 'xss');
    await expect(heroTitle(visitor)).toHaveText(inertText);
    await expect(heroTitle(visitor).locator('script')).toHaveCount(0);
    await expect(visitor.evaluate(() => (window as Window & { __copypatchXss?: boolean }).__copypatchXss)).resolves.toBeUndefined();
  });

  test('isolates drafts and published snapshots by locale', async ({ page, context }) => {
    const turkishText = `Turkiye v2 ${Date.now()}`;
    await openEditor(page);
    await page.getByRole('button', { name: 'TR' }).click();
    await expect(toolbar(page)).toContainText('tr');

    const title = heroTitle(page);
    await title.click();
    await title.fill(turkishText);
    await title.blur();

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes('/editor/tr/changes') && response.request().method() === 'PUT',
    );
    await toolbar(page).getByRole('button', { name: 'Save Draft' }).click();
    expect((await saveResponse).status()).toBe(200);

    const publishResponse = page.waitForResponse((response) =>
      response.url().includes('/editor/tr/publish') && response.request().method() === 'POST',
    );
    await toolbar(page).getByRole('button', { name: 'Publish' }).click();
    expect((await publishResponse).status()).toBe(200);

    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(toolbar(page)).toContainText('en');
    await expect(title).not.toHaveText(turkishText);

    const englishVisitor = await visitorPage(context, 'english-locale');
    await expect(heroTitle(englishVisitor)).not.toHaveText(turkishText);
  });

  test('rejects a stale draft save without overwriting the newer draft', async ({ browser }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    const winningText = `Conflict winner ${Date.now()}`;
    const staleText = `Conflict stale ${Date.now()}`;

    try {
      await openEditor(first);
      await openEditor(second);

      await replaceHeroTitle(first, winningText);
      await saveDraft(first);

      await replaceHeroTitle(second, staleText);
      await saveDraft(second, 409);
      await expect(toolbar(second)).toContainText('The editor snapshot has changed.', { timeout: 10_000 });

      await publishDraft(first);
      const visitor = await visitorPage(firstContext, 'conflict');
      await expect(heroTitle(visitor)).toHaveText(winningText);
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test('keeps the public snapshot and mobile navigation usable on a phone viewport', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Covered by the mobile Chromium project.');
    await page.goto('/');
    await expect(heroTitle(page)).toBeVisible();

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Mobile Navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Mobile Navigation' })).toHaveCount(0);
  });
});
