import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import catalog from '../assets/bookshop-catalog.js';

const rawBook = (overrides = {}) => ({
  id: 'book-night-id', slug: 'duru_anxiety_night_walk', title: '불안과 밤 산책',
  author: '장진호', cat: 'book', img: 'assets/books/duru_anxiety_night_walk.jpg',
  desc: '<b>천천히 걷는 시간</b><br>책방에서 만나요.', price: 15000, ...overrides
});
const verified = rows => catalog.normalizeBooks(rows, { verified: true });
const canonical = (book, qty = 1) => ({ title: book.title, price: book.price, img: book.cover, qty });

test('UMD exposes the same API in a browser without CommonJS', async () => {
  const context = { URL };
  vm.runInNewContext(await readFile(new URL('../assets/bookshop-catalog.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.GaeddirangBookshopCatalog.normalizeBooks, 'function');
  assert.equal(typeof context.GaeddirangBookshopCatalog.sanitizeCart, 'function');
  assert.deepEqual(Array.from(context.GaeddirangBookshopCatalog.categories, category => category.id), ['heart', 'story', 'travel']);
});

test('verified catalog preserves exact source price, stable DB ID, unknown stock and plain description', () => {
  const [book] = verified([rawBook()]);
  assert.deepEqual(book, {
    id: 'book-night-id', title: '불안과 밤 산책', author: '장진호', category: 'heart',
    cover: 'assets/books/duru_anxiety_night_walk.jpg', price: 15000,
    note: '천천히 걷는 시간\n책방에서 만나요.', canPurchase: true, stock: null, source: 'public.books'
  });
  assert.equal(verified([rawBook({ id: undefined })])[0].id, 'duru_anxiety_night_walk');
  assert.equal(verified([rawBook({ id: undefined, slug: undefined })])[0].id, 'book:불안과 밤 산책');
  assert.equal(verified([rawBook({ id: 17 })])[0].id, '17');
  assert.equal(verified([rawBook({ stock: null })])[0].stock, null);
});

test('fallback, missing verification and string verification never become purchasable', () => {
  for (const options of [undefined, {}, { verified: false }, { verified: 'true' }]) {
    const [book] = catalog.normalizeBooks([rawBook()], options);
    assert.equal(book.canPurchase, false);
    assert.equal(book.source, 'unverified');
    assert.equal(book.price, 15000);
    assert.deepEqual(catalog.addItem([], book.id, 1, [book]), []);
  }
});

test('the three shelf categories recognize the actual catalog titles and slugs', () => {
  const fixtures = [
    ['불안과밤산책', 'heart'], ['모든 감정 도감', 'heart'], ['우울의 바깥으로', 'heart'],
    ['문고리', 'story'], ['어느 날 문득 잘 살고 싶어졌다', 'story'], ['이러나저러나 불편한 거야 불편한 건', 'story'],
    ['개띠랑 백빵 1', 'travel'], ['전국 빵집 대장정', 'travel'], ['새로운 이야기', 'story']
  ];
  for (const [title, expected] of fixtures) {
    const [book] = verified([rawBook({ id: title, title, slug: '' })]);
    assert.equal(book.category, expected, title);
  }
  assert.equal(verified([rawBook({ title: '새로운 기록', slug: 'collective_breadful_day_needed' })])[0].category, 'travel');
  assert.equal(verified([rawBook({ cat: 'story' })])[0].category, 'story');
});

test('only valid numeric integer prices are retained; no example price is substituted', () => {
  for (const price of [undefined, null, '', '15000', '15,000원', 0, -1, 15000.5, NaN, Infinity, true, {}, 10000001, Number.MAX_SAFE_INTEGER]) {
    const [book] = verified([rawBook({ price })]);
    assert.equal(book.price, null, String(price));
    assert.equal(book.canPurchase, false, String(price));
    assert.deepEqual(catalog.addItem([], book.id, 1, [book]), []);
  }
  assert.equal(verified([rawBook({ price: 1 })])[0].price, 1);
  assert.equal(verified([rawBook({ price: 10000000 })])[0].price, 10000000);
});

test('absent stock stays unknown; confirmed zero and malformed stock block purchase', () => {
  const [unknown] = verified([rawBook()]);
  assert.equal(unknown.stock, null);
  assert.deepEqual(catalog.addItem([], unknown.id, 99, [unknown]), [canonical(unknown, 99)]);
  const [available] = verified([rawBook({ stock: 2 })]);
  assert.equal(available.stock, 2);
  assert.equal(available.canPurchase, true);
  for (const stock of [0, -1, 0.5, '1', NaN, Infinity, false, {}]) {
    const [book] = verified([rawBook({ stock })]);
    assert.equal(book.canPurchase, false, String(stock));
    assert.equal(book.stock, stock === 0 ? 0 : null);
  }
});

test('non-public and archived catalog records are omitted rather than exposed in the bookshop', () => {
  for (const flags of [
    { is_published: false }, { is_active: false }, { is_visible: false }, { published: false }, { visible: 0 },
    { archived: true }, { is_archived: true }, { archived_at: '2026-10-15' },
    { deleted: true }, { deleted_at: '2026-10-15' },
    ...['draft', 'unpublished', 'archived', 'deleted', 'hidden', 'inactive', 'private', 'retired'].map(status => ({ status }))
  ]) assert.deepEqual(verified([rawBook(flags)]), [], JSON.stringify(flags));
  assert.equal(verified([rawBook({ is_published: true, archived: false, archived_at: null, status: 'published' })]).length, 1);
});

test('duplicate titles or stable IDs fail closed even if their prices happen to agree', () => {
  for (const rows of [
    [rawBook(), rawBook({ id: 'other-id', price: 17000 })],
    [rawBook(), rawBook({ id: 'other-id' })],
    [rawBook(), rawBook({ title: '모든 감정 도감' })]
  ]) {
    const books = verified(rows);
    assert.ok(books.every(book => book.canPurchase === false));
    assert.deepEqual(catalog.addItem([], books[0].id, 1, books), []);
    assert.deepEqual(catalog.sanitizeCart([{ title: books[0].title, qty: 1 }], books), []);
  }
  const mixed = [verified([rawBook()])[0], catalog.normalizeBooks([rawBook({ id: 'other' })])[0]];
  assert.deepEqual(catalog.sanitizeCart([{ title: rawBook().title, qty: 1 }], mixed), []);
});

test('malformed catalog records are skipped and boundary whitespace never promises a mismatching order title', () => {
  assert.deepEqual(verified([null, undefined, false, 1, [], {}, { title: 7 }, rawBook({ title: '' }), rawBook({ title: 'x'.repeat(181) }), rawBook({ title: 'bad\nname' })]), []);
  assert.deepEqual(catalog.normalizeBooks({ title: '문고리' }, { verified: true }), []);
  const [book] = verified([rawBook({ title: ' 문고리 ' })]);
  assert.equal(book.title, '문고리');
  assert.equal(book.canPurchase, false);
});

test('cart prices and images are regenerated exclusively from the current verified catalog', () => {
  const books = verified([rawBook()]);
  const poisoned = [{ title: books[0].title, price: 1, img: 'x" onerror="alert(1)', qty: 2, id: '__proto__', arbitrary: 'discard' }];
  const original = structuredClone(poisoned);
  assert.deepEqual(catalog.sanitizeCart(poisoned, books), [canonical(books[0], 2)]);
  assert.deepEqual(catalog.sanitizeCart(JSON.stringify(poisoned), books), [canonical(books[0], 2)]);
  assert.deepEqual(poisoned, original);
  assert.deepEqual(catalog.sanitizeCart([{ title: '미등록 책', price: 15000, qty: 1 }], books), []);
});

test('malicious or malformed localStorage payloads cannot become a cart', () => {
  const books = verified([rawBook()]);
  for (const raw of [undefined, null, true, 1, {}, 'null', '{}', 'not-json', '[', '"text"', ' '.repeat(262145), new Array(1001)]) {
    assert.deepEqual(catalog.sanitizeCart(raw, books), []);
  }
  for (const qty of [0, -1, 1.5, 100, '1', '99', NaN, Infinity, true, null, {}, []]) {
    assert.deepEqual(catalog.sanitizeCart([{ title: books[0].title, qty }], books), [], String(qty));
  }
  const poisoned = JSON.parse('{"__proto__":{"polluted":true},"title":"불안과 밤 산책","qty":1}');
  assert.deepEqual(catalog.sanitizeCart([poisoned], books), [canonical(books[0])]);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(catalog.sanitizeCart([Object.create({ title: books[0].title, qty: 1 })], books), []);
  const getter = Object.defineProperty({ qty: 1 }, 'title', { get() { throw new Error('do not execute a getter'); } });
  assert.deepEqual(catalog.sanitizeCart([getter], books), []);
});

test('duplicate valid cart lines merge, while overflowing or stale-stock groups are rejected', () => {
  const books = verified([rawBook({ stock: 3 })]);
  assert.deepEqual(catalog.sanitizeCart([{ title: books[0].title, qty: 1 }, { title: books[0].title, qty: 2 }], books), [canonical(books[0], 3)]);
  assert.deepEqual(catalog.sanitizeCart([{ title: books[0].title, qty: 2 }, { title: books[0].title, qty: 2 }], books), []);
  assert.deepEqual(catalog.sanitizeCart([{ title: books[0].title, qty: 4 }], books), []);
  const unknown = verified([rawBook()]);
  assert.deepEqual(catalog.sanitizeCart([{ title: unknown[0].title, qty: 60 }, { title: unknown[0].title, qty: 60 }], unknown), []);
});

test('addItem increments an existing canonical product without mutating caller input', () => {
  const books = verified([rawBook({ stock: 3 })]);
  const cart = [{ title: books[0].title, price: 7, img: 'evil', qty: 1 }];
  const original = structuredClone(cart);
  assert.deepEqual(catalog.addItem(cart, books[0].id, 2, books), [canonical(books[0], 3)]);
  assert.deepEqual(cart, original);
  assert.deepEqual(catalog.addItem(cart, books[0].id, 3, books), [canonical(books[0])]);
});

test('invalid additions return the cleaned existing cart and never sneak past quantity or product guards', () => {
  const books = verified([rawBook()]);
  const cart = [{ title: books[0].title, price: 1, img: 'evil', qty: 98 }];
  for (const qty of [0, -1, 1.5, 100, '1', Infinity, undefined, null]) {
    assert.deepEqual(catalog.addItem(cart, books[0].id, qty, books), [canonical(books[0], 98)]);
  }
  assert.deepEqual(catalog.addItem(cart, books[0].id, 2, books), [canonical(books[0], 98)]);
  assert.deepEqual(catalog.addItem(cart, books[0].id, 1, books), [canonical(books[0], 99)]);
  assert.deepEqual(catalog.addItem(cart, 'missing', 1, books), [canonical(books[0], 98)]);
  assert.deepEqual(catalog.addItem(cart, { toString() { throw new Error('do not coerce IDs'); } }, 1, books), [canonical(books[0], 98)]);
});

test('current catalog changes remove sold-out, invalid-price and unverified saved products', () => {
  const saved = [{ title: '불안과 밤 산책', price: 15000, img: 'old.jpg', qty: 1 }];
  for (const books of [verified([rawBook({ stock: 0 })]), verified([rawBook({ price: null })]), catalog.normalizeBooks([rawBook()]), []]) {
    assert.deepEqual(catalog.sanitizeCart(saved, books), []);
  }
  const changed = verified([rawBook({ price: 16000, img: '/updated-cover.jpg' })]);
  assert.deepEqual(catalog.sanitizeCart(saved, changed), [canonical(changed[0])]);
});

test('executable or attribute-breaking canonical covers are stripped, while ordinary website image paths survive', () => {
  for (const img of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'x" onerror="alert(1)', "x'onerror='alert(1)", 'https:\\evil.test/x', '\nassets/x.jpg', 'file:///private/test']) {
    const [book] = verified([rawBook({ img })]);
    if (img === '\nassets/x.jpg') assert.equal(book.cover, 'assets/x.jpg');
    else assert.equal(book.cover, '', img);
  }
  for (const img of ['assets/books/cover.jpg', '/assets/cover.jpg', '../assets/cover.jpg', 'https://gaeddirang.com/assets/cover.jpg', 'https://cdn.example.test/한글.jpg?width=400']) {
    assert.equal(verified([rawBook({ img })])[0].cover, img);
  }
});

test('RPC line and total limits remain valid before checkout handoff', () => {
  const books = verified(Array.from({ length: 21 }, (_, index) => rawBook({ id: 'id-' + index, title: '책 ' + index, price: 1 })));
  const raw = books.map(book => ({ title: book.title, qty: 1 }));
  const cart = catalog.sanitizeCart(raw, books);
  assert.equal(cart.length, 20);
  assert.deepEqual(catalog.addItem(cart, books[20].id, 1, books), cart);
  const expensive = verified(Array.from({ length: 3 }, (_, index) => rawBook({ id: 'big-' + index, title: '고가 ' + index, price: 10000000 })));
  const full = catalog.sanitizeCart(expensive.map(book => ({ title: book.title, qty: 99 })), expensive);
  assert.equal(full.length, 2);
  assert.deepEqual(catalog.addItem(full, expensive[2].id, 3, expensive), full);
  assert.equal(catalog.addItem(full, expensive[2].id, 2, expensive).reduce((sum, row) => sum + row.price * row.qty, 0), 2000000000);
});

test('purchase helpers also reject a hand-crafted normalized catalog with ambiguous or invalid authority fields', () => {
  const [book] = verified([rawBook()]);
  for (const entry of [
    { ...book, canPurchase: 'true' }, { ...book, source: 'fallback' }, { ...book, price: '15000' },
    { ...book, stock: undefined }, { ...book, stock: -1 }, { ...book, id: '' }
  ]) assert.deepEqual(catalog.addItem([], entry.id, 1, [entry]), []);
  assert.deepEqual(catalog.addItem([], book.id, 1, [book, { ...book, id: 'other-id' }]), []);
  assert.deepEqual(catalog.addItem([], book.id, 1, [book, { ...book, title: '다른 책' }]), []);
});
