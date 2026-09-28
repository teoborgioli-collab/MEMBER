// Full-stack HTTP tests against the production build and a real (PGlite or Postgres) database.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  COMPLETE,
  Client,
  newApplication,
  pageConsent,
  startApp,
  startDatabase,
  migrate,
  visible,
  type App,
  type Db,
} from './harness';

let db: Db;
let app: App;
let admin: Client;
let revision = 0;

const html = async (route: string, client?: Client) => {
  const res = client ? await client.req(route) : await fetch(app.base + route);
  return { status: res.status, headers: res.headers, text: visible(await res.text()) };
};

async function saveSettings(patch: Record<string, unknown>) {
  const current = await admin.json('/api/admin/settings');
  const result = await admin.json('/api/admin/settings', {
    method: 'PUT',
    json: { settings: { ...current.data.settings, ...patch }, revision: current.data.revision },
  });
  if (result.status === 200) revision = result.data.revision;
  return result;
}

before(async () => {
  db = await startDatabase();
  await migrate(db);
  app = await startApp(db);
  admin = new Client(app.base);
});

after(async () => {
  await app?.stop();
  await db?.stop();
});

describe('public pages', () => {
  test('the portal starts closed, with built-in texts and security headers', async () => {
    const page = await html('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /<title>Mitgliederportal<\/title>/);
    assert.match(page.text, /noindex, nofollow/);
    assert.match(page.text, /Schön, dass du/);
    assert.match(page.text, /Das Portal wird eingerichtet/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.match(page.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal(page.headers.get('x-powered-by'), null);
    // Missing documents fall back to the placeholder page.
    assert.match(page.text, /href="\/documents"/);
    assert.equal((await html('/documents')).status, 200);
  });

  test('admin pages are never cached and show the login form without a session', async () => {
    for (const route of ['/admin', '/admin/formular']) {
      const page = await html(route);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('cache-control')!, /no-store/);
      assert.match(page.text, /Willkommen zurück/);
      assert.doesNotMatch(page.text, /Portal-Status/);
    }
  });

  test('submissions are refused while the portal is closed', async () => {
    const consent = await pageConsent(app.base);
    const res = await new Client(app.base).json('/api/submissions', {
      json: newApplication(consent),
    });
    assert.equal(res.status, 503);
    assert.match(res.data.error, /nicht für Einreichungen freigeschaltet/);
  });
});

describe('request hardening', () => {
  const client = () => new Client(app.base);

  test('mutations need the portal’s own origin', async () => {
    for (const origin of [false, 'https://evil.example', 'null'] as const) {
      const res = await client().json('/api/admin/login', {
        json: { password: 'x' },
        origin,
      });
      assert.equal(res.status, 403, String(origin));
    }
  });

  test('bodies must be small JSON objects', async () => {
    const plain = await client().json('/api/admin/login', {
      body: '{"password":"x"}',
      headers: { 'content-type': 'text/plain' },
    });
    assert.equal(plain.status, 415);
    const broken = await client().json('/api/admin/login', {
      body: '{"password":',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(broken.status, 400);
    const list = await client().json('/api/admin/login', { json: ['x'] });
    assert.equal(list.status, 400);
    const huge = await client().json('/api/submissions', {
      json: { padding: 'x'.repeat(9000) },
    });
    assert.equal(huge.status, 413);
  });

  test('admin endpoints reject missing and forged sessions', async () => {
    const forged = client();
    forged.cookie = 'portal_admin=4102444800000.' + 'a'.repeat(32) + '.' + 'b'.repeat(64);
    for (const c of [client(), forged]) {
      assert.equal((await c.json('/api/admin/submissions')).status, 401);
      assert.equal((await c.json('/api/admin/settings')).status, 401);
      assert.equal((await c.json('/api/admin/settings', { method: 'PUT', json: {} })).status, 401);
      assert.equal(
        (
          await c.json('/api/admin/submissions/' + crypto.randomUUID(), {
            json: { action: 'approve' },
          })
        ).status,
        401,
      );
      assert.equal(
        (await c.json('/api/admin/submissions/' + crypto.randomUUID() + '/pdf')).status,
        401,
      );
      assert.equal((await c.json('/api/admin/pdf-preview', { json: {} })).status, 401);
    }
  });
});

describe('admin login', () => {
  test('wrong and empty passwords are refused', async () => {
    assert.equal(
      (await admin.json('/api/admin/login', { json: { password: 'nope' } })).status,
      401,
    );
    assert.equal((await admin.json('/api/admin/login', { json: { password: '' } })).status, 400);
    assert.equal((await admin.json('/api/admin/login', { json: {} })).status, 400);
    assert.equal(admin.cookie, '');
  });

  test('the session cookie is HttpOnly, SameSite=Strict, Secure and expires after 8 hours', async () => {
    await admin.login();
    const cookie = admin.setCookies.find((c) => c.startsWith('portal_admin='))!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=28800/);
    const page = await html('/admin', admin);
    assert.match(page.text, /Einreichungen\./);
    assert.doesNotMatch(page.text, /Willkommen zurück/);
  });
});

describe('form settings', () => {
  test('start from built-in texts and environment defaults', async () => {
    const { status, data, headers } = await admin.json('/api/admin/settings');
    assert.equal(status, 200);
    assert.match(headers.get('cache-control')!, /no-store/);
    assert.equal(data.revision, 0);
    assert.equal(data.updatedAt, null);
    assert.equal(data.settings.portalOpen, false);
    assert.equal(data.settings.form1Heading, 'Ein guter Anfang.');
    assert.deepEqual(data.infra, {
      database: true,
      adminPassword: true,
      sessionSecret: true,
      appUrl: true,
    });
  });

  test('opening requires club, contact and documents', async () => {
    const res = await saveSettings({ portalOpen: true });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /Zum Öffnen des Portals fehlen noch Angaben/);
    assert.deepEqual(Object.keys(res.data.fields).sort(), Object.keys(COMPLETE).sort());
  });

  test('invalid values are reported per field and nothing is saved', async () => {
    const res = await saveSettings({
      ...COMPLETE,
      statutesUrl: 'javascript:alert(1)',
      form1Heading: '   ',
      emailSubject: 'Willkommen {name}',
      pdfSignature: 'Vorstand ☃',
      kindQuestion: 'Zeile\nZeile',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.data.fields).sort(), [
      'emailSubject',
      'form1Heading',
      'kindQuestion',
      'pdfSignature',
      'statutesUrl',
    ]);
    assert.equal((await admin.json('/api/admin/settings')).data.revision, 0);
    const huge = await admin.json('/api/admin/settings', {
      method: 'PUT',
      json: { settings: { introText: 'x'.repeat(70_000) }, revision: 0 },
    });
    assert.equal(huge.status, 413);
    const noRevision = await admin.json('/api/admin/settings', {
      method: 'PUT',
      json: { settings: {} },
    });
    assert.equal(noRevision.status, 400);
  });

  test('saved texts go live immediately', async () => {
    const res = await saveSettings({
      ...COMPLETE,
      portalOpen: true,
      form1Heading: 'Herzlich willkommen!',
      introHeading: 'Willkommen\nim Verein.',
      headerNote: '',
      footerNote: 'Seit 1920 für Beispielstadt.',
      checkPrivacy: 'Ich habe die Datenschutzhinweise gelesen.',
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.revision, 1);
    const page = await html('/');
    assert.match(page.text, /<title>Mitgliederportal · SV Beispielstadt 1920 e\. V\.<\/title>/);
    assert.match(page.text, /Herzlich willkommen!/);
    assert.match(page.text, /<h1>Willkommen(<!-- -->)? <br\/>im Verein\.<\/h1>/);
    assert.match(page.text, /Seit 1920 für Beispielstadt\./);
    assert.doesNotMatch(page.text, /Gemeinsam im Verein\./);
    assert.match(page.text, /href="\/documents\/datenschutz-2026-09\.pdf"/);
    assert.match(page.text, /href="https:\/\/example\.org\/impressum"/);
    assert.doesNotMatch(page.text, /Das Portal wird eingerichtet/);
  });

  test('a stale editor cannot overwrite newer changes', async () => {
    const current = (await admin.json('/api/admin/settings')).data;
    const stale = await admin.json('/api/admin/settings', {
      method: 'PUT',
      json: { settings: { ...current.settings, form1Heading: 'Alt' }, revision: 0 },
    });
    assert.equal(stale.status, 409);
    assert.match(stale.data.error, /inzwischen an anderer Stelle gespeichert/);
    assert.equal(
      (await admin.json('/api/admin/settings')).data.settings.form1Heading,
      'Herzlich willkommen!',
    );
  });

  test('settings are stored as one row with a revision', async () => {
    const rows =
      await db.sql`SELECT id, revision, data->>'form1Heading' AS heading FROM portal_settings`;
    assert.deepEqual(
      rows.map((r) => ({ ...r })),
      [{ id: 1, revision, heading: 'Herzlich willkommen!' }],
    );
  });
});

describe('submissions', () => {
  const ids: Record<string, string> = {};

  test('a new application and an existing-member update are accepted', async () => {
    const consent = await pageConsent(app.base);
    const visitor = new Client(app.base);
    const application = newApplication(consent, { email: '  Juergen.Oeztuerk@Example.ORG ' });
    const first = await visitor.json('/api/submissions', { json: application });
    assert.equal(first.status, 201);
    assert.equal(first.data.reference, application.requestId);
    ids.new = application.requestId;
    // A retry with the same request id (e.g. after a lost response) does not duplicate.
    const retry = await visitor.json('/api/submissions', { json: application });
    assert.equal(retry.status, 201);
    assert.equal(retry.data.reference, application.requestId);

    const update = newApplication(consent, {
      kind: 'existing',
      firstName: 'Anna',
      lastName: 'Schmidt',
      email: 'anna.schmidt@example.org',
      statutesAccepted: undefined,
    });
    assert.equal((await visitor.json('/api/submissions', { json: update })).status, 201);
    ids.existing = update.requestId;
  });

  test('incomplete or suspicious submissions are rejected', async () => {
    const consent = await pageConsent(app.base);
    const visitor = new Client(app.base);
    for (const patch of [
      { statutesAccepted: undefined },
      { privacyRead: undefined },
      { website: 'https://spam.example' },
      { birthDate: '2999-01-01' },
      { birthDate: '1990-02-30' },
      { email: 'keine-adresse' },
      { firstName: '' },
      { consent: 'x' },
    ]) {
      const res = await visitor.json('/api/submissions', {
        json: newApplication(consent, patch),
      });
      assert.equal(res.status, 400, JSON.stringify(patch));
    }
  });

  test('confirming outdated texts is refused and returns the current version', async () => {
    const outdated = '0000000000000000';
    const res = await new Client(app.base).json('/api/submissions', {
      json: newApplication(outdated),
    });
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'stale');
    assert.deepEqual(res.data.config.consent, await pageConsent(app.base));
    assert.equal(res.data.config.texts.checkPrivacy, 'Ich habe die Datenschutzhinweise gelesen.');
  });

  test('the record keeps documents, version and the exact confirmed wording', async () => {
    const rows = await db.sql`
      SELECT id, kind, email, birth_date::text AS birth_date, status, document_version,
             statutes_url, privacy_url, acknowledgements
      FROM submissions ORDER BY created_at`;
    assert.equal(rows.length, 2);
    const [created, update] = rows;
    assert.equal(created.email, 'juergen.oeztuerk@example.org');
    assert.equal(created.birth_date, '1990-05-17');
    assert.equal(created.status, 'pending');
    assert.equal(created.document_version, '2026-09-28');
    assert.equal(created.statutes_url, '/documents/satzung-2026-09.pdf');
    assert.equal(created.privacy_url, '/documents/datenschutz-2026-09.pdf');
    assert.deepEqual(created.acknowledgements, [
      'Ich habe die Satzung gelesen und erkenne sie an. Ich beantrage die Aufnahme in den Verein.',
      'Ich habe die Datenschutzhinweise gelesen.',
      'Ich bestätige, dass meine Angaben richtig und aktuell sind.',
    ]);
    assert.equal(update.kind, 'existing');
    assert.equal(update.statutes_url, '');
    assert.equal(update.acknowledgements.length, 2);
  });

  test('the admin list shows records, counts and the e-mail template', async () => {
    const { status, data } = await admin.json('/api/admin/submissions?status=pending');
    assert.equal(status, 200);
    assert.equal(data.rows.length, 2);
    assert.deepEqual(data.counts, { pending: 2 });
    assert.equal(data.hasMore, false);
    const row = data.rows.find((r: any) => r.id === ids.new);
    assert.equal(row.birth_date, '1990-05-17');
    assert.equal(row.acknowledgements.length, 3);
    assert.equal(data.mail.clubName, COMPLETE.clubName);
    assert.match(data.mail.subject, /\{verein\}/);
    assert.equal((await admin.json('/api/admin/submissions?status=bogus')).status, 400);
  });

  test('decisions follow the allowed transitions', async () => {
    const act = (id: string, action: string, confirm?: string) =>
      admin.json('/api/admin/submissions/' + id, { json: { action, confirm } });
    assert.equal((await admin.json(`/api/admin/submissions/${ids.new}/pdf`)).status, 409);
    assert.equal((await act(ids.existing, 'approve')).status, 409);
    assert.equal((await act(ids.new, 'review')).status, 409);
    assert.equal((await act(ids.new, 'sent')).status, 409);
    assert.equal((await act(ids.new, 'fly')).status, 400);
    assert.equal((await act('not-a-uuid', 'approve')).status, 400);
    assert.equal((await act(crypto.randomUUID(), 'approve')).status, 404);
    assert.equal((await act(ids.new, 'approve')).status, 200);
    assert.equal((await act(ids.new, 'approve')).status, 409);
    assert.equal((await act(ids.new, 'reject')).status, 409);
    assert.equal((await act(ids.existing, 'review')).status, 200);
    const { data } = await admin.json('/api/admin/submissions?status=all');
    assert.deepEqual(data.counts, { approved: 1, reviewed: 1 });
    assert.ok(data.rows.every((r: any) => r.decided_at));
  });

  test('approved applications get a PDF with the edited texts', async () => {
    await saveSettings({ pdfTitle: 'Aufnahmebestätigung', pdfSignature: 'Der Vorstand' });
    const res = await admin.req(`/api/admin/submissions/${ids.new}/pdf`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('cache-control')!, /no-store/);
    assert.equal(
      res.headers.get('content-disposition'),
      `attachment; filename="Mitgliedsbestaetigung-Juergen-Oeztuerk.pdf"; filename*=UTF-8''Mitgliedsbest%C3%A4tigung%20J%C3%BCrgen%20%C3%96zt%C3%BCrk.pdf`,
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getTitle(), 'Aufnahmebestätigung');
    assert.equal(pdf.getAuthor(), COMPLETE.clubName);
    assert.equal((await admin.json(`/api/admin/submissions/${ids.existing}/pdf`)).status, 409);
  });

  test('marking as sent is recorded once', async () => {
    const act = () => admin.json('/api/admin/submissions/' + ids.new, { json: { action: 'sent' } });
    assert.equal((await act()).status, 200);
    const [{ sent_at: first }] = await db.sql`SELECT sent_at FROM submissions WHERE id=${ids.new}`;
    assert.ok(first);
    assert.equal((await act()).status, 200);
    const [{ sent_at: second }] = await db.sql`SELECT sent_at FROM submissions WHERE id=${ids.new}`;
    assert.equal(second.getTime(), first.getTime());
  });

  test('names the PDF font cannot draw produce a clear error', async () => {
    const consent = await pageConsent(app.base);
    const application = newApplication(consent, { firstName: '王', lastName: '小明' });
    assert.equal(
      (await new Client(app.base).json('/api/submissions', { json: application })).status,
      201,
    );
    await admin.json('/api/admin/submissions/' + application.requestId, {
      json: { action: 'approve' },
    });
    const res = await admin.json(`/api/admin/submissions/${application.requestId}/pdf`);
    assert.equal(res.status, 422);
    assert.match(res.data.error, /王/);
    assert.match(res.data.error, /manuell/);
  });

  test('deleting needs the record id as confirmation', async () => {
    const act = (confirm?: string) =>
      admin.json('/api/admin/submissions/' + ids.existing, { json: { action: 'delete', confirm } });
    assert.equal((await act()).status, 400);
    assert.equal((await act(ids.new)).status, 400);
    assert.equal((await act(ids.existing)).status, 200);
    assert.equal((await act(ids.existing)).status, 404);
    const rows = await db.sql`SELECT id FROM submissions WHERE id=${ids.existing}`;
    assert.equal(rows.length, 0);
  });

  test('a retry of a stored submission succeeds even after the texts changed', async () => {
    const consent = await pageConsent(app.base);
    const application = newApplication(consent, { firstName: 'Retry', lastName: 'Person' });
    const visitor = new Client(app.base);
    assert.equal((await visitor.json('/api/submissions', { json: application })).status, 201);
    const before = (await admin.json('/api/admin/settings')).data.settings.checkPrivacy;
    assert.equal((await saveSettings({ checkPrivacy: 'Geänderter Wortlaut.' })).status, 200);
    // The response to the first attempt got lost; the browser sends the same request again.
    const retry = await visitor.json('/api/submissions', { json: application });
    assert.equal(retry.status, 201);
    assert.equal(retry.data.reference, application.requestId);
    assert.equal((await saveSettings({ portalOpen: false })).status, 200);
    assert.equal((await visitor.json('/api/submissions', { json: application })).status, 201);
    const rows = await db.sql`SELECT acknowledgements FROM submissions WHERE last_name = 'Person'`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].acknowledgements[1], before);
    assert.equal((await saveSettings({ portalOpen: true, checkPrivacy: before })).status, 200);
    await db.sql`DELETE FROM submissions WHERE last_name = 'Person'`;
  });

  test('changing the statutes does not interrupt existing members', async () => {
    const consent = await pageConsent(app.base);
    const before = (await admin.json('/api/admin/settings')).data.settings.checkStatutes;
    assert.equal(
      (await saveSettings({ checkStatutes: 'Ich erkenne die neue Satzung an.' })).status,
      200,
    );
    const visitor = new Client(app.base);
    const update = newApplication(consent, {
      kind: 'existing',
      statutesAccepted: undefined,
      lastName: 'Bestand',
    });
    assert.equal((await visitor.json('/api/submissions', { json: update })).status, 201);
    const application = newApplication(consent, { lastName: 'Neuling' });
    assert.equal((await visitor.json('/api/submissions', { json: application })).status, 409);
    assert.equal((await saveSettings({ checkStatutes: before })).status, 200);
    await db.sql`DELETE FROM submissions WHERE last_name IN ('Bestand', 'Neuling')`;
  });

  test('symbols in texts outside the PDF do not affect PDFs', async () => {
    const before = (await admin.json('/api/admin/settings')).data.settings;
    const saved = await saveSettings({
      introText: 'Willkommen 🎉',
      headerNote: '⚽ Sport für alle',
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const res = await admin.req(`/api/admin/submissions/${ids.new}/pdf`);
    assert.equal(res.status, 200);
    assert.match(await visible(await (await fetch(app.base + '/')).text()), /Willkommen 🎉/);
    assert.equal(
      (await saveSettings({ introText: before.introText, headerNote: before.headerNote })).status,
      200,
    );
  });

  test('lists are paginated by 50', async () => {
    await db.sql`
      INSERT INTO submissions (id, kind, first_name, last_name, birth_date, email,
                               document_version, statutes_url, privacy_url, created_at)
      SELECT gen_random_uuid(), 'existing', 'Test', 'Person ' || n, '1980-01-01',
             'person' || n || '@example.org', 'v1', '', '/p.pdf', now() - n * interval '1 minute'
      FROM generate_series(1, 55) AS n`;
    const first = await admin.json('/api/admin/submissions?status=pending');
    assert.equal(first.data.rows.length, 50);
    assert.equal(first.data.hasMore, true);
    const second = await admin.json('/api/admin/submissions?status=pending&offset=50');
    assert.equal(second.data.rows.length, 5);
    assert.equal(second.data.hasMore, false);
    const seen = new Set([...first.data.rows, ...second.data.rows].map((r: any) => r.id));
    assert.equal(seen.size, 55);
    await db.sql`DELETE FROM submissions WHERE first_name = 'Test'`;
  });
});

describe('PDF preview in the editor', () => {
  test('returns a sample PDF with unsaved texts', async () => {
    const res = await admin.req('/api/admin/pdf-preview', {
      json: {
        clubName: 'Probeverein',
        pdfTitle: 'Probe',
        pdfIntro: 'Wir bestätigen',
        pdfWelcome: '',
        pdfWelcomeText: '',
        pdfSignature: 'Der Vorstand',
      },
    });
    assert.equal(res.status, 200);
    const pdf = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    assert.equal(pdf.getTitle(), 'Probe');
    assert.equal(pdf.getAuthor(), 'Probeverein');
  });

  test('reports texts the PDF cannot use', async () => {
    const res = await admin.json('/api/admin/pdf-preview', {
      json: {
        clubName: 'Probeverein',
        pdfTitle: '',
        pdfIntro: 'Wir bestätigen',
        pdfWelcome: '',
        pdfWelcomeText: '',
        pdfSignature: 'Vorstand ☃',
      },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.data.fields).sort(), ['pdfTitle']);
    const glyph = await admin.json('/api/admin/pdf-preview', {
      json: {
        clubName: 'Probeverein',
        pdfTitle: 'Titel',
        pdfIntro: 'Wir bestätigen',
        pdfWelcome: '',
        pdfWelcomeText: '',
        pdfSignature: 'Vorstand ☃',
      },
    });
    assert.equal(glyph.status, 422);
    assert.match(glyph.data.error, /☃/);
  });
});

describe('closing the portal', () => {
  test('takes effect immediately and shows the closed notice', async () => {
    assert.equal(
      (await saveSettings({ portalOpen: false, closedNotice: 'Pause bis Montag.' })).status,
      200,
    );
    const consent = await pageConsent(app.base);
    const res = await new Client(app.base).json('/api/submissions', {
      json: newApplication(consent),
    });
    assert.equal(res.status, 503);
    assert.match((await html('/')).text, /Pause bis Montag\./);
    assert.equal((await saveSettings({ portalOpen: true })).status, 200);
  });
});

describe('rate limits', () => {
  test('allow 10 valid submissions per hour and do not count invalid ones', async () => {
    await db.sql`DELETE FROM rate_limits`;
    const consent = await pageConsent(app.base);
    const visitor = new Client(app.base);
    for (let i = 0; i < 3; i++)
      assert.equal(
        (await visitor.json('/api/submissions', { json: newApplication(consent, { email: 'x' }) }))
          .status,
        400,
      );
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await visitor.json('/api/submissions', { json: newApplication(consent) })).status,
        201,
        'submission ' + (i + 1),
      );
    const blocked = await visitor.json('/api/submissions', { json: newApplication(consent) });
    assert.equal(blocked.status, 429);
    assert.match(blocked.data.error, /Zu viele Versuche/);
  });

  test('allow 8 login attempts per hour', async () => {
    await db.sql`DELETE FROM rate_limits`;
    const attacker = new Client(app.base);
    for (let i = 0; i < 8; i++)
      assert.equal(
        (await attacker.json('/api/admin/login', { json: { password: 'guess' + i } })).status,
        401,
      );
    assert.equal(
      (await attacker.json('/api/admin/login', { json: { password: 'guess' } })).status,
      429,
    );
    // Even the right password waits for the next hour.
    assert.equal(
      (
        await new Client(app.base).json('/api/admin/login', {
          json: { password: 'integration-test-password' },
        })
      ).status,
      429,
    );
  });

  test('store only keyed hashes, never IP addresses', async () => {
    const rows = await db.sql`SELECT key FROM rate_limits`;
    assert.ok(rows.length > 0);
    for (const { key } of rows) assert.match(key, /^[0-9a-f]{64}$/);
  });
});

describe('logout and logs', () => {
  test('logout clears the session cookie', async () => {
    await db.sql`DELETE FROM rate_limits`;
    const res = await admin.json('/api/admin/logout', { json: {} });
    assert.equal(res.status, 200);
    const cookie = admin.setCookies.find((c) => c.startsWith('portal_admin='))!;
    assert.match(cookie, /^portal_admin=;/);
    assert.match(cookie, /Max-Age=0/);
    assert.equal(admin.cookie, '');
    assert.equal((await admin.json('/api/admin/settings')).status, 401);
  });

  test('server logs contain no personal data', () => {
    const logs = app.logs();
    for (const secret of ['Öztürk', 'Juergen', 'juergen', 'Schmidt', 'example.org', '1990-05-17'])
      assert.equal(logs.includes(secret), false, secret);
  });
});
