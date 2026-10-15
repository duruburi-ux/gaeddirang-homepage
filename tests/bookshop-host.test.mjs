import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [catalogScript, hostScript] = await Promise.all([
  readFile(new URL('../assets/bookshop-catalog.js', import.meta.url), 'utf8'),
  readFile(new URL('../assets/bookshop-host.js', import.meta.url), 'utf8')
]);

const book = (overrides = {}) => ({
  id: 'night', title: '가상 밤 산책', price: 15000,
  img_path: 'assets/books/fixture-night.jpg', ...overrides
});
const secondBook = () => book({ id: 'bread', title: '가상 빵 여행', price: 17000, img_path: 'assets/books/fixture-bread.jpg' });
const row = (rawBook, qty = 1, overrides = {}) => ({
  title: rawBook.title, price: rawBook.price, img: rawBook.img_path, qty, ...overrides
});

function fixture(options = {}) {
  let rawCatalog = structuredClone(options.catalog ?? [book(), secondBook()]);
  let catalogState = { loading: false, verified: true, error: '', ...options.state };
  let sharedCart = structuredClone(options.cart ?? []);
  const calls = { writes: [], openCart: 0, browse: 0, program: 0, retry: 0, mounts: 0, refresh: 0, network: 0 };
  const windowListeners = new Map();
  const documentListeners = new Map();
  const listen = (listeners, name, callback) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(callback);
  };
  const dispatch = (listeners, event) => {
    for (const callback of listeners.get(event.type) || []) callback(event);
  };
  const blockedNetwork = () => { calls.network += 1; throw new Error('Network and real orders are forbidden in this fixture'); };
  const hostElement = { id: 'virtualBookshop' };
  const source = {
    getRawCatalog: () => structuredClone(rawCatalog),
    getCatalogState: () => ({ ...catalogState }),
    readCart: () => structuredClone(sharedCart),
    writeCart: next => {
      if (options.failWrites) throw new Error('Synthetic storage failure');
      sharedCart = structuredClone(next);
      calls.writes.push(structuredClone(next));
      dispatch(windowListeners, { type: 'gaeddirang:cartchange' });
    },
    openCart: () => { calls.openCart += 1; },
    browse: () => { calls.browse += 1; },
    program: () => { calls.program += 1; },
    retry: () => { calls.retry += 1; },
    isPreview: options.isPreview ?? true
  };
  let appOptions;
  const sandbox = {
    URL,
    Event: class FixtureEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
    document: {
      readyState: options.readyState ?? 'complete',
      getElementById: id => id === 'virtualBookshop' ? hostElement : null,
      addEventListener: (name, callback) => listen(documentListeners, name, callback)
    },
    location: { hash: options.hash ?? '#bookshop' },
    addEventListener: (name, callback) => listen(windowListeners, name, callback),
    dispatchEvent: event => dispatch(windowListeners, event),
    fetch: blockedNetwork,
    XMLHttpRequest: blockedNetwork,
    supabaseClient: { rpc: blockedNetwork, from: blockedNetwork },
    GaeddirangVirtualBookshopSource: source,
    GaeddirangBookshopApp: {
      mount(element, configuration) {
        assert.equal(element, hostElement);
        calls.mounts += 1;
        appOptions = configuration;
        return { refresh: () => { calls.refresh += 1; } };
      }
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(catalogScript, context, { filename: 'bookshop-catalog.js' });
  vm.runInContext(hostScript, context, { filename: 'bookshop-host.js' });
  return {
    controller: sandbox.GaeddirangVirtualBookshopController,
    calls,
    get appOptions() { return appOptions; },
    cart: () => structuredClone(sharedCart),
    setCatalog: value => { rawCatalog = structuredClone(value); },
    setState: value => { catalogState = { ...catalogState, ...value }; },
    setCart: value => { sharedCart = structuredClone(value); },
    emit: (type, init = {}) => sandbox.dispatchEvent(new sandbox.Event(type, init)),
    start: () => dispatch(documentListeners, { type: 'DOMContentLoaded' })
  };
}

function assertUnchanged(f, original) {
  assert.deepEqual(f.cart(), original);
  assert.equal(f.calls.writes.length, 0);
  assert.equal(f.calls.openCart, 0);
  assert.equal(f.calls.network, 0);
}

test('host mounts once and exposes existing homepage actions without a network client', () => {
  const f = fixture();
  assert.equal(f.calls.mounts, 1);
  assert.equal(f.appOptions.isPreview, true);
  assert.equal(f.appOptions.getCatalog()[0].stock, null);
  assert.equal(f.appOptions.getCatalog()[0].source, 'public.books');
  f.controller.mount();
  f.appOptions.onBrowse();
  f.appOptions.onProgram();
  f.appOptions.onRetry();
  assert.equal(f.calls.mounts, 1);
  assert.equal(f.calls.browse, 1);
  assert.equal(f.calls.program, 1);
  assert.equal(f.calls.retry, 1);
  assert.equal(f.calls.network, 0);
});

test('unverified, loading and failed catalog states block add and checkout without discarding cart', async t => {
  for (const state of [
    { verified: false }, { loading: true },
    { loading: false, verified: false, error: 'Synthetic public catalog failure' }
  ]) await t.test(JSON.stringify(state), () => {
    const original = [row(book())];
    const f = fixture({ cart: original, state });
    assert.equal(f.controller.add('night', 1).ok, false);
    assert.equal(f.controller.checkout().ok, false);
    assert.equal(f.appOptions.getCatalog()[0].canPurchase, false);
    assertUnchanged(f, original);
  });
});

test('game additions share the homepage cart and replace saved price and cover with current catalog values', () => {
  const f = fixture({ cart: [row(book(), 1, { price: 1, img: 'old.jpg' })] });
  assert.equal(f.appOptions.onAdd('night', 1).ok, true);
  assert.deepEqual(f.cart(), [row(book(), 2)]);
  // Simulate an existing homepage cart edit, then return to the game.
  f.setCart([row(book(), 3), row(secondBook())]);
  assert.equal(f.controller.add('bread', 1).ok, true);
  assert.deepEqual(f.cart(), [row(book(), 3), row(secondBook(), 2)]);
  assert.equal(f.calls.network, 0);
});

test('catalog changes are read at action time rather than using the first price or cover', () => {
  const f = fixture({ cart: [row(book())] });
  const changed = book({ price: 16000, img_path: '/updated-fixture-cover.jpg' });
  f.setCatalog([changed, secondBook()]);
  assert.equal(f.controller.add('night', 1).ok, true);
  assert.deepEqual(f.cart(), [row(changed, 2)]);
  const changedAgain = book({ price: 18000, img_path: '/latest-fixture-cover.jpg' });
  f.setCatalog([changedAgain, secondBook()]);
  assert.equal(f.controller.checkout().ok, true);
  assert.deepEqual(f.cart(), [row(changedAgain, 2)]);
});

test('unknown, hidden, sold-out, ambiguous and invalid-price products cannot be added', async t => {
  for (const catalog of [
    [], [book({ is_visible: false })], [book({ stock: 0 })],
    [book({ price: null })], [book(), book({ id: 'duplicate-title' })]
  ]) await t.test(JSON.stringify(catalog), () => {
    const f = fixture({ catalog });
    assert.equal(f.controller.add('night', 1).ok, false);
    assertUnchanged(f, []);
  });
});

test('unknown existing products block both add and checkout instead of being silently removed', () => {
  const original = [row(book()), { title: '기존 미확인 상품', price: 7000, img: 'saved.jpg', qty: 2 }];
  const f = fixture({ cart: original });
  assert.equal(f.controller.add('night', 1).ok, false);
  assert.equal(f.controller.checkout().ok, false);
  assertUnchanged(f, original);
});

test('invalid quantities elsewhere in the existing cart block actions without erasing those rows', async t => {
  for (const qty of [100, 0, -1, 1.5, '2', NaN]) await t.test(String(qty), () => {
    const original = [row(book(), qty), row(secondBook(), 2)];
    const f = fixture({ cart: original });
    assert.equal(f.controller.add('bread', 1).ok, false);
    assert.equal(f.controller.change('bread', -1).ok, false);
    assert.equal(f.controller.checkout().ok, false);
    assertUnchanged(f, original);
  });
});

test('duplicate saved quantities whose combined count exceeds the limit are preserved and blocked', () => {
  const original = [row(book(), 60), row(book(), 60), row(secondBook(), 2)];
  const f = fixture({ cart: original });
  assert.equal(f.controller.add('bread', 1).ok, false);
  assert.equal(f.controller.change('bread', -1).ok, false);
  assert.equal(f.controller.checkout().ok, false);
  assertUnchanged(f, original);
});

test('invalid requested addition quantities never report success or rewrite the shared cart', async t => {
  for (const count of [0, -1, 1.5, '1', 100, NaN, undefined]) await t.test(String(count), () => {
    const f = fixture();
    assert.equal(f.controller.add('night', count).ok, false);
    assertUnchanged(f, []);
  });
});

test('quantity and known-stock limits block additions without reducing saved quantities', () => {
  for (const [catalog, original] of [
    [[book()], [row(book(), 99)]],
    [[book({ stock: 2 })], [row(book(), 2)]],
    [[book({ stock: 2 }), secondBook()], [row(book(), 3), row(secondBook())]]
  ]) {
    const f = fixture({ catalog, cart: original });
    const id = catalog.length === 1 ? 'night' : 'bread';
    assert.equal(f.controller.add(id, 1).ok, false);
    assertUnchanged(f, original);
  }
});

test('existing cart line and total overflows are blocked instead of trimmed by normalization', async t => {
  const many = Array.from({ length: 21 }, (_, index) => book({ id: `book-${index}`, title: `가상 책 ${index}`, price: 1000 }));
  const expensive = Array.from({ length: 3 }, (_, index) => book({ id: `expensive-${index}`, title: `가상 고가책 ${index}`, price: 10000000 }));
  for (const [catalog, original, id] of [
    [many, many.map(item => row(item)), 'book-0'],
    [expensive, expensive.map(item => row(item, 99)), 'expensive-0']
  ]) await t.test(id, () => {
    const f = fixture({ catalog, cart: original });
    assert.equal(f.controller.add(id, 1).ok, false);
    assert.equal(f.controller.checkout().ok, false);
    assertUnchanged(f, original);
  });
});

test('twenty valid lines remain intact when adding a twenty-first product is rejected', () => {
  const catalog = Array.from({ length: 21 }, (_, index) => book({ id: `book-${index}`, title: `가상 책 ${index}` }));
  const original = catalog.slice(0, 20).map(item => row(item));
  const f = fixture({ catalog, cart: original });
  assert.equal(f.controller.add('book-20', 1).ok, false);
  assertUnchanged(f, original);
});

test('existing quantities decrease by one and the final copy is removed while other books remain', () => {
  const f = fixture({ cart: [row(book(), 2, { price: 1, img: 'old.jpg' }), row(secondBook(), 3)] });
  assert.equal(f.appOptions.onQuantity('night', -1).ok, true);
  assert.deepEqual(f.cart(), [row(book()), row(secondBook(), 3)]);
  assert.equal(f.controller.change('night', -1).ok, true);
  assert.deepEqual(f.cart(), [row(secondBook(), 3)]);
  assert.equal(f.calls.openCart, 0);
  assert.equal(f.calls.network, 0);
});

test('decrementing duplicate saved lines changes their combined quantity by exactly one', () => {
  const f = fixture({ cart: [row(book(), 2), row(book(), 2), row(secondBook())] });
  assert.equal(f.controller.change('night', -1).ok, true);
  assert.equal(f.cart().filter(item => item.title === book().title).reduce((sum, item) => sum + item.qty, 0), 3);
  assert.deepEqual(f.cart().filter(item => item.title === secondBook().title), [row(secondBook())]);
});

test('remove still allows a visitor to remove a known saved book while catalog verification is unavailable', () => {
  const f = fixture({ cart: [row(book()), row(secondBook())], state: { loading: true, verified: false } });
  assert.equal(f.appOptions.onRemove('night').ok, true);
  assert.deepEqual(f.cart(), [row(secondBook())]);
  assert.equal(f.controller.remove('unknown').ok, false);
  assert.equal(f.calls.writes.length, 1);
});

test('unexpected quantity deltas are rejected without changing the shared cart', () => {
  const original = [row(book(), 2)];
  const f = fixture({ cart: original });
  for (const delta of [0, 2, -2, '1', null]) assert.equal(f.controller.change('night', delta).ok, false);
  assertUnchanged(f, original);
});

test('checkout canonicalizes the shared cart then opens only the existing cart, in preview and hosted modes', () => {
  for (const isPreview of [true, false]) {
    const f = fixture({ isPreview, cart: [row(book(), 2, { price: 1, img: 'old.jpg' }), row(secondBook())] });
    assert.equal(f.appOptions.isPreview, isPreview);
    assert.equal(f.appOptions.onCheckout().ok, true);
    assert.deepEqual(f.cart(), [row(book(), 2), row(secondBook())]);
    assert.equal(f.calls.openCart, 1);
    assert.equal(f.calls.writes.length, 1);
    assert.equal(f.calls.network, 0);
  }
});

test('empty checkout does not persist or open an order screen', () => {
  const f = fixture();
  assert.equal(f.controller.checkout().ok, false);
  assertUnchanged(f, []);
});

test('storage failures are reported and never open checkout or pretend that a cart change succeeded', () => {
  const original = [row(book(), 2)];
  for (const action of [
    controller => controller.add('night', 1),
    controller => controller.change('night', -1),
    controller => controller.remove('night'),
    controller => controller.checkout()
  ]) {
    const f = fixture({ cart: original, failWrites: true });
    assert.equal(action(f.controller).ok, false);
    assertUnchanged(f, original);
  }
});

test('catalog, homepage cart and matching cross-tab storage events refresh the mounted game', () => {
  const f = fixture();
  const before = f.calls.refresh;
  f.emit('gaeddirang:catalogchange');
  f.emit('gaeddirang:cartchange');
  f.emit('storage', { key: 'gd_cart_v1' });
  assert.equal(f.calls.refresh, before + 3);
  f.emit('storage', { key: 'unrelated-setting' });
  assert.equal(f.calls.refresh, before + 3);
});

test('mount waits for the document and the bookshop route, then does not create duplicate instances', () => {
  const f = fixture({ readyState: 'loading', hash: '#library' });
  assert.equal(f.calls.mounts, 0);
  f.start();
  assert.equal(f.calls.mounts, 0);
  f.emit('gaeddirang:routechange', { detail: { category: 'bookshop' } });
  assert.equal(f.calls.mounts, 1);
  f.emit('gaeddirang:routechange', { detail: { category: 'bookshop' } });
  assert.equal(f.calls.mounts, 1);
  assert.equal(f.calls.network, 0);
});
