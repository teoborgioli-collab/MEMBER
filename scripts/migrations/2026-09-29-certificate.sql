-- Mitgliedsbescheinigung per E-Mail: Zeitpunkt des letzten Versands und letzter Fehlercode.
-- Run once in Neon SQL Editor BEFORE deploying. Nur ergänzend, mehrfaches Ausführen ist unschädlich.
BEGIN;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS certificate_sent_at timestamptz;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS certificate_mail_error text;
COMMIT;
