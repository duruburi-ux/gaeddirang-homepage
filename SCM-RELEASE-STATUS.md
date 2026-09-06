# SCM release status — 2026-09-06

## Payhere reviewed sales import

- Added a signed-in administrator workflow under `연결 현황`: upload the Payhere sales `.xlsx`, review parsed products, run a server-side duplicate/current-stock check, explicitly confirm, and then apply.
- A selected file never changes stock by itself. Unknown products, ambiguous transaction timing, price mismatches, missing stock, negative-stock results, and altered product/SKU requests fail closed.
- Server validation rechecks the authoritative Payhere product mapping, SKU catalog, current Google SCM quantity, and both duplicate ledgers. Browser input cannot select a spreadsheet, location, event type, or credential.
- `감정엽서키트` is treated as a program-material payment and excluded from inventory movement.
- The already-reflected 2026-08-31 sales for `이러나저러나 불편한 거야 불편한 건` and `우울의 바깥을 향하며` were backfilled only into the duplicate-control ledger. No stock was deducted again.
- If Google SCM succeeds but the control ledger fails, a retry repairs only the missing control record; it does not append a second stock movement.
- `scm-sales-import` is deployed with JWT verification. Anonymous calls are rejected at the gateway. SmartStore and SmartPlace remain visibly unconnected pending account/API authorization.

## Integration operations hub

- Added a signed-in `연결 현황` screen that separates automatic connections, manual operations, setup-required systems, and attention items. It never presents an unconfigured external account as connected.
- Added admin-only Supabase control tables for connector state, product/SKU mappings, inventory locations, append-only inventory movements, idempotent sync runs, settlement entries, and reconciliation issues.
- Seeded the current operating boundary: homepage, Google SCM and Notion are connected; Payhere and SmartStore require connector credentials or exports; SmartPlace is reference-only; consignment, publisher/production and settlement remain manual until their source feeds are provided.
- Added locations for the workshop, home stock, publisher/production stock, external consignment and online virtual tracking. No existing stock quantity was migrated or changed.
- Anonymous access is revoked from all new tables. Signed-in access is further restricted by the existing administrator allowlist and row-level security.
- Added duplicate external-event guards, data checks and supporting indexes. Supabase security/performance advisors report no new missing-policy or missing-foreign-key-index warning for these integration tables.
- Added two integration UI safety tests. The full 31-test suite passes.

## Team dashboard usability pass

- Reworked the signed-in first screen around four user questions: what needs action now, where common work starts, what SCM needs attention, and the overall operating totals.
- Replaced system-oriented tab labels with plain team language, while preserving every existing destination and action.
- Added one-step work search from the dashboard into the nine-area source directory. Search still targets navigation metadata only; no private Notion task content is copied.
- Added live SCM attention/warning summary cards that deep-link into the existing read-only SCM filters. This does not add stock editing or Payhere deductions.
- Added explicit partial-source failure status for the existing homepage data queries instead of silently presenting empty counts as healthy.

## Operations directory addition

- Added the `전체 업무` admin tab, with nine work areas, alias-aware search, original Notion links, and navigation to existing orders, applications, inquiries and SCM tabs.
- This is a source directory, not a live task-status aggregator. No private task records, student records, financial amounts, messages, or credentials are embedded in these public static assets.
- Notion access remains governed by Notion permissions. No Notion server token or automated Payhere/Smartstore/mail integration was added.
- Existing login and default Home view are preserved. `#operations` opens the directory after successful admin login.
- Added five directory tests covering source targets, search, rendering, safe text handling, routing and explicit connection caveats. These are synthetic tests, not browser or signed-in live verification.
- Operations and SCM frontend changes were published through the existing GitHub Pages workflow. The production administrator session shows all nine work areas.

## SCM rollout

- User approved storing the existing Google SCM connection credential in the existing homepage Supabase project.
- `SCM_GOOGLE_SERVICE_ACCOUNT` was saved through the authenticated Supabase dashboard. The custom-secret row and update time (2026-09-05 14:10:16 UTC) were verified. No secret value is included here or in source control.
- `scm-read` v1 had already been deployed. Saving the secret is not evidence of a successful signed-in end-to-end request.
- Latest homepage changes through `4be8b0b` were fast-forwarded locally, preserving the independently published homepage improvements.
- The 16 synthetic tests and `git diff --check` pass. Earlier direct Google source verification was local with mocked Supabase authorization, not a live administrator session.
- Frontend changes were committed and published. The production homepage now includes `전체 업무` and `상품·재고` in the existing gated administrator view.
- A real signed-in homepage administrator session successfully loaded 64 products, 14 blind-book products, and 7 ledger warnings. The page displayed the server's current success timestamp.
- Anonymous and invalid-token requests are denied, and synthetic tests cover non-admin and revoked-admin denial. No spare real non-admin account was created or impersonated, so a separate real non-admin browser check remains unperformed.
- Preserve the existing GitHub Pages deployment and domain, existing login, admin allowlist, and unrelated changes. Never deploy private snapshots or credential files.
- The SCM view remains read-only. Payhere deductions are available only through reviewed file import; no background or automatic email ingestion is enabled.
