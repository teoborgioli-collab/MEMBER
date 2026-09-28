-- Repeatable schema for the membership portal. Safe to run again: it only creates what is
-- missing and adds columns introduced after the first release.
CREATE TABLE IF NOT EXISTS submissions (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('new','existing')),
 first_name text NOT NULL CHECK(length(first_name) BETWEEN 1 AND 80),
 last_name text NOT NULL CHECK(length(last_name) BETWEEN 1 AND 80),
 birth_date date NOT NULL,
 email text NOT NULL CHECK(length(email)<=254),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','reviewed','rejected')),
 document_version text NOT NULL,
 statutes_url text NOT NULL,
 privacy_url text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 sent_at timestamptz,
 CHECK((kind='new' AND status<>'reviewed') OR (kind='existing' AND status<>'approved'))
);
-- The exact acknowledgement texts (checkbox wording) a person confirmed when submitting.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS acknowledgements jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Added 2026-09-29 (see scripts/migrations/): phone, room, additional answers, e-mail status.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS phone text CHECK (phone IS NULL OR length(phone) <= 30);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS room text CHECK (room IS NULL OR length(room) <= 20);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS club_notified_at timestamptz;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS mail_error text;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approval_mail_error text;
CREATE INDEX IF NOT EXISTS submissions_status_created ON submissions(status,created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limits (key text NOT NULL,bucket bigint NOT NULL,count integer NOT NULL,PRIMARY KEY(key,bucket));
-- Texts, links and open/closed state edited in /admin/formular (a single row).
CREATE TABLE IF NOT EXISTS portal_settings (
 id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 data jsonb NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- A dedicated app DB role should have only SELECT/INSERT/UPDATE/DELETE on these three tables:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON submissions, rate_limits, portal_settings TO <app_role>;
-- No browser database client and no public/anonymous database access are used.
