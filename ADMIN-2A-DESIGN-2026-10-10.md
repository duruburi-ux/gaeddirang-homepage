# 관리실 2A 설계·승인 범위

이 문서는 운영 커밋 `29b50ba` 뒤의 2A 설계와 로컬 구현 상태다. 읽기 전용 2A-0 결과는 `ADMIN-RLS-BASELINE-2026-10-10.md`에 기록했다. DB·RLS·Edge/UI 변경과 회귀 테스트는 작업 브랜치에 준비했지만 운영에는 적용·배포하지 않았다. 운영 행 데이터 조회·수정, 과거 주문 백필, 권한 변경도 하지 않았다.

## 결론

한 번의 승인으로 바로 운영 정책을 교체하지 않는다. 권장 범위는 다음 두 단계다.

1. **2A-0 읽기 전용 기준선 — 완료**: 운영의 schema·grant·RLS·함수 보안 속성만 추출했다. 행 값, 관리자 이메일, 고객 정보, Storage object 이름은 읽지 않았다.
2. **2A-1 추가형 원자성 변경 — 로컬 구현/검증 완료, 미적용**: Payhere 예약 테이블/RPC와 주문 생성 RPC, 살아 있는 세션을 확인하는 관리자 판정을 준비했다. 기존 행은 수정하지 않는다.
3. **2A-2 cutover — 로컬 초안/검증 완료, 미적용**: SQL은 자동 적용되지 않도록 `supabase/migration-plans/`에 둔다. UI/Edge 전환이 먼저 배포·관찰된 뒤 주문 직접 쓰기 권한과 과도한 공개 접수 정책을 회수한다.

## 1. Payhere 중복 반영 방지

### 확인된 경로와 위험

- `supabase/functions/scm-sales-import/handler.mjs`는 Google `입출고원장`과 `integration_inventory_movements`를 읽어 중복을 검사한 뒤 Google에 먼저 append하고 control ledger를 나중에 insert한다.
- 브라우저의 반복 클릭 잠금과 `integration_inventory_movements.external_event_id` 중복 방지는 한 요청 안의 재시도에는 유효하다.
- 두 관리자·탭·Edge isolate가 같은 이벤트를 동시에 읽으면 둘 다 Google append 전 검사에 통과할 수 있다. DB unique 충돌은 이미 일어난 두 번째 Google 쓰기를 되돌리지 못한다.

### 정확한 변경 대상

| 구분 | 대상 | 내용 |
| --- | --- | --- |
| 추가 | `public.integration_sales_import_reservations` | Payhere 이벤트별 선점과 복구 상태. `connector_code`, `external_event_id`를 PK로 두고 `report_hash`, `request_id`, `canonical_sku`, 수량·단가·거래시각, `status`, 시각, `reserved_by`, 오류 코드만 저장한다. 파일 내용·계좌·이메일은 저장하지 않는다. |
| 추가 | `public.reserve_payhere_sales_import(text, uuid, jsonb)` | 관리자 세션을 다시 확인한 뒤 요청의 모든 이벤트를 한 트랜잭션에서 예약한다. 한 건이라도 다른 요청이 `reserved/google_written_pending_control`이면 전체 요청을 쓰기 전에 HTTP 409 `IMPORT_IN_PROGRESS`로 끝낸다. `applied`는 중복으로 반환한다. |
| 추가 | `public.mark_payhere_google_written(uuid, jsonb)` | 현재 요청이 예약한 이벤트만 `google_written_pending_control`로 전환한다. Google 성공 전에는 호출하지 않는다. |
| 추가 | `public.finalize_payhere_sales_import(uuid, jsonb)` | 고정 connector/location/movement 규칙을 다시 검사하고 `integration_inventory_movements` insert와 예약 상태 `applied` 전환을 한 DB 트랜잭션으로 처리한다. 같은 이벤트·같은 내용의 재호출은 성공으로 응답하고 다른 내용이면 차단한다. |
| 추가 | `public.fail_payhere_sales_import(uuid, text)` | Google 쓰기 전 실패만 `failed_before_google`로 바꾼다. `google_written_pending_control`은 실패로 내리지 못한다. |
| 추가 | RLS·grant | 예약 테이블은 RLS를 켜고 `public/anon/authenticated`의 직접 권한을 모두 회수한다. 테이블 직접 정책은 만들지 않는다. RPC는 `authenticated`만 실행 가능하고 `security definer`, `search_path=''`, 현재 로그인·이메일 확인·`public.is_admin()`을 모두 재검사한다. |
| 변경 | `supabase/functions/scm-sales-import/handler.mjs` | apply 요청에 `request_id`를 요구하고 `Google/control 조회 → reserve → 예약 결과상 필요한 Google append → mark → finalize` 순서로 바꾼다. `applied` 또는 `google_written_pending_control` 예약은 다시 append하지 않는다. |
| 변경 | `admin/integration.js` | 한 파일 hash마다 UUID를 `sessionStorage`에 고정해 apply 재시도와 새로고침 복구에 재사용한다. 원본 파일 내용은 저장하지 않는다. `IMPORT_IN_PROGRESS`, `CONTROL_REPAIR_REQUIRED`를 명확히 표시한다. |
| 변경 | 테스트·README | 두 동시 요청, 응답 유실, Google 성공 뒤 DB 실패, 권한 회수, 서로 다른 payload의 동일 이벤트를 추가한다. |
| 삭제 | 없음 | 기존 movement, sync run, mapping, Google 행을 삭제하지 않는다. |

상태는 `reserved → google_written_pending_control → applied` 또는 Google 쓰기 전의 `failed_before_google`만 허용한다. 자동 TTL 탈취는 넣지 않는다. 오래된 `reserved`는 Google과 control ledger를 다시 읽어 동일 이벤트가 없을 때만 같은 요청 ID로 재개하고, 결과가 모호하면 `needs_review`로만 표시한다. 이 원칙이 시간 경과만으로 같은 판매를 다시 쓰는 것보다 안전하다.

### 데이터·권한·호환성

- 기존 `integration_inventory_movements`, `integration_sync_runs`, Google 원장은 **수정·백필하지 않는다**.
- 적용 전 진단은 event ID와 report hash의 중복/양쪽 존재 여부를 집계만 하며 원본 행 내용을 보고서에 남기지 않는다.
- 현재 `is_admin()`이 허용하는 관리자 3명은 같은 권한을 유지한다. 복구 전용 1인 권한이나 새 인증정보는 만들지 않는다.
- 새 테이블/RPC를 먼저 배포해도 기존 Edge는 영향을 받지 않는 추가형 변경이다. 새 Edge가 실패하면 apply를 일시적으로 dry-run-only로 내리고 구 Edge 쓰기 경로로 되돌아가지 않는다. 테이블과 기록은 보존하며 긴급 롤백에서 drop하지 않는다.

### 승인 후 검증

- 동일 payload를 `Promise.all`로 두 번 적용해 Google append가 정확히 1회인지 확인
- Google append 응답 유실 뒤 재시도에서 Google 재기록 없이 control ledger만 복구
- reserve 후 권한을 회수한 사용자가 mark/finalize하지 못하는지 확인
- 이벤트 ID는 같고 수량·SKU가 다른 payload가 차단되는지 확인
- 정상/중복/부분 복구 각각에서 `integration_inventory_movements`가 정확히 1행인지 확인
- 실제 운영 검증은 쓰기 없이 기존 이벤트의 양쪽 원장 존재 여부만 확인하고, 합성 어댑터와 로컬 DB에서 쓰기 시나리오를 수행

## 2. 주문·품목 원자 저장

### 확인된 경로와 위험

- 관리자 `admin/index.html`은 `orders` insert 뒤 `order_items`를 별도로 insert한다. 품목 실패 때 재시도 UI는 생겼지만 빈 주문이 먼저 남는다.
- 공개 `index.html`도 같은 두 단계로 저장하고, 품목 실패 때 브라우저에서 방금 만든 주문을 delete해 보상한다. 네트워크 단절 또는 DELETE RLS 차단이면 반쪽 주문이 남을 수 있다.
- 따라서 관리자 직접 주문만 RPC로 바꾸면 공개 주문 경로의 같은 문제가 남는다. 두 경로를 같은 승인 단위에서 고쳐야 한다.

### 정확한 변경 대상

| 구분 | 대상 | 내용 |
| --- | --- | --- |
| 추가 | `public.orders.client_request_id uuid` | nullable. 새 주문의 멱등키다. 기존 행은 `null` 유지한다. |
| 추가 | `public.orders.client_request_hash text` | nullable 64자리 hash. 같은 request ID에 다른 주문 내용을 보내는 오용을 차단한다. |
| 추가 | `orders_client_request_id_uidx` | `client_request_id is not null`인 행만 unique인 partial index. |
| 추가 | `public.create_public_order_v1(uuid, text, text, text, text, text, jsonb)` | anon/authenticated 공개 주문용. `user_id`는 입력받지 않고 `auth.uid()`에서 정한다. 필수 연락처·주소, 1~20 품목, 수량·가격 범위와 합계를 서버에서 검증·계산하고 주문과 품목을 한 트랜잭션에 저장한다. 응답은 주문 ID·상태·합계만 돌려준다. |
| 추가 | `public.create_admin_order_v1(uuid, text, text, text, text, text, text, text, jsonb)` | authenticated 관리자 전용. 살아 있는 세션·확인된 비익명 사용자·allowlist를 재검사하고 허용 channel/status만 받는다. 공개·배송 주문은 주소를 요구하지만 `기타` 현장 주문은 이메일·배송지를 비워 최소 정보만 기록할 수 있다. 운영 열은 `NOT NULL`이므로 미수집 값은 가짜 정보 대신 빈 문자열로 저장한다. |
| 변경 | `index.html`, `preview/index.html` | 공개 주문의 두 insert와 delete 보상을 단일 RPC로 교체한다. 입력 hash와 UUID만 `sessionStorage`에 보관해 실패·새로고침 재시도에서 같은 UUID를 쓰고, 성공 또는 내용 변경 때 새 UUID를 만든다. 개인정보 원문은 보관하지 않는다. |
| 변경 | `admin/index.html` | 직접 주문을 관리자 RPC로 교체한다. 1차는 현재처럼 한 품목만 받되 RPC payload는 배열로 보내 추후 다품목을 호환한다. 입력은 `합계`가 아니라 `개당 금액`으로 명확히 하고 합계는 서버 계산값을 표시한다. 이메일은 선택 입력이며, 채널이 `기타`일 때 배송지도 선택 입력으로 바뀐다. |
| 변경(2단계) | `orders`, `order_items` grant/policy | 두 클라이언트 전환과 관찰이 끝난 뒤에만 anon/authenticated의 직접 INSERT와 공개 DELETE를 회수한다. 관리자 상태 UPDATE와 본인 주문 SELECT는 유지한다. |
| 삭제 | 없음 | 기존 주문·품목을 삭제하거나 자동 복구하지 않는다. |

RPC는 같은 `client_request_id`와 같은 hash면 기존 성공 결과를 반환하고, hash가 다르면 `IDEMPOTENCY_KEY_REUSED`로 차단한다. 주문 합계는 `sum(quantity × unit_price)`로 서버가 계산하므로 주문과 품목 합계가 어긋날 수 없다.

### 데이터·권한·호환성

- 기존 주문은 두 새 열을 `null`로 두며 백필하지 않는다.
- 품목 없는 기존 주문의 수와 생성 시각만 읽기 전용으로 점검한다. 사람 확인 없이 품목 생성·주문 삭제를 하지 않는다.
- 기존 관리자 3명은 직접 주문 생성과 상태 변경 권한을 그대로 가진다. 공개 주문자는 관리자 status/channel을 지정할 수 없다.
- 배포 순서는 `nullable 열·index·RPC → 공개/관리자 UI → 합성 회귀와 관찰 → 직접 INSERT/DELETE 회수 여부 별도 승인`이다. 권한 회수 전에는 UI만 이전 커밋으로 되돌릴 수 있다. 권한 회수 후 롤백은 RPC 유지가 기본이며 테이블·열 drop은 하지 않는다.

### 승인 후 검증

- 품목 insert를 강제 실패시켰을 때 주문도 0행인지 확인
- 성공 응답 유실 후 같은 request ID 재시도에서 주문·품목이 각각 한 묶음만 존재하는지 확인
- 같은 request ID에 바뀐 주소·금액·품목을 보내면 차단되는지 확인
- anon이 관리자 status/channel/user_id를 주입하지 못하는지, 일반 authenticated가 관리자 RPC를 실행하지 못하는지 확인
- 관리자 3명 역할 fixture는 성공하고 권한 회수 fixture는 즉시 실패하는지 확인
- 기존 공개 주문내역 조회와 관리자 주문 상태 변경이 그대로 동작하는지 확인

## 3. 핵심 테이블 RLS 기준선

### 2A-0에서 읽은 정확한 대상

행 데이터를 읽는 것이 아니라 아래 객체의 정의만 읽는다.

- 공개·고객 경로: `records`, `applications`, `book_alerts`, `orders`, `order_items`, `carts`
- 관리자 핵심: `cohorts`, `inquiries`, `admin_emails`
- 공개 카탈로그: `authors`, `books`, `notices`, `podcasts`, `programs`, `reviews`
- 서류실: `quotes`, `doc_items`, `team_links`, `doc_assets`, `lecture_plans`, `instructor_profiles`, `fee_sheets`, `doc_settings`
- 연동: `integration_connectors`, `integration_product_mappings`, `integration_inventory_movements`, `integration_reconciliation_issues`, `integration_settlement_entries`, `integration_sync_runs`
- 이미 강화된 기준 비교군: `royalty_payment_accounts`, `royalty_payment_account_events`, `settlement_documents`, `settlement_document_events`, private bucket `settlement-documents`
- 함수: `is_admin`, 위 표의 테이블을 쓰는 trigger function, 모든 public RPC와 `security definer` 함수

추출 필드는 `pg_class.relrowsecurity/relforcerowsecurity`, `information_schema.role_table_grants`, `pg_policies`, `pg_proc.prosecdef/proconfig/proacl`, trigger 정의, FK/unique/check와 Storage bucket의 public·크기·MIME 설정뿐이다. `select *`, 이메일 목록, 고객 행, 계좌, 문서 경로, JWT, secret은 추출하지 않는다.

상세 결과와 Advisor 판정은 `ADMIN-RLS-BASELINE-2026-10-10.md`에 있다.

### 추가·변경·삭제 구분

| 단계 | 추가 | 변경 | 삭제 |
| --- | --- | --- | --- |
| 2A-0 | 익명화된 권한 기준선 보고 | 없음 | 없음 |
| 로컬 초안 | 주문/Payhere 원자성, 엄격한 관리자 세션, 공개 접수 제한 migration과 회귀 | 아직 운영에는 적용하지 않음 | 없음 |
| 별도 승인 후 | 추가형 migration부터 적용 | UI/Edge 전환·관찰 뒤 cutover | 대체 RPC 검증 뒤 직접 쓰기 정책만 회수 |

현재 승인 범위에는 운영 RLS 변경이 포함되지 않는다. 기대 경계는 테스트로 먼저 고정했다.

- anon: 공개 카탈로그의 의도된 열 조회와 공개 접수 RPC/INSERT만 가능, 고객·주문·문의·관리 문서 조회 불가
- 일반 authenticated: 본인 cart와 본인 주문 조회만 가능, 관리자 장부·연동·문서 접근 불가
- 허용 관리자 3명: 기존 관리실 기능의 필요한 SELECT/INSERT/UPDATE/DELETE만 가능
- 권한 회수 관리자: 새 토큰뿐 아니라 기존 JWT로도 `is_admin`/allowlist 재검사 뒤 즉시 거부
- 계좌와 정산자료: 기존 Vault·private Storage·RPC 경계 유지, 완화 금지

### 롤백과 검증

- 2A-0은 읽기 전용이라 운영 롤백이 없다. 민감값이 없는 manifest 파일만 폐기할 수 있다.
- 정책 변경이 필요한 경우 정책별 역마이그레이션을 같은 PR에 둔다. `disable row level security`, broad `to public using(true)`, service-role 키의 브라우저 사용은 롤백 수단으로 금지한다.
- pgTAP 역할은 anon, 일반 authenticated, 허용 관리자, anonymous auth, 이메일 미확인 관리자, allowlist에서 제거된 관리자로 구성한다.
- 각 역할에서 SELECT/INSERT/UPDATE/DELETE/RPC를 허용·거부 표대로 검사하고 공개 주문·관리자 주문·Payhere RPC 회귀를 함께 돌린다.
- 2026-10-10 전용 로컬 Supabase에서 기존 정산 pgTAP 60개와 신규 원자성 29개, 합계 89개가 통과했다. 실제 localhost HTTP/RPC에서도 일반 사용자 거부, 현재 관리자 허용, 로그아웃 세션 거부, 주문 멱등성·부분 실패 롤백, Payhere 예약 충돌·완료 재호출을 확인했다. 운영 데이터와 외부 Google/Payhere 쓰기는 사용하지 않았다.

## 운영 변경 없이 진행한 저위험 후속

- 신청 목록에 남아 있던 `refund_confirmed → 입금✓` 표기를 `환불규정✓`로 바로잡고 브라우저 회귀를 추가했다.
- 거래명세서 수정과 견적 상태 갱신에 기존 `updated_at` 조건을 사용하도록 보강했다. 다른 관리자가 먼저 고쳤거나 상태 저장이 실패하면 PDF 인쇄를 중단한다.
- 두 변경은 현재 작업 브랜치에만 있으며 아직 운영 배포하지 않았다.

## 아직 구현하지 않은 항목 분류

| 항목 | 지금 구현하지 않은 이유 | 다음 승인/결정 |
| --- | --- | --- |
| 작가 정산 제외 사유와 지급상태 badge | 거래별 사유의 영구 원본과 실제 지급상태의 공식 원본을 정해야 함 | 정산 메타데이터·문구 승인 |
| 계획/실사/예약/출고/가용 재고 | 예약 생성·해제 시점과 원본 열이 없음 | SCM 데이터 계약 승인 |
| 관리자 CDN 자체 호스팅·CSP | 빌드/호스팅과 위반 수집 정책이 필요 | 공급망 배포 단위 승인 |
| localStorage 민감 초안 TTL/삭제 | 브라우저 종료 후 복구 필요 기간을 정해야 함 | 1일/7일/30일 또는 session-only 결정 |
| 지원사업 회계 단계 | Notion·Sheet·회계 중 공식 원본과 역할이 미정 | 업무·권한 모델 결정 |
| 고정 Google/Notion 식별자 설정 이동 | 식별자는 비밀이 아니나 설정 RPC·캐시 변경이 필요 | 운영 설정 변경 승인 |
| 계좌 reveal/copy MFA·2인 승인 | 현재 3관리자 동등 권한을 바꾸는 정책 변경 | 별도 보안 결정 |

위 항목은 숫자나 상태를 추정해 화면에 먼저 만들지 않는다.
