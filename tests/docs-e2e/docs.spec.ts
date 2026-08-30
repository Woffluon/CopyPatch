import { expect, test } from '@playwright/test';

test('preserves the matching page when switching documentation language', async ({ page }) => {
  await page.goto('/docs/nextjs');

  await expect(page).toHaveTitle(/Next\.js App Router/);
  await expect(page.locator('link[rel="alternate"][hreflang="tr"]')).toHaveAttribute('href', /\/tr\/docs\/nextjs$/);
  await expect(page.locator('a[href="/tr/docs/nextjs"]').first()).toBeVisible();
});

test('opens local documentation search from the keyboard', async ({ page }) => {
  await page.goto('/docs');
  await page.keyboard.press('Control+k');

  const searchInput = page.locator('.pagefind-ui__search-input:visible').first();
  await expect(searchInput).toBeVisible();
  await searchInput.fill('CopyPatchProvider');
  await expect(page.locator('.pagefind-ui__result-link:visible').first()).toBeVisible();
});

test('documents render without horizontal overflow at supported widths', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop project owns the explicit viewport matrix');

  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/docs');
    expect(await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

test('documentation links resolve and the page has no console errors', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one complete static-link pass is sufficient');
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/docs');
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')).filter(Boolean))]);
  const responses = await Promise.all(hrefs.map((href) => page.request.get(href!)));

  for (const response of responses) expect(response.status(), response.url()).toBeLessThan(400);
  expect(errors).toEqual([]);
});

test('keeps documentation navigation usable on a mobile viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only behavior');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tr/docs');

  const trigger = page.locator('#docs-mobile-trigger');
  await trigger.click();
  await expect(page.locator('#docs-mobile-dropdown')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#docs-mobile-dropdown')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
