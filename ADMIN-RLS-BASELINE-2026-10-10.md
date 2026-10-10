# 관리실 2A-0 권한 기준선

- 대상: Supabase 프로젝트의 스키마·grant·RLS·함수/트리거 보안 속성
- 방식: 읽기 전용 메타데이터 질의
- 제외: 테이블 행, 관리자 이메일 값, 고객 정보, 계좌, 금액, Storage 객체명·경로, secret
- 운영 변경: 없음

## 결론

대상 핵심 테이블은 모두 RLS가 켜져 있다. 정산 계좌와 정산 문서는 이미 직접 테이블 접근을 차단하고 엄격한 관리자 RPC만 허용한다. 가장 큰 실제 위험은 RLS의 공통 관리자 판정인 `public.is_admin()`이 JWT 이메일과 allowlist만 확인하고, 현재 `auth.uid()`, 확인된 비익명 사용자, 살아 있는 `auth.sessions`를 확인하지 않는다는 점이다. allowlist에서 이메일을 지워도 거부되지만, 삭제·철회된 세션의 기존 access token은 만료 때까지 관리자 RLS를 통과할 수 있다.

두 번째 위험은 공개 주문이 `orders`와 `order_items`를 브라우저에서 나눠 쓰고 실패 때 브라우저 DELETE로 보상한다는 점이다. 네트워크 단절이나 DELETE RLS 실패 때 품목 없는 주문이 남을 수 있다. 관리자 직접 주문은 운영 스키마가 요구하는 이메일과 배송지를 받지 않아 저장이 실패할 수 있고, 화면의 금액 의미도 합계인지 개당 금액인지 불명확했다.

세 번째 위험은 Payhere 가져오기가 Google 원장을 먼저 쓰고 통합 원장을 나중에 써서 두 요청이 동시에 사전 검사를 통과할 수 있다는 점이다. DB의 movement unique index는 두 번째 Google 행을 되돌리지 못한다.

## 확인된 권한 경계

| 영역 | 현재 RLS/정책 | 판정 |
| --- | --- | --- |
| `applications` | public INSERT `with check true`, 관리자 SELECT/UPDATE | 공개 입력값이 업무 상태·법적 동의 열까지 지정 가능해 과도함 |
| `orders` | public INSERT, 관리자 SELECT/UPDATE, 본인 SELECT | 주문 본문/품목 분할 쓰기와 공개 보상 DELETE가 위험 |
| `order_items` | public INSERT, 관리자 SELECT, 부모 주문 소유자 SELECT | 주문과 별도 트랜잭션이라 반쪽 저장 가능 |
| `inquiries` | anon/auth INSERT `with check true`, 관리자 SELECT/UPDATE | 공개 입력값 제한이 없음 |
| `book_alerts` | anon만 INSERT `with check true`, 관리자 SELECT | 로그인 사용자는 제출 실패 가능, 입력값 제한 없음 |
| 공개 카탈로그 | public SELECT 정책 | 의도한 공개 읽기 범위 |
| 연동·서류 테이블 | `is_admin()` 기반 관리자 정책 | 공통 관리자 판정 강화가 선행되어야 함 |
| `royalty_payment_accounts/events` | 엄격한 RLS와 관리자 RPC, anon RPC 없음 | 기존 경계 유지 |
| `settlement_documents/events` | 직접 grant·테이블 정책 없음, 관리자 RPC만 허용 | 의도한 RPC-only 경계 |
| private `settlement-documents` bucket | private, 20MiB/MIME 제한, 관리자 read/upload/cleanup | 기존 경계 유지 |

과거에 만들어진 여러 테이블은 `anon`/`authenticated`에 넓은 테이블 grant가 남아 있다. 현재는 RLS 정책이 실제 접근을 제한하지만 최소권한 관점에서는 약하다. 이번 초안은 동작 영향이 명확한 주문·공개 접수 권한만 줄이고, 나머지는 업무별 회귀를 만든 뒤 별도 축소한다.

## 함수·세션 보안

- 주요 `SECURITY DEFINER` 함수는 모두 `search_path=''`를 사용한다.
- 정산 계좌·정산 문서 RPC는 `anon` 실행권한이 없고 내부에서 별도 엄격 관리자 검사를 한다.
- `public.is_admin()`은 현재 JWT 이메일과 `admin_emails`만 비교한다. 세션 철회 즉시성 보장이 없다.
- 운영 `auth.sessions.id`와 `user_id`는 UUID이고 `not_after`가 존재한다. 따라서 관리자 판정을 `auth.uid()`·확인된 비익명 `auth.users`·allowlist·현재 session id·`not_after`로 묶을 수 있다.
- Edge 함수가 조회하는 `/auth/v1/user`의 현재 사용자 검사와 DB RLS가 같은 세션 경계를 사용하도록 맞추는 것이 최소 변경이다.

## 스키마 정합성 발견

- `orders.email`과 `orders.shipping_address`는 둘 다 NOT NULL이다. 기존 관리자 직접 주문 폼은 이메일이 없고 배송지를 선택처럼 안내했다.
- `orders.total_amount`는 nullable integer, `order_items.unit_price`는 nullable integer다. 새 RPC는 둘을 신뢰하지 않고 품목의 `quantity × unit_price`로 합계를 계산한다.
- `books.title`은 NOT NULL, `books.price`는 nullable이다. 공개 RPC는 현재 공개 카탈로그의 같은 제목·가격 조합만 허용해 클라이언트의 임의 가격을 받지 않는다.
- `integration_inventory_movements`에는 `(connector_code, external_event_id)` partial unique index가 있고 `created_by uuid`가 있다. 이 unique는 control ledger 중복만 막고 Google 선행 쓰기의 경쟁은 막지 못한다.
- `order_items` AFTER INSERT 알림 트리거는 RPC 안의 품목 insert에서도 유지된다.

## Supabase Advisor 판정

- `program_income`, `settlement_documents`, `settlement_document_events`에 `rls_enabled_no_policy` 정보가 있다. 정산 두 테이블은 direct grant 없는 RPC-only 설계라 의도된 상태다. `program_income`은 현재 저장소에서 사용처를 찾지 못해 추측 정책을 만들지 않는다.
- public schema의 `pg_net` 경고가 있다. 이동·제거는 기존 webhook/알림 영향 분석 뒤 별도 변경한다.
- 공개 schema의 `SECURITY DEFINER` 함수 경고가 있다. 현재 정산·Vault 함수는 고정 search path와 내부 관리자 검사를 갖춘 의도된 RPC다. 새 RPC도 같은 패턴과 명시적 EXECUTE grant를 사용한다.
- 유출 비밀번호 차단이 꺼져 있다. 이는 Auth 설정 변경이므로 이번 로컬 마이그레이션에 포함하지 않는다.

## 준비한 최소 변경(아직 미적용)

1. 추가형 migration
   - `is_admin()`을 살아 있는 현재 세션까지 확인하도록 강화
   - nullable 주문 멱등키·hash와 공개/관리자 원자 생성 RPC 추가
   - Payhere 이벤트 예약 테이블과 reserve/mark/finalize 복구 RPC 추가
   - 기존 행 백필·삭제 없음
2. 클라이언트/Edge 전환
   - 공개·관리자 주문을 원자 RPC로 전환
   - Payhere를 `reserve → 필요한 Google append → mark → control finalize`로 전환
   - 같은 입력의 재시도 UUID는 `sessionStorage`에 hash와 함께 보관하며 개인정보 원문은 저장하지 않음
3. 승인 대기 cutover 계획(`supabase/migration-plans/`에 두어 자동 적용에서 제외)
   - 주문/품목 직접 INSERT와 공개 DELETE 회수
   - 공개 신청·문의·출간알림을 허용 상태·동의·형식·길이·생성시각으로 제한
   - 관리자 INSERT는 강화된 `is_admin()` 정책으로 유지

적용 순서는 추가형 DB migration → Edge/UI 동시 배포 → 합성·읽기 전용 스모크 → cutover다. 두 migration을 UI보다 먼저 한꺼번에 적용하면 기존 공개 주문이 끊기므로 금지한다.

## 보류·사용자 결정

- `program_income`의 실제 업무 소유자와 필요한 역할을 정하기 전에는 정책을 만들지 않는다.
- 유출 비밀번호 차단은 기존 관리자 로그인 영향과 복구 절차를 확인한 뒤 켠다.
- `pg_net` 이동은 알림/webhook 의존성을 확인한 별도 migration으로 한다.
- 정산 계좌 전체 조회의 MFA/2인 승인, 브라우저 초안 TTL, 지원사업 회계 단계, 재고의 예약·가용 정의는 업무·보안 정책 결정이 필요하다.

참고: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions)
