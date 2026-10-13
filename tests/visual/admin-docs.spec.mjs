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
  ['settlements', '정산 자료실'],
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
      '성명: 김가상',
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
  await expect(page.locator('[data-f="profile.name"]')).toHaveValue('김가상');
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
      '김가상 / 필명 : 글봄',
      '학력',
      '연락처 010-0000-0000',
      '저서',
      '대표 강연 이력',
    ].join('\n')),
  });
  await expect(page.locator('.profile-import-note')).toContainText('자동 정리를 멈췄어요');
  await expect(page.locator('.profile-import-note')).toContainText('기존 내용은 그대로예요');
  await expect(page.locator('[data-f="profile.name"]')).toHaveValue(before);
});

test('admin docs: confirmed replacement clears optional fields missing from the new file', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#kit', { waitUntil:'domcontentloaded' });
  await page.locator('#kitSeg [data-sub="profile"]').click();
  await page.locator('[data-f="profile.intro"]').fill('이전 파일에서 남은 소개글');
  page.on('dialog', dialog => dialog.accept());
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.profile-import-btn').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name:'김바다_이력서.txt', mimeType:'text/plain', buffer:Buffer.from([
      '이름: 김바다',
      '한 줄 소개: 감정 기록 글쓰기 강사',
      '경력',
      '2024.01 ~ 현재 마음책방 운영',
      '저서',
      '2025.01 <마음 기록의 시작>',
      '강연 / 모임',
      '2026.01 별빛도서관 감정 기록 워크숍',
    ].join('\n')),
  });
  await expect(page.locator('.profile-import-note')).toContainText('5개 항목을 정리해 채웠어요');
  await expect(page.locator('[data-f="profile.intro"]')).toHaveValue('');
  await expect(page.locator('[data-f="profile.name"]')).toHaveValue('김바다');
});

test('admin docs: private HWP profile fixture can be validated without logging its contents', async ({ page }) => {
  const fixture = process.env.PROFILE_HWP_FIXTURE;
  test.skip(!fixture, 'Set PROFILE_HWP_FIXTURE only when checking a private real HWP locally.');
  await page.goto('/admin/docs.html?preview#kit', { waitUntil:'domcontentloaded' });
  await page.locator('#kitSeg [data-sub="profile"]').click();
  page.on('dialog', dialog => dialog.accept());
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.profile-import-btn').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(fixture);
  await expect(page.locator('.profile-import-note')).not.toContainText('읽는 중', { timeout:30000 });
  const result = await page.evaluate(() => ({
    note:document.querySelector('.profile-import-note')?.textContent || '',
    name:document.querySelector('[data-f="profile.name"]')?.value || '',
    headline:document.querySelector('[data-f="profile.headline"]')?.value || '',
    intro:document.querySelector('[data-f="profile.intro"]')?.value || '',
    careers:document.querySelector('[data-f="profile.careers"]')?.value || '',
    works:document.querySelector('[data-f="profile.works"]')?.value || '',
    lectures:document.querySelector('[data-f="profile.lectures"]')?.value || '',
  }));
  expect(result.note).not.toContain('읽는 중');
  expect(Object.values(result).join(' ').length).toBeGreaterThan(0);
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

test('admin docs: standard settlement form separates sales, event royalties and gross amount', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#royalty', { waitUntil:'domcontentloaded' });
  await page.evaluate(() => {
    populateRoyaltyBooks([
      { key:'가상A::가상 인세도서',author:'가상A',title:'가상 인세도서',type:'저자 인세',isRoyalty:true,price:16000,rate:.25,sales:[
        {date:'2026-07-10',channel:'가상 온라인몰',price:16000,qty:20,sheetRoyalty:80000},
        {date:'2026-08-20',channel:'가상 독립책방 위탁판매',price:16000,qty:11,sheetRoyalty:44000},
        {date:'2026-09-18',channel:'홍보 이벤트',memo:'인세 적용',price:16000,qty:1,sheetRoyalty:4000},
      ],operations:[] },
      { key:'가상B::가상 위탁도서',author:'가상B',title:'가상 위탁도서',type:'외부위탁',isRoyalty:false,price:14000,rate:.65,sales:[
        {date:'2026-09-01',channel:'가상 오프라인 판매',price:14000,qty:3},
      ],operations:[{label:'누적 입고',qty:16,note:'판매 아님'}] },
    ]);
    document.querySelector('#ryStart').value='2026-07-01';
    document.querySelector('#ryEnd').value='2026-09-30';
    document.querySelector('#ryPay').value='2026-10-10';
    document.querySelector('#ryIssue').value='2026-10-05';
    document.querySelector('#ryDocNo').value='GDR-QA-2026Q3-01';
    document.querySelector('#ryIssuer').value='가상 출판사';
    document.querySelector('#ryBasis').value=RY_MODEL.defaultBasis(BOOK,'2026-09-30');
    reapplyPeriod();renderRoyaltyRows();renderRoyalty();
  });

  const sheet=page.locator('#rySheet');
  await expect(sheet).toContainText('저자 인세 정산서');
  await expect(sheet).toContainText('판매 31권과 인세 적용 이벤트 제공 1권을 합한 32권에 인세를 적용했습니다.');
  await expect(sheet).toContainText('128,000원');
  await expect(sheet).toContainText('GDR-QA-2026Q3-01');
  await expect(sheet).toContainText('가상 출판사');
  await expect(sheet.locator('.section-title').nth(0)).toContainText('정산 내역');
  await expect(sheet.locator('.section-title').nth(1)).toContainText('채널별 정산 수량');
  await expect(sheet.locator('.section-title').nth(2)).toContainText('정산 산식');
  await expect(sheet.locator('.statement-issuer img')).toHaveAttribute('src', '../assets/images/brand/gd-universe-logomark.png');
  await expect(sheet.locator('.channel-table thead')).toHaveCount(0);
  await expect(sheet.locator('.channel-table tbody tr').first().locator('td')).toHaveCount(4);
  await expect(sheet.locator('.channel-table tbody tr').first().locator('td').nth(0)).toHaveCSS('background-color', 'rgb(242, 244, 241)');
  await expect(sheet.locator('.channel-table tbody tr').first().locator('td').nth(1)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(sheet.locator('.gross-total td').last()).toHaveCSS('font-size', '22.6667px');
  await expect(sheet.locator('.gross-total td').last()).toHaveCSS('font-weight', '700');
  await expect(sheet.locator('.gross-total td').last()).toHaveCSS('color', 'rgb(36, 76, 58)');
  const sectionLine=await sheet.locator('.section-title').first().evaluate(el=>{const s=getComputedStyle(el,'::after'),r=el.getBoundingClientRect();return{display:s.display,height:parseFloat(s.height),width:parseFloat(s.width),hostWidth:r.width,marginTop:parseFloat(s.marginTop)};});
  expect(sectionLine.display).toBe('block');
  expect(sectionLine.height).toBeCloseTo(1.333,1);
  expect(sectionLine.width).toBeCloseTo(sectionLine.hostWidth,0);
  expect(sectionLine.marginTop).toBeCloseTo(5.333,1);
  await expect(sheet).toContainText('실제 지급액은 기지급 내역과 공제 사항 확인 후 확정됩니다.');
  await expect(sheet.getByText('실제 지급액은 기지급 내역과 공제 사항 확인 후 확정됩니다.', { exact:true })).toHaveCount(1);
  await expect(sheet.getByText('온라인 판매는 구매확정일 기준, 그 외 채널은 9월30일까지 결제·출고 완료분을 기준으로 합니다.', { exact:true })).toHaveCount(1);
  await expect(sheet.locator('.section-title', { hasText:'저자 증정본 제공 내역' })).toHaveCount(0);
  await expect(sheet).not.toContainText('정가 환산액');
  await expect(sheet).not.toContainText('원천징수 3.3%');
  await expect(sheet).not.toContainText('ISBN');
  await expect(sheet).not.toContainText('사업자등록번호');
  await expect(sheet).not.toContainText('gaeddirang085@naver.com');
  await expect(sheet).not.toContainText('(인)');

  await page.evaluate(() => {
    document.querySelector('#ryGiftAgreed').value='10';
    document.querySelector('#ryGiftProvided').value='4';
    document.querySelector('#ryGiftRemaining').value='6';
    renderRoyalty();
  });
  await expect(sheet.locator('.section-title', { hasText:'저자 증정본 제공 내역' })).toHaveCount(1);
  await expect(sheet.locator('.gift-table')).toContainText('10권');
  await expect(sheet.locator('.gift-table')).toContainText('4권');
  await expect(sheet.locator('.gift-table')).toContainText('6권');
  await page.evaluate(() => {
    ['#ryGiftAgreed','#ryGiftProvided','#ryGiftRemaining'].forEach(selector=>document.querySelector(selector).value='');
    renderRoyalty();
  });

  await page.locator('#ryRows label', { hasText:'홍보 이벤트' }).locator('input').uncheck();
  await expect(sheet.locator('.channel-table')).toContainText('20권');
  await expect(sheet.locator('.channel-table')).toContainText('11권');
  await expect(sheet.locator('.gross-total')).toContainText('124,000원');
  await expect(sheet).toContainText('이벤트 1권은 정산 대상에서 제외했습니다.');

  await page.locator('#ryBasis').fill('가상 검증용 맞춤 기준 문구');
  await page.locator('#ryMemo').fill('가상A 전용 메모');
  await page.locator('#rySaveDraftBtn').click();
  await page.locator('#ryBook').selectOption('가상B::가상 위탁도서');
  await expect(sheet).toContainText('위탁도서 판매대금 정산서');
  await expect(sheet).toContainText('가상B');
  await expect(page.locator('#ryIssuer')).toHaveValue('개띠랑 책공방');
  await expect(sheet).not.toContainText('GDR-QA-2026Q3-01');
  await expect(sheet).not.toContainText('가상A 전용 메모');
  await expect(sheet).not.toContainText('누적 입고');
  await page.locator('#ryBook').selectOption('가상A::가상 인세도서');
  await expect(page.locator('#ryBasis')).toHaveValue('가상 검증용 맞춤 기준 문구');
  await expect(page.locator('#ryDocNo')).toHaveValue('GDR-QA-2026Q3-01');
  await expect(page.locator('#ryIssuer')).toHaveValue('가상 출판사');
  await expect(sheet).toContainText('가상A 전용 메모');

  await page.evaluate(() => { window.__printed=0;window.print=()=>{window.__printed+=1;}; });
  await page.locator('#ryPay').fill('');
  await page.locator('#ryPrintBtn').click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(0);
  await page.locator('#ryPay').fill('2026-10-10');
  await page.locator('#ryPrintBtn').click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  await expect(page.locator('#printArea')).toContainText('가상 검증용 맞춤 기준 문구');
});

test('admin docs: royalty payment accounts stay masked, explicit and outside the PDF', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#royalty', { waitUntil:'domcontentloaded' });
  await page.evaluate(() => {
    MODE='db';
    window.confirm=()=>true;
    window.__accountCalls=[];
    window.__clipboard='';
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__clipboard=value;}}});
    sb.rpc=async(name,args)=>{
      window.__accountCalls.push({name,args});
      if(name==='list_royalty_payment_accounts')return {data:[{
        id:'00000000-0000-0000-0000-000000000001',author_name:'가상작가',bank_name:'가상은행',
        masked_account:'•••• 0000',masked_holder:'가***주',verification_status:'verified',
        holder_confirmed:true,source_clear:true,source_type:'original_image',source_checked_on:'2026-10-10',
        updated_at:'2026-10-10T01:00:00Z',updated_by:'admin@example.test',last_access_at:null,last_access_action:null,
      }],error:null};
      if(name==='reveal_royalty_payment_account')return {data:[{
        id:args.p_id,author_name:'가상작가',bank_name:'가상은행',account_number:'000000000000',
        holder_name:'가상예금주',verification_status:'verified',
      }],error:null};
      if(name==='save_royalty_payment_account')return {data:[{id:args.p_id}],error:null};
      return {data:null,error:{message:'UNEXPECTED_RPC'}};
    };
    populateRoyaltyBooks([{key:'가상작가::가상도서',author:'가상작가',title:'가상도서',type:'저자 인세',isRoyalty:true,price:10000,rate:.2,sales:[],operations:[]}]);
    RoyaltyAccountUI.selectAuthor('가상작가');
  });

  const account=page.locator('#ryAccountHost');
  await expect(account).toContainText('가상은행 · •••• 0000 · 예금주 가***주');
  await expect(account).toContainText('확인 완료');
  await expect(account).not.toContainText('000000000000');
  await expect(page.locator('#rySheet')).not.toContainText('지급계좌');
  await expect(page.locator('#rySheet')).not.toContainText('가상은행');

  await account.locator('#ryAccountCopy').click();
  await expect.poll(()=>page.evaluate(()=>window.__clipboard)).toBe('가상은행 000000000000 가상예금주');
  const copyCall=await page.evaluate(()=>window.__accountCalls.find(c=>c.name==='reveal_royalty_payment_account'&&c.args.p_action==='copy'));
  expect(copyCall.args.p_id).toBe('00000000-0000-0000-0000-000000000001');

  await account.locator('#ryAccountEdit').click();
  await expect(account.locator('#ryAccountNumber')).toHaveValue('000000000000');
  const questionnaire=await page.evaluate(()=>window.__docsAssistant.makeQuestionnaire());
  expect(questionnaire).not.toContain('ryAccountNumber');
  expect(questionnaire).not.toContain('000000000000');
  expect(questionnaire).not.toContain('가상예금주');
  await account.locator('#ryAccountNumber').fill('000000000001');
  await expect(account.locator('#ryAccountSourceClear')).not.toBeChecked();
  await expect(account.locator('#ryAccountHolderConfirmed')).not.toBeChecked();
  await expect(account.locator('#ryAccountVerified')).not.toBeChecked();
  await expect(account.locator('#ryAccountNote')).toContainText('확인 상태를 해제');
  await account.locator('#ryAccountVerified').check();
  await account.locator('#ryAccountSave').click();
  await expect(account.locator('#ryAccountNote')).toContainText('확인 완료');
  expect(await page.evaluate(()=>Object.values(localStorage).some(v=>String(v).includes('000000000000')))).toBe(false);
  await expect(page.locator('#rySheet')).not.toContainText('000000000000');
});

test('admin docs: settlement archive separates templates, versions and private access', async ({ page }) => {
  await page.goto('/admin/docs.html?preview#settlements', {waitUntil:'domcontentloaded'});
  const archive=page.locator('#view-settlements');
  await expect(archive).toBeVisible();
  await expect(archive).toContainText('저자 인세 정산서');
  await expect(archive).toContainText('위탁도서 판매대금 정산서');
  await expect(archive).toContainText('작가별 외부 정산');
  await expect(archive).toContainText('내부 팀 정산');
  await expect(archive).toContainText('회사 보고서');
  await expect(archive.locator('.archive-status.review').first()).toContainText('검토중');
  await expect(archive.locator('.archive-status.confirmed').first()).toContainText('확정');
  await expect(archive.locator('.archive-status.superseded').first()).toContainText('대체됨');
  await expect(archive.locator('.archive-row')).toHaveCount(4);
  await expect(archive.locator('.archive-row').first()).toContainText('가상');
  await expect(archive.locator('.archive-open').first()).toBeDisabled();

  await archive.locator('[data-settlement-template="consignment"]').click();
  await expect(page.locator('#view-royalty')).toBeVisible();
  await expect(page).toHaveURL(/#royalty$/);

  await page.evaluate(async()=>{
    MODE='db';window.confirm=()=>true;window.__archiveCalls=[];window.__archiveOpen='';
    window.open=url=>{window.__archiveOpen=url;};
    const rows=[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',series_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',version_no:1,category:'internal_team',period_label:'2026년 8~9월',subject:'가상팀',title:'가상 내부 정산',status:'review',file_name:'가상팀_정산.pdf',storage_path:'33333333-3333-3333-3333-333333333333/cccccccc-cccc-cccc-cccc-cccccccccccc/가상팀_정산.pdf',mime_type:'application/pdf',size_bytes:100,created_at:'2026-10-10T00:00:00Z'}];
    sb.auth.getSession=async()=>({data:{session:{user:{id:'33333333-3333-3333-3333-333333333333'}}}});
    sb.rpc=async(name,args)=>{
      window.__archiveCalls.push({name,args});
      if(name==='list_settlement_documents')return {data:rows,error:null};
      if(name==='record_settlement_document_access')return {data:rows[0].storage_path,error:null};
      if(name==='set_settlement_document_status')return {data:null,error:null};
      if(name==='register_settlement_document')return {data:[{id:'new-doc'}],error:null};
      return {data:null,error:{message:'UNEXPECTED_RPC'}};
    };
    sb.storage.from=bucket=>({
      createSignedUrl:async(path,seconds,options)=>{window.__archiveCalls.push({name:'signed',bucket,path,seconds,options});return {data:{signedUrl:'https://signed.example.test/file'},error:null};},
      upload:async(path,file,options)=>{window.__archiveCalls.push({name:'upload',bucket,path,fileName:file.name,options});return {data:{path},error:null};},
      remove:async paths=>{window.__archiveCalls.push({name:'remove',paths});return {data:[],error:null};},
    });
    switchView('settlements');await SettlementArchiveUI.reload();
  });
  await expect(archive).toContainText('가상 내부 정산');
  await archive.locator('.archive-open').click();
  await expect.poll(()=>page.evaluate(()=>window.__archiveOpen)).toBe('https://signed.example.test/file');
  const signed=await page.evaluate(()=>window.__archiveCalls.find(call=>call.name==='signed'));
  expect(signed.bucket).toBe('settlement-documents');
  expect(signed.seconds).toBe(60);
  await archive.locator('.archive-supersede').first().click();
  await expect.poll(()=>page.evaluate(()=>window.__archiveCalls.some(call=>call.name==='set_settlement_document_status'&&call.args.p_status==='superseded'))).toBe(true);

  await archive.locator('#archiveAdd').click();
  await archive.locator('#archivePeriodLabel').fill('2026년 10월');
  await archive.locator('#archiveSubject').fill('가상팀');
  await archive.locator('#archiveTitle').fill('가상 월간 정산');
  await archive.locator('#archiveFile').setInputFiles({name:'가상팀_10월_정산.pdf',mimeType:'application/pdf',buffer:Buffer.from('fake private pdf')});
  await archive.locator('#archiveUpload').click();
  await expect.poll(()=>page.evaluate(()=>window.__archiveCalls.some(call=>call.name==='register_settlement_document'))).toBe(true);
  const upload=await page.evaluate(()=>window.__archiveCalls.find(call=>call.name==='upload'));
  const register=await page.evaluate(()=>window.__archiveCalls.find(call=>call.name==='register_settlement_document'));
  expect(upload.options.upsert).toBe(false);
  expect(upload.path).toMatch(/^33333333-3333-3333-3333-333333333333\/[0-9a-f-]{36}\//);
  expect(register.args.p_storage_path).toBe(upload.path);
  expect(register.args.p_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(register.args.p_status).toBeUndefined();
  expect(await page.evaluate(()=>Object.values(localStorage).some(value=>String(value).includes('가상팀_10월_정산.pdf')))).toBe(false);
});

test('admin docs: every printable form stays on one branded A4 page', async ({ page }) => {
  const cases = [
    ['quote', 'quote'],
    ['statement', 'statement'],
    ['royalty', 'royalty'],
    ['royalty-long-title', 'royalty:long'],
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
    await expect(page.locator('#printArea .qdoc .wrap'), name).toHaveCSS('max-width', name.startsWith('royalty')?'none':'760px');
    if(name.startsWith('royalty'))await expect(page.locator('#printArea .statement-top-meta'),name).toContainText('문서번호 GDR-QA-');
    const pdf = await page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pages, `${name} PDF pages`).toBe(1);
  }
});
