import assert from 'node:assert/strict';

const apiUrl = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;

assert.ok(apiUrl?.startsWith('http://127.0.0.1:'), 'LOCAL_SUPABASE_URL must be localhost');
assert.ok(anonKey, 'LOCAL_SUPABASE_ANON_KEY is required');
assert.ok(serviceKey, 'LOCAL_SUPABASE_SERVICE_KEY is required');

const password = 'LocalOnly-Admin-Atomicity-A1!';

async function request(path, { method = 'GET', key = anonKey, token = key, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
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

const ordinaryToken = await signup('ordinary-atomic-http@example.test');
const adminToken = await signup('local-security-admin@example.test');

const ordinaryAdminCheck = await rpc('is_admin', {}, ordinaryToken);
assert.equal(ordinaryAdminCheck.response.status, 200, ordinaryAdminCheck.text);
assert.equal(ordinaryAdminCheck.json, false);

const adminCheck = await rpc('is_admin', {}, adminToken);
assert.equal(adminCheck.response.status, 200, adminCheck.text);
assert.equal(adminCheck.json, true);

const ordinaryOrder = await rpc('create_admin_order_v1', {
  p_request_id: '11111111-aaaa-4111-8111-111111111111',
  p_buyer_name: '가상 일반 사용자',
  p_contact: '010-0000-0000',
  p_email: '',
  p_shipping_address: '',
  p_message: null,
  p_channel: '기타',
  p_status: '신규',
  p_items: [{ book_title: '권한 거부 가상도서', quantity: 1, unit_price: 5000 }],
}, ordinaryToken);
assert.equal(ordinaryOrder.response.status, 403, ordinaryOrder.text);

const inPersonRequestId = '22222222-aaaa-4222-8222-222222222222';
const inPersonPayload = {
  p_request_id: inPersonRequestId,
  p_buyer_name: '가상 현장 주문자',
  p_contact: '010-0000-0000',
  p_email: '',
  p_shipping_address: '',
  p_message: null,
  p_channel: '기타',
  p_status: '신규',
  p_items: [{ book_title: '가상 현장 도서', quantity: 2, unit_price: 5000 }],
};
const inPerson = await rpc('create_admin_order_v1', inPersonPayload, adminToken);
assert.equal(inPerson.response.status, 200, inPerson.text);
assert.equal(inPerson.json?.total_amount, 10000);

const inPersonRetry = await rpc('create_admin_order_v1', inPersonPayload, adminToken);
assert.equal(inPersonRetry.response.status, 200, inPersonRetry.text);
assert.equal(inPersonRetry.json?.id, inPerson.json?.id, 'same request must return the same order');

const changedRetry = await rpc('create_admin_order_v1', {
  ...inPersonPayload,
  p_buyer_name: '변경된 가상 주문자',
}, adminToken);
assert.equal(changedRetry.response.status, 409, changedRetry.text);

const missingDeliveryAddress = await rpc('create_admin_order_v1', {
  ...inPersonPayload,
  p_request_id: '33333333-aaaa-4333-8333-333333333333',
  p_channel: '스마트스토어',
}, adminToken);
assert.equal(missingDeliveryAddress.response.status, 400, missingDeliveryAddress.text);

const publicRequestId = '44444444-aaaa-4444-8444-444444444444';
const publicPayload = {
  p_request_id: publicRequestId,
  p_buyer_name: '가상 공개 주문자',
  p_contact: '010-0000-0000',
  p_email: 'public-http@example.test',
  p_shipping_address: '가상시 안전로 1',
  p_message: null,
  p_items: [{ book_title: '원자성 HTTP 가상 도서', quantity: 2, unit_price: 7000 }],
};
const publicOrder = await rpc('create_public_order_v1', publicPayload);
assert.equal(publicOrder.response.status, 200, publicOrder.text);
assert.equal(publicOrder.json?.total_amount, 14000);
const publicRetry = await rpc('create_public_order_v1', publicPayload);
assert.equal(publicRetry.response.status, 200, publicRetry.text);
assert.equal(publicRetry.json?.id, publicOrder.json?.id);

const transactionFailureId = '55555555-aaaa-4555-8555-555555555555';
const transactionFailure = await rpc('create_admin_order_v1', {
  ...inPersonPayload,
  p_request_id: transactionFailureId,
  p_items: [{ book_title: '강제실패 HTTP 가상도서', quantity: 1, unit_price: 5000 }],
}, adminToken);
assert.equal(transactionFailure.response.status, 400, transactionFailure.text);

const failedHeader = await request(`/rest/v1/orders?client_request_id=eq.${transactionFailureId}&select=id`, {
  key: serviceKey,
  token: serviceKey,
});
assert.equal(failedHeader.response.status, 200, failedHeader.text);
assert.deepEqual(failedHeader.json, [], 'item failure must roll back the order header');

const event = {
  external_event_id: 'payhere-http-event-1',
  canonical_sku: 'GDR-TEST-0001',
  quantity: 2,
  unit_amount: 7000,
  occurred_at: '2026-10-10T01:00:00Z',
  google_seen: false,
};
const reportHash = 'a'.repeat(64);
const requestA = '66666666-aaaa-4666-8666-666666666666';
const requestB = '77777777-aaaa-4777-8777-777777777777';
const reserved = await rpc('reserve_payhere_sales_import', {
  p_report_hash: reportHash,
  p_request_id: requestA,
  p_events: [event],
}, adminToken);
assert.equal(reserved.response.status, 200, reserved.text);
assert.equal(reserved.json?.[0]?.owned, true);

const concurrent = await rpc('reserve_payhere_sales_import', {
  p_report_hash: reportHash,
  p_request_id: requestB,
  p_events: [event],
}, adminToken);
assert.equal(concurrent.response.status, 409, concurrent.text);

const marked = await rpc('mark_payhere_google_written', {
  p_request_id: requestA,
  p_event_ids: [event.external_event_id],
}, adminToken);
assert.equal(marked.response.status, 200, marked.text);
assert.equal(marked.json, 1);

const finalRow = {
  external_event_id: event.external_event_id,
  canonical_sku: event.canonical_sku,
  quantity: event.quantity,
  unit_amount: event.unit_amount,
  occurred_at: event.occurred_at,
  payhere_name: '가상 상품',
};
const finalized = await rpc('finalize_payhere_sales_import', {
  p_request_id: requestA,
  p_rows: [finalRow],
}, adminToken);
assert.equal(finalized.response.status, 200, finalized.text);
assert.equal(finalized.json, 1);

const finalizedRetry = await rpc('finalize_payhere_sales_import', {
  p_request_id: requestA,
  p_rows: [finalRow],
}, adminToken);
assert.equal(finalizedRetry.response.status, 200, finalizedRetry.text);
assert.equal(finalizedRetry.json, 1);

const movementRows = await request(`/rest/v1/integration_inventory_movements?external_event_id=eq.${event.external_event_id}&select=id`, {
  key: serviceKey,
  token: serviceKey,
});
assert.equal(movementRows.response.status, 200, movementRows.text);
assert.equal(movementRows.json?.length, 1, 'finalize retry must not duplicate the control movement');

const mismatched = await rpc('reserve_payhere_sales_import', {
  p_report_hash: reportHash,
  p_request_id: requestB,
  p_events: [{ ...event, canonical_sku: 'GDR-TEST-0002', google_seen: true }],
}, adminToken);
assert.equal(mismatched.response.status, 409, mismatched.text);

const logout = await request('/auth/v1/logout?scope=local', {
  method: 'POST',
  token: adminToken,
});
assert.equal(logout.response.status, 204, logout.text);
const revoked = await rpc('is_admin', {}, adminToken);
assert.equal(revoked.response.status, 200, revoked.text);
assert.equal(revoked.json, false, 'revoked JWT may reach PostgREST but must fail the live-session check');
const revokedAdminOrder = await rpc('create_admin_order_v1', {
  ...inPersonPayload,
  p_request_id: '88888888-aaaa-4888-8888-888888888888',
}, adminToken);
assert.equal(revokedAdminOrder.response.status, 403, revokedAdminOrder.text);

console.log('PASS local admin atomicity HTTP: role denial, live admin, minimal collection, idempotency, rollback, Payhere reservation/finalize, session revocation');
