# Reviewed Payhere sales import

Authenticated administrators can dry-run and then apply a Payhere sales export. The function validates every row against the current Google SCM catalog, checks both the Google `입출고원장` transaction IDs and the Supabase control ledger, and rejects unknown SKUs, price mismatches, ambiguous data, and negative-stock results.

An apply first reserves every deterministic event ID through `reserve_payhere_sales_import`. Only rows still owned in `reserved` state are appended as `직판` rows to the fixed Google SCM spreadsheet. The function then marks the reservation `google_written_pending_control` and finalizes the matching `sale` movement and `applied` state in one database transaction. A retry after a Google-only write repairs the control ledger without appending the stock row again. A concurrent request either sees the completed event or receives `IMPORT_IN_PROGRESS`; it cannot append an event owned by another request.

The browser sends one UUID for a file hash and keeps only that hash/UUID pair in session storage. It never stores the workbook contents there. The function never accepts credentials, spreadsheet IDs, location codes, movement types, or arbitrary ranges from the browser.

Deploy `20261010095936_admin_atomicity_additive.sql` before this Edge version. The cutover is intentionally held outside the automatic migrations directory at `supabase/migration-plans/20261010095948_admin_atomicity_cutover.sql`; move/apply it only after both public and admin static clients are on the order RPCs and the new Edge/UI have passed preview checks.

Deploy with JWT verification enabled. It uses the existing `SCM_GOOGLE_SERVICE_ACCOUNT` secret but requests the full spreadsheets scope; the service account must have editor access to the single fixed workbook. CORS is limited to the canonical site. Only the existing administrator allowlist can call it.
