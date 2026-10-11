# integration-ingest — 증빙 수집함

관리자 전용 증빙 수집·검토 경계다. 원문 전체 대신 원천 ID, 시각, 짧은 요약, 첨부 해시, 거래 후보만 `integration_evidence_inbox`에 넣는다. 메일과 Google Chat은 항상 `evidence` 후보이며 승인이나 실행 명령으로 승격하지 않는다.

- `action=collect`, `connectorCode=homepage`: 기존 홈페이지 주문을 읽어 dry-run하거나 검토함에 적재한다.
- `action=ingest`: 승인된 외부 수집기가 전달한 네이버 메일, Google Chat, 스마트스토어, PayHere, 네이버 정산 후보를 공통 형식으로 정규화한다.
- `action=review`: 관리자가 후보를 근거 확인·반려·대기로 표시한다. 이 동작은 SCM 원장, 채널 재고, 지급 상태를 바꾸지 않는다.
- 스마트스토어·Google Chat·네이버 메일의 실제 수집은 자격증명과 대상 범위를 별도 승인받기 전 `CONNECTOR_APPROVAL_REQUIRED`로 멈춘다.

기존 관리자 JWT를 매 요청마다 Supabase Auth, `is_admin()`, 관리자 이메일 목록으로 다시 확인한다. CORS는 운영 도메인 두 개, POST/OPTIONS만 허용한다. 운영 적용에는 같은 변경 묶음의 DB migration 배포가 먼저 필요하다. Edge 함수는 `verify_jwt: false`로 배포하되 함수 내부 검증을 제거하면 안 된다.
