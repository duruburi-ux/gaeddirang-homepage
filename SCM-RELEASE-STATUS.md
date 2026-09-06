# SCM release status — 2026-09-05

## Operations directory addition

- Added the `전체 업무` admin tab, with nine work areas, alias-aware search, original Notion links, and navigation to existing orders, applications, inquiries and SCM tabs.
- This is a source directory, not a live task-status aggregator. No private task records, student records, financial amounts, messages, or credentials are embedded in these public static assets.
- Notion access remains governed by Notion permissions. No Notion server token or automated Payhere/Smartstore/mail integration was added.
- Existing login and default Home view are preserved. `#operations` opens the directory after successful admin login.
- Added five directory tests covering source targets, search, rendering, safe text handling, routing and explicit connection caveats. These are synthetic tests, not browser or signed-in live verification.
- Operations and SCM frontend changes are still local; no production push or deployment was performed in this turn. The real-session release gate below remains open.

## SCM rollout

- User approved storing the existing Google SCM connection credential in the existing homepage Supabase project.
- `SCM_GOOGLE_SERVICE_ACCOUNT` was saved through the authenticated Supabase dashboard. The custom-secret row and update time (2026-09-05 14:10:16 UTC) were verified. No secret value is included here or in source control.
- `scm-read` v1 had already been deployed. Saving the secret is not evidence of a successful signed-in end-to-end request.
- Latest homepage changes through `4be8b0b` were fast-forwarded locally, preserving the independently published homepage improvements.
- The 16 synthetic tests and `git diff --check` pass. Earlier direct Google source verification was local with mocked Supabase authorization, not a live administrator session.
- Frontend changes remain local and uncommitted; they have NOT been pushed or released. The live homepage does not yet include the new SCM menu.
- Release gate: verify the endpoint using a real signed-in homepage administrator session, and verify denial for a normal user. Do not extract browser session tokens, impersonate an administrator, or loosen authorization to perform this check.
- Browser access to the live admin page was not available in this task; request a user-assisted administrator sign-in/check before release.
- Preserve the existing GitHub Pages deployment and domain, existing login, admin allowlist, and unrelated changes. Never deploy private snapshots or credential files.
- This integration remains read-only. It does not repair the legacy stock calculator or enable Payhere automatic deductions.
