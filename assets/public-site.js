(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaeddirangPublic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BOOK_SLUGS = new Set(['moongori', 'gaeddirang_baekbbang1', 'gaeddirang_baekbbang2',
    'dasom_all_emotions_atlas', 'dasom_caught_my_emotion', 'dasom_uncomfortable_is_uncomfortable',
    'duru_someday_want_live_well', 'duru_toward_outside_of_depression', 'duru_anxiety_night_walk',
    'collective_breadful_day_needed', 'collective_gray_hair_so_what', 'dasom_32_emotion_cards',
    'dasom_35_uncomfortable_emotion_cards', 'duru_check_card1', 'duru_check_card2', 'gaeddirang_bread_q_card']);
  const seoulDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  function programStatus(program, today = seoulDate()) {
    if (program.end_date && program.end_date < today) return 'ended';
    if (program.is_open === false) return 'closed';
    if (program.registration_start && program.registration_start > today) return 'upcoming';
    if (program.registration_end && program.registration_end < today) return 'closed';
    if (program.start_date && program.start_date <= today && !program.late_join) return 'in_progress';
    // A future class date alone is not evidence of current registration availability.
    if (program.is_open !== true || !program.registration_verified_until || program.registration_verified_until < today) return 'check_required';
    return 'open';
  }
  function programForDisplay(program, today = seoulDate()) {
    const status = programStatus(program, today);
    const labels = {
      ended: ['지난 회차 정보', '일정 종료', '다음 일정 확인하기'],
      closed: ['접수 종료 · 공식 안내 확인', '접수 종료', '다음 접수 안내 확인하기'],
      upcoming: ['접수 예정 · 공식 안내 확인', '접수 전', '공식 일정 확인하기'],
      in_progress: ['운영 일정 진행 중 · 추가 참여 확인 필요', '추가 참여 문의', '추가 참여 가능 여부 확인하기'],
      check_required: ['모집 상태 확인 필요', '공식 안내 확인', '공식 모집 안내 확인하기']
    };
    if (status === 'open') return { ...program, status };
    const [badge_type, stat2_value, apply_label] = labels[status];
    return { ...program, status, is_open: false, badge_type, stat2_label: '상태', stat2_value, apply_label,
      time_info: status === 'ended' ? String(program.time_info || '').split('<br>')[0] + '<br>지난 회차의 일정입니다. 다음 회차는 공식 안내를 확인해 주세요.' : program.time_info,
      price: status === 'ended' && program.price ? `지난 회차: ${program.price}` : program.price };
  }
  function noticeDate(notice) {
    const value = String(notice.published_on || notice.created_at || '');
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
  }
  function mergeNotices(fallback, cms, archivedTitles, today = seoulDate()) {
    const entries = new Map();
    for (const notice of [...fallback, ...cms]) {
      if (!notice.title || archivedTitles.has(notice.title) || notice.is_published === false ||
          (notice.expires_on && notice.expires_on < today) || noticeDate(notice) > today) continue;
      const key = `${notice.category || 'notice'}:${notice.title.trim()}`;
      const previous = entries.get(key);
      if (!previous || noticeDate(notice) >= noticeDate(previous)) entries.set(key, notice);
    }
    const sorted = [...entries.values()].sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || noticeDate(b).localeCompare(noticeDate(a)) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(cms.includes(b)) - Number(cms.includes(a)));
    return [...sorted.filter(n => n.category !== 'news').slice(0, 3), ...sorted.filter(n => n.category === 'news').slice(0, 6)];
  }
  function bookShareUrl(book) {
    const slug = book?.slug || String(book?.img || '').split('/').pop().replace(/\.(png|jpe?g|webp)$/i, '');
    return BOOK_SLUGS.has(slug) ? `https://gaeddirang.com/b/${slug}/` : `https://gaeddirang.com/?book=${encodeURIComponent(book?.title || '')}#library`;
  }
  function shippingEstimate(subtotal) {
    const shipping = subtotal > 0 && subtotal < 30000 ? 3400 : 0;
    return { subtotal, shipping, estimatedTotal: subtotal + shipping };
  }
  return { BOOK_SLUGS, seoulDate, programStatus, programForDisplay, noticeDate, mergeNotices, bookShareUrl, shippingEstimate };
});
