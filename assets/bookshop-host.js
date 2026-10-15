(function (root) {
  'use strict';
  let app = null;
  const source = () => root.GaeddirangVirtualBookshopSource;
  const helper = () => root.GaeddirangBookshopCatalog;
  const state = () => source()?.getCatalogState() || {loading:true,verified:false,error:''};
  const catalog = () => helper().normalizeBooks(source().getRawCatalog(), {verified:state().verified && !state().loading});
  const result = (ok, message) => ({ok,message});
  const quantity = (cart, title) => cart.filter(row=>row.title===title).reduce((sum,row)=>sum+row.qty,0);
  const ready = () => state().verified && !state().loading;
  function preservesCart(raw,clean) {
    if(!Array.isArray(raw) || raw.length>1000 || clean.length>20 || !raw.every(row=>row && typeof row.title==='string' && Number.isSafeInteger(row.qty) && row.qty>0 && row.qty<=99)) return false;
    const titles=new Set(raw.map(row=>row.title));
    return titles.size===clean.length && [...titles].every(title=>quantity(raw,title)===quantity(clean,title));
  }
  function unavailable() { return result(false,'현재 상품 정보를 확인한 뒤 담을 수 있어요. 상품 다시 불러오기를 눌러주세요.'); }
  function commit(cart) {
    try { source().writeCart(cart); return true; }
    catch (_) { return false; }
  }
  function add(bookId, count) {
    if (!Number.isSafeInteger(count) || count<1 || count>99) return result(false,'수량을 확인해주세요.');
    if (!ready()) return unavailable();
    const books = catalog();
    const book = books.find(item=>item.id===bookId && item.canPurchase);
    if (!book) return result(false,'이 책의 현재 구매 정보를 확인할 수 없어요.');
    const raw = source().readCart();
    const clean = helper().sanitizeCart(raw,books);
    if (!preservesCart(raw,clean)) {
      return result(false,'기존 장바구니에 확인이 필요한 상품이 있어요. 상단 장바구니에서 먼저 확인해주세요.');
    }
    const next = helper().addItem(clean,bookId,count,books);
    if (next.length>20 || quantity(next,book.title)!==quantity(raw,book.title)+count) {
      return result(false,'수량을 확인해주세요. 한 책은 99권까지, 서로 다른 상품은 20종까지 담을 수 있어요.');
    }
    if (!commit(next)) return result(false,'책가방을 저장하지 못했어요. 브라우저 저장 공간을 확인해주세요.');
    return result(true,'홈페이지 장바구니에 담았어요.');
  }
  function remove(bookId) {
    const book = catalog().find(item=>item.id===bookId);
    if (!book) return result(false,'상단 장바구니에서 이 상품을 확인해주세요.');
    const next = source().readCart().filter(row=>row.title!==book.title);
    return commit(next) ? result(true,'책가방에서 뺐어요.') : result(false,'변경 내용을 저장하지 못했어요.');
  }
  function change(bookId, delta) {
    if (delta!==-1 && delta!==1) return result(false,'수량을 확인해주세요.');
    const book = catalog().find(item=>item.id===bookId);
    if (!book) return result(false,'현재 상품 정보를 확인할 수 없어요.');
    const raw = source().readCart();
    const count = quantity(raw,book.title);
    if (delta===-1 && count===1) return remove(bookId);
    if (delta===1) return add(bookId,1);
    if (!ready()) return unavailable();
    if (!book.canPurchase || count<1) return result(false,'이 책의 구매 정보를 다시 확인해주세요.');
    const clean = helper().sanitizeCart(raw,catalog());
    if(!preservesCart(raw,clean)) return result(false,'기존 장바구니에서 상품과 수량을 먼저 확인해주세요.');
    const next = clean.map(row=>row.title===book.title ? {...row,qty:row.qty-1} : row).filter(row=>row.qty>0);
    return commit(next) ? result(true,'수량을 바꿨어요.') : result(false,'변경 내용을 저장하지 못했어요.');
  }
  function checkout() {
    if (!ready()) return unavailable();
    const raw = source().readCart();
    if (!raw.length) return result(false,'책방에서 마음에 드는 책을 먼저 담아주세요.');
    const books = catalog();
    if (raw.length>20 || raw.some(row=>row.qty>99 || !books.some(book=>book.title===row.title && book.canPurchase))) {
      return result(false,'확인이 필요한 상품이나 수량이 있어요. 상단 장바구니에서 확인해주세요.');
    }
    const next = helper().sanitizeCart(raw,books);
    if (!next.length || !preservesCart(raw,next)) return result(false,'구매할 수 없는 상품이 있어요. 장바구니를 다시 확인해주세요.');
    if (!commit(next)) return result(false,'장바구니를 저장하지 못했어요.');
    source().openCart();
    return result(true,'현재 상품 가격으로 장바구니를 확인했어요. 주문 접수는 다음 화면에서 진행해요.');
  }
  function mount() {
    if (app || !source() || !helper() || !root.GaeddirangBookshopApp) return;
    const host = document.getElementById('virtualBookshop');
    if (!host) return;
    app = root.GaeddirangBookshopApp.mount(host,{
      getCatalog:catalog,getCatalogState:state,getCart:()=>source().readCart(),
      onAdd:add,onQuantity:change,onRemove:remove,onCheckout:checkout,
      onBrowse:()=>source().browse(),onProgram:()=>source().program(),onRetry:()=>source().retry(),
      isPreview:source().isPreview
    });
  }
  function refresh() { if(app) app.refresh(); }
  function route(event) {
    if(event?.detail?.category==='bookshop' || location.hash==='#bookshop') {mount();refresh();}
  }
  function start() {
    root.addEventListener('gaeddirang:routechange',route);
    root.addEventListener('gaeddirang:catalogchange',refresh);
    root.addEventListener('gaeddirang:cartchange',refresh);
    root.addEventListener('storage',event=>{if(event.key==='gd_cart_v1')refresh();});
    route();
  }
  root.GaeddirangVirtualBookshopController = {mount,refresh,add,change,remove,checkout};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})(window);
