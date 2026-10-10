import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const apiUrl = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;

assert.ok(apiUrl?.startsWith('http://127.0.0.1:'), 'LOCAL_SUPABASE_URL must be localhost');
assert.ok(anonKey, 'LOCAL_SUPABASE_ANON_KEY is required');

const runId = randomUUID().slice(0, 8);
const password = `LocalOnly-${randomUUID()}-A1!`;

async function request(path, { method = 'GET', key = anonKey, token = key, headers = {}, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      ...headers,
    },
    body,
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { response, bytes, text, json };
}

function expectDenied(result, label) {
  assert.ok(
    [400, 401, 403, 404].includes(result.response.status),
    `${label}: expected denial, got ${result.response.status} ${result.text}`,
  );
}

async function signup(prefixOrEmail) {
  const email = prefixOrEmail.includes('@')
    ? prefixOrEmail
    : `${prefixOrEmail}-${runId}@example.test`;
  const result = await request('/auth/v1/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(result.response.status, 200, `signup failed: ${result.text}`);
  assert.ok(result.json?.user?.id, 'signup must return a user id');
  assert.ok(result.json?.access_token, 'local email-confirmation-disabled signup must return a session');
  return { email, id: result.json.user.id, token: result.json.access_token };
}

async function rpc(name, args, token) {
  return request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    token,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
}

function storagePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

const unauthenticatedList = await rpc('list_settlement_documents', {}, anonKey);
expectDenied(unauthenticatedList, 'anon archive list');

const ordinary = await signup('ordinary');
const admin = await signup('local-security-admin@example.test');

const ordinaryDirectRead = await request('/rest/v1/royalty_payment_accounts?select=*', {
  token: ordinary.token,
});
assert.equal(ordinaryDirectRead.response.status, 200, ordinaryDirectRead.text);
assert.deepEqual(ordinaryDirectRead.json, [], 'non-admin direct read must return no rows');

for (const [label, name, args] of [
  ['ordinary account list', 'list_royalty_payment_accounts', { p_author_name: null }],
  ['ordinary archive list', 'list_settlement_documents', {}],
]) {
  expectDenied(await rpc(name, args, ordinary.token), label);
}

const savedAccount = await rpc('save_royalty_payment_account', {
  p_id: null,
  p_author_name: '가상작가',
  p_bank_name: '가상은행',
  p_account_number: '0000-0000-1234',
  p_holder_name: '가상예금주',
  p_source_type: 'original_image',
  p_source_checked_on: '2026-10-10',
  p_holder_confirmed: true,
  p_source_clear: true,
  p_mark_verified: true,
}, admin.token);
assert.equal(savedAccount.response.status, 200, savedAccount.text);
assert.equal(savedAccount.json?.[0]?.masked_account, '•••• 1234');
assert.ok(!savedAccount.text.includes('000000001234'), 'save response must not expose the full account number');

const accountId = savedAccount.json[0].id;
const revealedAccount = await rpc('reveal_royalty_payment_account', {
  p_id: accountId,
  p_action: 'copy',
}, admin.token);
assert.equal(revealedAccount.response.status, 200, revealedAccount.text);
assert.equal(revealedAccount.json?.[0]?.account_number, '000000001234');

const fakePdf = new TextEncoder().encode('%PDF-1.4\n% local synthetic fixture only\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const objectName = `${admin.id}/${randomUUID()}/synthetic-settlement.pdf`;
const objectUrl = `/storage/v1/object/settlement-documents/${storagePath(objectName)}`;

const ordinaryUpload = await request(
  `/storage/v1/object/settlement-documents/${storagePath(`${ordinary.id}/${randomUUID()}/denied.pdf`)}`,
  {
    method: 'POST',
    token: ordinary.token,
    headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
    body: fakePdf,
  },
);
expectDenied(ordinaryUpload, 'ordinary storage upload');

const uploaded = await request(objectUrl, {
  method: 'POST',
  token: admin.token,
  headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
  body: fakePdf,
});
assert.ok([200, 201].includes(uploaded.response.status), `admin upload failed: ${uploaded.text}`);

const overwrite = await request(objectUrl, {
  method: 'POST',
  token: admin.token,
  headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' },
  body: fakePdf,
});
expectDenied(overwrite, 'archive overwrite');

const hash = createHash('sha256').update(fakePdf).digest('hex');
const registered = await rpc('register_settlement_document', {
  p_category: 'external_author',
  p_subject: '가상작가',
  p_title: '가상 정산서',
  p_period_start: '2026-07-01',
  p_period_end: '2026-09-30',
  p_period_label: '2026년 3분기',
  p_file_name: 'synthetic-settlement.pdf',
  p_storage_path: objectName,
  p_mime_type: 'application/pdf',
  p_size_bytes: fakePdf.byteLength,
  p_sha256: hash,
  p_notes: '로컬 보안 검증용 가상 문서',
  p_supersedes_id: null,
}, admin.token);
assert.equal(registered.response.status, 200, registered.text);
assert.equal(registered.json?.[0]?.status, 'review');
const documentId = registered.json[0].id;

for (const status of ['confirmed', 'superseded']) {
  const changed = await rpc('set_settlement_document_status', { p_id: documentId, p_status: status }, admin.token);
  assert.ok([200, 204].includes(changed.response.status), `${status} failed: ${changed.text}`);
}

const loggedAccess = await rpc('record_settlement_document_access', {
  p_id: documentId,
  p_action: 'download',
}, admin.token);
assert.equal(loggedAccess.response.status, 200, loggedAccess.text);
assert.equal(loggedAccess.json, objectName);

const ordinarySignedUrl = await request(
  `/storage/v1/object/sign/settlement-documents/${storagePath(objectName)}`,
  {
    method: 'POST',
    token: ordinary.token,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  },
);
expectDenied(ordinarySignedUrl, 'ordinary signed URL creation');

const signed = await request(`/storage/v1/object/sign/settlement-documents/${storagePath(objectName)}`, {
  method: 'POST',
  token: admin.token,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ expiresIn: 60 }),
});
assert.equal(signed.response.status, 200, signed.text);
const signedPath = signed.json?.signedURL ?? signed.json?.signedUrl;
assert.equal(typeof signedPath, 'string', 'storage must return a signed URL');
const signedUrl = new URL(signedPath.startsWith('/object/') ? `/storage/v1${signedPath}` : signedPath, apiUrl);
assert.equal(signedUrl.origin, new URL(apiUrl).origin, 'signed URL must stay on the local Supabase origin');
assert.ok(signedUrl.pathname.startsWith('/storage/v1/object/sign/'), 'storage must return a private signed URL');

const signedDownload = await fetch(signedUrl);
assert.equal(signedDownload.status, 200);
assert.deepEqual(new Uint8Array(await signedDownload.arrayBuffer()), fakePdf);

const publicDownload = await request(
  `/storage/v1/object/public/settlement-documents/${storagePath(objectName)}`,
  { token: anonKey },
);
expectDenied(publicDownload, 'public object URL');

console.log('PASS local Supabase HTTP security: anon denied, non-admin denied, admin RPC allowed, private signed URL works, public URL and overwrite denied');
