-- Payhere email-export mappings and a duplicate guard for the 2026-08-31 sale
-- that was already entered in Google SCM before this importer existed.

insert into public.integration_product_mappings
  (canonical_sku, connector_code, external_sku, product_name, unit_price, mapping_status, note)
values
  ('GDR-B-0027','payhere','불편한거야 불편한건','이러나저러나 불편한 거야 불편한 건',15000,'active','페이히어 직접 도서'),
  ('GDR-B-0025','payhere','우울의바깥을향하며','우울의 바깥을 향하며',13000,'active','페이히어 직접 도서'),
  ('GDR-S-0001','payhere','감정엽서키트','감정엽서키트',5000,'active','프로그램 재료비 결제 · 재고 차감 제외'),
  ('GDR-B-0025','payhere','키워드-바깥-우울의바깥을향하며','우울의 바깥을 향하며',16000,'active','키워드 블라인드북'),
  ('GDR-B-0032','payhere','키워드-괜찮다-어느날문득잘살고싶어졌다','어느 날 문득 잘 살고 싶어졌다',16000,'active','키워드 블라인드북'),
  ('GDR-B-0023','payhere','키워드-경험-백빵기행2','백빵기행 2',18000,'active','키워드 블라인드북'),
  ('GDR-B-0031','payhere','키워드-문-문고리','문고리',20000,'active','키워드 블라인드북'),
  ('GDR-B-0036','payhere','키워드-사랑-가족이어서할수없는이야기','가족이어서 할 수 없는 이야기',15000,'active','키워드 블라인드북'),
  ('GDR-B-0022','payhere','키워드-처음-백빵기행1','백빵기행 1',18000,'active','키워드 블라인드북'),
  ('GDR-B-0030','payhere','키워드-알다-나에게도빵빵한하루가필요해','나에게도 빵빵한 하루가 필요해!',18000,'active','키워드 블라인드북'),
  ('GDR-B-0026','payhere','키워드-용기-불안과밤산책','불안과 밤 산책',18000,'active','키워드 블라인드북'),
  ('GDR-B-0028','payhere','키워드-감정-모든감정도감','모든 감정 도감',18000,'active','키워드 블라인드북'),
  ('GDR-B-0027','payhere','키워드-궁금하다-이러나저러나불편한거야불편한건','이러나저러나 불편한 거야 불편한 건',18000,'active','키워드 블라인드북'),
  ('GDR-B-0031','payhere','감정-불안하다-문고리','문고리',20000,'active','감정 블라인드북'),
  ('GDR-B-0023','payhere','감정-즐겁다-백빵기행2','백빵기행 2',18000,'active','감정 블라인드북'),
  ('GDR-B-0032','payhere','감정-미안하다-어느날문득잘살고싶어졌다','어느 날 문득 잘 살고 싶어졌다',16000,'active','감정 블라인드북'),
  ('GDR-B-0027','payhere','감정-두근거리다-이러나저러나불편한거야불편한건','이러나저러나 불편한 거야 불편한 건',18000,'active','감정 블라인드북'),
  ('GDR-B-0025','payhere','바깥-우울바깥','우울의 바깥을 향하며',16000,'active','이전 키워드 상품명'),
  ('GDR-B-0032','payhere','괜찮다-어문잘','어느 날 문득 잘 살고 싶어졌다',16000,'active','이전 키워드 상품명'),
  ('GDR-B-0023','payhere','경험-백빵기행2','백빵기행 2',18000,'active','이전 키워드 상품명'),
  ('GDR-B-0031','payhere','문-문고리','문고리',20000,'active','이전 키워드 상품명'),
  ('GDR-B-0036','payhere','사랑-가족이어서','가족이어서 할 수 없는 이야기',15000,'active','이전 키워드 상품명'),
  ('GDR-B-0022','payhere','처음-백빵기행1','백빵기행 1',18000,'active','이전 키워드 상품명'),
  ('GDR-B-0030','payhere','알다-나빵해','나에게도 빵빵한 하루가 필요해!',18000,'active','이전 키워드 상품명'),
  ('GDR-B-0026','payhere','용기-불안과밤산책','불안과 밤 산책',18000,'active','이전 키워드 상품명'),
  ('GDR-B-0028','payhere','감정-모든감정도감','모든 감정 도감',18000,'active','이전 키워드 상품명'),
  ('GDR-B-0027','payhere','궁금하다-불편한거야불편한건','이러나저러나 불편한 거야 불편한 건',18000,'active','이전 키워드 상품명'),
  ('GDR-B-0031','payhere','불안하다-문고리','문고리',20000,'active','이전 감정 상품명'),
  ('GDR-B-0023','payhere','즐겁다-백빵2','백빵기행 2',18000,'active','이전 감정 상품명'),
  ('GDR-B-0032','payhere','미안하다-어문잘','어느 날 문득 잘 살고 싶어졌다',16000,'active','이전 감정 상품명'),
  ('GDR-B-0027','payhere','두근거리다-불편한거야','이러나저러나 불편한 거야 불편한 건',18000,'active','이전 감정 상품명')
on conflict (connector_code, external_sku) do update set
  canonical_sku=excluded.canonical_sku,
  product_name=excluded.product_name,
  unit_price=excluded.unit_price,
  mapping_status=excluded.mapping_status,
  note=excluded.note,
  updated_at=now();

insert into public.integration_inventory_movements
  (canonical_sku, location_code, connector_code, external_event_id, movement_type, quantity_delta, unit_amount, occurred_at, note, payload)
values
  ('GDR-B-0027','workshop','payhere','2026-08-31T15:02:49+09:00::불편한거야불편한건::1::15000','sale',-1,15000,'2026-08-31T15:02:49+09:00','기존 SCM 반영 판매 백필 · 재차감 없음','{"report_hash":"015abfea2a3b6fb55b0784dd00c40a6831389da2c031712381ba90ab7abe4295","scm_already_applied":true}'::jsonb),
  ('GDR-B-0025','workshop','payhere','2026-08-31T15:02:49+09:00::우울의바깥을향하며::1::13000','sale',-1,13000,'2026-08-31T15:02:49+09:00','기존 SCM 반영 판매 백필 · 재차감 없음','{"report_hash":"015abfea2a3b6fb55b0784dd00c40a6831389da2c031712381ba90ab7abe4295","scm_already_applied":true}'::jsonb)
on conflict do nothing;

update public.integration_connectors
set status='manual', sync_mode='manual', data_direction='inbound',
    purpose='메일 매출 엑셀을 검사한 뒤 SCM 재고와 통합 원장에 반영',
    next_action='매출내역 엑셀 업로드 → 중복 검사 → 관리자 승인',
    updated_at=now()
where code='payhere';
