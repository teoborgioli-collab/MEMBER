import { submissionSchema } from '../../../lib/validation';
import { body, failure, HttpError, json, limit } from '../../../lib/http';
import {
  acceptingSubmissions,
  acknowledgements,
  consentVersion,
  formConfig,
  readSettings,
} from '../../../lib/settings';
import { db } from '../../../lib/db';
import { UNAVAILABLE_NOTICE } from '../../../lib/form-settings';

export async function POST(request: Request) {
  try {
    const raw = await body(request);
    const parsed = submissionSchema.safeParse(raw);
    if (!parsed.success)
      throw new HttpError(
        400,
        'Bitte prüfe deine Angaben und bestätige alle erforderlichen Hinweise.',
      );
    const d = parsed.data;
    const portal = await readSettings();
    if (portal.dbError) throw new HttpError(503, UNAVAILABLE_NOTICE);
    if (process.env.DATABASE_URL) {
      // A retry after a lost response: the submission is already stored.
      const [stored] = await db()`SELECT 1 FROM submissions WHERE id = ${d.requestId}`;
      if (stored) return json({ reference: d.requestId }, 201);
    }
    if (!acceptingSubmissions(portal))
      throw new HttpError(503, 'Das Portal ist derzeit nicht für Einreichungen freigeschaltet.');
    const s = portal.settings;
    // The visitor confirmed texts or documents that have changed since the page was loaded.
    if (d.consent !== consentVersion(s, d.kind))
      throw new HttpError(
        409,
        'Die Hinweise wurden gerade aktualisiert. Bitte lies sie erneut und bestätige sie.',
        { code: 'stale', config: formConfig(portal) },
      );
    await limit(request, 'submission', 10);
    const sql = db();
    await sql`
      INSERT INTO submissions
        (id, kind, first_name, last_name, birth_date, email,
         document_version, statutes_url, privacy_url, acknowledgements)
      VALUES
        (${d.requestId}, ${d.kind}, ${d.firstName}, ${d.lastName}, ${d.birthDate}, ${d.email},
         ${s.documentVersion}, ${d.kind === 'new' ? s.statutesUrl : ''}, ${s.privacyUrl},
         ${sql.json(acknowledgements(s, d.kind))})
      ON CONFLICT (id) DO NOTHING`;
    return json({ reference: d.requestId }, 201);
  } catch (err) {
    return failure(err, 'submission');
  }
}
