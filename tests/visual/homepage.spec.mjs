import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import publicSite from '../../assets/public-site.js';
import path from 'node:path';
const screenshotDir=path.resolve('../../review/previews/headless');
// Public fixture only. Real submissions, auth sessions and customer records are never used.
const publicBooks=await Promise.all([...publicSite.BOOK_SLUGS].filter(slug=>slug!=='moongori').map(async slug=>{
  const html=await readFile(new URL(`../../b/${slug}/index.html`,import.meta.url),'utf8');
  const product=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  return {title:product.name,author:product.author?.name||'신태림',category:slug.includes('card')?'card':'book',img_path:product.image.replace('https://gaeddirang.com/',''),description:product.description,price:Number(product.offers.price)};
}));
const sdkFixture=`window.supabase={createClient:()=>({from:table=>({select(){return this},order(){return Promise.resolve({data:table==='books'?${JSON.stringify(publicBooks)}:[],error:null})},limit(){return Promise.resolve({data:[],error:null})},insert(){throw Error('Submission forbidden in tests')}}),auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};`;
async function prepare(page,target='/'){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:sdkFixture}));
  await page.route('**/*.supabase.co/**',route=>route.abort());
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:''}));
  await page.goto(target,{waitUntil:'domcontentloaded'});
  await expect(page.locator('.prog-card')).toHaveCount(8);
  await page.evaluate(()=>document.fonts.ready);
  return errors;
}
for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844},{name:'small-mobile',width:320,height:720}]){
  test(`${viewport.name}: three journeys, cases, keyboard and modal return`,async({page})=>{
    await page.setViewportSize(viewport);const errors=await prepare(page);
    await expect(page.locator('.journey-links a')).toHaveCount(3);
    await expect(page.locator('#homeProgramTitle')).toContainText('프로그램 2개');
    await expect(page.locator('#nbListNews')).not.toContainText('늦은 합류');
    await expect(page.locator('#nbListNews')).not.toContainText('공개 예정');
    await expect(page.locator('#nbListNews')).toContainText('학교별 공동문집');
    await expect(page.locator('#nbListNotice')).toContainText('현재 모집 여부');
    if(viewport.width<900){
      await expect(page.locator('#mobileNavPanel')).toHaveAttribute('inert','');
      await page.locator('.hamburger-btn').click();
      await expect(page.locator('.hamburger-btn')).toHaveAttribute('aria-expanded','true');
      await expect(page.locator('#mobileNavPanel .mobile-menu-close')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobileNavPanel')).toHaveAttribute('inert','');
      await expect(page.locator('.hamburger-btn')).toBeFocused();
      await expect.poll(async()=>page.locator('#mobileNavPanel').evaluate(el=>el.getBoundingClientRect().left>=innerWidth)).toBe(true);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await mkdir(screenshotDir,{recursive:true});
    await page.screenshot({path:path.join(screenshotDir,`home-${viewport.name}.png`),fullPage:true});
    await page.screenshot({path:path.join(screenshotDir,`home-fold-${viewport.name}.png`)});
    await page.locator('.journey-links a[href="#institutions"]').click();
    await expect(page.locator('#institutions')).toBeVisible();
    await expect(page.locator('#institutions')).toContainText('예산 범위');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:path.join(screenshotDir,`institutions-${viewport.name}.png`),fullPage:true});
    await page.locator('#institutions a[href*="project=schools"]').click();
    await expect(page.locator('#projectDetailResult')).toContainText('총 두 권 출간');
    await expect(page).toHaveURL(/project=schools#projects$/);
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#projectModal a')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#projectModal')).not.toHaveClass(/active/);
    await expect(page).toHaveURL(/#institutions$/);
    await page.goForward();await expect(page.locator('#projectModal')).toHaveClass(/active/);
    await expect(page.locator('#projectDetailTitle')).toContainText('흥업초');
    await page.reload();await expect(page.locator('#projectModal')).toHaveClass(/active/);
    await page.locator('#projectModal .project-detail-close').click();
    await expect(page.locator('#projectModal')).not.toHaveClass(/active/);
    await page.evaluate(()=>switchView('main','program'));
    const pastProgram=page.locator('.prog-card[data-program="ai-emotion-writing-sep-2026"]');
    await pastProgram.focus();await page.keyboard.press('Enter');
    await expect(page.locator('#pmType')).toHaveText('지난 회차 정보');
    await expect(page.locator('#pmTime')).not.toContainText('늦은 합류');
    // Simulate delayed CMS rendering while a dialog is open: restore to the replacement card.
    await page.evaluate(()=>{renderProgramsUI(CURRENT_PROGRAMS);applyDeepLink()});
    await page.locator('#programModal .pm-wrapper').evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished))});
    await page.screenshot({path:path.join(screenshotDir,`program-${viewport.name}.png`)});
    await page.locator('#programModal .pm-close').click();await expect(page.locator('#programModal')).not.toHaveClass(/active/);
    await expect(pastProgram).toBeFocused();
    await page.evaluate(()=>switchView('main','library'));
    const book=page.locator('button.book-card').filter({hasText:'문고리'});await book.focus();await book.press('Enter');
    await expect(page.locator('#detailModal')).toHaveClass(/active/);
    expect(await page.evaluate(()=>bookShareUrl(currentOrderBook))).toBe('https://gaeddirang.com/b/moongori/');
    await page.keyboard.press('Escape');await expect(page.locator('#detailModal')).not.toHaveClass(/active/);
    await expect(book).toBeFocused();
    await page.evaluate(()=>switchView('main','projects'));
    await expect(page.locator('.team-person')).toHaveCount(3);
    await expect(page.locator('.project-card')).toHaveCount(7);
    await page.getByRole('button',{name:'이다솜',exact:true}).click();
    await expect(page.locator('.project-card:visible')).toHaveCount(3);
    await page.getByRole('button',{name:'전체',exact:true}).click();
    await expect(page.locator('.project-card:visible')).toHaveCount(7);
    await page.locator('.chat-launcher').click();await expect(page.locator('.chat-launcher')).toHaveAttribute('aria-expanded','true');
    await page.getByRole('button',{name:'챗봇 닫기',exact:true}).click();
    await page.getByRole('button',{name:'개인정보처리방침',exact:true}).click();
    await expect(page.locator('#privacyModal')).toHaveClass(/active/);
    await page.getByRole('button',{name:'개인정보처리방침 닫기'}).click();
    expect(errors).toEqual([]);
  });
}
test('direct program and project links close to the proper lists',async({page})=>{
  const errors=await prepare(page,'/?program=forest-sentences-autumn-2026');
  await expect(page.locator('#pmType')).toContainText('추가 참여 확인 필요');
  await page.locator('#programModal .pm-back').click();await expect(page).toHaveURL(/#program$/);await expect(page.locator('#program')).toBeVisible();
  await page.goto('/?project=forest#projects');await expect(page.locator('#projectDetailRole')).toContainText('아홉프레스 박지현');
  await page.locator('#projectModal .project-detail-close').click();await expect(page).toHaveURL(/#projects$/);await expect(page.locator('#projects')).toBeVisible();
  expect(errors).toEqual([]);
});
test('new CMS notices render as text and local writes never leave browser',async({page})=>{
  await prepare(page);
  await page.evaluate(()=>renderNoticesUI([{category:'news',title:'최신 CMS 소식 <img src=x onerror=alert(1)>',published_on:'2026-09-30',pinned:true,body:'로컬 검사용 가상 글'}]));
  await expect(page.locator('#nbListNews .nb-item').first()).toContainText('최신 CMS 소식');await expect(page.locator('#nbListNews img')).toHaveCount(0);
  const result=await page.evaluate(async()=>{let sent=false;window.fetch=async()=>{sent=true;throw Error('must not send')};const response=await previewFetch('https://example.com',{method:'POST',body:'test'});return {status:response.status,sent};});
  expect(result).toEqual({status:403,sent:false});
});
test('checkout includes a separate shipping estimate and marketing is not opted in',async({page})=>{
  await prepare(page);expect(await page.locator('#authMarketingConsent').isChecked()).toBe(false);
  await page.evaluate(()=>{saveCart([{title:'문고리',price:17000,qty:1,img:'assets/moongori/cover.png'}]);openCheckoutForm()});
  await expect(page.locator('#coSummaryTotal')).toHaveText('상품 합계: 17,000원');await expect(page.locator('#coShippingEstimate')).toContainText('20,400원');
  await page.evaluate(()=>{saveCart([{title:'문고리',price:17000,qty:2,img:'assets/moongori/cover.png'}]);renderCheckoutSummary()});
  await expect(page.locator('#coShippingEstimate')).toContainText('34,000원');await expect(page.locator('#coShippingEstimate')).toContainText('배송비: 0원');
});

test('all sixteen canonical book pages return 200 without automatic redirects',async({request})=>{
  for(const slug of publicSite.BOOK_SLUGS){
    const response=await request.get(`/b/${slug}/`,{maxRedirects:0});
    expect(response.status()).toBe(200);
    const html=await response.text();
    expect(html).toContain(`href="https://gaeddirang.com/b/${slug}/"`);
    expect(html).not.toMatch(/http-equiv=["']refresh|location\.(replace|assign)/i);
  }
  const missing=await request.get('/b/does-not-exist/',{maxRedirects:0});expect(missing.status()).toBe(404);
});

test('checkout retry reuses one opaque request id and completes without split table writes', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    window.__checkoutCalls = [];
    let attempt = 0;
    supabaseClient.rpc = async (name, args) => {
      window.__checkoutCalls.push({ name, args });attempt++;
      return attempt === 1 ? { data:null,error:{message:'synthetic outage'} } : { data:{id:'virtual-order-1',status:'신규',total_amount:14000},error:null };
    };
    saveCart([{title:'가상 도서',price:7000,img:'',qty:2}]);openCheckoutForm();
  });
  await page.locator('#coName').fill('가상 주문자');await page.locator('#coContact').fill('010-0000-0000');await page.locator('#coEmail').fill('buyer@example.test');
  await page.locator('#coAddress').fill('가상시 안전로 1');await page.locator('#coConsent').check();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#coSubmitBtn').click();await expect(page.locator('#coSubmitBtn')).toBeEnabled();
  await page.locator('#coSubmitBtn').click();await expect(page.locator('#coResult')).toHaveClass(/active/);
  const calls=await page.evaluate(()=>window.__checkoutCalls);
  expect(calls).toHaveLength(2);expect(calls.every(call=>call.name==='create_public_order_v1')).toBe(true);
  expect(calls[0].args.p_request_id).toBe(calls[1].args.p_request_id);expect(calls[1].args.p_items).toEqual([{book_title:'가상 도서',unit_price:7000,quantity:2}]);
});

for(const width of [1440,390,320]){
  test(`UX ${width}: catalog, search, statuses, nested dialogs and all public routes`,async({page})=>{
    await page.setViewportSize({width,height:900});const errors=await prepare(page);
    await page.locator('.journey-links a[href="#library"]').click();
    await expect(page.locator('#bookContainer .book-card')).toHaveCount(16);
    await expect(page.locator('#libraryCount')).toHaveText('16개');
    await expect(page.locator('#bookContainer')).toHaveCSS('display','grid');
    await page.locator('#libraryQuery').fill('존재하지 않는 책 이름');
    await expect(page.locator('#libraryEmpty')).toBeVisible();
    await page.locator('#libraryEmpty button').click();
    await page.locator('#library .cat-btn').filter({hasText:'카드'}).click();
    await expect(page.locator('#bookContainer .book-card')).toHaveCount(5);
    await page.locator('#libraryQuery').fill('두루');
    await expect(page.locator('#bookContainer .book-card')).toHaveCount(2);
    await page.evaluate(()=>resetBookFilters());
    await page.screenshot({path:path.join(screenshotDir,`library-ux-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'사이트 전체 검색',exact:true}).click();
    await expect(page.locator('#searchInput')).toBeFocused();
    await page.locator('#searchInput').fill('감정');
    const searchOptions=await page.locator('#searchResults .sr-item').count();await page.keyboard.press('ArrowUp');
    await expect(page.locator('#searchInput')).toHaveAttribute('aria-activedescendant',`sr-opt-${searchOptions-1}`);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#searchInput')).toHaveAttribute('aria-activedescendant','sr-opt-0');
    await page.keyboard.press('Enter');
    await expect(page.locator('#detailModal')).toHaveClass(/active/);
    await expect(page.locator('#siteSearchModal')).not.toHaveClass(/active/);
    await expect(page.locator('#nmPrice')).toContainText('원');
    const foundTitle=await page.locator('#nmTitle').innerText();
    await page.keyboard.press('Escape');
    await expect(page.locator('button.book-card').filter({hasText:foundTitle})).toBeFocused();
    await page.locator('button.book-card').filter({hasText:'문고리'}).click();
    await page.locator('#detailModal .new-modal-wrapper').evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished))});
    await page.screenshot({path:path.join(screenshotDir,`book-ux-${width}.png`)});
    await page.locator('.nm-order-btn').click();
    await expect(page.locator('#uxStatus')).toContainText('장바구니에 담았어요');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'장바구니 열기',exact:true}).click();
    await page.getByRole('button',{name:'주문하러 가기',exact:true}).click();
    const privacyLink=page.locator('#checkoutModal .em-consent-link').filter({hasText:'자세히 보기'});
    await privacyLink.click();
    await expect(page.locator('#privacyModal')).toHaveAttribute('aria-hidden','false');
    await expect(page.locator('#checkoutModal')).toHaveAttribute('inert','');
    await page.keyboard.press('Escape');
    await expect(page.locator('#checkoutModal')).not.toHaveAttribute('inert','');
    await expect(privacyLink).toBeFocused();
    await page.locator('#coName').fill('가상 주문자');
    await page.locator('#uxStatus').evaluate(el=>el.classList.remove('visible'));
    await expect(page.locator('#uxStatus')).toHaveCSS('opacity','0');
    const closeBox=await page.locator('#checkoutModal .em-close').boundingBox();expect(closeBox.y).toBeGreaterThanOrEqual(0);expect(closeBox.y+closeBox.height).toBeLessThanOrEqual(900);
    await page.screenshot({path:path.join(screenshotDir,`checkout-ux-${width}.png`)});
    await page.keyboard.press('Escape');
    await page.evaluate(()=>switchView('main','program'));
    await expect(page.locator('#progGrid .prog-card').first()).toHaveAttribute('data-program','walk-and-write-oct-2026');
    await expect(page.locator('#progGrid button button')).toHaveCount(0);
    await expect(page.locator('#progGrid')).toHaveCSS('transform','none');
    await page.getByRole('button',{name:'진행·예정 일정',exact:true}).click();
    await expect(page.locator('#progGrid .prog-card')).toHaveCount(5);
    await expect(page.locator('#progGrid .state-open')).toHaveCount(2);
    await expect(page.locator('#progGrid .state-schedule_check')).toHaveCount(2);
    await page.getByRole('button',{name:'지난 회차',exact:true}).click();
    await expect(page.locator('#progGrid .prog-card')).toHaveCount(3);
    await page.getByRole('button',{name:'전체',exact:true}).click();
    await page.screenshot({path:path.join(screenshotDir,`program-list-ux-${width}.png`),fullPage:true});
    for(const category of ['library','program','projects','institutions','finder','game','gaedditv','authors','publisher','moongori']){
      await page.evaluate(cat=>switchView(['authors','publisher'].includes(cat)?cat:'main',cat),category);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${category} horizontal overflow`).toBe(true);
      await expect(page.locator('#pageTrailCurrent')).not.toBeEmpty();
    }
    await page.evaluate(()=>switchView('main','projects'));
    await page.screenshot({path:path.join(screenshotDir,`projects-ux-${width}.png`),fullPage:true});
    await page.evaluate(()=>switchView('authors'));
    await page.locator('.ap-card').filter({hasText:'다솜'}).click();
    await expect(page.locator('.ap-detail[data-author="dasom"]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>switchView('main','finder'));
    await page.getByRole('button',{name:'테스트 시작하기',exact:true}).click();
    for(const name of ['오롯이 나 혼자서','조금 복잡하고 우울해요','글이나 체크리스트로 적기','내면의 성찰과 위로'])await page.getByRole('button',{name,exact:true}).click();
    await expect(page.locator('#resDetailLink')).toHaveAttribute('href',/\/b\/.+\//);
    const recommended=await page.locator('#resDetailLink').getAttribute('href');expect((await page.request.get(recommended)).status()).toBe(200);
    if(width<900){
      await page.locator('.hamburger-btn').click();
      const first=page.locator('#mobileNavPanel .mobile-menu-close');await first.focus();
      await page.keyboard.press('Shift+Tab');await expect(page.locator('#mobileNavPanel .mnav-cta')).toBeFocused();
      await page.keyboard.press('Tab');await expect(first).toBeFocused();
      await page.keyboard.press('Escape');await expect(page.locator('.hamburger-btn')).toBeFocused();
    }
    expect(errors).toEqual([]);
  });
}

test('search opens a project detail; catalog errors are visible without exposing diagnostics',async({page})=>{
  await prepare(page);await page.locator('.header-search').click();await page.locator('#searchInput').fill('이다솜');
  await page.locator('#searchResults .sr-item').filter({hasText:'작가'}).first().click();await expect(page.locator('.ap-detail[data-author="dasom"]')).toBeVisible();
  await page.locator('.header-search').click();await page.locator('#searchInput').fill('숲숲학교');
  const index=await page.locator('#searchResults .sr-item').evaluateAll(items=>items.findIndex(el=>el.textContent.includes('프로젝트')));
  expect(index).toBeGreaterThanOrEqual(0);await page.locator('#searchResults .sr-item').nth(index).click();
  await expect(page.locator('#projectModal')).toHaveClass(/active/);await expect(page.locator('#projectDetailTitle')).toContainText('숲숲학교');
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{supabaseClient.from=()=>({select(){return this},order:async()=>({data:null,error:{message:'synthetic'}})});await loadAllContent();switchView('main','library');});
  await expect(page.locator('#libraryLoadState')).toBeVisible();await expect(page.locator('#libraryLoadState')).not.toContainText('synthetic');
});

test('new real programs expose exclusions, schedule checks and correct facilitators in their detail panels',async({page})=>{
  await prepare(page,'/?program=make-my-book-first-2026');
  await expect(page.locator('#pmInstructor')).toContainText('박지현');
  await expect(page.locator('#pmTime')).toContainText('구독료');
  await expect(page.locator('#pmBenefit')).toContainText('보장');
  await page.locator('#programModal .pm-close').click();
  await page.goto('/?program=after-work-writing-90-oct-2026');
  await expect(page.locator('#pmType')).toHaveText('일정·장소 확인 중');
  await expect(page.locator('#pmTime')).toContainText('19:30');
  await page.locator('#programModal .pm-close').click();
  await page.goto('/?project=nurile#projects');
  await expect(page.locator('#projectDetailRole')).toContainText('두루');
  await expect(page.locator('#projectDetailResult')).toContainText('완료 실적이 아닙니다');
});

test('canonical book pages are readable and navigable on small phones',async({page})=>{
  await page.setViewportSize({width:320,height:720});
  await page.route('https://gaeddirang.com/assets/**',route=>route.fulfill({path:path.resolve(new URL(route.request().url()).pathname.slice(1))}));
  for(const slug of publicSite.BOOK_SLUGS){
    await page.goto(`/b/${slug}/`);await expect(page.locator('.book-page-nav a')).toHaveCount(3);
    await expect(page.locator('h1')).not.toBeEmpty();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.goto('/b/dasom_all_emotions_atlas/');await page.screenshot({path:path.join(screenshotDir,'canonical-book-320.png'),fullPage:true});
});
