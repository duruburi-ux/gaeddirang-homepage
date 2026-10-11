(function (root, factory) {
  const content = factory();
  if (typeof module === 'object' && module.exports) module.exports = content;
  else root.GaeddirangContent = content;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Public Naver booking details observed on 2026-10-11. Availability is not a lasting promise.
  const venue = '개띠랑책공방 · 동탄 라크몽 B동 2층 W241호';
  const booking = 'https://m.booking.naver.com/booking/6/bizes/1609502/items/';
  const common = { is_open: true, registration_verified_on: '2026-10-11',
    registration_verified_until: '2026-10-11', late_join: false, star_rating: 0,
    apply_label: '네이버 예약에서 최신 일정 확인하기', image_path: '', location: venue };
  const programs = [{
    ...common, slug: 'walk-and-write-oct-2026', title: '같이 걷고<br>같이 써요',
    description: '다솜과 동탄호수공원을 걸으며 관찰하고 사진을 찍은 뒤, 책공방으로 돌아와 그날의 장면을 글로 남기는 두 시간입니다. 글 나눔은 원하는 만큼만 합니다.',
    target: '성인 · 회차별 최대 6명',
    time_info: '2026년 10월 17·24·31일(토), 22·29일(목) 중 하루 선택<br>10:00–12:00 · 휴대전화와 편한 신발을 준비해 주세요.<br>약한 비에는 우산을 쓰고 진행하며, 큰 비가 예상되면 전날 안내합니다.',
    benefit: '직접 찍은 사진 한 장 인화 · 접이식 기록지 한 장<br>공원 산책·관찰과 책공방에서의 사진·글 기록',
    price: '1회 25,000원', instructor: '다솜(이다솜) · 감정기록가·숲해설가',
    start_date: '2026-10-17', end_date: '2026-10-31',
    session_dates: ['2026-10-17', '2026-10-22', '2026-10-24', '2026-10-29', '2026-10-31'],
    badge_type: '회차별 원데이 · 예약 일정 확인',
    stat1_label: '대상', stat1_value: '성인 · 6명', stat2_label: '시간', stat2_value: '120분',
    sort_no: -4, border_color: '#285943', bg_color: '#e9f3ec', icon_emoji: '🌿✍️',
    apply_url: booking + '8106497'
  }, {
    ...common, slug: 'make-my-book-first-2026', title: '책 짓는 사이 1기:<br>나만의 책 만들기',
    description: '책의 방향을 정하고 원고·내지·표지·인쇄 파일을 준비해 샘플 책을 만드는 여섯 주 과정입니다. 원고가 완성되지 않았어도 책으로 만들고 싶은 주제가 있다면 참여할 수 있습니다.',
    target: '나만의 책을 만들어보고 싶은 분 · 정원 8명',
    time_info: '2026년 10월 30일–12월 4일 · 매주 금요일 19:00–21:00 · 총 6회<br>10/30·11/6·11/27 온라인, 11/13·11/20·12/4 책공방에서 만납니다.<br>노트북과 Photoshop·InDesign이 필요하며, 개별 구독료는 수강료에 포함되지 않습니다.',
    benefit: '샘플 책 1권 제작 지원 · 1:1 과제 피드백<br>입고나 판매를 보장하는 과정은 아닙니다.',
    price: '6주 전체 240,000원 (도구 구독료 별도)', instructor: '박지현 · 아홉프레스 대표',
    start_date: '2026-10-30', end_date: '2026-12-04',
    badge_type: '온라인·오프라인 병행 · 6주 과정',
    stat1_label: '정원', stat1_value: '8명', stat2_label: '기간', stat2_value: '6주',
    sort_no: -3, border_color: '#806c25', bg_color: '#f5f1d8', icon_emoji: '📖✂️',
    apply_url: booking + '8116481'
  }, {
    ...common, slug: 'after-work-writing-90-oct-2026', title: '퇴근 후,<br>내 이야기를 쓰는 90분',
    description: '두루가 고른 두세 문장과 하나의 질문에서 출발해 내 이야기를 씁니다. 합평·첨삭·과제 없이, 글을 나누는 것은 선택입니다.',
    target: '퇴근 뒤 내 이야기를 써보고 싶은 직장인 · 최대 4명',
    time_info: '네이버 예약 안내: 2026년 10월 14·21·28일(수) 19:30 · 회차별 90분<br>같은 장소의 다른 수업과 일정이 겹쳐, 최종 일정과 장소를 확인하고 있습니다.<br>필기도구와 노트를 준비해 주세요. 나와 관련된 책·사진·물건은 선택입니다.',
    benefit: '30분 글쓰기와 선택적인 나눔<br>그날의 질문으로 남기는 나의 문장',
    price: '1회 10,000원', instructor: '두루(장진호)',
    start_date: '2026-10-14', end_date: '2026-10-28',
    session_dates: ['2026-10-14', '2026-10-21', '2026-10-28'], schedule_needs_confirmation: true,
    badge_type: '일정·장소 확인 중', stat1_label: '대상', stat1_value: '직장인 · 4명',
    stat2_label: '시간', stat2_value: '90분', sort_no: -2,
    border_color: '#285943', bg_color: '#e9f3ec', icon_emoji: '📝☕', apply_url: booking + '8031041'
  }, {
    ...common, slug: 'drama-writer-oct-2026', title: '나도<br>드라마 작가',
    description: '내 감정과 기억에서 인물을 찾고 짧은 대본을 쓴 뒤, AI 이미지·클립과 편집을 더해 짧은 영상으로 만들어봅니다. 개인 경험은 공개하지 않아도 됩니다.',
    target: '내 이야기를 대본과 영상으로 만들어보고 싶은 성인 · 정원 6명',
    time_info: '네이버 예약 안내: 2026년 10월 14·21·28일, 11월 4일(수) 19:00–21:00 · 총 4회<br>같은 장소의 다른 수업과 일정이 겹쳐, 최종 일정과 장소를 확인하고 있습니다.<br>노트북을 권장하며 ChatGPT·Higgsfield 개별 구독이 필요합니다. 구독료는 수강료와 별도입니다.',
    benefit: '짧은 대본 · 30초–1분 영상 · PDF 대본집<br>첫 회차 예약으로 4회 전체에 참여하는 과정',
    price: '4회 전체 59,000원 (도구 구독료 별도)', instructor: '이다솜',
    start_date: '2026-10-14', end_date: '2026-11-04', schedule_needs_confirmation: true,
    badge_type: '일정·장소 확인 중', stat1_label: '대상', stat1_value: '성인 · 6명',
    stat2_label: '기간', stat2_value: '4회', sort_no: -1,
    border_color: '#4c5894', bg_color: '#eef0fb', icon_emoji: '🎬✍️', apply_url: booking + '8106509'
  }];
  const news = [{
    category: 'news', title: '[책공방] 감정과 키워드로 고르는 블라인드북',
    published_on: '2026-10-11', date_label: '10.11',
    body: '책공방의 10월 3일 공개 안내에서는 이다솜의 감정카드나 두루의 키워드카드에서 끌리는 말 하나를 골라, 표지를 가린 책을 만나는 블라인드북을 소개했습니다. 책공방에서는 카드를 직접 보며 고를 수 있고 스마트스토어에서도 안내를 확인할 수 있습니다. 제목을 먼저 정해 구매하는 일반 도서와 다른 방식이며, 현재 상품 구성과 판매 여부는 매장 또는 공식 스토어에서 확인해 주세요.'
  }, {
    category: 'news', title: '[운영 일정] 두루와 다솜의 도서관·평생학습 과정',
    published_on: '2026-10-11', date_label: '10.11',
    body: '두루의 대림도서관 기록공작소 6기는 10월 15일까지, 누릴인권센터의 「내 글이 하나의 이야기가 될 때」는 11월 16일까지 운영 일정이 잡혀 있습니다. 다솜은 향남의 초등 감정 과정, 둥지나래·노을빛도서관의 AI 과정, 삼괴도서관과 장안여중의 숲 관찰 과정을 진행하는 일정입니다. 기관별 기간과 전체 회차는 프로젝트 상세에서 확인할 수 있습니다. 이 글은 운영 일정 소개이며 신규 모집이나 모든 회차의 완료를 뜻하지 않습니다.'
  }, {
    category: 'news', title: '[책공방 프로그램] 다솜과 같이 걷고 같이 써요',
    published_on: '2026-10-11', date_label: '10.11', expires_on: '2026-10-31',
    body: '10월 17·24·31일 토요일, 22·29일 목요일 중 하루를 선택해 다솜과 동탄호수공원을 걷고 책공방에서 사진과 글을 남깁니다. 성인 회차별 최대 6명, 10:00–12:00, 1회 25,000원입니다. 현재 예약 가능한 날짜와 잔여 자리는 프로그램 카드의 네이버 예약에서 확인해 주세요.'
  }, {
    category: 'news', title: '[책 만들기] 책 짓는 사이 1기 · 온라인과 책공방에서 만나요',
    published_on: '2026-10-11', date_label: '10.11', expires_on: '2026-12-04',
    body: '아홉프레스 박지현이 진행하는 여섯 주 책 만들기 과정입니다. 10월 30일부터 12월 4일까지 금요일 19:00–21:00에 온라인 세 번, 개띠랑책공방 세 번을 병행합니다. 정원 8명, 전체 240,000원이며 샘플 책 1권 제작 지원과 과제 피드백이 포함됩니다. Photoshop·InDesign 구독료는 별도이고 입고·판매를 보장하지 않습니다. 세부 일정과 최신 접수 상태는 공식 예약에서 확인해 주세요.'
  }];
  return { verified_on: '2026-10-11', programs, news };
});
