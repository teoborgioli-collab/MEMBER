# Update: automatische Aufnahmebestätigung mit PDF

1. In Neon **vor** dem Deployment `scripts/migrations/2026-09-29-approval-email.sql` im SQL Editor ausführen. Vorhandene Daten bleiben erhalten.
2. Die **Inhalte** dieses Projektordners in dein bestehendes GitHub-Repository übernehmen (keine `.env`-Datei mit echten Zugangsdaten einchecken).
3. In Vercel / Production setzen oder prüfen: `RESEND_API_KEY` (echter geheimer Schlüssel), `MAIL_FROM=SSV Potsdamer Straße <info@ssvpotsdamerstr.de>`, `CLUB_NOTIFY_EMAIL=info@ssvpotsdamerstr.de`, `APP_URL=https://member.ssvpotsdamerstr.de`.
4. Die Absenderdomain muss bei Resend zum Senden verifiziert sein. `PORTAL_OPEN=false` beibehalten, bis alles getestet ist.
5. Vercel neu deployen. Beim Klick auf **Aufnahme bestätigen** wird die Entscheidung gespeichert und die Bestätigung mit automatisch erzeugtem PDF an das Mitglied geschickt. Bei einem Versandfehler **nicht noch einmal aufnehmen**, sondern im Filter **Angenommen** die Funktion **Bestätigung mit PDF erneut senden** wählen.
6. Eine vorhandene manuelle Versandmarkierung (`sent_at`) wird respektiert, damit bereits versendete Bestätigungen nicht erneut verschickt werden.

Hinweis: Die PDF-Vorlage verwendet das Datum der Aufnahmeentscheidung als Bestätigungsdatum. Prüfe vor echtem Einsatz, ob das zur Satzung und euren Aufnahmeverfahren passt. Der Versand ist API-seitig idempotent; nach Ablauf des Resend-Idempotenzfensters sind bei extrem seltenen Netzwerk-/Datenbank-Teilfehlern Doppelversendungen nicht technisch vollständig ausgeschlossen.
