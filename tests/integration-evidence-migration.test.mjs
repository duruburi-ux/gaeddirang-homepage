import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20261011093000_integration_evidence_inbox.sql',import.meta.url),'utf8');
const pgTap=fs.readFileSync(new URL('../supabase/tests/integration_evidence_inbox_rls.test.sql',import.meta.url),'utf8');

test('evidence inbox is admin-only metadata and cannot directly mutate business ledgers',()=>{
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on table public\.integration_evidence_inbox from public, anon, authenticated/i);
  assert.match(sql,/using \(\(select public\.is_admin\(\)\)\)/i);
  assert.match(sql,/private\.require_current_admin\(\)/i);
  assert.match(sql,/private\.ingest_integration_evidence_internal/);
  assert.match(sql,/private\.review_integration_evidence_internal/);
  assert.match(sql,/security invoker/i);
  assert.equal(/create or replace function public\.(?:ingest|review)_integration_evidence[\s\S]{0,300}security definer/i.test(sql),false);
  assert.match(sql,/MESSAGE_IS_EVIDENCE_ONLY/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/ledger_changed',false/);
  for(const forbidden of ['message_body','attachment_body','bank_account','access_token','refresh_token'])assert.equal(sql.includes(forbidden),false);
  assert.equal(/insert\s+into\s+public\.(integration_inventory_movements|integration_settlement_entries)/i.test(sql),false);
  assert.match(sql,/evidence_metadata jsonb not null/i);
  assert.match(pgTap,/select plan\(13\)/i);
  assert.match(pgTap,/has_column\('public', 'integration_evidence_inbox', 'evidence_metadata'/i);
  assert.match(pgTap,/no direct write grant/i);
  assert.match(pgTap,/public RPC wrappers are security invoker/i);
});
