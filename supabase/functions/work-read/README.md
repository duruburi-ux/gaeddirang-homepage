# Work read-only endpoint

This function exposes a deliberately small, read-only view of four fixed Notion sources to the existing authenticated homepage admin. It returns titles, status, priority, owner/team, next action, dates, freshness flags, and Notion links. It never returns page bodies, decision text, attachments, comments, customer data, student data, financial details, or arbitrary user-selected databases.

Create a dedicated read-only Notion integration, share only the four allowlisted data sources with it, and store its token as the Supabase Edge Function secret `WORK_NOTION_TOKEN`. Never place the token in GitHub, browser JavaScript, logs, Notion pages, or screenshots.

Deploy with `verify_jwt: true`. The function also validates the current user with Supabase Auth, the existing `is_admin()` RPC, and the current admin email allowlist on every request, including cache hits. CORS is limited to the canonical website and its www variant. Only GET and OPTIONS are accepted.

Notion is read at most once every 55 seconds per isolate. A successful response is cached for up to ten minutes if Notion is temporarily unavailable and is clearly marked stale. The frontend does not write to Notion and does not infer completion.
