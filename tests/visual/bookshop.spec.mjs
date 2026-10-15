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
// trace is a worker fixture in this Playwright version and cannot be changed
// inside describe(). A separate test type keeps the other fourteen traces on.
const walkingTest = test.extend({trace: 'off'});

async function prepare(page, { books = publicBooks, error = null, engine = 'fallback', motionClock = false } = {}) {
  const errors = [];
  const blockedWrites = [];
  const blockedSupabase = [];
  const requests = [];
  page.on('pageerror', exception => errors.push(exception.message));
  page.on('request', request => requests.push({url: request.url(), method: request.method(), body: request.postData()}));
  if (motionClock) await page.clock.install({time: new Date('2026-10-15T03:00:00Z')});
  else await page.clock.setFixedTime(new Date('2026-10-15T03:00:00Z'));
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

// Layout relationships below come from the root agent's photo observations and
// the scene's agreed semantic contract, not an independent photo measurement.
const photoLandmarkIds = [
  'floor-gray-tile', 'front-black-glazing', 'back-black-glazing',
  'entrance-white-carousel', 'center-lightwood-table', 'center-darkwood-table',
  'right-tall-grid-shelves', 'right-slim-blind-shelf',
  'back-low-faceout-left', 'back-low-faceout-right', 'right-bench', 'back-white-counter'
];
const sceneTargetIds = ['heart', 'story', 'travel', 'keeper', 'counter', 'table', 'guest-reader', 'guest-traveler'];
const sceneState = page => page.evaluate(() => document.getElementById('virtualBookshop').__gaeddirangBookshop.getSceneState());
const distanceXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const rgb = color => {
  expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  return color.slice(1).match(/../g).map(channel => Number.parseInt(channel, 16));
};

function expectPhotoLayout(state) {
  expect(state.layout).toBe('photo-reference-v1');
  expect(state.room.measured).toBe(false);
  expect(state.room.width).toBeGreaterThan(0);
  expect(state.room.length).toBeGreaterThan(state.room.width * 1.3);
  expect(state.landmarks.map(landmark => landmark.id)).toEqual(expect.arrayContaining(photoLandmarkIds));
  expect(state.targets.map(target => target.id).sort()).toEqual([...sceneTargetIds].sort());
  expect(state.targets.every(target => target.approachClear === true)).toBe(true);
  const byId = Object.fromEntries(state.landmarks.map(landmark => [landmark.id, landmark]));
  for (const landmark of state.landmarks) {
    expect(landmark.position).toHaveLength(3);
    expect(landmark.position.every(Number.isFinite)).toBe(true);
    expect(typeof landmark.kind).toBe('string');
    expect(Number.isFinite(landmark.screen.x) && Number.isFinite(landmark.screen.y)).toBe(true);
    expect(landmark.material.roughness).toBeGreaterThanOrEqual(0);
    expect(landmark.material.roughness).toBeLessThanOrEqual(1);
  }
  const front = byId['front-black-glazing'];
  const back = byId['back-black-glazing'];
  expect(front.position[2]).toBeGreaterThan(back.position[2]);
  for (const glazing of [front, back]) expect(Math.max(...rgb(glazing.material.color))).toBeLessThan(100);
  const floor = rgb(byId['floor-gray-tile'].material.color);
  expect(Math.max(...floor) - Math.min(...floor)).toBeLessThanOrEqual(35);
  expect(Math.max(...floor)).toBeLessThan(180);
  expect(byId['floor-gray-tile'].material.roughness).toBeGreaterThanOrEqual(0.6);
  const carousel = byId['entrance-white-carousel'];
  expect(carousel.position[0]).toBeLessThan(0);
  expect(carousel.position[2]).toBeGreaterThan((front.position[2] + back.position[2]) / 2);
  expect(Math.min(...rgb(carousel.material.color))).toBeGreaterThan(190);
  const tables = [byId['center-lightwood-table'], byId['center-darkwood-table']];
  expect(distanceXZ(tables[0].position, tables[1].position)).toBeGreaterThan(1);
  for (const table of tables) {
    expect(Math.abs(table.position[0])).toBeLessThan(state.room.width * 0.3);
    expect(table.position[2]).toBeGreaterThan(back.position[2]);
    expect(table.position[2]).toBeLessThan(front.position[2]);
  }
  expect(rgb(tables[0].material.color).reduce((sum, channel) => sum + channel, 0))
    .toBeGreaterThan(rgb(tables[1].material.color).reduce((sum, channel) => sum + channel, 0));
  for (const id of ['right-tall-grid-shelves', 'right-slim-blind-shelf', 'right-bench']) expect(byId[id].position[0]).toBeGreaterThan(0);
  expect(Math.max(...rgb(byId['right-slim-blind-shelf'].material.color))).toBeLessThan(100);
  for (const id of ['back-low-faceout-left', 'back-low-faceout-right', 'back-white-counter']) {
    expect(byId[id].position[2]).toBeLessThan((front.position[2] + back.position[2]) / 2);
  }
  expect(byId['back-low-faceout-left'].position[0]).toBeLessThan(byId['back-low-faceout-right'].position[0]);
}

async function selectSceneTarget(page, id) {
  if (['heart', 'story', 'travel'].includes(id)) {
    await app(page).locator(`.vbs-shelf-nav [data-vbs-action="category"][data-category="${id}"]`).click();
  } else if (id === 'keeper') {
    await app(page).locator('.vbs-place-nav [data-vbs-action="talk"]').click();
  } else if (id === 'counter') {
    await app(page).locator('.vbs-topbar [data-vbs-action="bag"]').click();
  } else if (id === 'table') {
    await app(page).locator('.vbs-place-nav [data-vbs-action="program"]').click();
  } else {
    await app(page).locator('.vbs-place-nav [data-vbs-action="guests"]').click();
    await app(page).locator(`.vbs-guest-picker [data-vbs-action="guest"][data-guest="${id}"]`).click();
  }
  const expectedTitle = {
    heart: '마음과 기록', story: '작가의 서재', travel: '빵과 여행', keeper: '책방에 온 걸 환영해요',
    counter: '내 책가방', table: '마음 단어 테이블', 'guest-reader': '모모와 이야기하기', 'guest-traveler': '보리와 이야기하기'
  }[id];
  await expect(app(page).locator('.vbs-panel-title')).toHaveText(expectedTitle);
  // Mobile panels scroll themselves into view. Put the renderer back on screen
  // before advancing time because its IntersectionObserver pauses hidden scenes.
  await app(page).locator('[data-vbs-world] canvas').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await sceneState(page)).inView).toBe(true);
}

async function advanceSceneToTarget(page, id) {
  const state = await sceneState(page);
  const target = state.targets.find(target => target.id === id);
  expect(target).toBeDefined();
  expect(target.approachClear).toBe(true);
  expect(state.target).toBe(id);
  const speed = state.movementSpeed ?? 2.3;
  // Preserve every real animation frame, but sample inside the browser instead
  // of adding locator/evaluation/trace round trips and assertions to each frame.
  const budgetMs = Math.ceil(2 * (state.room.width + state.room.length) / speed * 1000) + 1500;
  await page.evaluate(({id, speed}) => {
    const read = () => document.getElementById('virtualBookshop').__gaeddirangBookshop.getSceneState();
    const initial = read();
    const walk = window.__bookshopWalk = {
      id, done: false, violations: [], frames: 0, travelled: 0,
      previous: {time: performance.now(), position: initial.player},
      samples: [{position: initial.player, clear: initial.playerClear, visible: initial.inView, moving: initial.moving}],
      final: null
    };
    function sample(time) {
      const current = read();
      const step = Math.hypot(current.player[0] - walk.previous.position[0], current.player[2] - walk.previous.position[2]);
      const allowedStep = speed * Math.min(Math.max(0, time - walk.previous.time) / 1000, 0.085) + 0.08;
      walk.frames += 1;
      walk.travelled += step;
      walk.samples.push({position: current.player, clear: current.playerClear, visible: current.inView, moving: current.moving});
      if (!current.playerClear) walk.violations.push('player intersects an expanded furniture collider');
      if (!current.inView) walk.violations.push('renderer became invisible while advancing a route');
      if (step > allowedStep) walk.violations.push('avatar jumped farther than its speed and frame delta allow');
      walk.previous = {time, position: current.player};
      walk.final = {player: current.player, target: current.target, lastArrived: current.lastArrived, moving: current.moving};
      if (current.lastArrived === id && !current.moving) walk.done = true;
      else if (!current.moving) walk.violations.push('motion stopped before the requested actual arrival');
      if (!walk.done && !walk.violations.length) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, {id, speed});
  for (let elapsed = 0; elapsed < budgetMs;) {
    // Each fastForward executes one capped physics frame. Keep its 85ms step
    // and collect every RAF in-page, but query progress only once per batch.
    for (let frame = 0; frame < 10 && elapsed < budgetMs; frame += 1) {
      await page.clock.fastForward(85);
      elapsed += 85;
    }
    const progress = await page.evaluate(() => ({done: window.__bookshopWalk.done, violations: window.__bookshopWalk.violations}));
    if (progress.done || progress.violations.length) break;
  }
  const walk = await page.evaluate(() => window.__bookshopWalk);
  expect(walk.violations, `${id}: frame-by-frame movement invariants`).toEqual([]);
  expect(walk.samples.every(sample => sample.clear && sample.visible), `${id}: the entire route must remain clear and rendered`).toBe(true);
  expect(walk.done, `${id}: arrive within the room-perimeter walking budget`).toBe(true);
  expect(walk.frames).toBeGreaterThan(0);
  expect(walk.final.lastArrived).toBe(id);
  expect(walk.final.moving).toBe(false);
  expect(distanceXZ(walk.final.player, target.approach), `${id}: actual arrival position`).toBeLessThan(0.09);
  return walk;
}

for (const width of [1440, 320]) {
  test(`${width}px: photo-reference landmarks reproduce the observed room relationships and fit the rendered scene`, async ({page}, testInfo) => {
    test.setTimeout(45_000);
    await page.setViewportSize({width, height: 950});
    await page.emulateMedia({reducedMotion: 'reduce'});
    const run = await prepare(page, {engine: 'ready'});
    await app(page).locator('[data-vbs-world] canvas').scrollIntoViewIfNeeded();
    const state = await sceneState(page);
    expectPhotoLayout(state);
    for (const id of ['entrance-white-carousel', 'center-lightwood-table', 'center-darkwood-table', 'right-tall-grid-shelves', 'right-slim-blind-shelf']) {
      const landmark = state.landmarks.find(landmark => landmark.id === id);
      expect(landmark.screen.visible, `${id} must fit the default scene framing`).toBe(true);
      expect(landmark.screen.x).toBeGreaterThanOrEqual(0);
      expect(landmark.screen.x).toBeLessThanOrEqual(state.width);
      expect(landmark.screen.y).toBeGreaterThanOrEqual(0);
      expect(landmark.screen.y).toBeLessThanOrEqual(state.height);
    }
    const canvas = app(page).locator('[data-vbs-world] canvas');
    const buffer = await canvas.evaluate(canvas => ({width: canvas.width, height: canvas.height}));
    expect(buffer.width).toBeGreaterThanOrEqual(Math.floor(state.width));
    expect(buffer.width).toBeLessThanOrEqual(Math.ceil(state.width * 2));
    expect(buffer.height).toBeGreaterThan(0);
    await noOverflow(page);
    await page.screenshot({path: testInfo.outputPath(`photo-layout-${width}-default.png`)});
    await action(page, 'rotate').click();
    await expect.poll(async () => Math.abs((await sceneState(page)).camera.azimuth - state.camera.azimuth)).toBeGreaterThan(0.05);
    const rotated = await sceneState(page);
    expectPhotoLayout(rotated);
    expect(rotated.player).toEqual(state.player);
    await page.screenshot({path: testInfo.outputPath(`photo-layout-${width}-rotated.png`)});
    await assertSafe(run, page);
  });

  walkingTest(`${width}px: photo-reference room lets the avatar reach all eight UI targets without furniture collisions`, async ({page, trace}, testInfo) => {
    test.setTimeout(240_000);
    expect(trace).toBe('off');
    await page.setViewportSize({width, height: 950});
    await page.emulateMedia({reducedMotion: 'reduce'});
    const run = await prepare(page, {engine: 'ready', motionClock: true});
    // Original full-resolution framing is covered by the two landmark tests.
    // Keep the 1440/320 CSS viewport and real physics, reducing only GPU pixels.
    await page.addStyleTag({content: '#virtualBookshop .vbs-stage {max-width:384px !important;height:280px !important;}'});
    await app(page).locator('[data-vbs-world] canvas').scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const current = await sceneState(page);
      return current.width <= 384 && current.height === 280;
    }).toBe(true);
    expectPhotoLayout(await sceneState(page));
    // install() starts at 03:00 before navigation. A fixed future pause avoids
    // sending Date.now()+100ms back after a slow WebGL/trace round trip.
    await page.clock.pauseAt(new Date('2026-10-15T04:00:00Z'));
    // Cross the room in both directions so reaching a nearby first shelf cannot
    // mask a disconnected aisle around the newly modelled central tables.
    const walks = [];
    for (const id of ['heart', 'travel', 'counter', 'story', 'guest-reader', 'table', 'keeper', 'guest-traveler']) {
      await selectSceneTarget(page, id);
      walks.push(await advanceSceneToTarget(page, id));
      console.info(`photo walk ${width}px ${id}: ${walks.at(-1).frames} frames, arrived collision-free`);
      await noOverflow(page);
    }
    await testInfo.attach(`photo-room-walks-${width}`, {body: JSON.stringify(walks), contentType: 'application/json'});
    expect(await page.evaluate(() => getCart())).toEqual([]);
    await assertSafe(run, page);
  });
}
