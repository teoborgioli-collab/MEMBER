-- Migration 2026-09-29: Telefonnummer, Zimmernummer, Zusatzfragen und E-Mail-Status.
-- Nur ergänzend: Es werden keine Daten gelöscht oder verändert. Bestehende Einträge behalten
-- leere Werte (NULL) für Telefon und Zimmer. Mehrfaches Ausführen ist unschädlich.
BEGIN;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS phone text CHECK (phone IS NULL OR length(phone) <= 30);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS room text CHECK (room IS NULL OR length(room) <= 20);
-- Antworten auf Zusatzfragen inkl. Fragetext zum Zeitpunkt der Einreichung.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Automatische E-Mails: Zeitpunkt des Versands, letzter Fehlercode (ohne personenbezogene Daten).
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS club_notified_at timestamptz;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS mail_error text;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approval_mail_error text;
COMMIT;
