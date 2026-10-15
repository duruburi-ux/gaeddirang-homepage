import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import publicSite from '../../assets/public-site.js';

// Public book metadata and synthetic customers only; no real SDK or order writes.
const publicBooks = await Promise.all([...publicSite.BOOK_SLUGS].filter(slug => slug !== 'moongori').map(async slug => {
  const html = await readFile(new URL(`../../b/${slug}/index.html`, import.meta.url), 'utf8');
  const product = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  return {
    id: `fixture-${slug}`, slug, title: product.name, author: product.author?.name || '개띠랑',
    category: slug.includes('card') ? 'card' : 'book',
    img_path: product.image.replace('https://gaeddirang.com/', ''),
    description: product.description, price: Number(product.offers.price)
  };
}));
const nightBook = publicBooks.find(book => book.slug === 'duru_anxiety_night_walk');
const sdkFixture = `
window.supabase = {createClient: (url, key, options) => ({
  from: table => ({
    select() { return this; },
    order() {
      window.__bookshopSdkReads.push(table);
      return Promise.resolve(table === 'books'
        ? {data: window.__bookshopFixture.error ? null : window.__bookshopFixture.books, error: window.__bookshopFixture.error}
        : {data: [], error: null});
    },
    insert() { throw Error('Real table submission is forbidden'); },
    upsert() { throw Error('Real cart synchronization is forbidden'); }
  }),
  rpc: async (name, args) => {
    window.__bookshopRpcCalls.push({name, args});
    const response = await options.global.fetch(url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(args)
    });
    const body = await response.json();
    window.__bookshopPreviewResponses.push({status: response.status, body});
    return response.ok ? {data: body, error: null} : {data: null, error: body};
  },
  auth: {
    getSession: async () => ({data: {session: null}}),
    onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}})
  }
})};`;

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

async function prepare(page, { books = publicBooks, error = null, engine = 'fallback' } = {}) {
  const errors = [];
  const blockedWrites = [];
  const blockedSupabase = [];
  const requests = [];
  page.on('pageerror', exception => errors.push(exception.message));
  page.on('request', request => requests.push({url: request.url(), method: request.method(), body: request.postData()}));
  await page.clock.setFixedTime(new Date('2026-10-15T03:00:00Z'));
  await page.addInitScript(({ books, error }) => {
    window.__bookshopFixture = { books, error };
    window.__bookshopSdkReads = [];
    window.__bookshopRpcCalls = [];
    window.__bookshopPreviewResponses = [];
    window.__bookshopStorageWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.__bookshopStorageWrites.push({key, value: String(value)});
      return setItem.call(this, key, value);
    };
  }, { books, error });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!local && !['GET', 'HEAD'].includes(request.method())) {
      blockedWrites.push({url: request.url(), method: request.method()});
      return route.abort();
    }
    if (url.hostname.endsWith('.supabase.co')) {
      blockedSupabase.push(request.url());
      return route.abort();
    }
    if (url.pathname.endsWith('/supabase.min.js')) return route.fulfill({contentType: 'application/javascript', body: sdkFixture});
    if (url.hostname === 'www.youtube-nocookie.com') return route.fulfill({contentType: 'text/html', body: ''});
    if (engine === 'fallback' && url.hostname === 'esm.sh') return route.abort();
    return route.continue();
  });
  await page.goto('/#bookshop', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('#bookshop')).toBeVisible();
  await expect(page.locator('#virtualBookshop .vbs-shell')).toBeVisible();
  await expect.poll(() => page.evaluate(() => GaeddirangVirtualBookshopSource.getCatalogState().loading)).toBe(false);
  await expect(page.locator('.vbs-stage')).toHaveAttribute('data-engine', engine === 'fallback' ? 'fallback' : 'ready', {timeout: 25_000});
  await page.evaluate(() => document.fonts.ready);
  return { errors, blockedWrites, blockedSupabase, requests };
}

function app(page) { return page.locator('#virtualBookshop'); }
function action(page, name) { return app(page).locator(`[data-vbs-action="${name}"]`); }
async function assertSafe(run, page) {
  expect(run.errors).toEqual([]);
  expect(run.blockedWrites).toEqual([]);
  expect(run.blockedSupabase).toEqual([]);
  expect(await page.evaluate(() => window.__bookshopRpcCalls)).toEqual([]);
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await app(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}
async function openRecommendedBook(page) {
  await action(page, 'dialogue').filter({hasText: '오늘 마음에 맞는 책'}).click();
  await action(page, 'recommend').filter({hasText: '차분히 쉬고 싶어요'}).click();
  await expect(app(page).locator('.vbs-dialogue')).toContainText(nightBook.title);
  await action(page, 'book').filter({hasText: '이 책 소개 보기'}).click();
  await expect(app(page).locator('.vbs-panel-title')).toHaveText(nightBook.title);
  await expect(app(page).locator('.vbs-detail-price')).toHaveText('15,000원');
  await expect(app(page).locator('.vbs-stock')).toContainText('주문 확인 시 안내');
}

for (const width of [1440, 390, 320]) {
  test(`${width}px: recommendation, shared cart, existing checkout and local-only rejected order`, async ({page}, testInfo) => {
    await page.setViewportSize({width, height: 950});
    const run = await prepare(page);
    await expect(page).toHaveURL(/#bookshop$/);
    expect(await page.evaluate(() => GaeddirangBookshopCatalog.normalizeBooks(GaeddirangVirtualBookshopSource.getRawCatalog(), {verified: true}).length)).toBe(15);
    await noOverflow(page);
    await openRecommendedBook(page);
    await expect.poll(() => app(page).locator('.vbs-cover-large').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await action(page, 'add').click();
    await expect(app(page).locator('[data-vbs-count]')).toHaveText('1');
    await expect(page.locator('#cartBadge')).toHaveText('1');
    await noOverflow(page);
    await action(page, 'browse').click();
    await expect(page.locator('#library')).toBeVisible();
    await page.locator('#bookContainer .book-card').filter({hasText: nightBook.title}).click();
    await page.locator('#detailModal .nm-order-btn').click();
    await expect(page.locator('#cartBadge')).toHaveText('2');
    await expect(app(page).locator('[data-vbs-count]')).toHaveText('2');
    await page.keyboard.press('Escape');
    await page.evaluate(() => switchView('main', 'bookshop'));
    await app(page).locator('.vbs-topbar [data-vbs-action="bag"]').click();
    await expect(app(page).locator('.vbs-cart-row')).toHaveCount(1);
    await expect(app(page).locator('.vbs-cart-row .vbs-muted')).toContainText('2권');
    await action(page, 'checkout').click();
    await expect(page.locator('#cartModal')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__bookshopRpcCalls)).toEqual([]);
    await page.locator('#cartModal .cart-item-qty button').first().click();
    await expect(page.locator('#cartBadge')).toHaveText('1');
    await expect(app(page).locator('[data-vbs-count]')).toHaveText('1');
    await expect(app(page).locator('.vbs-cart-row .vbs-muted')).toContainText('1권');
    await page.locator('#cartModal').getByRole('button', {name: '주문하러 가기', exact: true}).click();
    await expect(page.locator('#checkoutModal')).toHaveClass(/active/);
    await expect(page.locator('#coSummaryTotal')).toHaveText('상품 합계: 15,000원');
    await expect(page.locator('#coShippingEstimate')).toContainText('3,400원');
    await expect(page.locator('#coShippingEstimate')).toContainText('18,400원');
    await noOverflow(page);
    await page.locator('#coName').fill('가상 테스트 주문자');
    await page.locator('#coContact').fill('010-0000-0000');
    await page.locator('#coEmail').fill('fixture@example.test');
    await page.locator('#coAddress').fill('가상시 테스트로 1');
    await page.locator('#coConsent').check();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#coSubmitBtn').click();
    await expect(page.locator('#coSubmitBtn')).toBeEnabled();
    await expect(page.locator('#coResult')).not.toHaveClass(/active/);
    const submission = await page.evaluate(() => ({
      responses: window.__bookshopPreviewResponses, calls: window.__bookshopRpcCalls, cart: getCart()
    }));
    expect(submission.responses.map(response => response.status)).toEqual([403]);
    expect(submission.calls).toHaveLength(1);
    expect(submission.calls[0].name).toBe('create_public_order_v1');
    expect(submission.calls[0].args.p_items).toEqual([{book_title: nightBook.title, unit_price: 15000, quantity: 1}]);
    expect(submission.cart).toHaveLength(1);
    expect(submission.cart[0].qty).toBe(1);
    expect(run.blockedWrites).toEqual([]);
    expect(run.blockedSupabase).toEqual([]);
    expect(run.errors).toEqual([]);
    await page.keyboard.press('Escape');
    await page.evaluate(() => openCartModal());
    await page.locator('#cartModal .cart-item-remove').click();
    await expect(page.locator('#cartEmpty')).toBeVisible();
    await expect(app(page).locator('[data-vbs-count]')).toHaveText('0');
    await page.keyboard.press('Escape');
    await expect(app(page).locator('.vbs-empty')).toContainText('책가방에 담아보세요');
    await page.screenshot({path: testInfo.outputPath(`bookshop-${width}.png`), fullPage: true});
  });
}

test('all three category shelves use the fifteen verified public products and real local cover images', async ({page}) => {
  const run = await prepare(page);
  const seen = new Set();
  for (const category of ['heart', 'story', 'travel']) {
    await app(page).locator(`.vbs-shelf-nav [data-category="${category}"]`).click();
    const cards = app(page).locator('.vbs-book-card');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const id of await cards.locator('[data-vbs-action="book"]').evaluateAll(elements => elements.map(element => element.dataset.book))) seen.add(id);
    const covers = cards.locator('img.vbs-cover');
    await covers.evaluateAll(images => images.forEach(img => { img.loading = 'eager'; }));
    await expect.poll(() => covers.evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await expect(cards.locator('.vbs-cover-missing')).toHaveCount(0);
  }
  expect([...seen].sort()).toEqual(publicBooks.map(book => book.id).sort());
  expect([...seen]).not.toContain('fixture-moongori');
  await assertSafe(run, page);
});

test('invalid public prices stay unavailable and never render a zero-won substitute', async ({page}) => {
  const books = publicBooks.map(book => book.id === nightBook.id ? {...book, price: '15000'} : book);
  const run = await prepare(page, {books});
  await app(page).locator('.vbs-shelf-nav [data-category="heart"]').click();
  await action(page, 'book').filter({has: page.locator(`img[alt="${nightBook.title} 표지"]`)}).click();
  await expect(app(page).locator('.vbs-detail-price')).toHaveText('가격 확인 필요');
  await expect(action(page, 'add')).toBeDisabled();
  expect(await page.evaluate(() => getCart())).toEqual([]);
  await assertSafe(run, page);
});

test('catalog load failure blocks purchase, explains the issue and retry recovers the verified products', async ({page}) => {
  const run = await prepare(page, {error: {message: 'SYNTHETIC_PRIVATE_DIAGNOSTIC'}});
  await expect(app(page).locator('.vbs-notice')).toContainText('상품 정보를 확인하지 못했어요');
  await expect(app(page)).not.toContainText('SYNTHETIC_PRIVATE_DIAGNOSTIC');
  await expect(action(page, 'add')).toHaveCount(0);
  expect(await page.evaluate(() => GaeddirangVirtualBookshopController.add('fixture-duru_anxiety_night_walk', 1).ok)).toBe(false);
  expect(await page.evaluate(() => getCart())).toEqual([]);
  await page.evaluate(() => { window.__bookshopFixture.error = null; });
  await action(page, 'retry').click();
  await expect.poll(() => page.evaluate(() => GaeddirangVirtualBookshopSource.getCatalogState().verified)).toBe(true);
  await openRecommendedBook(page);
  await expect(action(page, 'add')).toBeEnabled();
  await assertSafe(run, page);
});

test('the meeting sentence stays in memory and is neither stored nor submitted', async ({page}) => {
  const run = await prepare(page);
  const sentence = '가상테스트문장_전송하지않는_오늘의여유_78124';
  const before = await page.evaluate(() => ({local: {...localStorage}, session: {...sessionStorage}}));
  await action(page, 'program').click();
  await action(page, 'word').filter({hasText: '용기'}).click();
  await action(page, 'program-write').click();
  await app(page).locator('[data-vbs-note]').fill(sentence);
  await action(page, 'program-complete').click();
  await expect(app(page).locator('.vbs-note-card')).toContainText(sentence);
  await expect(app(page).locator('.vbs-note-card')).toContainText('용기');
  expect(await page.evaluate(() => ({local: {...localStorage}, session: {...sessionStorage}}))).toEqual(before);
  expect(await page.evaluate(value => window.__bookshopStorageWrites.some(write => write.value.includes(value)), sentence)).toBe(false);
  expect(run.requests.some(request => request.url.includes(sentence) || request.body?.includes(sentence))).toBe(false);
  await action(page, 'program-reset').click();
  await action(page, 'program-write').click();
  await expect(app(page).locator('[data-vbs-note]')).toHaveValue('');
  await assertSafe(run, page);
});

test('real Three.js imports render a WebGL canvas while the fallback remains usable when unavailable', async ({page}, testInfo) => {
  test.setTimeout(45_000);
  const run = await prepare(page, {engine: 'ready'});
  await expect(app(page).locator('[data-vbs-world] canvas')).toBeVisible();
  await expect(app(page).locator('[data-vbs-fallback]')).toBeHidden();
  const renderer = await app(page).locator('[data-vbs-world] canvas').evaluate(canvas => ({
    width: canvas.width, height: canvas.height, webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  }));
  expect(renderer.width).toBeGreaterThan(0);
  expect(renderer.height).toBeGreaterThan(0);
  expect(renderer.webgl).toBe(true);
  expect(run.requests.some(request => request.url.startsWith('https://esm.sh/three@0.180.0'))).toBe(true);
  await app(page).locator('.vbs-shelf-nav [data-category="travel"]').click();
  await expect(app(page).locator('.vbs-panel-title')).toHaveText('빵과 여행');
  await page.screenshot({path: testInfo.outputPath('bookshop-webgl.png')});
  await assertSafe(run, page);
});

const guestJourneys = [
  {id: 'guest-reader', name: '모모', greeting: '나는 모모야', paths: [['calm'], ['story'], ['about', 'calm'], ['about', 'story']]},
  {id: 'guest-traveler', name: '보리', greeting: '나는 보리야', paths: [['travel'], ['questions'], ['story']]}
];

async function chooseGuest(page, guest) {
  await app(page).locator('.vbs-place-nav [data-vbs-action="guests"]').click();
  await expect(app(page).locator('.vbs-guest-picker')).toBeVisible();
  await expect(app(page).locator('.vbs-guest-picker [data-vbs-action="guest"]')).toHaveCount(2);
  await app(page).locator(`.vbs-guest-picker [data-guest="${guest.id}"]`).click();
  await expect(app(page).locator('.vbs-panel-title')).toHaveText(`${guest.name}와 이야기하기`);
  await expect(app(page).locator('.vbs-guest-dialogue > p')).toContainText(guest.greeting);
  await expect(app(page)).toContainText('실제 접속자와의 채팅이 아니에요');
  await expect(app(page).locator('.vbs-guest-dialogue [data-vbs-action="guest-step"]')).toHaveCount(3);
  await noOverflow(page);
}

async function followGuestPath(page, steps) {
  for (const step of steps) {
    await app(page).locator(`.vbs-guest-dialogue [data-vbs-action="guest-step"][data-step="${step}"]`).click();
    if (step === 'about') {
      await expect(app(page).locator('.vbs-guest-dialogue > p')).toContainText('눈에 들어오는 제목');
      await expect(app(page).locator('.vbs-guest-recommendation')).toHaveCount(0);
      await expect(app(page).locator('.vbs-guest-dialogue [data-step="calm"]')).toBeVisible();
      await expect(app(page).locator('.vbs-guest-dialogue [data-step="story"]')).toBeVisible();
    }
    await noOverflow(page);
  }
}

async function openGuestRecommendation(page, step, {purchasable = true} = {}) {
  const recommendation = app(page).locator('.vbs-guest-recommendation');
  await expect(recommendation).toBeVisible();
  const openBook = app(page).locator('.vbs-guest-dialogue [data-vbs-action="book"]');
  const id = await openBook.getAttribute('data-book');
  const canonical = publicBooks.find(book => book.id === id);
  expect(canonical, `${step}: recommendation must identify a verified public fixture book`).toBeDefined();
  expect(id).not.toBe('fixture-moongori');
  if (step === 'calm') expect(canonical.id).toBe(nightBook.id);
  if (step === 'travel' || step === 'questions') expect(canonical.title).toMatch(/빵|여행|백빵/);
  if (step === 'questions' && publicBooks.some(book => /질문/.test(book.title))) expect(canonical.title).toContain('질문');
  await expect(recommendation.locator('h4')).toHaveText(canonical.title);
  await noOverflow(page);
  await openBook.click();
  await expect(app(page).locator('.vbs-panel-title')).toHaveText(canonical.title);
  await expect(app(page).locator('.vbs-detail-price')).toHaveText(`${canonical.price.toLocaleString('ko-KR')}원`);
  await expect(app(page).locator('[data-vbs-action="add"]')).toHaveAttribute('data-book', canonical.id);
  if (purchasable) await expect(action(page, 'add')).toBeEnabled();
  else await expect(action(page, 'add')).toBeDisabled();
  await noOverflow(page);
}

for (const width of [1440, 320]) {
  test(`${width}px: both fictional guests traverse every dialogue branch and recommend actual catalog books without saving or sending conversation`, async ({page}) => {
    test.setTimeout(60_000);
    await page.setViewportSize({width, height: 950});
    const run = await prepare(page);
    const before = await page.evaluate(() => ({
      local: {...localStorage}, session: {...sessionStorage},
      storageWrites: window.__bookshopStorageWrites.length, reads: window.__bookshopSdkReads.length
    }));
    for (const guest of guestJourneys) {
      for (let index = 0; index < guest.paths.length; index += 1) {
        const steps = guest.paths[index];
        await chooseGuest(page, guest);
        await followGuestPath(page, steps);
        if (index === 0) {
          await app(page).locator('.vbs-guest-dialogue [data-vbs-action="guest-step"][data-step="hello"]').click();
          await expect(app(page).locator('.vbs-guest-dialogue > p')).toContainText(guest.greeting);
          await expect(app(page).locator('.vbs-guest-recommendation')).toHaveCount(0);
          await followGuestPath(page, steps);
        }
        await openGuestRecommendation(page, steps.at(-1));
      }
    }
    expect(await page.evaluate(() => ({
      local: {...localStorage}, session: {...sessionStorage},
      storageWrites: window.__bookshopStorageWrites.length, reads: window.__bookshopSdkReads.length
    }))).toEqual(before);
    expect(run.requests.filter(request => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
    expect(run.requests.some(request => /guest-reader|guest-traveler/.test(request.url + (request.body || '')))).toBe(false);
    expect(await page.evaluate(() => getCart())).toEqual([]);
    await assertSafe(run, page);
  });

  test(`${width}px: guest dialogue survives missing and stale failed catalogs without enabling a purchase`, async ({page}) => {
    test.setTimeout(60_000);
    await page.setViewportSize({width, height: 950});
    const run = await prepare(page, {error: {message: 'SYNTHETIC_GUEST_CATALOG_FAILURE'}});
    for (const guest of guestJourneys) {
      for (const steps of guest.paths) {
        await chooseGuest(page, guest);
        await followGuestPath(page, steps);
        await expect(app(page).locator('.vbs-guest-recommendation')).toHaveCount(0);
        await expect(app(page).locator('.vbs-guest-dialogue [data-vbs-action="book"]')).toHaveCount(0);
        await expect(action(page, 'add')).toHaveCount(0);
        await expect(app(page).locator('.vbs-notice')).toContainText('상품 정보를 확인하지 못했어요');
      }
    }
    // A previous successful read must not authorize purchase after a later failure.
    await page.evaluate(async () => {
      window.__bookshopFixture.error = null;
      await GaeddirangVirtualBookshopSource.retry();
      window.__bookshopFixture.error = {message: 'SYNTHETIC_STALE_GUEST_CATALOG_FAILURE'};
      await GaeddirangVirtualBookshopSource.retry();
    });
    expect(await page.evaluate(() => GaeddirangVirtualBookshopSource.getCatalogState().verified)).toBe(false);
    const before = await page.evaluate(() => ({local: {...localStorage}, session: {...sessionStorage}, writes: window.__bookshopStorageWrites.length}));
    for (const guest of guestJourneys) {
      for (const steps of guest.paths) {
        await chooseGuest(page, guest);
        await followGuestPath(page, steps);
        await openGuestRecommendation(page, steps.at(-1), {purchasable: false});
        await expect(app(page).locator('.vbs-detail-price')).not.toHaveText('0원');
      }
    }
    expect(await page.evaluate(id => GaeddirangVirtualBookshopController.add(id, 1).ok, nightBook.id)).toBe(false);
    expect(await page.evaluate(() => getCart())).toEqual([]);
    expect(await page.evaluate(() => ({local: {...localStorage}, session: {...sessionStorage}, writes: window.__bookshopStorageWrites.length}))).toEqual(before);
    expect(run.requests.filter(request => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
    await assertSafe(run, page);
  });
}
