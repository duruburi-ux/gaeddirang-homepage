import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const apiUrl = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;

assert.ok(apiUrl?.startsWith('http://127.0.0.1:'), 'LOCAL_SUPABASE_URL must be localhost');
assert.ok(anonKey, 'LOCAL_SUPABASE_ANON_KEY is required');
assert.ok(serviceKey, 'LOCAL_SUPABASE_SERVICE_KEY is required');

const runId = randomUUID();
const password = `LocalOnly-${randomUUID()}-A1!`;
const ordinaryEmail = `ordinary-evidence-${runId}@example.test`;
const adminEmail = `admin-evidence-${runId}@example.test`;

async function request(path, {
  method = 'GET',
  key = anonKey,
  token = key,
  headers = {},
  body,
} = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { response, text, json };
}

function expectDenied(result, label) {
  assert.ok(
    [400, 401, 403, 404].includes(result.response.status),
    `${label}: expected denial, got ${result.response.status} ${result.text}`,
  );
}

async function signup(email) {
  const result = await request('/auth/v1/signup', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(result.response.status, 200, `signup failed: ${result.text}`);
  assert.ok(result.json?.access_token, 'signup must return a live session');
  return result.json.access_token;
}

async function rpc(name, body, token = anonKey) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', token, body });
}

const ordinaryToken = await signup(ordinaryEmail);
const adminToken = await signup(adminEmail);

const allowlisted = await request('/rest/v1/admin_emails', {
  method: 'POST',
  key: serviceKey,
  token: serviceKey,
  headers: { Prefer: 'return=minimal' },
  body: { email: adminEmail, name: 'Local evidence admin' },
});
assert.equal(allowlisted.response.status, 201, allowlisted.text);

const anonIngest = await rpc('ingest_integration_evidence', {
  p_connector_code: 'homepage',
  p_run_id: randomUUID(),
  p_rows: [],
});
expectDenied(anonIngest, 'anonymous ingest');

const ordinaryRows = await request('/rest/v1/integration_evidence_inbox?select=id', {
  token: ordinaryToken,
});
assert.equal(ordinaryRows.response.status, 200, ordinaryRows.text);
assert.deepEqual(ordinaryRows.json, [], 'ordinary user must see no evidence rows');

const ordinaryIngest = await rpc('ingest_integration_evidence', {
  p_connector_code: 'homepage',
  p_run_id: randomUUID(),
  p_rows: [{
    source_event_id: 'order:ordinary:신규',
    content_hash: '1'.repeat(64),
    occurred_at: '2026-10-11T00:00:00Z',
    evidence_type: 'homepage_order',
    summary: '권한 거부용 가상 주문',
    candidate_type: 'evidence',
  }],
}, ordinaryToken);
expectDenied(ordinaryIngest, 'ordinary ingest');

const sourceEventId = `order:virtual-${runId}:발송준비`;
const baseRow = {
  source_event_id: sourceEventId,
  content_hash: 'a'.repeat(64),
  occurred_at: '2026-10-11T00:00:00Z',
  evidence_type: 'homepage_order',
  summary: '가상 홈페이지 주문 · 발송준비',
  source_ref: `order:virtual-${runId}`,
  attachment_hashes: [],
  candidate_type: 'reservation',
  candidate_payload: { quantity: 1, unit_amount: 7000 },
  review_reason: '가용 재고 후보이며 판매 확정이 아님',
};

const inserted = await rpc('ingest_integration_evidence', {
  p_connector_code: 'homepage',
  p_run_id: randomUUID(),
  p_rows: [baseRow],
}, adminToken);
assert.equal(inserted.response.status, 200, inserted.text);
assert.equal(inserted.json?.[0]?.result, 'inserted');
const evidenceId = inserted.json[0].evidence_id;

const duplicate = await rpc('ingest_integration_evidence', {
  p_connector_code: 'homepage',
  p_run_id: randomUUID(),
  p_rows: [baseRow],
}, adminToken);
assert.equal(duplicate.response.status, 200, duplicate.text);
assert.equal(duplicate.json?.[0]?.result, 'duplicate');
assert.equal(duplicate.json?.[0]?.evidence_id, evidenceId);

const conflict = await rpc('ingest_integration_evidence', {
  p_connector_code: 'homepage',
  p_run_id: randomUUID(),
  p_rows: [{ ...baseRow, content_hash: 'b'.repeat(64), summary: '변경된 가상 주문 근거' }],
}, adminToken);
assert.equal(conflict.response.status, 200, conflict.text);
assert.equal(conflict.json?.[0]?.result, 'conflict');

const messageEscalation = await rpc('ingest_integration_evidence', {
  p_connector_code: 'naver_mail',
  p_run_id: randomUUID(),
  p_rows: [{
    ...baseRow,
    source_event_id: `mail:virtual-${runId}`,
    content_hash: 'c'.repeat(64),
    evidence_type: 'mail_message',
    summary: '가상 업무 메일',
    candidate_type: 'sale',
  }],
}, adminToken);
expectDenied(messageEscalation, 'message promoted to transaction');
assert.match(messageEscalation.text, /MESSAGE_IS_EVIDENCE_ONLY/);

const directUpdate = await request(`/rest/v1/integration_evidence_inbox?id=eq.${evidenceId}`, {
  method: 'PATCH',
  token: adminToken,
  body: { summary: '직접 수정 금지' },
});
expectDenied(directUpdate, 'direct evidence update');

const reviewed = await rpc('review_integration_evidence', {
  p_evidence_id: evidenceId,
  p_decision: 'reviewed',
  p_note: '가상 근거 검토 완료',
}, adminToken);
assert.equal(reviewed.response.status, 200, reviewed.text);
assert.equal(reviewed.json?.review_status, 'reviewed');
assert.equal(reviewed.json?.ledger_changed, false);

const edgeEventId = `virtual-edge-${runId}`;
const edgeIngest = await request('/functions/v1/integration-ingest', {
  method: 'POST',
  token: adminToken,
  body: {
    action: 'ingest',
    connectorCode: 'homepage',
    runId: randomUUID(),
    dryRun: false,
    events: [{
      id: edgeEventId,
      status: '발송준비',
      total_amount: 7000,
      created_at: '2026-10-11T00:00:00Z',
      updated_at: '2026-10-11T00:00:00Z',
    }],
  },
});
assert.equal(edgeIngest.response.status, 200, edgeIngest.text);
assert.equal(edgeIngest.json?.inserted, 1);
assert.equal(edgeIngest.json?.reviewRequired, 1);

const edgeRow = await request(
  `/rest/v1/integration_evidence_inbox?source_event_id=eq.order%3A${encodeURIComponent(edgeEventId)}%3A${encodeURIComponent('발송준비')}&select=review_status,candidate_type,summary`,
  { token: adminToken },
);
assert.equal(edgeRow.response.status, 200, edgeRow.text);
assert.equal(edgeRow.json?.length, 1, 'Edge ingest must be queryable through RLS');
assert.equal(edgeRow.json[0].review_status, 'pending');
assert.equal(edgeRow.json[0].candidate_type, 'reservation');

const logout = await request('/auth/v1/logout?scope=local', {
  method: 'POST',
  token: adminToken,
});
assert.equal(logout.response.status, 204, logout.text);
const revokedReview = await rpc('review_integration_evidence', {
  p_evidence_id: evidenceId,
  p_decision: 'pending',
  p_note: null,
}, adminToken);
expectDenied(revokedReview, 'revoked admin review');

const cleanup = await request(`/rest/v1/admin_emails?email=eq.${encodeURIComponent(adminEmail)}`, {
  method: 'DELETE',
  key: serviceKey,
  token: serviceKey,
  headers: { Prefer: 'return=minimal' },
});
assert.equal(cleanup.response.status, 204, cleanup.text);

console.log('PASS local evidence HTTP: anon/ordinary denied, admin insert/duplicate/conflict/review, messages stay evidence-only, Edge persistence, direct writes denied, session revocation');
