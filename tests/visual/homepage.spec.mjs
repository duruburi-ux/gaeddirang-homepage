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
    await expect(page.locator('#nbListNews')).toContainText('늦은 합류 가능');
    await expect(page.locator('#nbListNotice')).toContainText('책공방 방문 전 확인해 주세요');
    await expect(page.locator('#nbListNotice')).toContainText('현재 모집 프로그램');
    await expect(page.locator('#nbListNotice')).toContainText('주문·배송·교환 및 환불 안내');
    await expect(page.locator('#nbListNotice')).not.toContainText('새로운 공간으로 이전');
    await expect(page.locator('#nbListNotice')).not.toContainText('경기상상캠퍼스로 보금자리');
    await expect(page.locator('#nbListNews')).toContainText('빵!탐정 1화');
    await expect(page.locator('#nbListNews')).toContainText('대림도서관 기록공작소 6기');
    await expect(page.locator('#nbListNews')).toContainText('숲숲학교 가을학기');
    await expect(page.locator('#nbListNews')).toContainText('입고 제안 진행 중');
    await expect(page.locator('#nbListNews')).toContainText('3차 입고 준비 중');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `homepage-home-${viewport.name}.png`), fullPage: true });

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

    await page.evaluate(() => switchView('main', 'projects'));
    await expect(page.locator('.team-person')).toHaveCount(3);
    await expect(page.locator('.team-activity')).toContainText('이다솜');
    await expect(page.locator('.team-activity')).toContainText('개띠랑');
    await expect(page.locator('.team-activity')).toContainText('두루');
    await expect(page.locator('.project-card')).toHaveCount(6);
    await expect(page.locator('.project-card')).toContainText(['숲숲학교', '이다솜의 감정·AI 기록', '대림도서관', '빵!탐정', '문고리', '흥업초·호저초']);
    await expect(page).toHaveURL(/#projects$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.project-card').first().click({ position: { x: 40, y: 40 } });
    await expect(page.locator('#projectModal')).toHaveClass(/active/);
    await expect(page.locator('#projectDetailTitle')).toHaveText('숲숲학교 〈숲의 문장들〉');
    await expect(page.locator('#projectDetailResult')).toContainText('아홉 권의 개인 책');
    await expect(page.getByRole('button', { name: '프로젝트 상세 닫기' })).toBeVisible();
    await page.getByRole('button', { name: '프로젝트 상세 닫기' }).click();
    await expect(page.locator('#projectModal')).not.toHaveClass(/active/);
    await page.screenshot({ path: path.join(screenshotDir, `homepage-projects-${viewport.name}.png`), fullPage: true });

    await page.evaluate(() => switchView('main', 'library'));
    await expect(page.locator('.book-card').filter({ hasText: '문고리' })).toHaveCount(1);

    const launcher = page.locator('.chat-launcher');
    await launcher.click();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#chatWindow')).toHaveClass(/active/);
    await page.getByRole('button', { name: '챗봇 닫기', exact: true }).click();
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: '개인정보처리방침', exact: true }).click();
    await expect(page.locator('#privacyModal')).toHaveClass(/active/);
    await page.getByRole('button', { name: '개인정보처리방침 닫기' }).click();

    await page.screenshot({ path: path.join(screenshotDir, `homepage-${viewport.name}.png`), fullPage: true });
    expect(consoleErrors.filter(message => !message.includes('Failed to load resource'))).toEqual([]);
  });
}

test('expired program dates stop being counted as open', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-30T03:00:00Z'));
  await prepare(page);
  await page.evaluate(() => {
    renderProgramsUI(CURRENT_PROGRAMS);
    renderProgramHighlights();
  });
  await expect(page.locator('#homeProgramTitle')).toContainText('프로그램 1개');
  await page.getByRole('button', { name: /함께하는 프로그램/ }).click();
  await expect(page.locator('.prog-card').first()).toContainText('일정 종료');
});
