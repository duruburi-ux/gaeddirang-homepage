import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('../../review/previews/headless');

async function prepare(page) {
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.prog-card').length === 4);
  await page.evaluate(() => document.fonts?.ready);
  return consoleErrors;
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`${viewport.name}: layout and core interactions`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const consoleErrors = await prepare(page);

    await expect(page.locator('.prog-card')).toHaveCount(4);
    await expect(page.locator('#homeProgramTitle')).toContainText('프로그램 3개');
    await expect(page.locator('#nbListNews')).toContainText('지난 소식');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole('button', { name: /함께하는 프로그램/ }).click();
    const firstProgram = page.locator('.prog-card').first();
    await expect(firstProgram).toBeVisible();
    await firstProgram.focus();
    await firstProgram.press('Enter');
    await expect(page.locator('#programModal')).toHaveClass(/active/);
    await expect(page.locator('#programModal .pm-back')).toBeVisible();
    await expect(page.locator('#programModal .pm-close')).toBeVisible();
    await page.locator('#programModal .pm-close').click();
    await expect(page.locator('#programModal')).not.toHaveClass(/active/);

    const launcher = page.locator('.chat-launcher');
    await launcher.click();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#chatWindow')).toHaveClass(/active/);
    await page.getByRole('button', { name: '챗봇 닫기', exact: true }).click();
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: '개인정보처리방침', exact: true }).click();
    await expect(page.locator('#privacyModal')).toHaveClass(/active/);
    await page.getByRole('button', { name: '개인정보처리방침 닫기' }).click();

    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `homepage-${viewport.name}.png`), fullPage: true });
    expect(consoleErrors.filter(message => !message.includes('Failed to load resource'))).toEqual([]);
  });
}
