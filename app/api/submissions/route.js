import { after } from 'next/server';
import { submissionSchema } from '../../../lib/validation';
import { body, failure, HttpError, json, limit } from '../../../lib/http';
import { acceptingSubmissions, acknowledgements, checkAnswers, consentVersion, formConfig, readSettings, } from '../../../lib/settings';
import { db } from '../../../lib/db';
import { UNAVAILABLE_NOTICE } from '../../../lib/form-settings';
import { sendSubmissionEmails } from '../../../lib/notify';
// Leaves time for the automatic e-mails, which are sent after the response.
export const maxDuration = 30;
export async function POST(request) {
    try {
        const raw = await body(request);
        const locale = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.locale === 'en' ? 'en' : 'de';
        const parsed = submissionSchema.safeParse(raw);
        if (!parsed.success)
            throw new HttpError(400, locale === 'en' ? 'Please check your information and confirm all required notices.' : 'Bitte prüfe deine Angaben und bestätige alle erforderlichen Hinweise.');
        const d = parsed.data;
        const portal = await readSettings();
        if (portal.dbError)
            throw new HttpError(503, UNAVAILABLE_NOTICE);
        if (process.env.DATABASE_URL) {
            // A retry after a lost response: the submission is already stored.
            const [stored] = await db() `SELECT 1 FROM submissions WHERE id = ${d.requestId}`;
            if (stored)
                return json({ reference: d.requestId }, 201);
        }
        if (!acceptingSubmissions(portal))
            throw new HttpError(503, d.locale === 'en' ? 'The portal is currently not accepting submissions.' : 'Das Portal ist derzeit nicht für Einreichungen freigeschaltet.');
        const s = portal.settings;
        // The visitor confirmed texts or documents that have changed since the page was loaded.
        if (d.consent !== consentVersion(s, d.kind))
            throw new HttpError(409, d.locale === 'en' ? 'The notices were just updated. Please read and confirm them again.' : 'Die Hinweise wurden gerade aktualisiert. Bitte lies sie erneut und bestätige sie.', { code: 'stale', config: formConfig(portal) });
        const { answers, error: answerError } = checkAnswers(s.questions, d.kind, d.answers, d.locale);
        if (answerError)
            throw new HttpError(400, answerError);
        await limit(request, 'submission', 10);
        const sql = db();
        const inserted = await sql `
      INSERT INTO submissions
        (id, kind, locale, first_name, last_name, birth_date, email, phone, room, membership_start_month, answers,
         document_version, statutes_url, privacy_url, acknowledgements)
      VALUES
        (${d.requestId}, ${d.kind}, ${d.locale}, ${d.firstName}, ${d.lastName}, ${d.birthDate}, ${d.email},
         ${d.phone}, ${d.room}, ${d.kind === 'existing' ? d.membershipStartMonth ?? null : null}, ${sql.json(answers)},
         ${s.documentVersion}, ${d.kind === 'new' ? s.statutesUrl : ''}, ${s.privacyUrl},
         ${sql.json(acknowledgements(s, d.kind))})
      ON CONFLICT (id) DO NOTHING
      RETURNING id`;
        // E-mails go out only after the submission is stored, and only for a new row (a retried
        // request with the same id never triggers a second round).
        if (inserted.length)
            after(() => sendSubmissionEmails(d.requestId, s));
        return json({ reference: d.requestId }, 201);
    }
    catch (err) {
        return failure(err, 'submission');
    }
}
