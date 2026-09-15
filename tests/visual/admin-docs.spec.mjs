import { test, expect } from '@playwright/test';

const views = [
  ['quote', '견적서'],
  ['statement', '거래명세서'],
  ['records', 'B2B 진행'],
  ['partners', '거래처'],
  ['items', '품목표'],
  ['kit', '기관 제출 서류'],
  ['roster', '명단·출석부'],
  ['fees', '사례비 지급 명세'],
  ['royalty', '문고리 인세'],
  ['links', '링크 모음'],
];

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`admin docs ${viewport.name}: tabs, layout and draft guards`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/admin/docs.html?preview#quote', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#appView')).toBeVisible();
    await expect(page.locator('#docTabs .doc-tab')).toHaveCount(views.length);
    const tabLayout = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('#docTabs .doc-tab')];
      const bar = document.querySelector('#docTabs');
      return { rows:new Set(tabs.map(t=>Math.round(t.getBoundingClientRect().top))).size, scrolls:bar.scrollWidth>bar.clientWidth };
    });
    expect(tabLayout.rows).toBe(1);
    if(viewport.name === 'mobile') expect(tabLayout.scrolls).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--orange').trim())).toBe('#76513a');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#sheet .qdoc .wrap'), '::before').backgroundImage)).toContain('gaeddirang_wordmark.png');
    for (const [view, label] of views) {
      await page.locator(`#docTabs .doc-tab[data-view="${view}"]`).click();
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      await expect(page.locator(`#docTabs .doc-tab[data-view="${view}"]`)).toHaveClass(/active/);
      await expect(page).toHaveURL(new RegExp(`#${view}$`));
      await expect(page.locator(`#view-${view} > .view-desc`)).toBeVisible();
      await expect(page.locator(`#docTabs .doc-tab[data-view="${view}"]`)).toHaveText(label);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.locator('#docTabs .doc-tab[data-view="quote"]').click();
    await page.locator('#toName').fill('테스트 기관');
    await page.locator('#docTabs .doc-tab[data-view="records"]').click();
    await expect(page.locator('#view-records')).toBeVisible();
    await page.locator('#docTabs .doc-tab[data-view="quote"]').click();
    await expect(page.locator('#toName')).toHaveValue('테스트 기관');

    expect(errors).toEqual([]);
  });
}

test('admin docs: fee privacy, PDF readiness and save-race guards', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#fees', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await page.locator('#fePrintBtn').click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);

  await page.evaluate(() => { MODE = 'db'; localStorage.removeItem('docs_fees_draft'); });
  await page.locator('#feNote').fill('검사용 가짜 번호 1234567890123');
  await expect(page.locator('#feNote')).toHaveClass(/fees-bad/);
  expect(await page.evaluate(() => localStorage.getItem('docs_fees_draft'))).toBeNull();

  await page.evaluate(() => {
    MODE = 'db';
    switchView('quote'); resetForm();
    ITEMS = [{ ...blankItem(), name:'검사용 품목', price:1000, qty:1 }];
    document.querySelector('#title').value = '저장 시작'; update();
    window.__savedRow = null;
    sb.from = () => ({
      insert(row){ window.__savedRow = row; return this; },
      select(){ return this; },
      single(){ return new Promise(resolve => { window.__releaseSave = resolve; }); },
    });
    window.__saving = saveQuote();
  });
  await page.locator('#title').fill('저장 중 수정');
  const race = await page.evaluate(async () => {
    window.__releaseSave({ data:{ ...window.__savedRow, id:'test-quote', number:'TEST-1', status:'작성', updated_at:'2026-09-13T00:00:00Z' } });
    await window.__saving;
    return { dirty:quoteDirty(), draft:store(editKey(CURRENT.id)), title:document.querySelector('#title').value };
  });
  expect(race.title).toBe('저장 중 수정');
  expect(race.dirty).toBe(true);
  expect(race.draft?.data?.title).toBe('저장 중 수정');

  await page.evaluate(() => { MODE = 'preview'; switchView('kit'); });
  await page.locator('#kitSeg [data-sub="confirm"]').click();
  await page.locator('[data-f="confirm.dates"]').fill('');
  await page.locator('[data-f="confirm.headcount"]').fill('');
  await page.locator('#kitCfImport').click();
  await expect(page.locator('[data-f="confirm.dates"]')).toHaveValue('');
  await expect(page.locator('[data-f="confirm.headcount"]')).toHaveValue('');
  await page.locator('#kitPrint').click();
  await expect(page.locator('#toast')).toContainText('실제 출강 날짜와 시간');

  await page.evaluate(() => {
    setSeal('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
    switchView('statement');
  });
  await expect(page.locator('#tsSheet .statement-doc')).toHaveCount(1);
  await expect(page.locator('#tsSheet .blank-row')).toHaveCount(4);
  await expect(page.locator('#tsSheet')).not.toContainText('인수자 확인');
  await expect(page.locator('#tsSheet .receive .sig')).toHaveCount(0);
  await expect(page.locator('#tsSheet .sign .seal-wrap img')).toHaveCount(1);
  await expect(page.locator('#tsTip')).toContainText('머리글과 바닥글');

  await page.evaluate(() => { switchView('kit'); });
  await page.locator('#kitSeg [data-sub="plan"]').click();
  await expect(page.locator('#kitSheet .sign')).toContainText('대표 이진이');
  await expect(page.locator('#kitSheet .sign .seal-wrap img')).toHaveCount(1);
});

test('admin docs: every printable form stays on one branded A4 page', async ({ page }) => {
  const cases = [
    ['quote', 'quote'],
    ['statement', 'statement'],
    ['royalty', 'royalty'],
    ['kit-plan', 'kit:plan'],
    ['kit-profile', 'kit:profile'],
    ['kit-confirm', 'kit:confirm'],
    ['roster-list', 'roster:list'],
    ['roster-attendance', 'roster:attendance'],
    ['fees', 'fees'],
    ['fees-many', 'fees:many'],
  ];
  for (const [name, value] of cases) {
    await page.goto(`/admin/docs.html?preview&sample&printtest=${encodeURIComponent(value)}`, { waitUntil:'networkidle' });
    await expect(page.locator('#printArea .qdoc'), name).toHaveCount(1);
    await expect(page.locator('#printArea .qdoc .wrap'), name).toHaveCSS('max-width', '760px');
    const pdf = await page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pages, `${name} PDF pages`).toBe(1);
  }
});
