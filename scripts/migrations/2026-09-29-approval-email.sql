-- Run once in Neon SQL Editor BEFORE deploying the new app. Safe to repeat.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approval_mail_error text;
