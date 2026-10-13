-- Register the read-only evidence collectors used by the admin integration inbox.
-- These rows are descriptors only: they add no credentials, grants, or automation.

insert into public.integration_connectors
  (code, name, system_group, purpose, status, sync_mode, data_direction,
   automated, source_of_truth, next_action, note, sort_order)
values
  (
    'naver_mail',
    '네이버 메일',
    'finance',
    '영수증·첨부 근거 후보',
    'connected',
    'scheduled',
    'inbound',
    true,
    false,
    '새 근거를 검토함에서 확인',
    'MoneyPin 메일 첨부의 비식별 메타데이터만 수집하며 거래·정산·지급으로 자동 승격하지 않음',
    35
  ),
  (
    'google_chat',
    'Google Chat',
    'work',
    '업무 메모 근거 · 거래 확정 아님',
    'connected',
    'scheduled',
    'inbound',
    true,
    false,
    '새 근거를 검토함에서 확인',
    '읽기 전용 메시지 메타데이터와 해시만 수집하며 승인·명령·확정 거래로 취급하지 않음',
    36
  )
on conflict (code) do nothing;
