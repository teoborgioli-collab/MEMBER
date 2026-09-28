# Update: English portal + Eintrittsmonat/-jahr

This version adds:

- DE/EN switch on the public portal (German remains the default)
- English public-form labels, notices, validation messages, receipt emails and acceptance emails
- English membership-confirmation PDF for submissions made in English
- optional English translations for admin-created custom questions, help text and select options
- required `Eintrittsmonat und -jahr` (`YYYY-MM`) for existing members
- membership start shown in admin, CSV export and membership confirmation PDF
- existing members can download a membership confirmation PDF after their record has been marked `Abgeglichen`

## 1. Run the Neon migration once

Run `scripts/migrations/2026-09-28-language-membership-start.sql` in the Neon SQL editor:

```sql
BEGIN;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'de' CHECK (locale IN ('de','en'));
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS membership_start_month text CHECK (membership_start_month IS NULL OR membership_start_month ~ '^\d{4}-\d{2}$');
COMMIT;
```

Existing submissions remain valid. They default to German and have no membership start month.

## 2. Upload the project to GitHub

Replace the existing project files with the contents of this project. Do not upload `node_modules`, `.next`, or local `.env*` files.

## 3. Vercel

No new environment variables are required. Existing Neon and Resend variables remain unchanged.

After GitHub deploys, test both DE and EN, then submit one test as a new member and one as an existing member.
