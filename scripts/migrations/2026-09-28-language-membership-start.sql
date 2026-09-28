-- Bilingual portal + membership start month/year for existing members. Safe to run repeatedly.
BEGIN;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'de' CHECK (locale IN ('de','en'));
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS membership_start_month text CHECK (membership_start_month IS NULL OR membership_start_month ~ '^\d{4}-\d{2}$');
COMMIT;
