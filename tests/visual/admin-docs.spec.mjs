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
  ['royalty', '작가 정산'],
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

test('admin docs: existing instructor profile file fills the profile form locally', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#kit', { waitUntil:'domcontentloaded' });
  await page.locator('#kitSeg [data-sub="profile"]').click();
  await expect(page.locator('.profile-import')).toBeVisible();
  await expect(page.locator('.profile-import')).toContainText('HWP·HWPX');
  await expect(page.locator('.doc-assist-up')).toHaveText('기존 프로필 파일 올리기');
  page.once('dialog', dialog => dialog.accept());
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.doc-assist-up').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name:'기존_강사프로필.txt', mimeType:'text/plain', buffer:Buffer.from([
      '성명: 이진이',
      '한 줄 소개: 그림책과 감정 기록을 잇는 글쓰기 강사',
      '강사 소개',
      '그림책과 질문으로 자신의 마음을 기록하도록 돕습니다.',
      '주요 경력',
      '2024.03 ~ 현재 개띠랑유니버스 대표',
      '저서·작품',
      '2025.06 《마음의 문고리》 공저',
      '주요 출강 이력',
      '2026.05 수원시립도서관 · 감정 기록 워크숍 (4회)',
    ].join('\n')),
  });
  await expect(page.locator('[data-f="profile.name"]')).toHaveValue('이진이');
  await expect(page.locator('[data-f="profile.careers"]')).toHaveValue(/개띠랑유니버스 대표/);
  await expect(page.locator('[data-f="profile.works"]')).toHaveValue(/마음의 문고리/);
  await expect(page.locator('[data-f="profile.lectures"]')).toHaveValue(/수원시립도서관/);
  await expect(page.locator('.profile-import-note')).toContainText('6개 항목을 정리해 채웠어요');
  await expect(page.locator('#kitSheet .profile-doc')).toHaveCount(1);
  await expect(page.locator('#kitSheet .kit-lh-no')).toHaveText(['01','02','03']);
  await expect(page.locator('#kitSheet .profile-title-kicker')).toContainText('INSTRUCTOR PROFILE');
  await page.locator('[data-f="profile.works"]').fill('대표 저서 《마음의 문고리》\n공저 《나에게도 빵빵한 하루가 필요해》');
  await expect(page.locator('#kitSheet .kit-profile-sec').nth(1).locator('.kit-r.no-date-col')).toHaveCount(2);
});

test('admin docs: uncertain profile import stops without overwriting the form', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#kit', { waitUntil:'domcontentloaded' });
  await page.locator('#kitSeg [data-sub="profile"]').click();
  const before = await page.locator('[data-f="profile.name"]').inputValue();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.profile-import-btn').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name:'깨진_프로필.txt', mimeType:'text/plain', buffer:Buffer.from([
      '장진호 / 필명 : 장두루',
      '학력',
      '연락처 010-4004-8396',
      '저서',
      '대표 강연 이력',
    ].join('\n')),
  });
  await expect(page.locator('.profile-import-note')).toContainText('자동 정리를 멈췄어요');
  await expect(page.locator('.profile-import-note')).toContainText('기존 내용은 그대로예요');
  await expect(page.locator('[data-f="profile.name"]')).toHaveValue(before);
});

test('admin docs: long instructor profile splits by whole rows and repeats its identity', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#kit', { waitUntil:'domcontentloaded' });
  await page.locator('#kitSeg [data-sub="profile"]').click();
  await page.locator('[data-f="profile.name"]').fill('장두루');
  await page.locator('[data-f="profile.headline"]').fill('감정 기록 · 글쓰기 · 창작');
  await page.locator('[data-f="profile.intro"]').fill('질문과 기록으로 자신의 마음을 표현하도록 돕는 강사입니다.');
  const careers = Array.from({length:12},(_,i) => `202${i%7}.0${i%9+1} ○○기관 ${i+1}기 · 감정 기록 강사`);
  const works = Array.from({length:9},(_,i) => `202${i%7}.0${i%9+1} 《마음을 기록하는 책 ${i+1}》 · 개띠랑 출판사`);
  const lectures = Array.from({length:20},(_,i) => `2026.${String(i%12+1).padStart(2,'0')} ○○도서관 ${i+1} · 감정 기록 워크숍 (${i%4+1}회)`);
  await page.locator('[data-f="profile.careers"]').fill(careers.join('\n'));
  await page.locator('[data-f="profile.works"]').fill(works.join('\n'));
  await page.locator('[data-f="profile.lectures"]').fill(lectures.join('\n'));
  await expect(page.locator('#kitFit')).toContainText(/A4 [2-9][0-9]*장 · 항목 단위 자동 분할/);
  const pages = await page.locator('#kitSheet .profile-page').count();
  expect(pages).toBeGreaterThan(1);
  await expect(page.locator('#kitSheet .profile-cont-head')).toHaveCount(pages-1);
  await expect(page.locator('#kitSheet .kit-r')).toHaveCount(careers.length+works.length+lectures.length);
  expect(await page.locator('#kitSheet .profile-key').count()).toBeGreaterThan(20);
  for(let i=0;i<pages;i++){
    expect(await page.locator('#kitSheet .profile-page').nth(i).locator('.kit-r').count()).toBeGreaterThan(0);
  }
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('#kitPrint').click();
  await expect(page.locator('#printArea .profile-page')).toHaveCount(pages);
  const pdf = await page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  expect(pdfPages).toBe(pages);
});

test('admin docs: instructor profile supports DIY sections and keeps inquiry at the final A4 bottom', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#kit', { waitUntil:'domcontentloaded' });
  await page.locator('#kitSeg [data-sub="profile"]').click();
  await page.locator('#kitProfileAdd').click();
  const custom = page.locator('#kitProfileSections .kit-profile-edit').last();
  await custom.locator('.kit-profile-title').fill('전시·프로젝트');
  await custom.locator('.kit-profile-text').fill('2026.08 마음 기록 전시 기획\n2025.12 지역 기록 프로젝트 운영');
  await expect(page.locator('#kitSheet .kit-lh')).toContainText(['경력','저서·작품','주요 출강 이력','전시·프로젝트']);

  const first = page.locator('#kitProfileSections .kit-profile-edit').first();
  await first.locator('.kit-profile-title').fill('주요 활동 경력');
  await expect(page.locator('#kitSheet .kit-lh').first()).toContainText('주요 활동 경력');
  await custom.locator('.kit-profile-up').click();
  await expect(page.locator('#kitProfileSections .kit-profile-title').nth(5)).toHaveValue('전시·프로젝트');

  const pages = page.locator('#kitSheet .profile-page');
  const count = await pages.count();
  await expect(page.locator('#kitSheet .profile-inquiry')).toHaveCount(1);
  await expect(pages.last().locator('.profile-inquiry')).toContainText('강의 및 프로그램 문의');
  const gap = await pages.last().evaluate(el => {
    const inquiry = el.querySelector('.profile-inquiry');
    const pageBox = el.getBoundingClientRect(), inquiryBox = inquiry.getBoundingClientRect();
    return Math.round(pageBox.bottom - inquiryBox.bottom);
  });
  expect(gap).toBeLessThan(55);
  if(count > 1) await expect(pages.first().locator('.profile-inquiry')).toHaveCount(0);
});

test('admin docs: profile importer is available after entering from another tab', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#royalty', { waitUntil:'domcontentloaded' });
  await page.evaluate(() => switchView('kit'));
  await page.locator('#kitSeg [data-sub="profile"]').click();
  await expect(page.locator('.profile-import')).toBeVisible();
  await expect(page.locator('.doc-assist-up')).toHaveText('기존 프로필 파일 올리기');
});

test('admin docs: every printable form stays on one branded A4 page', async ({ page }) => {
  const cases = [
    ['quote', 'quote'],
    ['statement', 'statement'],
    ['royalty', 'royalty'],
    ['royalty-consignment', 'royalty:consignment'],
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
