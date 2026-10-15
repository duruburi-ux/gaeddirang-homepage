(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaeddirangBookshopCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const categories = Object.freeze([
    Object.freeze({ id: 'heart', name: '마음과 기록', description: '내 마음을 살피고 기록하는 책장' }),
    Object.freeze({ id: 'story', name: '작가의 서재', description: '작가의 문장과 이야기를 만나는 책장' }),
    Object.freeze({ id: 'travel', name: '빵과 여행', description: '빵 냄새를 따라 떠나는 책장' })
  ]);
  const CATEGORY_IDS = new Set(categories.map(category => category.id));
  const MAX_PRICE = 10000000;
  const MAX_QUANTITY = 99;
  // The public checkout RPC accepts at most 20 lines and a 2-billion-won total.
  const MAX_CART_LINES = 20;
  const MAX_CART_TOTAL = 2000000000;
  const MAX_RAW_CART_ROWS = 1000;
  const MAX_STORAGE_LENGTH = 262144;

  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function ownValue(object, key) {
    if (!isRecord(object)) return undefined;
    const property = Object.getOwnPropertyDescriptor(object, key);
    return property && Object.prototype.hasOwnProperty.call(property, 'value') ? property.value : undefined;
  }
  const validPrice = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_PRICE;
  const validQuantity = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_QUANTITY;
  const validStock = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  function identifier(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text || text.length > 256 || /[\u0000-\u001f\u007f]/.test(text) || ['__proto__', 'constructor', 'prototype'].includes(text)) return '';
    return text;
  }
  function safeCover(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text || text.length > 8192 || /[\u0000-\u0020\u007f<>"'`\\]/.test(text)) return '';
    // Cart HTML still renders image URLs. Keep canonical HTTP(S)/relative paths,
    // never an executable scheme or attacker-supplied localStorage attribute.
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return '';
    try {
      const url = new URL(text, 'https://gaeddirang.com/');
      return ['https:', 'http:'].includes(url.protocol) ? text : '';
    } catch (_) { return ''; }
  }
  function plainText(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'")
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&').trim().slice(0, 1200);
  }
  function publiclyVisible(raw) {
    for (const key of ['is_published', 'is_active', 'is_visible', 'published', 'active', 'visible']) {
      const value = ownValue(raw, key);
      if (value !== undefined && value !== null && value !== true) return false;
    }
    for (const key of ['archived', 'is_archived', 'deleted', 'is_deleted']) {
      const value = ownValue(raw, key);
      if (value !== undefined && value !== null && value !== false && value !== 0) return false;
    }
    for (const key of ['archived_at', 'deleted_at']) {
      const value = ownValue(raw, key);
      if (value !== undefined && value !== null && value !== '') return false;
    }
    const status = ownValue(raw, 'status');
    return typeof status !== 'string' || !['draft', 'unpublished', 'archived', 'deleted', 'hidden', 'inactive', 'private', 'retired'].includes(status.trim().toLowerCase());
  }
  function shelfFor(raw, title) {
    const explicit = ownValue(raw, 'cat') || ownValue(raw, 'category');
    if (CATEGORY_IDS.has(explicit)) return explicit;
    const key = (title + ' ' + (ownValue(raw, 'slug') || '')).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    if (/빵|베이커리|bread|bakery|baekbbang/.test(key)) return 'travel';
    if (/문고리|어느날문득|불편한거야|moongori|someday|uncomfortable/.test(key)) return 'story';
    if (/불안과밤산책|감정|우울의바깥|마음|emotion|anxiety|depression|feeling|check_card/.test(key)) return 'heart';
    return 'story';
  }

  function normalizeBooks(rawBooks, options = {}) {
    if (!Array.isArray(rawBooks)) return [];
    const verified = ownValue(options, 'verified') === true;
    const result = [];
    for (const raw of rawBooks) {
      if (!isRecord(raw) || !publiclyVisible(raw)) continue;
      const rawTitle = ownValue(raw, 'title');
      if (typeof rawTitle !== 'string') continue;
      const title = rawTitle.trim();
      if (!title || title.length > 180 || /[\u0000-\u001f\u007f]/.test(title)) continue;
      const id = identifier(ownValue(raw, 'id')) || identifier(ownValue(raw, 'slug')) || 'book:' + title;
      const rawPrice = ownValue(raw, 'price');
      const price = validPrice(rawPrice) ? rawPrice : null;
      const rawStock = ownValue(raw, 'stock');
      const stock = validStock(rawStock) ? rawStock : null;
      const stockIsValid = rawStock === undefined || rawStock === null || validStock(rawStock);
      result.push({
        id, title,
        author: typeof ownValue(raw, 'author') === 'string' ? ownValue(raw, 'author').trim() : '',
        category: shelfFor(raw, title),
        cover: safeCover(ownValue(raw, 'img') || ownValue(raw, 'img_path')),
        price,
        note: plainText(ownValue(raw, 'desc') || ownValue(raw, 'description')),
        canPurchase: verified && rawTitle === title && price !== null && stockIsValid && stock !== 0,
        stock,
        source: verified ? 'public.books' : 'unverified'
      });
    }
    const titles = new Map();
    const ids = new Map();
    for (const book of result) {
      titles.set(book.title, (titles.get(book.title) || 0) + 1);
      ids.set(book.id, (ids.get(book.id) || 0) + 1);
    }
    // Homepage carts and the public order RPC identify products by exact title.
    // Ambiguous catalog rows must never pick an arbitrary title/price pair.
    for (const book of result) {
      if (titles.get(book.title) !== 1 || ids.get(book.id) !== 1) book.canPurchase = false;
    }
    return result;
  }

  function purchaseCatalog(normalizedBooks) {
    const byTitle = new Map();
    const byId = new Map();
    const titleCounts = new Map();
    const idCounts = new Map();
    if (!Array.isArray(normalizedBooks)) return { byTitle, byId };
    for (const book of normalizedBooks) {
      if (!isRecord(book)) continue;
      const title = ownValue(book, 'title');
      const id = ownValue(book, 'id');
      if (typeof title === 'string') titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
      if (typeof id === 'string') idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    for (const book of normalizedBooks) {
      if (!isRecord(book)) continue;
      const title = ownValue(book, 'title');
      const id = ownValue(book, 'id');
      const price = ownValue(book, 'price');
      const stock = ownValue(book, 'stock');
      if (typeof title !== 'string' || !title || title !== title.trim() || title.length > 180 || /[\u0000-\u001f\u007f]/.test(title) ||
          typeof id !== 'string' || !id || titleCounts.get(title) !== 1 || idCounts.get(id) !== 1 ||
          ownValue(book, 'source') !== 'public.books' || ownValue(book, 'canPurchase') !== true ||
          !validPrice(price) || !(stock === null || validStock(stock)) || stock === 0) continue;
      const canonical = { id, title, price, img: safeCover(ownValue(book, 'cover')), stock };
      byTitle.set(title, canonical);
      byId.set(id, canonical);
    }
    return { byTitle, byId };
  }
  function cartRows(rawCart) {
    if (typeof rawCart === 'string') {
      if (rawCart.length > MAX_STORAGE_LENGTH) return [];
      try { rawCart = JSON.parse(rawCart); } catch (_) { return []; }
    }
    return Array.isArray(rawCart) && rawCart.length <= MAX_RAW_CART_ROWS ? rawCart : [];
  }
  function sanitizeCart(rawCart, normalizedBooks) {
    const { byTitle } = purchaseCatalog(normalizedBooks);
    const quantities = new Map();
    const invalid = new Set();
    for (const row of cartRows(rawCart)) {
      const title = ownValue(row, 'title');
      const qty = ownValue(row, 'qty');
      const book = byTitle.get(title);
      if (!book || !validQuantity(qty)) continue;
      const quantity = (quantities.get(title) || 0) + qty;
      if (quantity > MAX_QUANTITY || (book.stock !== null && quantity > book.stock)) invalid.add(title);
      quantities.set(title, quantity);
    }
    const result = [];
    let total = 0;
    for (const [title, qty] of quantities) {
      if (invalid.has(title) || result.length >= MAX_CART_LINES) continue;
      const book = byTitle.get(title);
      const lineTotal = book.price * qty;
      if (total + lineTotal > MAX_CART_TOTAL) continue;
      result.push({ title: book.title, price: book.price, img: book.img, qty });
      total += lineTotal;
    }
    return result;
  }
  function addItem(rawCart, bookId, qty, normalizedBooks) {
    const cart = sanitizeCart(rawCart, normalizedBooks);
    const { byId } = purchaseCatalog(normalizedBooks);
    const book = typeof bookId === 'string' ? byId.get(bookId) : undefined;
    if (!book || !validQuantity(qty)) return cart;
    const existing = cart.find(row => row.title === book.title);
    const quantity = (existing ? existing.qty : 0) + qty;
    if (quantity > MAX_QUANTITY || (book.stock !== null && quantity > book.stock)) return cart;
    if (!existing && cart.length >= MAX_CART_LINES) return cart;
    const total = cart.reduce((sum, row) => sum + row.price * row.qty, 0);
    if (total + book.price * qty > MAX_CART_TOTAL) return cart;
    if (existing) existing.qty = quantity;
    else cart.push({ title: book.title, price: book.price, img: book.img, qty });
    return cart;
  }

  return Object.freeze({ categories, normalizeBooks, sanitizeCart, addItem });
});
