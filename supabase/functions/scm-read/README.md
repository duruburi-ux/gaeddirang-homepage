# SCM read-only endpoint

The existing GitHub Pages admin UI remains the frontend. This function is its only SCM data reader. No database/schema changes, no new accounts, no inventory writes, and no Payhere synchronization are introduced.

## Required private configuration

In the existing Supabase project's **Edge Functions → Secrets**, set `SCM_GOOGLE_SERVICE_ACCOUNT` to a Google service-account JSON credential that can read the intended SCM spreadsheet. Prefer a dedicated reader account shared only with that spreadsheet. Never store this value in the repository, HTML, browser storage, or logs. The function requests only the `spreadsheets.readonly` OAuth scope and uses a fixed spreadsheet ID and fixed ranges.

The standard Supabase runtime supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEYS`). No service-role key is used by this endpoint.

The bookshop counter summary reuses the same reader account. Store the existing bookshop planning spreadsheet id in the administrator-only `public.doc_settings` row whose key is `bookshop_sheet_id`. Do not put that id in source code or frontend assets. The reader requests only the fixed `통합 재고!A:R` and `YES24 확인!A:J` ranges and returns allowlisted counts and aggregates; it omits titles from the supplemental source, raw evidence text, and source references. A missing or invalid setting leaves the supplemental summary unavailable without blocking the independent SCM dataset.

## Authorization

Deploy with `verify_jwt: true`. The handler additionally verifies the user through Auth, requires a non-anonymous confirmed email, checks the existing `is_admin()` RPC, and compares the user's current email with the existing admin allowlist under that user's RLS context. These checks run even for cached responses. Never pass browser role flags or `user_metadata` into authorization decisions.

Only GET is supported. OPTIONS is available for allowed-origin preflight. CORS is limited to the existing canonical website and its www variant; missing Origin still requires the same authentication. All responses use `private, no-store`.

## Freshness

Sheets is fetched at most once per 55 seconds per running isolate, with concurrent reads sharing a request. A successful read includes its own timestamp. After ten minutes the response is explicitly labelled `historical`; the last known good response remains visible for at most 36 hours, then is hidden. The browser polls every minute while the SCM tab is visible and clears data on sign-out/authorization denial. Source outages are distinct from Auth outages. No counts are silently changed to zero, and reservation, pending inbound, purchase candidates, channel counts, and physically confirmed sellable stock stay separate.

## Validation and release

Run `node --test tests/scm.test.mjs` from the repository root with a recent Node runtime. The fixtures are synthetic. Complete signed-in admin and normal-user live checks before release. An unauthenticated request must return 401; a signed-in non-admin must not receive any inventory. Verify source configuration, role removal, expired session, and server failures. Existing JWT access tokens may remain valid until expiry after remote sign-out; allowlist removal is checked on each request.

Use the existing homepage deployment workflow. Publish the frontend and its two assets atomically. Do not change the domain, access allowlist, existing functions, or existing application tables as part of this release. If rolling back, revert only the SCM frontend commit and the newly added `scm-read` function; preserve all prior homepage features.

Current limitations: this does not repair the legacy stock calculator, synchronize Payhere, place YES24 orders, or verify physical inventory. A successful read is a source-backed view; only a nonblank `판매가능 확정값` is presented as physically confirmed sellable stock.
