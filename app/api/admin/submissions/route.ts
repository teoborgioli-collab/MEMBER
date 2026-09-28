import { admin, failure, HttpError, json } from '../../../../lib/http';
import { db } from '../../../../lib/db';
import { fetchSettings } from '../../../../lib/settings';
import { STATUSES } from '../../../../lib/validation';

export async function GET(request: Request) {
  try {
    await admin();
    const p = new URL(request.url).searchParams;
    const status = p.get('status') || 'pending';
    if (status !== 'all' && !(STATUSES as readonly string[]).includes(status))
      throw new HttpError(400, 'Unbekannter Filter.');
    const offset = Math.max(0, Math.min(100000, Math.floor(Number(p.get('offset'))) || 0));
    const sql = db();
    const rows = await sql`
      SELECT id, kind, first_name, last_name, birth_date::text AS birth_date, email, status,
             document_version, statutes_url, privacy_url, acknowledgements,
             created_at, decided_at, sent_at
      FROM submissions
      WHERE (${status} = 'all' OR status = ${status})
      ORDER BY created_at DESC, id DESC
      LIMIT 51 OFFSET ${offset}`;
    const counts = await sql`SELECT status, count(*)::int AS n FROM submissions GROUP BY status`;
    const { settings } = await fetchSettings();
    return json({
      rows: rows.slice(0, 50),
      hasMore: rows.length > 50,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      mail: {
        clubName: settings.clubName,
        subject: settings.emailSubject,
        body: settings.emailBody,
      },
    });
  } catch (err) {
    return failure(err, 'listing submissions', { adminRoute: true });
  }
}
