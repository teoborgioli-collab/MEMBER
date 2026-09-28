# Mitgliederportal · Vercel

A small German membership portal built with Next.js, TypeScript and Postgres. No paid email service, member accounts, analytics, or browser database SDK required.

## What is included

- Responsive German form: first name, last name, date of birth, email.
- New members acknowledge the statutes, privacy notice and accuracy of their information before applying.
- Existing members submit current data for manual verification against the club’s existing register. This is an intake portal, not a replacement member database; it never reveals or automatically overwrites existing records.
- Receipt page explicitly says an application has **not yet been accepted**.
- Password-protected `/admin`: filter, review, approve/reject, mark existing data as reconciled, delete records, and paginate.
- **Form editor at `/admin/formular`**: all texts of the public portal (headings, explanations, checkbox wording, notices, button labels, receipt page), document links, club name, contact email, the e-mail template and the PDF texts, plus opening and closing the portal. Live preview before saving; changes are online immediately, without redeploying.
- Only approved new applications have a downloadable PDF. Admin opens an email draft, attaches the PDF manually, sends from the club mailbox, and records that it was sent. Opening the draft or downloading a PDF never sends email.
- A dedicated server-side database, TLS connections with certificate verification, secure session cookies, server-side validation, origin checks, durable hourly rate limits, honeypot, parameterized queries, no-store admin responses, and request-size limits.
- No personal data in localStorage, analytics, URL query parameters, or application logs. Hosting/database providers may maintain their own infrastructure logs.

## 1. Run the preview

Install Node.js 22 or 24 LTS. In this folder:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:3000** (use exactly this address, not `localhost`: forms only accept requests from `APP_URL`). Without configuration, the design and form steps work, but submissions remain disabled. No demonstration submissions are seeded. If port 3000 is occupied, stop the other server or set `APP_URL` to the exact alternative local origin.

To try everything locally – including `/admin` and the form editor – without setting up a database, run:

```sh
npm run dev:local
```

It starts a local test database (stored in `.local-db/`; delete the folder to start over) and prints the address and a local admin password (`lokal-testen`). Use it only with fictional data. For a real setup you need a database (section 2), an admin password hash and a session secret (section 4).

## 2. Database: managed Postgres in Europe

A practical default is a **Neon Postgres project in Frankfurt**, using its pooled connection string. Another managed Postgres provider works with the same schema. Choose an EU region and review the provider’s processing terms, backup retention, and plan limits for the club’s use; this project does not promise a free production tier.

1. Create a dedicated database for this portal, separate from unrelated personal projects.
2. Copy the **pooled** connection string into `DATABASE_URL` in `.env.local` exactly as the provider shows it. Parameters meant for other tools, such as Neon’s `sslmode=require&channel_binding=require`, are removed automatically before connecting.
3. Keep `DATABASE_SSL=true` in production: the connection is encrypted and the server certificate is verified (works with Neon and other providers using publicly trusted certificates). Use `require` only if your provider uses a private certificate authority (encrypted, but unverified), and `false` only for a trusted local test database.
4. Run `npm run db:migrate`, or paste `scripts/schema.sql` into the provider’s SQL editor. Run migrations before enabling the portal. The script is repeatable and also upgrades a database created with the first release of this portal (it adds the `portal_settings` table and the `acknowledgements` column). After updating the code, run it again before deploying.
5. Ideally create a separate application DB role with `SELECT`, `INSERT`, `UPDATE`, and `DELETE` only on `submissions`, `rate_limits` and `portal_settings`; use the owner role only for migrations. Use the application connection string on Vercel.
6. Do not expose these tables through any public database API. There are no browser credentials, anonymous inserts or publicly readable rows.

The app stores submissions, review timestamps and the portal texts, not document uploads. The statutes/privacy documents are public, versioned files. Rate-limit keys are HMAC hashes of the request IP, never raw IP addresses, and old buckets are pruned on subsequent allowed requests after 24 hours. Hashes are pseudonymous operational data; document them in your privacy notice.

Provider reference: [Neon connection guidance](https://neon.com/docs/connect/connect-from-any-app).

## 3. Club documents and identity

Use the club’s actual adopted documents. No fabricated Satzung, privacy notice or legal imprint is supplied.

- Put public PDFs in `public/documents/`, for example `satzung-2026-09.pdf` and `datenschutz-2026-09.pdf`, and link them as `/documents/satzung-2026-09.pdf` and `/documents/datenschutz-2026-09.pdf`. Files in `public/` are published with a deployment.
- Alternatively, link full **HTTPS** addresses of the club’s existing public documents. The app does not fetch or copy remote files. Only site paths starting with `/` and `https://` links are accepted.
- Enter the links, the imprint address, a document version (e.g. `2026-09-28`), the club name and the administration mailbox in **/admin/formular → Verein & Kontakt / Dokumente & Links**. The environment variables `CLUB_NAME`, `CONTACT_EMAIL`, `STATUTES_URL`, `PRIVACY_URL`, `IMPRINT_URL` and `DOCUMENT_VERSION` can provide starting values, but once the texts are saved in the editor, the saved values apply.
- Submitted records retain the document version, the actual document links, the exact wording of the confirmed checkboxes and the submission timestamp. When documents change, upload them under a new file name, update the links and the version, and keep old versions available under their original names instead of overwriting them.
- Never place applications, member lists, private PDFs or credentials in `public/`: everything there is publicly accessible.

## 4. Admin password and session secret

Use a unique long password from a password manager. The app stores only a salted scrypt password hash. Generate the hash locally without putting the password in shell history (macOS zsh):

```sh
read -rs 'portal_password?New admin password (16+ characters): '
printf '%s' "$portal_password" | npm run --silent admin:password
unset portal_password
```

Copy the resulting `salt:hash` into `ADMIN_PASSWORD_HASH`. Generate an independent session secret:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the result in `SESSION_SECRET`. Never commit `.env.local` or put secrets in any `NEXT_PUBLIC_` variable. Admin cookies are HttpOnly, SameSite=Strict, HTTPS-only in production, and expire after eight hours. Logout removes the browser cookie. To invalidate all previously issued session tokens (including a copied/stolen token), rotate `SESSION_SECRET` and redeploy. Rotate it whenever changing the admin password.

This intentionally uses one shared administrative account, suitable for a small trusted committee. The same login gives access to submissions and to the form editor. Review and editing timestamps are saved, but there is no individual operator audit trail or MFA. If several people need accountable access, replace this with a managed identity provider before expanding use. Enable MFA on the hosting, database, source-control and club mailbox accounts.

## 5. Environment variables

| Variable              | Value / purpose                                                        |
| --------------------- | ---------------------------------------------------------------------- |
| `APP_URL`             | **Required.** Exact origin, no path: `https://members.yourdomain.com`  |
| `DATABASE_URL`        | **Required.** Private pooled Postgres connection string                |
| `DATABASE_SSL`        | `true` (verify certificate, default), `require` or `false` – section 2 |
| `ADMIN_PASSWORD_HASH` | **Required.** Generated salted scrypt hash                             |
| `SESSION_SECRET`      | **Required.** Random secret, at least 32 characters                    |
| `CLUB_NAME`           | Optional starting value for the club name                              |
| `CONTACT_EMAIL`       | Optional starting value for the administration mailbox                 |
| `STATUTES_URL`        | Optional starting value: versioned public PDF path or HTTPS URL        |
| `PRIVACY_URL`         | Optional starting value: versioned public PDF path or HTTPS URL        |
| `IMPRINT_URL`         | Optional starting value: public imprint URL/path                       |
| `DOCUMENT_VERSION`    | Optional starting value: document release recorded with submissions    |
| `PORTAL_OPEN`         | Optional starting value: `true` opens the portal before the first save |
| `DATABASE_POOL_MAX`   | Optional: database connections per server instance (default `3`)       |

All are server-side settings. The optional values are only used until the texts are saved in `/admin/formular`; invalid values (e.g. an `http://` link) are ignored with a warning in the server log. Do not use production database credentials in preview deployments. Preview builds should use a separate test database and secrets. `APP_URL` must match the origin used for forms/admin; requests from other origins are rejected by design.

## 6. Deploy on Vercel

1. Push this project folder to a **private Git repository** without `.env.local`, `node_modules`, `.next`, `test-results` or member data.
2. Import it in Vercel. Framework: **Next.js**. Root directory: this folder (or repository root if you uploaded its contents). Node.js: 22 or 24. Build: `npm run build`; install: `npm ci`; leave output directory at the framework default.
3. Add the required environment variables under **Settings → Environment Variables → Production**. The portal stays closed until you open it in the editor.
4. `vercel.json` requests Frankfurt (`fra1`) for server functions; confirm the deployed function region in your project and use a nearby EU database.
5. Deploy. Add your final custom subdomain, update `APP_URL`, and redeploy if needed. Test with fictional data in a separate test deployment/database first.
6. Sign in at `/admin/formular`, enter club details and document links, check the texts with **Vorschau**, confirm the club’s review and retention procedures, switch **Portal-Status** to **Geöffnet** and save. No redeploy is needed for text changes.

No public deployment or external account was created as part of this deliverable. The application still needs your own database, real documents, secrets, and hosting setup.

## 7. Namecheap: connect members.yourdomain.com

1. Vercel project → **Settings → Domains → Add Domain**: enter `members.yourdomain.com`.
2. Copy the **exact CNAME target displayed by Vercel for this project**; do not use a guessed generic target.
3. If Namecheap is your authoritative DNS provider: **Domain List → Manage → Advanced DNS → Host Records → Add New Record**:

   | Setting | Value                    |
   | ------- | ------------------------ |
   | Type    | CNAME Record             |
   | Host    | `members`                |
   | Value   | Exact target from Vercel |
   | TTL     | Automatic                |

4. Remove a conflicting existing record **only for the `members` host** if necessary. Keep website and mail records intact. You do not need to move your domain’s nameservers.
5. If you use external nameservers, add the record at that DNS provider instead. If using Namecheap hosting DNS, use its hosting DNS/cPanel controls as appropriate.
6. Wait for Vercel to verify the domain and issue HTTPS. Set `APP_URL=https://members.yourdomain.com`, redeploy, and check both the public form and `/admin` using that URL.

References: [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain) · [Namecheap subdomains](https://www.namecheap.com/support/knowledgebase/article.aspx/9776/2237/how-to-create-a-subdomain-for-my-domain/).

## 8. Editing the form (`/admin/formular`)

Sign in and choose **Formular bearbeiten**. The texts are grouped: _Verein & Kontakt_, _Dokumente & Links_, _Startseite_, _Formular · Schritt 1_, _Formular · Schritt 2_, _Eingangsbestätigung_, _E-Mail-Entwurf nach Annahme_ and _PDF-Mitgliedsbestätigung_. The form fields themselves (first name, last name, date of birth, email) stay fixed; their labels can be changed, e.g. to switch the portal from “du” to “Sie”.

- **Vorschau** shows the whole public page with the unsaved changes – both paths (new application, existing member), both steps and the receipt page. **Speichern** publishes immediately; **Verwerfen** returns to the saved version. Every field has **Standard wiederherstellen** for the original text.
- **Portal-Status** opens or closes the portal. Opening requires club name, contact email, statutes, privacy notice, imprint and a document version; missing items are listed and linked. While closed, visitors see the form with the “closed” notice and cannot submit.
- Multi-line texts keep their line breaks. Only site paths (`/…`) and `https://` links are accepted, control characters are rejected, and each text has a length limit shown next to the field.
- The **checkbox wording is stored with every submission** (see “Bestätigte Hinweise” in the submission details). If you change checkbox texts, documents or their version while someone is filling in the form, that person is shown the new version and must confirm it again before sending; the entered data is kept.
- The e-mail template supports `{vorname}`, `{nachname}` and `{verein}`; a live example is shown below it. The PDF texts can be checked with **Beispiel-PDF herunterladen** (fictional name “Anna Beispiel”). Characters the PDF font cannot print are rejected when saving.
- If two people edit at the same time, the second save is refused instead of silently overwriting the first; reload and re-apply your changes. If the session expires while editing, sign in again in the dialog – unsaved changes are kept.

## 9. Day-to-day operation

1. Sign in at `/admin`.
2. Expand a submission and check the details. Emails and claimed existing membership are **not automatically verified**. Match updates using existing club records and contact the person through a known channel when needed.
3. For applicants, follow the actual admission process in the club’s statutes. Resolve any required guardian approval separately for minors; the online acknowledgement alone is not proof of guardian consent.
4. Approve only after that decision. Existing-member submissions instead use **Als abgeglichen markieren**, after manually updating the authoritative membership register.
5. Approved application (tab **Angenommen**): download PDF → open email draft → **attach the downloaded PDF yourself** → send from the club mailbox → mark sent. No API email provider is involved. If no mail app is configured, compose the email directly in webmail and attach the PDF.
6. Rejected applicants are not automatically emailed; inform them personally where appropriate.
7. Delete intake records once transferred and no longer required, following your club’s documented retention policy. Decide retention periods for pending, rejected, accepted and update records with the responsible club administrator; do not leave the portal as an indefinite duplicate membership archive. Deletion affects the live database; provider backups and downloaded/email copies need their own retention policy.

The PDF intentionally omits birth date and email. It records the name, club, decision date and application reference. It is a confirmation document, not a cryptographic signature or an independently authenticated membership credential. The bundled OFL Noto Sans font handles German and many European names. Unsupported scripts fail with a clear error instead of silently corrupting the name; extend the font support or issue that confirmation manually if needed.

## 10. Checks and maintenance

```sh
npm test                  # unit tests (validation, security, settings, PDF) – a few seconds
npm run test:integration  # production build + full-stack tests against a real database and browser
npm run typecheck
```

`npm test` covers input validation, date handling, acknowledgement requirements, session integrity, origin checks, allowed status transitions, database URL/TLS options, text-setting validation and the PDF (approval gating, fonts, page breaks, file names).

`npm run test:integration` builds the app and starts the **production server** against a throwaway database, then tests over HTTP: closed/open portal, submissions (both paths, retries, honeypot, invalid input, outdated acknowledgements), login and cookie flags, forged sessions, origin/size/format checks, the form editor (validation, going live, concurrent edits), all review transitions, PDF download and font errors, deletion, pagination, rate limits, logout, migration of an older database, missing or unreachable databases, and that server logs contain no personal data. A second part drives Chrome through the public form on a phone, an existing-member update, the re-confirmation flow, the editor with preview, expired sessions, concurrent editors, closing the portal, and the full approval workflow; screenshots and a sample PDF are saved in `test-results/`.

- The database is an in-memory [PGlite](https://pglite.dev) by default (no installation needed). To test against a real Postgres, set `TEST_DATABASE_URL` to a database whose name contains `test` (each run uses and drops a temporary schema) and `TEST_DATABASE_SSL` (`true`, `require` or `false`).
- The browser tests use the installed Google Chrome; set `CHROMIUM_PATH` to use another Chromium, or they are skipped with a notice.

Before launch, test a new application and existing-member update, denied admin access, approval, PDF download, manual mail attachment, deletion, mobile layout, and your final domain. Hosting DNS/TLS, managed database connectivity, and delivery from the actual club mailbox must be verified in your own deployment.

Keep dependencies updated and review Vercel/database access regularly. For sustained spam, add a provider firewall rate-limit rule or a server-verified challenge. Current app limits are 10 submissions and 8 login attempts per IP per hour, backed by the database; shared networks share the limit. The app relies on Vercel’s trusted forwarded IP header in production. A different hosting proxy requires reviewing that trust boundary.

## Project map

- `app/`: public pages, admin pages (`/admin`, `/admin/formular`) and protected route handlers.
- `components/`: German membership form, page chrome, admin screens (`components/admin/`: submissions, form editor, preview).
- `lib/form-settings.ts`: every editable text with its default, label, limits and editor group.
- `lib/settings.ts`: validation, loading and saving of the texts; `lib/`: also input validation, database client, security and PDF generation.
- `scripts/schema.sql`, `scripts/migrate.mts`: repeatable database schema and migration.
- `public/documents/`: your **public** versioned club documents.
- `tests/`: unit tests; `tests/integration/`: full-stack and browser tests.

Privacy-conscious defaults are included, but the club must supply its own accurate privacy notice and decide lawful processing, retention, admission and guardian procedures. The code does not certify legal compliance.
