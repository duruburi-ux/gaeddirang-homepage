# 재정 현황 운영 반영 기록

2026-10-12 사용자 승인에 따라 비공개 스냅샷 저장 구조와 검증 스냅샷을 운영에 반영했다. 실제 재정 JSON, 개인 이름, 금액, 원본 경로는 Git 저장소·정적 번들·마이그레이션 seed에 넣지 않는다.

## 1. 코드 반영 범위

1. `20261012010500_finance_dashboard_private_snapshots.sql`을 적용한다.
2. 익명·일반 인증 사용자가 `finance_dashboard_snapshots`를 직접 읽거나 쓸 수 없는지 확인한다.
3. 기존 정산 문서 관리자 3명만 `get_finance_dashboard()`를 실행할 수 있는지 확인한다.
4. 관리자 정적 파일의 재정 탭과 모델·스타일을 배포한다.

## 2. 비공개 스냅샷 만들기

원천 폴더와 출력 파일은 Git 작업트리 밖에 둔다. 빌더는 기본 재정 JSON 4개, 비민감 거래 드릴다운·스키마·검증 JSON 3개, 등록된 원본 파일의 SHA-256을 다시 확인한다. 검증 상태가 `passed`가 아니거나 회사 손익·팀 계좌 잔액이 임의 값으로 채워졌거나 민감 필드 제거 증명이 빠졌으면 중단한다.

```sh
node scripts/build-finance-dashboard-snapshot.mjs /absolute/private/source-dir --out /absolute/private/finance-dashboard-snapshot.json
```

출력 파일은 새 파일로만 만들며 권한은 `0600`이다. 이미 있는 경로를 덮어쓰지 않는다.

## 3. 서비스 역할로 원자적 활성화

브라우저·anon key·관리자 세션에는 스냅샷 쓰기 권한을 주지 않는다. 운영 DB의 신뢰된 서비스 역할에서 한 트랜잭션으로 기존 활성본을 비활성화하고 새 검증본 하나만 활성화한다.

```sql
begin;

update public.finance_dashboard_snapshots
set is_active = false
where is_active;

insert into public.finance_dashboard_snapshots (
  schema_version,
  source_as_of,
  source_sha256,
  payload,
  is_active,
  activated_at,
  created_by,
  notes
) values (
  1,
  :'source_as_of'::timestamptz,
  :'source_sha256',
  :'payload'::jsonb,
  true,
  now(),
  :'operator',
  :'notes'
);

commit;
```

`source_sha256`은 입력 묶음과 빌더 코드까지 포함한다. 같은 입력·같은 빌더의 재적재는 고유 제약으로 실패하고, 빌더 검증 규칙이 바뀌면 새 지문으로 배포한다. 실패하면 트랜잭션 전체를 되돌리고 기존 활성본을 유지한다.

## 4. 운영 확인

- 미로그인과 일반 인증 사용자: RPC 거부, 테이블 직접 조회 거부.
- 기존 정산 문서 관리자 3명: 8월·9월 확정과 10월 진행 중을 구분해 조회.
- 회사 수입·지출과 팀 계좌 잔액: `0원`이 아니라 `확인 필요` 또는 `집계 보류`.
- 머니핀 8~9월 455행: 은행·카드·계산서·그 밖 증빙을 구분하고 검색·필터 제공. 손익·잔액 카드와 분리.
- 확인 항목: 확정 미지급, 분배 전 보관금, 지급 증거 누락, 연결·중복 후보를 거래 합계와 분리.
- 숫자 상세: 계산식·거래 근거·해당 월 확정 정산 문서만 표시.
- 문서 열기: 기존 접근 감사 RPC 뒤 60초 서명 링크만 사용.
- 세션 만료: 재정 데이터와 상세 패널을 즉시 비우고 로그인 화면으로 이동.

## 5. 적용 결과

- 마이그레이션 `finance_dashboard_private_snapshots` 적용 완료.
- 원본 테이블은 anon·authenticated 직접 조회 권한 없음, RLS 활성화, 정책 없음(의도된 RPC 전용 구조).
- anon RPC 호출은 HTTP 401로 거부됨.
- 기존 관리자 허용 목록은 3명으로 유지됨.
- 활성 스냅샷 1건, 8월 255행·9월 200행·10월 0행, 문제 목록 8건을 집계 없이 게시함.
- 회사 손익과 현재 팀 잔액은 `null` 유지.

## 6. 이번 변경에 포함하지 않은 것

- 은행·머니핀 새 연결이나 자격증명 생성
- 실제 송금·지급 완료 표시
- 원장·정산 문서·원본 파일 수정
- 관리자 권한 확대
- 은행 원장 연결과 손익 자동 확정
