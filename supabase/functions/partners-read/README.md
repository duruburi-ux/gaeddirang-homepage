# partners-read — SCM 거래처 탭 읽기 전용

서류실 「거래처」 탭과 견적서·거래명세서 「받는 곳」 자동완성이 SCM 시트의 「거래처」 탭(책방명·거래유형·공급률·정산주기·담당/연락처·비고·우편번호·주소)을 읽을 때 쓴다. 시트에 쓰지 않는다. 거래처 원본은 계속 SCM 「거래처」 탭이다(CU 택배 연락처 `contacts.json`도 이 탭에서 만들어진다).

- 인증·구글 계정·캐시·오류 처리는 `royalty-read`와 같다(`verify_jwt: true`, is_admin + admin_emails, `SCM_GOOGLE_SERVICE_ACCOUNT` 읽기 전용, 55초 캐시, 실패 시 10분 안의 마지막 결과를 stale로).
- 시트 ID: `public.doc_settings`의 `key='scm_sheet_id'`.
- 돌려주는 값: `header`, `partners`(제목줄 이름을 키로 한 행 목록), `meta.fetchedAt`.
