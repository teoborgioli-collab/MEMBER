import { admin, failure, HttpError } from '../../../../lib/http';
import { db } from '../../../../lib/db';
import { STATUSES } from '../../../../lib/validation';
export const runtime = 'nodejs';
const STATUS_LABELS = {
    pending: 'Offen',
    approved: 'Angenommen',
    reviewed: 'Abgeglichen',
    rejected: 'Abgelehnt',
};
// Excel-friendly CSV: semicolons, UTF-8 with BOM, and cells that could be read as formulas
// (starting with = + - @) are prefixed with an apostrophe.
function cell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text))
        text = "'" + text;
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const stamp = (value) => value
    ? value.toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
    : '';
/** GET /api/admin/export?status=all – all submissions (or one status) as CSV. */
export async function GET(request) {
    try {
        await admin();
        const status = new URL(request.url).searchParams.get('status') || 'all';
        if (status !== 'all' && !STATUSES.includes(status))
            throw new HttpError(400, 'Unbekannter Filter.');
        const rows = await db() `
      SELECT id, kind, status, locale, first_name, last_name, birth_date::text AS birth_date, email,
             phone, room, membership_start_month, answers, created_at, decided_at, sent_at, club_notified_at,
             confirmation_sent_at
      FROM submissions WHERE (${status} = 'all' OR status = ${status})
      ORDER BY created_at DESC, id DESC`;
        // One column per additional question (by question text, in order of first appearance).
        const questions = [];
        for (const row of rows)
            for (const a of row.answers ?? [])
                if (!questions.includes(a.question))
                    questions.push(a.question);
        const header = [
            'Vorgangsnummer',
            'Art',
            'Status',
            'Vorname',
            'Nachname',
            'Geburtsdatum',
            'E-Mail',
            'Telefon',
            'Zimmernummer',
            'Eintrittsmonat/-jahr',
            'Sprache',
            ...questions,
            'Eingegangen',
            'Bearbeitet',
            'Bestätigung versendet',
            'Vereins-E-Mail',
            'Eingangsbestätigung',
        ];
        const lines = rows.map((r) => {
            const answer = (q) => (r.answers ?? []).find((a) => a.question === q)?.answer ?? '';
            return [
                r.id,
                r.kind === 'new' ? 'Neuer Antrag' : 'Bestehendes Mitglied',
                STATUS_LABELS[r.status],
                r.first_name,
                r.last_name,
                r.birth_date.split('-').reverse().join('.'),
                r.email,
                r.phone ?? '',
                r.room ?? '',
                r.membership_start_month ?? '',
                r.locale === 'en' ? 'Englisch' : 'Deutsch',
                ...questions.map(answer),
                stamp(r.created_at),
                stamp(r.decided_at),
                stamp(r.sent_at),
                stamp(r.club_notified_at),
                stamp(r.confirmation_sent_at),
            ]
                .map(cell)
                .join(';');
        });
        const csv = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n') + '\r\n';
        const date = new Date().toISOString().slice(0, 10);
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="Mitgliederportal-Export-${date}.csv"`,
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    }
    catch (err) {
        return failure(err, 'export', { adminRoute: true });
    }
}
