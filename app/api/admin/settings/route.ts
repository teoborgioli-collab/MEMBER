import { admin, body, failure, HttpError, json } from '../../../../lib/http';
import { missingToOpen } from '../../../../lib/form-settings';
import {
  defaultSettings,
  fetchSettings,
  infraStatus,
  saveSettings,
  validateSettings,
} from '../../../../lib/settings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await admin();
    const loaded = await fetchSettings();
    return json({ ...loaded, defaults: defaultSettings(), infra: infraStatus() });
  } catch (err) {
    return failure(err, 'reading settings', { adminRoute: true });
  }
}

export async function PUT(request: Request) {
  try {
    await admin();
    const input = await body(request, 64 * 1024);
    const revision = input.revision;
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0)
      throw new HttpError(400, 'Ungültige Anfrage.');
    const { settings, errors } = await validateSettings(input.settings);
    if (Object.keys(errors).length) {
      const opening = settings.portalOpen && missingToOpen(settings).length > 0;
      throw new HttpError(
        400,
        opening
          ? 'Zum Öffnen des Portals fehlen noch Angaben. Bitte ergänze die markierten Felder oder lass das Portal geschlossen.'
          : 'Bitte prüfe die markierten Felder.',
        { fields: errors },
      );
    }
    const saved = await saveSettings(settings, revision);
    return json({ ok: true, settings, ...saved });
  } catch (err) {
    return failure(err, 'saving settings', { adminRoute: true });
  }
}
