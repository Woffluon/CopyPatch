import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.resolve('e2e-copypatch.sqlite');

test.describe('CopyPatch End-to-End Browser & Acceptance Tests', () => {
  let serverProcess: ChildProcess;
  let viteProcess: ChildProcess;

  test.beforeAll(async () => {
    // 1. Clean test DB
    if (fs.existsSync(DB_PATH)) {
      try { fs.unlinkSync(DB_PATH); } catch {}
    }

    // 2. Initialize database & admin password
    const { initDatabase, hashPassword } = await import('../../packages/server/dist/index.js');
    const passHash = await hashPassword('correct-horse-battery-staple-2026');

    const dbsToClean = [DB_PATH, path.resolve('copypatch.sqlite')];
    for (const p of dbsToClean) {
      try {
        const dbConn = initDatabase(p);
        dbConn.sqlite.exec(`
          DELETE FROM content_entries;
          DELETE FROM content_state;
          DELETE FROM sessions;
          INSERT OR REPLACE INTO auth_credentials (id, password_hash, updated_at)
          VALUES (1, '${passHash}', ${Date.now()});
        `);
        dbConn.sqlite.close();
      } catch {}
    }

    // 3. Start standalone CopyPatch server in direct mode
    serverProcess = spawn(
      'node',
      [
        path.resolve('packages/server/dist/cli/bin.js'),
        'serve',
        '--port', '4040',
        '--db', DB_PATH,
        '--origin', 'http://localhost:5173',
        '--mode', 'direct',
      ],
      { stdio: 'pipe' }
    );

    // 4. Start Vite dev server directly via node
    const viteBin = path.resolve('examples/vite-react/node_modules/vite/bin/vite.js');
    viteProcess = spawn(
      'node',
      [viteBin, '--port', '5173'],
      {
        cwd: path.resolve('examples/vite-react'),
        stdio: 'pipe',
      }
    );

    // Wait for servers to be fully up and ready
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test.afterAll(async () => {
    if (viteProcess) {
      try { viteProcess.kill(); } catch {}
    }
    if (serverProcess) {
      try { serverProcess.kill(); } catch {}
    }
    if (fs.existsSync(DB_PATH)) {
      try { fs.unlinkSync(DB_PATH); } catch {}
    }
  });

  test('1. Public visitor sees fallback text without editor UI overhead', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Verify hero fallback title is visible
    const heroTitle = page.locator('[data-copypatch="home.hero.title"]');
    await expect(heroTitle).toHaveText('Build something people actually use.');

    // Verify no editor toolbar or portal is loaded
    const portal = page.locator('#copypatch-portal-root');
    await expect(portal).toHaveCount(0);
  });

  test('2. Editor workflow: login, caret placement, inline text edit, persistence and XSS safety', async ({ page }) => {
    // 1. Open with ?copypatch=1
    await page.goto('http://localhost:5173?copypatch=1');

    // 2. Expect login modal
    const modalTitle = page.locator('#copypatch-login-title');
    await expect(modalTitle).toBeVisible();

    // 3. Login with password
    await page.fill('#copypatch-password', 'correct-horse-battery-staple-2026');
    await page.click('button:has-text("Unlock Editor")');

    // 4. Toolbar appears
    const toolbar = page.locator('aside[aria-label="CopyPatch Edit Toolbar"]');
    await expect(toolbar).toBeVisible();

    // 5. Select hero title and edit text directly inline
    const heroTitle = page.locator('[data-copypatch="home.hero.title"]');
    await heroTitle.click();
    await heroTitle.fill('Production Ready Inline Copy Editing with CopyPatch!');

    // 6. Save changes
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();

    // Wait for save to complete
    await expect(page.locator('text=Ready to edit')).toBeVisible({ timeout: 5000 });

    // 7. Reload page in normal visitor mode (no ?copypatch=1)
    await page.goto('http://localhost:5173');
    await expect(heroTitle).toHaveText('Production Ready Inline Copy Editing with CopyPatch!');

    // 8. Re-open editor to test XSS inert string
    await page.goto('http://localhost:5173?copypatch=1');
    await heroTitle.click();
    await heroTitle.fill('<script>alert("XSS")</script>');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Ready to edit')).toBeVisible({ timeout: 5000 });

    // 9. Verify in normal visitor mode that the script is rendered strictly as inert literal text
    await page.goto('http://localhost:5173');
    await expect(heroTitle).toHaveText('<script>alert("XSS")</script>');
  });

  test('3. Multilingual isolation: Turkish editing does not alter English copy', async ({ page }) => {
    // 1. Open page in edit mode & login
    await page.goto('http://localhost:5173?copypatch=1');
    await page.fill('#copypatch-password', 'correct-horse-battery-staple-2026');
    await page.click('button:has-text("Unlock Editor")');
    await expect(page.locator('aside[aria-label="CopyPatch Edit Toolbar"]')).toBeVisible();

    // 2. Switch to Turkish locale
    await page.click('button:has-text("TR")');

    const heroTitle = page.locator('[data-copypatch="home.hero.title"]');
    await expect(heroTitle).toHaveText('İnsanların gerçekten kullandığı şeyler üretin.');

    // 3. Edit Turkish copy
    await heroTitle.click();
    await heroTitle.fill('Türkiye için özel olarak güncellenmiş başlık');

    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Ready to edit')).toBeVisible({ timeout: 5000 });

    // 4. Switch back to English and verify English copy remains completely unchanged
    await page.click('button:has-text("EN")');
    await expect(heroTitle).toHaveText('<script>alert("XSS")</script>');
  });

  test('4. Backend offline resilience: site remains fully usable on server outage', async ({ page }) => {
    // 1. Kill backend server process
    if (serverProcess) {
      try { serverProcess.kill(); } catch {}
    }

    // 2. Open client page - must render fallback without blanking or throwing fatal error
    await page.goto('http://localhost:5173');
    const heroTitle = page.locator('[data-copypatch="home.hero.title"]');
    await expect(heroTitle).toBeVisible();
    await expect(page.locator('text=Features')).toBeVisible();
  });
});
