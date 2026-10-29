# Admin Mac/iPhone UX candidate

## Scope

- Base: `e96f89e3dd3b81be41fc7e1dbb7eaa9d7e7db360`
- Branch: `codex/admin-apple-ux-20261029`
- Review-only candidate. It is not pushed or deployed.
- Adds only a presentation/navigation layer to the already gated admin page.
- Does not change the public homepage, database, Edge Functions, permissions, inventory, settlement, payments, mail, chat, or program publication.

## Three reviewed workflows

1. **Today/team overview** — large title, explicit source freshness and unknown states, calm card hierarchy, stable bulk action bar, keyboard command search.
2. **Book/consignment finder** — mobile-first search, 54 px touch targets, visible read-only boundaries, fixed five-item bottom navigation at 390 px.
3. **Program review** — program list, draft editor, internal memo boundary, public preview, explicit review/approve/rollback actions. Drafts remain temporary per-user browser storage; no operating publish connection is implied.

The command palette opens with `Cmd/Ctrl+K` or `/`. `g h`, `g t`, `g b`, and `g p` open the main routes. Arrow keys, Enter, and Escape are covered by browser tests. Repeated initialization and rapid account transitions must not duplicate shell controls.

## Current connections

- Existing authenticated schedule and request-queue reads remain untouched.
- Book finder keeps using the existing authenticated read-only `scm-read` path.
- The team overview is a safe composite of existing reads; any unavailable source remains unknown or disconnected rather than becoming zero or success.
- Program content is loaded from the existing fixed public content asset for local review. Draft storage is per-user `sessionStorage` only.
- Consignment and partner-directory operational adapters are not connected. Dated review evidence is not treated as live stock, settlement, or contact truth.

## Permissions still needed for later work

No new permission is required for this UX candidate. Separate, future approvals are needed for:

- a server-backed shared team snapshot contract if the current read adapters are to become one source;
- field-level private partner-contact reads, keeping settlement-sensitive data separate;
- shared persistent program drafts with row-level access control;
- a server-trusted program approval/publish/rollback workflow for the public homepage.

Those permissions are intentionally not requested or used here.

## Verification

- Focused Node UX contract: 5/5 pass.
- Chromium UX flows: 5/5 pass at 1440 px and 390 px.
- Existing static-release Chromium regression: 6/6 pass.
- Full Node suite: 261 total, 256 pass, five unchanged inherited failures, zero candidate-only failures.
- Team-overview and book-finder screenshots use synthetic fixtures. The program-review screenshot also renders the repository's existing fixed public program content; none of the screenshots contains private contact, account, payment, or participant information.

## Review and rollback

Use the generated patch and manifest for independent review. If this candidate is later approved and deployed as one commit, rollback is `git revert <candidate-commit>`.
