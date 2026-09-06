# Reviewed Payhere sales import

Authenticated administrators can dry-run and then apply a Payhere sales export. The function validates every row against the current Google SCM catalog, checks both the Google `입출고원장` transaction IDs and the Supabase control ledger, and rejects unknown SKUs, price mismatches, ambiguous data, and negative-stock results.

An apply appends `직판` rows to the fixed Google SCM spreadsheet before recording matching `sale` movements in `integration_inventory_movements`. Google rows carry the deterministic Payhere event ID, so a retry can detect an earlier write. The function never accepts credentials, spreadsheet IDs, location codes, movement types, or arbitrary ranges from the browser.

Deploy with JWT verification enabled. It uses the existing `SCM_GOOGLE_SERVICE_ACCOUNT` secret but requests the full spreadsheets scope; the service account must have editor access to the single fixed workbook. CORS is limited to the canonical site. Only the existing administrator allowlist can call it.
