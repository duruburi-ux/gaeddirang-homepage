(function (global) {
  'use strict';
  var THREE_URL = 'https://esm.sh/three@0.180.0';
  var ROUND_URL = 'https://esm.sh/three@0.180.0/examples/jsm/geometries/RoundedBoxGeometry.js';
  var appearanceKey = 'gaeddirang.virtual-bookshop.appearance.v1';
  var bookmarkKey = 'gaeddirang.virtual-bookshop.bookmarks.v1';
  var modulePromise = null;
  var icons = {
    book: '<path d="M12 5v15M12 5C9 2 4 3 2 4v14c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-2-10 1Z"/>',
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    leaf: '<path d="M20 3C8 1 2 7 5 14c3 8 15 5 15-11Z"/><path d="m4 21 11-12"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    bookmark: '<path d="M6 3h12v19l-6-4-6 4V3Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
    rotate: '<path d="M4 8a9 9 0 1 1-1 8M4 3v5h5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9c-2 0-4-.5-5-1l-5 2 2-5a9 9 0 1 1 17-5Z"/><path d="M7 10h10M7 14h6"/>',
    bread: '<path d="M4 10C0 9 1 3 5 4c0-4 6-4 7-1 3-2 7 0 7 3 4 0 5 5 1 7v7H4V10Z"/><path d="m8 7-1 4m6-5-1 4"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    paw: '<ellipse cx="12" cy="16" rx="6" ry="4"/><ellipse cx="5" cy="8" rx="2" ry="3"/><ellipse cx="11" cy="5" rx="2" ry="3"/><ellipse cx="18" cy="7" rx="2" ry="3"/>'
  };
  function icon(name) { return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || icons.book) + '</svg>'; }
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeImage(value) {
    var text = String(value || '').trim();
    if (/^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(text)) return text;
    return text && !text.startsWith('//') && !/[:\\\u0000-\u001f\u007f<>]/.test(text) ? text : '';
  }
  function money(value) { return value == null || value === '' || !Number.isFinite(Number(value)) ? '가격 확인 필요' : Math.max(0, Number(value)).toLocaleString('ko-KR') + '원'; }
  function loadSaved(key, fallback) { try { return JSON.parse(global.localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function saveSaved(key, value) { try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function normalizedTitle(value) { return String(value || '').replace(/[^\w가-힣]/g, '').toLowerCase(); }
  function mount(root, options) {
    if (!root) throw new Error('가상 책방을 표시할 공간이 필요합니다.');
    if (root.__gaeddirangBookshop) root.__gaeddirangBookshop.dispose();
    options = options || {};
    var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var categories = [
      { id: 'heart', name: '마음과 기록', description: '내 마음을 들여다보며 천천히 읽는 책', icon: 'heart' },
      { id: 'story', name: '작가의 서재', description: '서로 다른 목소리와 이야기를 만나는 자리', icon: 'book' },
      { id: 'travel', name: '빵과 여행', description: '맛있는 발견을 따라 가볍게 걸어가는 책', icon: 'bread' }
    ];
    var guests = [
      { id: 'guest-reader', name: '모모', animal: 'rabbit', shirt: 'rose', theme: '조용한 문장을 찾는 토끼' },
      { id: 'guest-traveler', name: '보리', animal: 'bear', shirt: 'bread', theme: '빵과 여행이 궁금한 곰' }
    ];
    var supplied = global.GaeddirangBookshopCatalog && global.GaeddirangBookshopCatalog.categories;
    if (Array.isArray(supplied)) categories.forEach(function (c) { var match = supplied.find(function (v) { return v.id === c.id; }); if (match) { c.name = String(match.name || match.label || c.name); c.description = String(match.description || c.description); } });
    var savedAppearance = loadSaved(appearanceKey, {});
    var savedBookmarks = loadSaved(bookmarkKey, []);
    var state = {
      view: 'welcome', category: 'heart', bookId: null, dialogue: 'welcome', query: '',
      animal: ['cat', 'bear', 'rabbit'].includes(savedAppearance.animal) ? savedAppearance.animal : 'cat',
      shirt: ['forest', 'bread', 'rose'].includes(savedAppearance.shirt) ? savedAppearance.shirt : 'forest',
      lighting: 'day', bookmarks: Array.isArray(savedBookmarks) ? savedBookmarks.filter(function (v) { return typeof v === 'string'; }).slice(0, 200) : [],
      word: '여유', programStage: 'choose', note: '', busy: false,
      guestId: null, guestStep: 'hello'
    };
    var scene = null;
    var engine = 'loading';
    var sceneSignature = '';
    var loadGeneration = 0;
    var disposed = false;
    var announcementTimer = 0;
    var prefix = (root.id || 'virtual-bookshop') + '-vbs';
    function books() {
      var input = typeof options.getCatalog === 'function' ? options.getCatalog() : [];
      return (Array.isArray(input) ? input : []).filter(function (b) { return b && b.id != null && typeof b.title === 'string'; }).map(function (b) {
        var stock = b.stock == null ? null : Number(b.stock);
        var price = b.price == null || b.price === '' ? null : Number(b.price);
        return { id: String(b.id), title: b.title, author: String(b.author || '개띠랑유니버스'), category: ['heart', 'story', 'travel'].includes(b.category) ? b.category : 'story', cover: safeImage(b.cover), price: price !== null && Number.isFinite(price) && price >= 0 ? price : null, note: String(b.note || ''), canPurchase: b.canPurchase === true, stock: Number.isFinite(stock) && stock !== null ? Math.max(0, Math.floor(stock)) : null };
      });
    }
    function catalogState() { return typeof options.getCatalogState === 'function' ? options.getCatalogState() || {} : {}; }
    function bookById(id) { return books().find(function (b) { return b.id === String(id); }); }
    function category(id) { return categories.find(function (c) { return c.id === id; }) || categories[0]; }
    function cart() { var value = typeof options.getCart === 'function' ? options.getCart() : []; return Array.isArray(value) ? value : []; }
    function count() { return cart().reduce(function (sum, b) { return sum + Math.max(0, Number(b.qty) || 0); }, 0); }
    function quantity(book) { return cart().reduce(function (sum, row) { return sum + (row.title === book.title ? Math.max(0, Number(row.qty) || 0) : 0); }, 0); }
    function canAdd(book) { return !state.busy && catalogState().verified !== false && book.canPurchase && book.price !== null && book.stock !== 0 && (book.stock == null || quantity(book) < book.stock); }
    function stockText(book) { return book.stock == null ? '재고는 주문 확인 시 안내' : book.stock === 0 ? '현재 품절' : '재고 ' + book.stock + '권'; }
    function button(label, action, attrs, primary) {
      var attr = Object.keys(attrs || {}).map(function (key) { return attrs[key] == null ? '' : ' ' + key + '="' + escape(attrs[key]) + '"'; }).join('');
      return '<button type="button" class="vbs-button' + (primary ? ' vbs-primary' : '') + '" data-vbs-action="' + action + '"' + attr + '>' + label + '</button>';
    }
    function controls(list) { return '<div class="vbs-actions">' + list.join('') + '</div>'; }
    function cover(book, large) {
      return book.cover ? '<img class="vbs-cover' + (large ? ' vbs-cover-large' : '') + '" src="' + escape(book.cover) + '" alt="' + escape(book.title + ' 표지') + '" loading="lazy" decoding="async">' : '<div class="vbs-cover vbs-cover-missing' + (large ? ' vbs-cover-large' : '') + '">' + icon('book') + '<span>표지 준비 중</span></div>';
    }
    function panelHeader(title, subtitle, back) {
      return '<div class="vbs-panel-head"><div><span class="vbs-eyebrow">' + (back ? '책장 사이에서' : '개띠랑 책방 산책') + '</span><h3 class="vbs-panel-title" id="' + prefix + '-panel-title" tabindex="-1">' + escape(title) + '</h3>' + (subtitle ? '<p class="vbs-muted">' + escape(subtitle) + '</p>' : '') + '</div>' + (back ? button(icon('close'), 'welcome', { 'aria-label': '책방지기 대화로 돌아가기' }) : '') + '</div>';
    }
    function addButton(book, primary) {
      var label = book.stock === 0 ? '현재 품절' : book.price === null ? '가격 확인 필요' : !book.canPurchase || catalogState().verified === false ? '주문 가능 여부 확인 중' : book.stock != null && quantity(book) >= book.stock ? '담을 수 있는 수량을 채웠어요' : state.busy ? '확인하고 있어요…' : '책가방에 담기';
      return button(escape(label), 'add', { 'data-book': book.id, disabled: canAdd(book) ? null : 'disabled' }, primary);
    }
    function bookCard(book) {
      var marked = state.bookmarks.includes(book.id);
      return '<article class="vbs-book-card"><button type="button" class="vbs-book-open" data-vbs-action="book" data-book="' + escape(book.id) + '" aria-label="' + escape(book.title + ' 자세히 보기') + '">' + cover(book) + '</button><div class="vbs-book-meta"><h4>' + escape(book.title) + '</h4><p class="vbs-muted">' + escape(book.author) + '</p><strong class="vbs-price">' + money(book.price) + '</strong><p class="vbs-stock">' + escape(stockText(book)) + '</p><div class="vbs-book-buttons">' + addButton(book, true) + button(icon('bookmark'), 'bookmark', { 'data-book': book.id, 'aria-label': book.title + (marked ? ' 책갈피 해제' : ' 책갈피 저장'), 'aria-pressed': String(marked) }) + '</div></div></article>';
    }
    function catalogMessage() {
      var status = catalogState();
      if (status.loading) return '<p class="vbs-notice" role="status">등록된 책과 주문 정보를 불러오고 있어요.</p>';
      if (status.error) return '<div class="vbs-notice" role="status"><p>상품 정보를 확인하지 못했어요. 다시 불러오거나 기존 책목록을 이용해 주세요.</p>' + controls([button('다시 불러오기', 'retry'), button('기존 책목록 보기', 'browse')]) + '</div>';
      return '';
    }
    function filteredBooks() {
      var q = state.query.trim().toLocaleLowerCase('ko-KR');
      return books().filter(function (b) { return b.category === state.category && (!q || (b.title + ' ' + b.author).toLocaleLowerCase('ko-KR').includes(q)); });
    }
    function bookListBody() {
      var chosen = filteredBooks();
      return chosen.length ? '<div class="vbs-book-grid">' + chosen.map(bookCard).join('') + '</div>' : '<div class="vbs-empty">' + icon('book') + '<p>' + (state.query ? '이 책장에서 찾는 책이 보이지 않아요.' : catalogState().loading ? '책장을 채우고 있어요.' : '이 책장에 등록된 책을 준비하고 있어요.') + '</p>' + button('모든 책목록 보기', 'browse') + '</div>';
    }
    function categoryView() {
      var c = category(state.category);
      return panelHeader(c.name, c.description, true) + '<div class="vbs-tabs" role="tablist" aria-label="책장 선택">' + categories.map(function (v) { return '<button type="button" class="vbs-tab" role="tab" id="' + prefix + '-tab-' + v.id + '" aria-controls="' + prefix + '-book-list" aria-selected="' + String(v.id === state.category) + '" tabindex="' + (v.id === state.category ? '0' : '-1') + '" data-vbs-action="category" data-category="' + v.id + '">' + escape(v.name) + '</button>'; }).join('') + '</div><label class="vbs-search">' + icon('search') + '<input type="search" data-vbs-search placeholder="책 제목·작가 찾기" aria-label="선택한 책장에서 책 제목·작가 찾기" value="' + escape(state.query) + '"></label>' + catalogMessage() + '<div data-vbs-list role="tabpanel" id="' + prefix + '-book-list" aria-labelledby="' + prefix + '-tab-' + state.category + '">' + bookListBody() + '</div>';
    }
    function detailView() {
      var book = bookById(state.bookId);
      if (!book) return panelHeader('책 정보를 다시 확인해 주세요', '', true) + catalogMessage() + button('책장으로 돌아가기', 'category', { 'data-category': state.category });
      var marked = state.bookmarks.includes(book.id);
      return panelHeader(book.title, category(book.category).name, true) + '<div class="vbs-detail">' + cover(book, true) + '<div><p class="vbs-author">' + escape(book.author) + '</p><p class="vbs-detail-note">' + escape(book.note || '책방에 등록된 도서입니다. 궁금한 점은 주문 확인 과정에서 함께 안내해 드려요.') + '</p><p class="vbs-detail-price">' + money(book.price) + '</p><p class="vbs-stock">' + escape(stockText(book)) + '</p>' + controls([addButton(book, true), button(icon('bookmark') + (marked ? ' 책갈피 해제' : ' 책갈피 저장'), 'bookmark', { 'data-book': book.id, 'aria-pressed': String(marked) })]) + '</div></div>' + controls([button('이 책장으로 돌아가기', 'category', { 'data-category': book.category }), button('책가방 보기 ' + count(), 'bag')]);
    }
    function recommendation(kind) {
      var wanted = kind === 'travel' ? 'travel' : kind === 'story' ? 'story' : 'heart';
      var candidates = books().filter(function (b) { return b.category === wanted; });
      var preferred = kind === 'feeling' ? /감정|마음/ : kind === 'calm' ? /불안|밤|산책/ : kind === 'travel' ? /백빵|빵|여행/ : /문고리|이야기/;
      return candidates.find(function (b) { return b.canPurchase && preferred.test(b.title); }) || candidates.find(function (b) { return b.canPurchase; }) || candidates.find(function (b) { return preferred.test(b.title); }) || candidates[0];
    }
    function guestById(id) { return guests.find(function (guest) { return guest.id === id; }); }
    function guestPortrait(guest) {
      return '<span class="vbs-guest-avatar" data-animal="' + guest.animal + '" data-shirt="' + guest.shirt + '" aria-hidden="true"></span>';
    }
    function guestsView() {
      return panelHeader('손님과 이야기하기', '책방 산책을 위해 만든 가상 인물들이에요.', true) +
        '<div class="vbs-guest-picker">' + guests.map(function (guest) {
          return button(guestPortrait(guest) + '<span class="vbs-guest-name">' + escape(guest.name) + '</span><span class="vbs-guest-tag">가상 손님</span><span class="vbs-guest-theme">' + escape(guest.theme) + '</span><span class="vbs-guest-invite">대화하기 ' + icon('arrow') + '</span>', 'guest', { 'data-guest': guest.id, 'aria-label': guest.name + ' 가상 손님과 대화하기' });
        }).join('') + '</div><p class="vbs-muted vbs-order-note">미리 준비한 이야기 중에서 골라 대화해요. 대화 선택은 저장하거나 전송하지 않아요.</p>';
    }
    function guestRecommendation(step) {
      if (step === 'questions') {
        var questions = books().filter(function (book) { return book.category === 'travel' && /질문/.test(book.title); });
        return questions.find(function (book) { return book.canPurchase; }) || questions[0] || recommendation('travel');
      }
      return recommendation(step === 'story' ? 'story' : step === 'travel' ? 'travel' : 'calm');
    }
    function guestView() {
      var guest = guestById(state.guestId);
      if (!guest) return guestsView();
      var reader = guest.id === 'guest-reader';
      var text = '';
      var choices = [];
      var book = null;
      var step = state.guestStep;
      if (step === 'hello') {
        text = reader ? '안녕, 나는 모모야. 오늘은 조용히 읽을 문장을 찾고 있어. 너는 어떤 이야기가 궁금해?' : '반가워, 나는 보리야. 빵과 여행 이야기를 나누는 걸 좋아해. 오늘 산책은 어디로 떠나볼까?';
        choices = reader ? [
          button('차분히 읽을 책을 찾고 있어요', 'guest-step', { 'data-step': 'calm' }, true),
          button('다른 사람의 이야기가 궁금해요', 'guest-step', { 'data-step': 'story' }),
          button('모모는 뭘 찾고 있어요?', 'guest-step', { 'data-step': 'about' })
        ] : [
          button('빵집 여행 이야기가 궁금해요', 'guest-step', { 'data-step': 'travel' }, true),
          button('함께 나눌 질문을 찾고 있어요', 'guest-step', { 'data-step': 'questions' }),
          button('여행 말고 다른 이야기도 좋아요', 'guest-step', { 'data-step': 'story' })
        ];
      } else if (step === 'about') {
        text = '눈에 들어오는 제목 앞에 잠깐 멈춰 보고 싶어. 마음을 기록하는 책도 좋고, 다른 사람이 만든 이야기 속으로 들어가는 것도 좋겠지?';
        choices = [button('마음과 기록부터 살펴볼까요?', 'guest-step', { 'data-step': 'calm' }, true), button('작가의 이야기를 만나볼래요', 'guest-step', { 'data-step': 'story' })];
      } else {
        book = guestRecommendation(step);
        text = step === 'story' ? '그럼 작가의 서재를 같이 살펴보자. 등록된 이야기들 중에서 한 권부터 펼쳐볼까?' : step === 'travel' ? '빵과 여행 책장으로 가볼까? 등록된 책의 제목을 따라 산책을 시작해 보자.' : step === 'questions' ? '같이 이야기할 때는 작은 질문 하나도 좋지. 빵과 여행 책장에 있는 질문과 이야기부터 살펴볼까?' : '마음과 기록 책장에는 잠깐 멈춰 살펴볼 제목들이 있어. 그중 한 권의 소개를 함께 읽어보자.';
        if (!book) text = '지금은 책 정보를 기다리고 있어. 책장을 먼저 둘러보거나 잠시 후에 다시 이야기하자.';
        var shelf = book ? book.category : step === 'travel' || step === 'questions' ? 'travel' : step === 'story' ? 'story' : 'heart';
        choices = (book ? [button('이 책 소개 보기', 'book', { 'data-book': book.id }, true)] : []).concat([
          button(escape(category(shelf).name) + ' 책장으로', 'category', { 'data-category': shelf }),
          button('다른 이야기 나누기', 'guest-step', { 'data-step': 'hello' })
        ]);
      }
      return panelHeader(guest.name + '와 이야기하기', '', true) + '<div class="vbs-guest-intro">' + guestPortrait(guest) + '<div><span class="vbs-guest-tag">가상 손님</span><p class="vbs-muted">' + escape(guest.theme) + '</p></div></div><div class="vbs-dialogue vbs-guest-dialogue"><p aria-live="polite">' + escape(text) + '</p>' +
        (book ? '<article class="vbs-guest-recommendation">' + cover(book) + '<div><span class="vbs-muted">함께 살펴볼 책</span><h4>' + escape(book.title) + '</h4><p class="vbs-muted">' + escape(book.author) + '</p></div></article>' : '') + controls(choices) + '</div>' +
        controls([button('다른 가상 손님 만나기', 'guests'), button('책방지기와 이야기하기', 'talk')]) + '<p class="vbs-muted vbs-order-note">대화는 이 화면에서만 이어져요. 실제 접속자와의 채팅이 아니에요.</p>' + catalogMessage();
    }
    function dialogueView() {
      var text = '어서 와요. 어떤 책이 기다리는지, 함께 천천히 둘러볼까요?';
      var choices = [];
      if (state.dialogue === 'mood') {
        text = '오늘은 어떤 쪽에 마음이 가나요? 등록된 책들 사이에서 한 권을 찾아볼게요.';
        choices = [button('차분히 쉬고 싶어요', 'recommend', { 'data-kind': 'calm' }), button('마음을 알아보고 싶어요', 'recommend', { 'data-kind': 'feeling' }), button('가볍게 여행하고 싶어요', 'recommend', { 'data-kind': 'travel' })];
      } else if (state.dialogue === 'browse') {
        text = '마음과 기록, 작가들의 이야기, 빵과 여행. 어디부터 산책할까요?';
        choices = categories.map(function (c) { return button(icon(c.icon) + ' ' + escape(c.name), 'category', { 'data-category': c.id }); });
      } else if (state.dialogue.startsWith('recommend:')) {
        var kind = state.dialogue.split(':')[1];
        var book = recommendation(kind);
        var shelf = kind === 'travel' ? 'travel' : 'heart';
        text = book ? '『' + book.title + '』부터 살펴볼까요? ' + (kind === 'travel' ? '빵과 여행 책장에 등록된 책이에요.' : '마음과 기록 책장에 등록된 책이에요.') : '지금은 이 책장에서 추천할 책을 준비하고 있어요. 다른 책장도 함께 둘러봐요.';
        choices = (book ? [button('이 책 소개 보기', 'book', { 'data-book': book.id }, true)] : []).concat([button('이 책장 둘러보기', 'category', { 'data-category': shelf }), button('다른 마음 고르기', 'dialogue', { 'data-next': 'mood' })]);
      } else if (state.dialogue === 'program') {
        text = '모임 테이블에서 마음 단어를 고르고, 나에게 한 문장을 건네보세요. 실제로 열리는 모임도 홈페이지에서 확인할 수 있어요.';
        choices = [button('테이블에서 잠깐 쉬기', 'program', {}, true), button('실제 프로그램 보기', 'program-link')];
      } else {
        choices = [button('오늘 마음에 맞는 책', 'dialogue', { 'data-next': 'mood' }, true), button('책장부터 둘러볼게요', 'dialogue', { 'data-next': 'browse' }), button('모임이 궁금해요', 'dialogue', { 'data-next': 'program' })];
      }
      return '<div class="vbs-keeper-intro"><div class="vbs-keeper-portrait" aria-hidden="true"></div><div><span class="vbs-speaker">책방지기 두루</span><h3 class="vbs-panel-title" id="' + prefix + '-panel-title" tabindex="-1">책방에 온 걸 환영해요</h3></div></div><div class="vbs-dialogue"><p>' + escape(text) + '</p>' + controls(choices) + '</div><div class="vbs-small-divider"></div><p class="vbs-muted">책장이나 책방지기를 눌러 걸어가 보세요. 아래 버튼으로 바로 책목록을 열어도 좋아요.</p>' + controls([button(icon('book') + ' 바로 책목록 보기', 'category', { 'data-category': state.category }), button(icon('bag') + ' 내 책가방', 'bag')]) + catalogMessage();
    }
    function bagView() {
      var rows = cart();
      var sum = rows.reduce(function (total, row) { return total + (Number(row.price) || 0) * (Number(row.qty) || 0); }, 0);
      var hasUnknownPrice = rows.some(function (row) { return row.price == null || row.price === '' || !Number.isFinite(Number(row.price)); });
      return panelHeader('내 책가방', '홈페이지 장바구니와 같은 책가방이에요.', true) + (rows.length ? '<div class="vbs-cart-list">' + rows.map(function (row) {
        var found = books().find(function (b) { return b.title === row.title; });
        var image = safeImage(row.img || (found && found.cover));
        return '<article class="vbs-cart-row">' + (image ? '<img src="' + escape(image) + '" alt="" loading="lazy">' : '<span class="vbs-cart-placeholder">' + icon('book') + '</span>') + '<div><h4>' + escape(row.title) + '</h4><p class="vbs-muted">' + money(row.price) + ' · ' + Math.max(0, Number(row.qty) || 0) + '권</p>' + (found ? '<div class="vbs-quantity">' + button('−', 'quantity', { 'data-book': found.id, 'data-delta': '-1', 'aria-label': row.title + ' 한 권 빼기', disabled: state.busy ? 'disabled' : null }) + '<span>' + Math.max(0, Number(row.qty) || 0) + '</span>' + button('+', 'quantity', { 'data-book': found.id, 'data-delta': '1', 'aria-label': row.title + ' 한 권 더 담기', disabled: canAdd(found) ? null : 'disabled' }) + button('빼기', 'remove', { 'data-book': found.id, 'aria-label': row.title + ' 책가방에서 빼기', disabled: state.busy ? 'disabled' : null }) + '</div>' : '<p class="vbs-muted">기존 장바구니에서 수량을 확인할 수 있어요.</p>') + '</div></article>';
      }).join('') + '</div><div class="vbs-cart-total"><span>상품 합계 <small>배송비 별도</small></span><strong>' + money(hasUnknownPrice ? null : sum) + '</strong></div>' + controls([button('홈페이지에서 주문 접수하기 ' + icon('arrow'), 'checkout', { disabled: state.busy ? 'disabled' : null }, true), button('계속 둘러보기', 'category', { 'data-category': state.category })]) + '<p class="vbs-muted vbs-order-note">주문 접수 후 입금 안내를 확인해 주세요. 여기서 카드 결제가 완료되는 것은 아니에요.</p>' : '<div class="vbs-empty">' + icon('bag') + '<p>마음에 드는 책을 책가방에 담아보세요.</p>' + button('책장 둘러보기', 'category', { 'data-category': state.category }, true) + '</div>');
    }
    function bookmarksView() {
      var marked = books().filter(function (b) { return state.bookmarks.includes(b.id); });
      return panelHeader('내 책갈피', '이 브라우저에만 저장한, 다시 만나고 싶은 책', true) + (marked.length ? '<div class="vbs-book-grid">' + marked.map(bookCard).join('') + '</div>' : '<div class="vbs-empty">' + icon('bookmark') + '<p>책 소개에서 책갈피를 남겨보세요.</p>' + button('책장 둘러보기', 'category', { 'data-category': state.category }) + '</div>');
    }
    function characterView() {
      return panelHeader('나의 산책 친구', '친구와 오늘 입을 옷을 골라주세요.', true) + '<div class="vbs-avatar-preview" data-animal="' + state.animal + '" data-shirt="' + state.shirt + '"></div><h4 class="vbs-label">함께 걸을 친구</h4><div class="vbs-choice-grid">' + [{ id: 'cat', name: '고양이' }, { id: 'bear', name: '곰' }, { id: 'rabbit', name: '토끼' }].map(function (a) { return button(escape(a.name), 'animal', { 'data-animal': a.id, 'aria-pressed': String(a.id === state.animal) }); }).join('') + '</div><h4 class="vbs-label">오늘의 옷</h4><div class="vbs-choice-grid">' + [{ id: 'forest', name: '숲 초록' }, { id: 'bread', name: '빵 노랑' }, { id: 'rose', name: '장미 분홍' }].map(function (a) { return button('<span class="vbs-swatch vbs-swatch-' + a.id + '"></span>' + escape(a.name), 'shirt', { 'data-shirt': a.id, 'aria-pressed': String(a.id === state.shirt) }); }).join('') + '</div><p class="vbs-muted vbs-order-note">캐릭터 외형과 책갈피만 이 브라우저에 저장해요.</p>' + controls([button('이 친구와 책방 걷기', 'welcome', {}, true)]);
    }
    function programView() {
      var head = panelHeader('마음 단어 테이블', '모임 분위기를 느껴보는, 나만의 짧은 쉼', true);
      if (state.programStage === 'choose') return head + '<p>오늘 가까이 두고 싶은 단어 하나를 골라주세요.</p><div class="vbs-word-grid">' + ['여유', '설렘', '용기', '그리움'].map(function (w) { return button(escape(w), 'word', { 'data-word': w, 'aria-pressed': String(state.word === w) }); }).join('') + '</div>' + controls([button('이 단어로 한 문장 쓰기', 'program-write', {}, true), button('실제 프로그램 보기', 'program-link')]);
      if (state.programStage === 'write') return head + '<span class="vbs-word-pill">오늘의 단어 · ' + escape(state.word) + '</span><label class="vbs-label" for="' + prefix + '-note">지금 나에게 건네고 싶은 한 문장</label><textarea id="' + prefix + '-note" class="vbs-textarea" rows="4" maxlength="180" data-vbs-note placeholder="지금 떠오르는 말이면 충분해요.">' + escape(state.note) + '</textarea><p class="vbs-muted">이 문장은 이 화면에만 머물러요. 저장하거나 전송하지 않아요.</p>' + controls([button('단어 다시 고르기', 'program-reset'), button('한 문장 마치기', 'program-complete', {}, true)]);
      return head + '<div class="vbs-note-card"><span>' + escape(state.word) + '</span><p>“' + escape(state.note) + '”</p></div><p>잠깐 머물러줘서 고마워요. 다른 사람들과도 함께 읽고 이야기하고 싶다면, 열려 있는 프로그램을 살펴보세요.</p>' + controls([button('실제 프로그램 알아보기', 'program-link', {}, true), button('다른 한 문장 쓰기', 'program-reset')]);
    }
    root.innerHTML = '<section class="vbs-shell" aria-label="캐릭터로 산책하는 개띠랑 책방"><header class="vbs-topbar"><div class="vbs-brand"><span class="vbs-brand-mark">' + icon('leaf') + '</span><div><span class="vbs-eyebrow">개띠랑유니버스</span><h2>책방 산책</h2></div></div><div class="vbs-top-actions">' + button(icon('bookmark'), 'bookmarks', { 'aria-label': '내 책갈피 보기' }) + button(icon('bag') + '<span>책가방</span><strong data-vbs-count>0</strong>', 'bag', { 'aria-label': '내 책가방 보기' }) + '</div></header><div class="vbs-layout"><div class="vbs-play-column"><div class="vbs-stage" data-engine="loading"><div class="vbs-world" data-vbs-world></div><img class="vbs-fallback" src="/assets/bookshop/room.webp" alt="나무 책장과 모임 테이블이 있는 개띠랑 책방" data-vbs-fallback><div class="vbs-stage-top"><span class="vbs-scene-tag">' + icon('leaf') + ' 오늘도, 책방에서</span><button type="button" class="vbs-avatar-button" data-vbs-action="character" aria-label="나의 캐릭터 꾸미기"><span class="vbs-avatar-thumb" data-animal="' + state.animal + '" data-shirt="' + state.shirt + '"></span><span>내 캐릭터</span></button></div><div class="vbs-stage-bottom">' + button(icon('rotate'), 'rotate', { 'aria-label': '책방 시점 돌리기' }) + button(icon('sun'), 'lighting', { 'aria-label': '낮과 저녁 바꾸기', 'aria-pressed': 'false' }) + '<span class="vbs-movement-hint">빈 바닥을 누르면 걸어가요</span></div><div class="vbs-engine-message" data-vbs-engine-message role="status">책방에 불을 켜고 있어요…</div></div><nav class="vbs-shelf-nav" aria-label="책장 바로 선택">' + categories.map(function (c) { return button(icon(c.icon) + '<span>' + escape(c.name) + '</span>', 'category', { 'data-category': c.id }); }).join('') + '</nav><div class="vbs-place-nav">' + button(icon('chat') + ' 책방지기', 'talk') + button(icon('paw') + ' 손님과 대화', 'guests') + button('모임 테이블', 'program') + button(icon('book') + ' 바로 책목록', 'category', { 'data-category': 'heart' }) + '</div><p class="vbs-scene-status" data-vbs-scene-status aria-live="polite">3D 공간에서 책장과 책방지기, 가상 손님을 눌러보세요.</p></div><section class="vbs-panel" data-vbs-panel aria-labelledby="' + prefix + '-panel-title"></section></div><footer class="vbs-footer"><span>' + (options.isPreview ? '미리보기 · 주문 전송 없음' : '실제 상품 · 주문 접수 후 입금 안내') + '</span><button type="button" data-vbs-action="browse">기존 책목록으로 보기 ' + icon('arrow') + '</button></footer><div class="vbs-toast" role="status" aria-live="polite" data-vbs-toast hidden></div></section>';
    var panel = root.querySelector('[data-vbs-panel]');
    var stage = root.querySelector('.vbs-stage');
    var world = root.querySelector('[data-vbs-world]');
    var fallback = root.querySelector('[data-vbs-fallback]');
    fallback.src = '/assets/bookshop/room.webp?v=photo-20261015a';
    fallback.alt = '실제 책공방 사진을 참고한 회전 책장과 중앙 진열대가 있는 입체 책방';
    stage.insertAdjacentHTML('afterend', '<p class="vbs-layout-note">실제 책공방 사진을 바탕으로 만들었어요. 비율과 통로는 산책하기 좋게 조금 조정했어요.</p>');
    root.querySelector('.vbs-place-nav [data-vbs-action="program"]').textContent = '모임 맛보기';
    var toast = root.querySelector('[data-vbs-toast]');
    function announce(message) { if (disposed || !message) return; clearTimeout(announcementTimer); toast.textContent = String(message); toast.hidden = false; announcementTimer = global.setTimeout(function () { toast.hidden = true; }, 4500); }
    function renderPanel(focusHeading) {
      if (disposed) return;
      var active = document.activeElement;
      var focused = panel.contains(active) && active.dataset ? Object.assign({}, active.dataset) : null;
      panel.innerHTML = state.view === 'category' ? categoryView() : state.view === 'detail' ? detailView() : state.view === 'bag' ? bagView() : state.view === 'bookmarks' ? bookmarksView() : state.view === 'character' ? characterView() : state.view === 'program' ? programView() : state.view === 'guests' ? guestsView() : state.view === 'guest' ? guestView() : dialogueView();
      root.querySelector('[data-vbs-count]').textContent = String(count());
      root.querySelectorAll('.vbs-shelf-nav [data-category]').forEach(function (b) { b.setAttribute('aria-pressed', String(state.view === 'category' && state.category === b.dataset.category)); });
      if (focusHeading) {
        panel.querySelector('.vbs-panel-title').focus({ preventScroll: true });
        if (global.innerWidth < 900) panel.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
      } else if (focused && Object.keys(focused).length) {
        var replacement = Array.from(panel.querySelectorAll('button,input,textarea')).find(function (el) { return Object.keys(focused).every(function (key) { return el.dataset[key] === focused[key]; }); });
        if (replacement) replacement.focus({ preventScroll: true });
      }
    }
    function moveTo(id) { if (scene) scene.goTo(id); }
    function showCategory(id, move, focus) { state.category = category(id).id; state.query = ''; state.view = 'category'; if (move) moveTo(state.category); renderPanel(focus); }
    function showGuest(id, move) {
      if (!guestById(id)) return;
      state.guestId = id; state.guestStep = 'hello'; state.view = 'guest';
      if (move) moveTo(id);
      renderPanel(true);
    }
    function interact(id) {
      if (['heart', 'story', 'travel'].includes(id)) showCategory(id, false, true);
      else if (id === 'keeper') { state.view = 'welcome'; state.dialogue = 'welcome'; renderPanel(true); }
      else if (id === 'table') { state.view = 'program'; renderPanel(true); }
      else if (id === 'counter') { state.view = 'bag'; renderPanel(true); }
      else if (guestById(id)) showGuest(id, false);
    }
    function applyAppearance() {
      saveSaved(appearanceKey, { animal: state.animal, shirt: state.shirt });
      root.querySelectorAll('.vbs-avatar-thumb,.vbs-avatar-preview').forEach(function (el) { el.dataset.animal = state.animal; el.dataset.shirt = state.shirt; });
      if (scene) scene.setAvatar({ animal: state.animal, shirt: state.shirt });
    }
    function invoke(name, args, fallbackMessage) {
      if (state.busy) return;
      if (typeof options[name] !== 'function') { announce('지금은 이 기능을 연결하는 중이에요. 기존 책목록을 이용해 주세요.'); return; }
      state.busy = true; renderPanel(false);
      Promise.resolve().then(function () { return options[name].apply(null, args || []); }).then(function (result) {
        if (disposed) return;
        var ok = result !== false && !(result && result.ok === false);
        announce(result && result.message ? result.message : ok ? fallbackMessage : '변경하지 못했어요. 다시 확인해 주세요.');
      }).catch(function () { announce('정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); }).finally(function () { state.busy = false; if (!disposed) refresh(); });
    }
    function onClick(event) {
      var target = event.target.closest('[data-vbs-action]');
      if (!target || !root.contains(target) || target.disabled) return;
      var action = target.dataset.vbsAction;
      var book = target.dataset.book ? bookById(target.dataset.book) : null;
      if (action === 'category') { showCategory(target.dataset.category, true, true); return; }
      if (action === 'book' && book) { state.bookId = book.id; state.category = book.category; state.view = 'detail'; renderPanel(true); return; }
      if (action === 'add' && book) { if (!canAdd(book)) { announce(book.stock === 0 ? '현재 품절인 책이에요.' : '최신 주문 정보를 확인해 주세요.'); return; } invoke('onAdd', [book.id, 1], '책가방에 담았어요.'); return; }
      if (action === 'quantity' && book) { invoke('onQuantity', [book.id, Number(target.dataset.delta) === -1 ? -1 : 1], '책가방 수량을 바꿨어요.'); return; }
      if (action === 'remove' && book) { invoke('onRemove', [book.id], '책가방에서 뺐어요.'); return; }
      if (action === 'checkout') { invoke('onCheckout', [], '홈페이지에서 주문 접수를 이어가 주세요.'); return; }
      if (action === 'browse') { if (typeof options.onBrowse === 'function') options.onBrowse(); return; }
      if (action === 'program-link') { if (typeof options.onProgram === 'function') options.onProgram(); return; }
      if (action === 'retry') { invoke('onRetry', [], '상품 정보를 다시 확인했어요.'); return; }
      if (action === 'retry-scene') { initScene(); return; }
      if (action === 'bookmark' && book) { var index = state.bookmarks.indexOf(book.id); if (index < 0) state.bookmarks.push(book.id); else state.bookmarks.splice(index, 1); saveSaved(bookmarkKey, state.bookmarks.slice(0, 200)); renderPanel(false); announce(index < 0 ? '다음 산책을 위해 책갈피를 남겼어요.' : '책갈피를 뺐어요.'); return; }
      if (action === 'dialogue') { state.view = 'welcome'; state.dialogue = ['welcome', 'mood', 'browse', 'program'].includes(target.dataset.next) ? target.dataset.next : 'welcome'; renderPanel(false); return; }
      if (action === 'recommend') { state.view = 'welcome'; state.dialogue = 'recommend:' + (['calm', 'feeling', 'travel'].includes(target.dataset.kind) ? target.dataset.kind : 'calm'); renderPanel(false); return; }
      if (action === 'talk') { moveTo('keeper'); state.view = 'welcome'; state.dialogue = 'welcome'; renderPanel(true); return; }
      if (action === 'guests') { state.view = 'guests'; state.guestId = null; state.guestStep = 'hello'; renderPanel(true); return; }
      if (action === 'guest') { showGuest(target.dataset.guest, true); return; }
      if (action === 'guest-step' && guestById(state.guestId)) {
        var allowedSteps = state.guestId === 'guest-reader' ? ['hello', 'about', 'calm', 'story'] : ['hello', 'travel', 'questions', 'story'];
        if (!allowedSteps.includes(target.dataset.step)) return;
        state.view = 'guest'; state.guestStep = target.dataset.step; renderPanel(true); return;
      }
      if (action === 'welcome') { state.view = 'welcome'; state.dialogue = 'welcome'; renderPanel(true); return; }
      if (action === 'bag') { moveTo('counter'); state.view = 'bag'; renderPanel(true); return; }
      if (action === 'bookmarks') { state.view = 'bookmarks'; renderPanel(true); return; }
      if (action === 'character') { state.view = 'character'; renderPanel(true); return; }
      if (action === 'animal' && ['cat', 'bear', 'rabbit'].includes(target.dataset.animal)) { state.animal = target.dataset.animal; applyAppearance(); renderPanel(false); return; }
      if (action === 'shirt' && ['forest', 'bread', 'rose'].includes(target.dataset.shirt)) { state.shirt = target.dataset.shirt; applyAppearance(); renderPanel(false); return; }
      if (action === 'lighting') { state.lighting = state.lighting === 'day' ? 'evening' : 'day'; if (scene) scene.setLighting(state.lighting); target.setAttribute('aria-pressed', String(state.lighting === 'evening')); target.innerHTML = icon(state.lighting === 'day' ? 'sun' : 'moon'); announce(state.lighting === 'day' ? '햇살 드는 낮이에요.' : '노을 지는 저녁이에요.'); return; }
      if (action === 'rotate') { if (scene) scene.rotateCamera(); return; }
      if (action === 'program') { moveTo('table'); state.view = 'program'; renderPanel(true); return; }
      if (action === 'word' && ['여유', '설렘', '용기', '그리움'].includes(target.dataset.word)) { state.word = target.dataset.word; renderPanel(false); return; }
      if (action === 'program-write') { state.programStage = 'write'; renderPanel(true); return; }
      if (action === 'program-reset') { state.programStage = 'choose'; state.note = ''; renderPanel(true); return; }
      if (action === 'program-complete') { if (!state.note.trim()) { announce('떠오르는 한 문장을 적어주세요.'); return; } state.programStage = 'complete'; renderPanel(true); }
    }
    function onInput(event) {
      if (event.target.matches('[data-vbs-search]')) { state.query = event.target.value.slice(0, 100); var list = panel.querySelector('[data-vbs-list]'); if (list) list.innerHTML = bookListBody(); }
      if (event.target.matches('[data-vbs-note]')) state.note = event.target.value.slice(0, 180);
    }
    function onKeydown(event) {
      if (event.target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      var index = categories.findIndex(function (c) { return c.id === state.category; });
      index = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length;
      showCategory(categories[index].id, true, false);
      panel.querySelector('[role="tab"][aria-selected="true"]').focus({ preventScroll: true });
    }
    function onImageError(event) {
      if (event.target.matches('.vbs-cover,.vbs-cart-row img')) {
        var el = event.target; var missing = document.createElement('span'); missing.className = 'vbs-cover vbs-cover-missing'; missing.innerHTML = icon('book') + '<span>표지를 확인하고 있어요</span>'; el.replaceWith(missing);
      }
    }
    function sceneCovers() {
      var titles = { night: '불안과밤산책', feeling: '모든감정도감', outside: '우울의바깥을향하며', door: '문고리', someday: '어느날문득잘살고싶어졌다', uncomfortable: '이러나저러나불편한거야불편한건', bread1: '백빵기행1', bread2: '백빵기행2', breadful: '나에게도빵빵한하루가필요해' };
      var result = {}; var current = books();
      Object.keys(titles).forEach(function (id) { var found = current.find(function (b) { var title = normalizedTitle(b.title); return title === titles[id] || title.startsWith(titles[id]); }); if (found && found.cover) result[id] = found.cover; });
      return result;
    }
    function coversSignature() { return JSON.stringify(sceneCovers()); }
    function sceneFailure() {
      engine = 'fallback'; stage.dataset.engine = 'fallback'; fallback.hidden = false;
      root.querySelector('[data-vbs-engine-message]').innerHTML = '<span>입체 책방을 열지 못했어요. 책목록은 바로 이용할 수 있어요.</span>' + button('다시 열기', 'retry-scene');
    }
    function initScene() {
      if (disposed) return;
      var generation = ++loadGeneration;
      engine = 'loading'; stage.dataset.engine = 'loading'; fallback.hidden = false;
      root.querySelector('[data-vbs-engine-message]').textContent = '책방에 불을 켜고 있어요…';
      if (scene) { scene.dispose(); scene = null; }
      if (!modulePromise) modulePromise = Promise.all([import(THREE_URL), import(ROUND_URL)]).catch(function (error) { modulePromise = null; throw error; });
      var timeout = global.setTimeout(function () { if (!disposed && generation === loadGeneration && engine !== 'ready') sceneFailure(); }, 18000);
      modulePromise.then(function (modules) {
        if (disposed || generation !== loadGeneration) return;
        if (typeof global.createBookshopScene !== 'function') throw new Error('Scene is not available');
        var covers = sceneCovers(); sceneSignature = JSON.stringify(covers);
        scene = global.createBookshopScene(modules[0], modules[1].RoundedBoxGeometry, {
          container: world, woodTextureUrl: '/assets/bookshop/oak.webp', bookCovers: covers,
          brandLogoUrl: '/assets/images/brand/gd-universe-logo.png',
          brandMarkUrl: '/assets/images/brand/gd-universe-logomark.png',
          onInteract: interact,
          onStatus: function (text) { if (!disposed) root.querySelector('[data-vbs-scene-status]').textContent = String(text); },
          onReady: function () { if (disposed || generation !== loadGeneration) return; engine = 'ready'; stage.dataset.engine = 'ready'; fallback.hidden = true; root.querySelector('[data-vbs-engine-message]').textContent = ''; }
        });
        scene.setAvatar({ animal: state.animal, shirt: state.shirt });
        scene.setLighting(state.lighting);
      }).catch(function () { if (!disposed && generation === loadGeneration) sceneFailure(); }).finally(function () { global.clearTimeout(timeout); });
    }
    function refresh() {
      if (disposed) return;
      renderPanel(false);
      if (scene && coversSignature() !== sceneSignature) initScene();
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('error', onImageError, true);
    renderPanel(false);
    initScene();
    var api = {
      refresh: refresh,
      getSceneState: function () { return scene && typeof scene.getDebugState === 'function' ? scene.getDebugState() : null; },
      dispose: function () {
        disposed = true; loadGeneration += 1; global.clearTimeout(announcementTimer);
        if (scene) scene.dispose();
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('keydown', onKeydown); root.removeEventListener('error', onImageError, true);
        root.innerHTML = ''; delete root.__gaeddirangBookshop;
      }
    };
    root.__gaeddirangBookshop = api;
    return api;
  }
  global.GaeddirangBookshopApp = { mount: mount };
})(window);
