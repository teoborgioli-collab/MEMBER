# Handoff

Status: feature-complete and tested locally. What remains are the club’s own accounts, documents and secrets (see “Still to do”). No production database, Vercel project or domain has been created.

## Implemented

- German two-step membership form with separate paths for new and existing members; receipt page; closed by default.
- Protected admin area (`/admin`): filter, counts, review/approve/reject/reconcile, approval-gated PDF, manual e-mail draft, mark as sent, delete, pagination.
- **Form editor (`/admin/formular`)** behind the same login: every public text (headings, explanations, checkbox wording, notices, buttons, field labels, receipt page), document links and version, club name, contact e-mail, header/footer lines, e-mail template (`{vorname}`, `{nachname}`, `{verein}`), PDF texts, and opening/closing the portal. Live preview (both paths, both steps, receipt), per-field defaults, validation messages next to the field, sample PDF, optimistic locking against concurrent edits, unsaved-changes warning, edits survive an expired session. Saved texts live in the `portal_settings` table and apply immediately; environment variables are only starting values.
- Each submission stores the exact confirmed checkbox wording. Visitors who confirmed outdated texts or documents are asked to confirm the new version; their entered data is kept.
- Fixes made while finishing:
  - Neon-style connection strings (`sslmode`, `channel_binding`) used to break every query; they now work.
  - `DATABASE_SSL=true` now verifies the server certificate.
  - PDF text wraps by words and continues on a second page instead of overlapping the footer. The PDF file name includes the member’s name.
  - Dates use a consistent `28.09.2026` format. Birth dates are read as plain dates, so they can’t shift with time zones.
  - Mobile heading spacing (“dudabei”) fixed.
  - Clearer errors for network, PDF and outdated-schema problems. A retry of an already stored submission is recognised, so no duplicate is created.
  - Logs carry error codes only, never personal data.
  - `npm run dev` binds to `127.0.0.1` to match `APP_URL`.
  - `npm run dev:local` runs everything locally without external services.

## Verified

- `npm test`: 25 unit tests passed (validation, sessions, origins, transitions, database URL/TLS options, text settings, PDF).
- `npm run test:integration`: production build plus 53 full-stack tests passed:
  - 41 HTTP/deployment tests and 12 browser tests.
  - Run against PGlite and against a real PostgreSQL 16 over TLS with a Neon-style URL.
  - Stable over repeated runs.
  - They cover submissions, the editor, all review transitions, PDF, deletion, pagination, rate limits, logout, migration of the first-release schema, missing/unreachable databases, and log privacy.
  - Browser tests run in Chromium: phone and desktop layouts, the re-confirmation flow, editor, preview, session expiry, concurrent editors, closing the portal and the full approval workflow.
  - Screenshots and a sample PDF land in `test-results/`.
- `npm run typecheck` and Prettier formatting are clean. There were no browser console errors in production or dev mode.
- The confirmation PDF was rendered and visually checked, including a worst-case long version.

Not verifiable here:

- Vercel deployment, Neon connectivity and custom domain/TLS.
- Behaviour of the club’s mail program with the `mailto:` draft.
- Google Chrome on macOS; the browser tests ran on Chromium 141/Linux and use the installed Chrome when you run them.

## Still to do (club/owner)

1. Create the Neon (or other EU Postgres) database and run `npm run db:migrate` (README §2).
2. Generate `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` (README §4).
3. Deploy on Vercel with the required environment variables (README §5–6), then connect the domain (README §7).
4. Upload the real Satzung and Datenschutzhinweise (versioned file names) and have an imprint page.
5. In `/admin/formular`: enter the club details and links, review all texts with **Vorschau**, and switch the portal to **Geöffnet**.
6. Before real use, run through a test application with fictional data on the deployed site, and agree on retention and admission procedures.

Never put real member data or secrets in public files. `.local-db/` (from `npm run dev:local`) and `test-results/` hold local test data only and are git-ignored.
