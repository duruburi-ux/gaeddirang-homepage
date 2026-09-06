# SCM release status — 2026-09-06

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
- This integration remains read-only. It does not repair the legacy stock calculator or enable Payhere automatic deductions.
