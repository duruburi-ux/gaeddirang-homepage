# royalty-read — 인세시트 읽기 전용

서류실 「문고리 인세 정산서」 탭이 인세시트의 「인세 원장(DB)」과 「대시보드」 탭을 자동으로 불러올 때 쓴다. 시트에 쓰지 않는다.

- 인증: `scm-read`와 같다. `verify_jwt: true`로 배포하고, 요청마다 로그인 사용자 → `is_admin()` → `admin_emails` 순서로 확인한다.
- 구글 인증: `scm-read`와 같은 비밀값 `SCM_GOOGLE_SERVICE_ACCOUNT`(읽기 전용 범위)를 쓴다. 인세시트가 그 서비스 계정에 공유되어 있어야 한다. 공유가 안 되어 있으면 `SHEET_NOT_SHARED`와 함께 서비스 계정 이메일을 관리자에게만 돌려준다.
- 시트 ID: 공개 저장소에 두지 않는다. `public.doc_settings`의 `key='royalty_sheet_id'` 행에서, 요청한 관리자의 권한으로 읽는다. 시트를 바꿀 때는 DB 관리 화면에서 이 값만 바꾼다.
- 캐시: 55초. 읽기가 실패하면 10분 안의 마지막 성공 결과를 `stale: true`로 돌려준다.
- 돌려주는 값: `header`, `rows`(원장 문자열 그대로), `exemptUsed`(인세 면제 200부 누적 사용), `dashboard`(누적 권수·누적 인세·지급 완료·미지급), `meta.fetchedAt`.
