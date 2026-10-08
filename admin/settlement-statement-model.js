(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.SettlementStatement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const text = value => value == null ? '' : String(value).trim();
  const number = value => {
    const parsed = Number(String(value == null ? '' : value).replaceAll(',', ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const compact = value => text(value).replace(/\s+/g, ' ');

  function classifyLine(line){
    const explicit = text(line && line.settlementKind).toLowerCase();
    if(explicit === 'event' || explicit === 'event_royalty') return 'event';
    if(explicit === 'sale') return 'sale';
    const clue = `${text(line && line.channel)} ${text(line && line.memo)}`;
    return /홍보\s*이벤트|이벤트\s*인세|홍보용|증정\s*인세/.test(clue) ? 'event' : 'sale';
  }

  function lineKey(line, index){
    return [
      text(line && (line.date || line.month)),
      text(line && line.channel),
      text(line && line.partner),
      number(line && line.qty),
      number(line && line.price),
      text(line && line.memo),
      Number.isInteger(index) ? index : '',
    ].join('|');
  }

  function defaultInclude(book, line){
    if(!line || line.period !== true || number(line.qty) <= 0) return false;
    const kind = classifyLine(line);
    if(kind === 'sale') return true;
    if(!(book && book.isRoyalty)) return false;
    return number(line.sheetRoyalty) > 0 || /인세\s*(적용|포함|대상)/.test(text(line.memo));
  }

  function sameBook(book, line){
    const expected = text(book && book.key);
    const actual = text(line && line.bookKey);
    return !actual || (!!expected && actual === expected);
  }

  function calculate(book, rows){
    const safeBook = book || {};
    const rate = Math.max(0, number(safeBook.rate));
    const defaultPrice = Math.max(0, number(safeBook.price));
    const included = (Array.isArray(rows) ? rows : [])
      .filter(line => line && line.include === true && sameBook(safeBook, line))
      .filter(line => safeBook.isRoyalty || classifyLine(line) === 'sale')
      .map((line, index) => {
        const qty = Math.max(0, number(line.qty));
        const price = Math.max(0, number(line.price) || defaultPrice);
        const kind = classifyLine(line);
        return {
          ...line,
          kind,
          qty,
          price,
          rate,
          rowKey: text(line.rowKey) || lineKey(line, index),
          amount: Math.round(price * qty * rate),
        };
      });

    const grouped = new Map();
    included.forEach(line => {
      const channel = compact(line.channel) || '기타';
      const key = `${line.kind}|${channel}|${line.price}|${line.rate}`;
      const previous = grouped.get(key) || {
        key,
        kind: line.kind,
        channel,
        qty: 0,
        price: line.price,
        rate: line.rate,
        amount: 0,
      };
      previous.qty += line.qty;
      previous.amount += line.amount;
      grouped.set(key, previous);
    });

    const groups = [...grouped.values()];
    const salesQty = included.filter(line => line.kind === 'sale').reduce((sum, line) => sum + line.qty, 0);
    const eventQty = included.filter(line => line.kind === 'event').reduce((sum, line) => sum + line.qty, 0);
    const totalQty = salesQty + eventQty;
    const grossAmount = included.reduce((sum, line) => sum + line.amount, 0);
    return { lines: included, groups, salesQty, eventQty, totalQty, grossAmount, rate, defaultPrice };
  }

  function koreanCutoff(date){
    const match = text(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[2])}월${Number(match[3])}일까지` : '정산 종료일까지';
  }

  function defaultBasis(book, endDate){
    const supplied = text(book && (book.basisText || book.settlementBasis));
    if(supplied) return supplied;
    const cutoff = koreanCutoff(endDate);
    if(book && book.isRoyalty){
      return `온라인 판매는 구매확정일 기준, 그 외 채널은 ${cutoff} 결제·출고 완료분을 기준으로 합니다.`;
    }
    return `${cutoff} 결제·출고 완료분 중 실제 판매분만 집계합니다. 위탁 입고·이동·반품·현재고는 판매수량에 포함하지 않습니다.`;
  }

  function identity(book){
    return [text(book && book.key), compact(book && book.author), compact(book && book.title)].join('|');
  }

  function draftKey(book){
    return `docs_settlement_draft::${encodeURIComponent(identity(book))}`;
  }

  return { calculate, classifyLine, defaultBasis, defaultInclude, draftKey, identity, lineKey, sameBook };
});
