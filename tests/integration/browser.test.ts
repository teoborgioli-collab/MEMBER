// End-to-end tests in a real browser (Chrome/Chromium via playwright-core).
// Uses the installed Google Chrome by default; set CHROMIUM_PATH to use another Chromium.
// Screenshots and downloaded PDFs are written to test-results/ for manual review.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import {
  COMPLETE,
  Client,
  PASSWORD,
  ROOT,
  migrate,
  startApp,
  startDatabase,
  type App,
  type Db,
} from './harness';

const OUT = path.join(ROOT, 'test-results');
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

let db: Db;
let app: App;
let browser: Browser | undefined;
let skipReason = '';
const consoleErrors: string[] = [];

before(async () => {
  await mkdir(OUT, { recursive: true });
  try {
    browser = await chromium.launch(
      process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : { channel: 'chrome' },
    );
  } catch (err) {
    skipReason =
      'No browser available – install Google Chrome or set CHROMIUM_PATH. ' +
      String((err as Error).message).split('\n')[0];
    return;
  }
  db = await startDatabase();
  await migrate(db);
  app = await startApp(db);
  const admin = await new Client(app.base).login();
  const current = (await admin.json('/api/admin/settings')).data;
  const saved = await admin.json('/api/admin/settings', {
    method: 'PUT',
    json: { settings: { ...current.settings, ...COMPLETE, portalOpen: true }, revision: 0 },
  });
  assert.equal(saved.status, 200);
});

after(async () => {
  await browser?.close();
  await app?.stop();
  await db?.stop();
});

beforeEach(async () => {
  if (!skipReason) await db.sql`DELETE FROM rate_limits`;
});

/** Like test(), but skipped when no browser could be started. */
function it(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn();
  });
}

async function until(check: () => Promise<boolean>, message: string, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) assert.fail(message);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function open(viewport = DESKTOP): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser!.newContext({
    viewport,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  watch(page);
  return { context, page };
}

function watch(page: Page) {
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => {
    // HTTP errors the UI handles (401, 409, 503 …) are logged by Chrome as resource errors.
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource'))
      consoleErrors.push(msg.text());
  });
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'confirm') void dialog.accept();
  });
}

async function fillPersonalData(page: Page, first = 'Jürgen', last = 'Öztürk') {
  await page.getByLabel('Vorname').fill(first);
  await page.getByLabel('Nachname').fill(last);
  await page.getByLabel('Geburtsdatum').fill('1990-05-17');
  const ascii = first
    .normalize('NFKD')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
  await page.getByLabel('E-Mail-Adresse').fill(`${ascii}@example.org`);
  await page.getByLabel('Telefonnummer').fill('030 1234567');
  await page.getByLabel('Zimmernummer').fill('B 214');
}

async function login(page: Page, route = '/admin') {
  await page.goto(app.base + route);
  await page.getByLabel('Verwaltungspasswort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Abmelden' }).waitFor();
}

const shot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: path.join(OUT, name + '.png'), fullPage });

describe('public form', () => {
  it('an applicant completes the form on a phone', async () => {
    const { context, page } = await open(PHONE);
    await page.goto(app.base + '/');
    await shot(page, 'phone-1-start');
    // Step 1 cannot be skipped with empty fields.
    await page.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    await assert.doesNotReject(page.getByText('Schritt 1 von 2').waitFor());
    await fillPersonalData(page);
    // Phone and room number are required, and the phone number must look like one.
    await page.getByLabel('Telefonnummer').fill('');
    await page.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    assert.equal(await page.getByText('Schritt 1 von 2').count(), 1);
    await page.getByLabel('Telefonnummer').fill('keine');
    assert.equal(
      await page.getByLabel('Telefonnummer').evaluate((el: HTMLInputElement) => el.validity.valid),
      false,
    );
    await page.getByLabel('Telefonnummer').fill('+49 (0)30 123-4567');
    await page.getByLabel('Zimmernummer').fill('');
    await page.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    assert.equal(await page.getByText('Schritt 1 von 2').count(), 1);
    await page.getByLabel('Zimmernummer').fill('B 214');
    await page.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    await page.getByText('Schritt 2 von 2').waitFor();
    assert.equal(
      await page.getByRole('link', { name: /Satzung/ }).getAttribute('href'),
      COMPLETE.statutesUrl,
    );
    // The browser refuses to send without the acknowledgements.
    await page.getByRole('button', { name: /Antrag absenden/ }).click();
    assert.equal(await page.getByText('Dein Antrag ist eingegangen.').count(), 0);
    await shot(page, 'phone-2-acknowledgements');
    await page.getByLabel(/Satzung gelesen/).check();
    await page.getByLabel(/Datenschutzhinweise zur Kenntnis/).check();
    await page.getByLabel(/richtig und aktuell/).check();
    await page.getByRole('button', { name: /Antrag absenden/ }).click();
    await page.getByText('Dein Antrag ist eingegangen.').waitFor();
    assert.match(await page.locator('.reference').innerText(), /^[0-9a-f-]{36}$/);
    await page.getByText(/noch nicht angenommen/).waitFor();
    await shot(page, 'phone-3-received');
    const rows =
      await db.sql`SELECT first_name, kind, phone, room FROM submissions WHERE last_name = 'Öztürk'`;
    assert.deepEqual(
      rows.map((r) => ({ ...r })),
      [{ first_name: 'Jürgen', kind: 'new', phone: '+49 (0)30 123-4567', room: 'B 214' }],
    );
    await context.close();
  });

  it('an existing member updates their data without the statutes step', async () => {
    const { context, page } = await open();
    await page.goto(app.base + '/');
    await page.getByText('Ich bin schon Mitglied').click();
    await fillPersonalData(page, 'Anna', 'Schmidt');
    await page.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    await page.getByText('Deine Datenbestätigung').waitFor();
    assert.equal(await page.getByLabel(/Satzung gelesen/).count(), 0);
    await page.getByLabel(/Datenschutzhinweise zur Kenntnis/).check();
    await page.getByLabel(/richtig und aktuell/).check();
    await shot(page, 'desktop-1-existing-step2');
    await page.getByRole('button', { name: /Angaben übermitteln/ }).click();
    await page.getByText('Deine Angaben sind eingegangen.').waitFor();
    await context.close();
  });

  it('texts changed while filling in must be confirmed again; entered data is kept', async () => {
    const { context, page } = await open();
    await page.goto(app.base + '/');
    await fillPersonalData(page, 'Clara', 'Neumann');
    await page.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    await page.getByLabel(/Satzung gelesen/).check();
    await page.getByLabel(/Datenschutzhinweise zur Kenntnis/).check();
    await page.getByLabel(/richtig und aktuell/).check();
    // Meanwhile the committee changes the privacy acknowledgement.
    const admin = await new Client(app.base).login();
    const current = (await admin.json('/api/admin/settings')).data;
    const newText = 'Ich habe die aktualisierten Datenschutzhinweise gelesen.';
    const saved = await admin.json('/api/admin/settings', {
      method: 'PUT',
      json: {
        settings: { ...current.settings, checkPrivacy: newText },
        revision: current.revision,
      },
    });
    assert.equal(saved.status, 200);
    await page.getByRole('button', { name: /Antrag absenden/ }).click();
    await page.getByText(/Die Hinweise wurden gerade aktualisiert/).waitFor();
    await page.getByText(newText).waitFor();
    assert.equal(await page.getByLabel(newText).isChecked(), false);
    assert.equal(await page.getByLabel(/Satzung gelesen/).isChecked(), false);
    await shot(page, 'desktop-2-reconfirm');
    await page.getByLabel(/Satzung gelesen/).check();
    await page.getByLabel(newText).check();
    await page.getByLabel(/richtig und aktuell/).check();
    await page.getByRole('button', { name: /Antrag absenden/ }).click();
    await page.getByText('Dein Antrag ist eingegangen.').waitFor();
    const [row] =
      await db.sql`SELECT acknowledgements FROM submissions WHERE last_name = 'Neumann'`;
    assert.equal(row.acknowledgements[1], newText);
    await context.close();
  });
});

describe('form editor', () => {
  it('edit texts, preview them, save, and see them live', async () => {
    const { context, page } = await open();
    await login(page, '/admin/formular');
    await page.getByRole('heading', { name: 'Portal-Status' }).waitFor();
    await shot(page, 'desktop-3-editor');
    await page.getByText('Formular · Schritt 1').click();
    const heading = page.locator('#f-form1Heading');
    await heading.waitFor();
    await heading.fill('Schön, dass Sie da sind!');
    await page.getByText('Ungespeicherte Änderungen').waitFor();
    // Preview with the unsaved draft.
    await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Vorschau' });
    await dialog.getByRole('heading', { name: 'Schön, dass Sie da sind!' }).waitFor();
    await dialog.getByRole('button', { name: 'Bestätigung' }).click();
    await dialog.getByText('Dein Antrag ist eingegangen.').waitFor();
    await shot(page, 'desktop-4-preview', false);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    // The public page still shows the saved text until the draft is saved.
    const visitor = await context.newPage();
    watch(visitor);
    await visitor.goto(app.base + '/');
    assert.equal(
      await visitor.getByRole('heading', { name: 'Schön, dass Sie da sind!' }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Gespeichert. Die Änderungen sind jetzt online.').waitFor();
    await page.getByText('Alles gespeichert').waitFor();
    await visitor.reload();
    await visitor.getByRole('heading', { name: 'Schön, dass Sie da sind!' }).waitFor();
    await context.close();
  });

  it('add, reorder and remove additional questions; visitors answer them', async () => {
    const { context, page } = await open();
    await login(page, '/admin/formular');
    await page.getByText('Formular · Schritt 1').click();
    await page.getByRole('button', { name: '+ Frage hinzufügen' }).click();
    const first = page.locator('fieldset.question-card').nth(0);
    await first.getByLabel('Fragetext').fill('Welche Sportart interessiert dich?');
    await first.getByLabel('Antwortart').selectOption('select');
    await first.getByLabel(/Auswahlmöglichkeiten/).fill('Fußball\nTischtennis\nYoga');
    await first.getByLabel('Pflichtfrage').check();
    await page.getByRole('button', { name: '+ Frage hinzufügen' }).click();
    const second = page.locator('fieldset.question-card').nth(1);
    await second.getByLabel('Fragetext').fill('Ich helfe bei Festen mit.');
    await second.getByLabel('Antwortart').selectOption('checkbox');
    await second.getByLabel('Gilt für').selectOption('new');
    await page.getByRole('button', { name: 'Frage 2 nach oben' }).click();
    assert.equal(
      await page.locator('fieldset.question-card').nth(0).getByLabel('Fragetext').inputValue(),
      'Ich helfe bei Festen mit.',
    );
    // A selection list needs two options.
    await page.getByRole('button', { name: '+ Frage hinzufügen' }).click();
    const third = page.locator('fieldset.question-card').nth(2);
    await third.getByLabel('Fragetext').fill('Unvollständig');
    await third.getByLabel('Antwortart').selectOption('select');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText(/Frage 3: Bitte mindestens zwei Auswahlmöglichkeiten/).waitFor();
    await shot(page, 'desktop-5a-questions-editor');
    await third.getByRole('button', { name: 'Entfernen' }).click();
    assert.equal(await page.locator('fieldset.question-card').count(), 2);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Gespeichert. Die Änderungen sind jetzt online.').waitFor();

    const visitor = await context.newPage();
    watch(visitor);
    await visitor.goto(app.base + '/');
    await fillPersonalData(visitor, 'Frida', 'Fragen');
    await visitor.getByLabel('Ich helfe bei Festen mit.').check();
    await visitor.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    assert.equal(await visitor.getByText('Schritt 1 von 2').count(), 1, 'required question');
    await visitor.getByLabel(/Welche Sportart/).selectOption('Yoga');
    await shot(visitor, 'desktop-5b-questions-form');
    await visitor.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    await visitor.getByLabel(/Satzung gelesen/).check();
    await visitor.getByLabel(/Datenschutzhinweise/).check();
    await visitor.getByLabel(/richtig und aktuell/).check();
    await visitor.getByRole('button', { name: /Antrag absenden/ }).click();
    await visitor.getByText('Dein Antrag ist eingegangen.').waitFor();
    const [row] = await db.sql`SELECT answers FROM submissions WHERE last_name = 'Fragen'`;
    assert.deepEqual(
      row.answers.map((a: any) => [a.question, a.answer]),
      [
        ['Ich helfe bei Festen mit.', 'Ja'],
        ['Welche Sportart interessiert dich?', 'Yoga'],
      ],
    );
    // Existing members only see the questions meant for them.
    await visitor.goto(app.base + '/');
    await visitor.getByText('Ich bin schon Mitglied').click();
    await visitor.getByLabel(/Welche Sportart/).waitFor();
    assert.equal(await visitor.getByLabel('Ich helfe bei Festen mit.').count(), 0);

    // Removing the questions again.
    for (let i = 0; i < 2; i++)
      await page
        .locator('fieldset.question-card')
        .first()
        .getByRole('button', { name: 'Entfernen' })
        .click();
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Gespeichert. Die Änderungen sind jetzt online.').waitFor();
    await visitor.goto(app.base + '/');
    assert.equal(await visitor.getByLabel(/Welche Sportart/).count(), 0);
    await context.close();
  });

  it('invalid values are explained next to the field', async () => {
    const { context, page } = await open();
    await login(page, '/admin/formular');
    const link = page.locator('#f-statutesUrl');
    await link.fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Bitte prüfe die markierten Felder.').waitFor();
    await page.getByText(/Bitte einen Pfad wie \/documents\/datei\.pdf/).waitFor();
    assert.equal(await link.getAttribute('aria-invalid'), 'true');
    await shot(page, 'desktop-5-field-error', false);
    await link.fill('/documents/satzung-2026-10.pdf');
    assert.equal(await link.getAttribute('aria-invalid'), null);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Gespeichert. Die Änderungen sind jetzt online.').waitFor();
    await context.close();
  });

  it('unsaved edits survive an expired session', async () => {
    const { context, page } = await open();
    await login(page, '/admin/formular');
    await page.getByText('Eingangsbestätigung').click();
    await page.locator('#f-homeButton').fill('Zurück zum Portal');
    await context.clearCookies();
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Bitte erneut anmelden.').waitFor();
    await page.getByLabel('Verwaltungspasswort').fill(PASSWORD);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    assert.equal(await page.locator('#f-homeButton').inputValue(), 'Zurück zum Portal');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Gespeichert. Die Änderungen sind jetzt online.').waitFor();
    await context.close();
  });

  it('a second editor cannot overwrite newer changes', async () => {
    const { context, page } = await open();
    await login(page, '/admin/formular');
    const other = await context.newPage();
    watch(other);
    await other.goto(app.base + '/admin/formular');
    await other.getByRole('heading', { name: 'Portal-Status' }).waitFor();
    await page.locator('#f-headerNote').fill('Erster Stand');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Gespeichert. Die Änderungen sind jetzt online.').waitFor();
    await other.locator('#f-headerNote').fill('Zweiter Stand');
    await other.getByRole('button', { name: 'Speichern', exact: true }).click();
    await other.getByText(/inzwischen an anderer Stelle gespeichert/).waitFor();
    await other.getByRole('button', { name: 'Neu laden' }).click();
    await until(
      async () => (await other.locator('#f-headerNote').inputValue()) === 'Erster Stand',
      'the second editor reloads the newer texts',
    );
    await context.close();
  });

  it('leaving with unsaved changes asks first', async () => {
    const { context, page } = await open();
    await login(page, '/admin/formular');
    await page.locator('#f-headerNote').fill('Noch nicht gespeichert');
    const dialog = new Promise<string>((resolve) =>
      page.once('dialog', (d) => {
        resolve(d.type());
        void d.dismiss();
      }),
    );
    await page.close({ runBeforeUnload: true });
    assert.equal(await dialog, 'beforeunload');
    await context.close();
  });

  it('closing the portal disables the public form', async () => {
    const { context, page } = await open(PHONE);
    await login(page, '/admin/formular');
    await shot(page, 'phone-4-editor');
    await page.getByRole('switch').uncheck();
    await page.getByText('Geschlossen: Das Formular ist sichtbar').waitFor();
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText(/Das Portal ist geschlossen; Einreichungen sind nicht möglich/).waitFor();
    const visitor = await context.newPage();
    watch(visitor);
    await visitor.goto(app.base + '/');
    await visitor.getByText('Das Portal wird eingerichtet.', { exact: false }).waitFor();
    await fillPersonalData(visitor, 'Dora', 'Zu');
    await visitor.getByRole('button', { name: /Weiter zu den Hinweisen/ }).click();
    assert.equal(await visitor.getByRole('button', { name: /Antrag absenden/ }).isDisabled(), true);
    await page.getByRole('switch').check();
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.getByText('Gespeichert. Die Änderungen sind jetzt online.').waitFor();
    await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
    await shot(page, 'phone-5-preview', false);
    await context.close();
  });
});

describe('processing submissions', () => {
  it('approve, download the PDF, prepare the e-mail, mark as sent, delete', async () => {
    const { context, page } = await open();
    await login(page);
    const record = page.locator('details.record', { hasText: 'Jürgen Öztürk' });
    await record.locator('summary').click();
    await record.getByText('Bestätigte Hinweise').waitFor();
    await record.getByRole('link', { name: '+49 (0)30 123-4567' }).waitFor();
    assert.equal(
      await record.getByRole('link', { name: '+49 (0)30 123-4567' }).getAttribute('href'),
      'tel:+49301234567',
    );
    await record.getByText('B 214').waitFor();
    // Without RESEND_API_KEY (as in this test) the e-mails fail and can be sent again later.
    await record.getByText(/RESEND_API_KEY ist in Vercel nicht gesetzt/).waitFor();
    await record.getByRole('button', { name: 'E-Mails erneut senden' }).click();
    await page.getByText(/E-Mail-Versand fehlgeschlagen/).waitFor();
    await shot(page, 'desktop-6-pending');
    await record.getByRole('button', { name: 'Aufnahme bestätigen' }).click();
    await page.getByText(/Aufnahme bestätigt\./).waitFor();
    await page.getByRole('button', { name: 'Zu „Angenommen“ wechseln' }).click();
    const approved = page.locator('details.record', { hasText: 'Jürgen Öztürk' });
    await approved.locator('summary').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      approved.getByRole('button', { name: 'PDF herunterladen' }).click(),
    ]);
    assert.equal(download.suggestedFilename(), 'Mitgliedsbestaetigung-Juergen-Oeztuerk.pdf');
    const file = path.join(OUT, 'Mitgliedsbestaetigung.pdf');
    await download.saveAs(file);
    assert.equal((await readFile(file)).subarray(0, 5).toString(), '%PDF-');
    const mailto = await approved
      .getByRole('link', { name: 'E-Mail-Entwurf öffnen' })
      .getAttribute('href');
    assert.ok(mailto!.startsWith('mailto:jurgen@example.org?subject='), mailto!);
    const mail = new URL(mailto!);
    assert.equal(
      mail.searchParams.get('subject'),
      `Deine Mitgliedsbestätigung – ${COMPLETE.clubName}`,
    );
    assert.match(mail.searchParams.get('body')!, /^Hallo Jürgen,\r\n\r\n/);
    await approved.getByRole('button', { name: 'Als versendet markieren' }).click();
    await page.getByText('Versand vermerkt.').waitFor();
    await shot(page, 'desktop-7-approved');
    await approved.getByRole('button', { name: 'Eintrag löschen' }).click();
    await page.getByText('Eintrag gelöscht.').waitFor();
    await until(
      async () =>
        (await page.locator('details.record', { hasText: 'Jürgen Öztürk' }).count()) === 0,
      'the deleted record disappears from the list',
    );
    await context.close();
  });

  it('exports the list as CSV with phone, room and answers', async () => {
    const { context, page } = await open();
    await login(page);
    await page
      .getByRole('button', { name: 'Zu „Alle“ wechseln' })
      .click()
      .catch(() => {});
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export (CSV)' }).click(),
    ]);
    assert.match(download.suggestedFilename(), /\.csv$/);
    const file = path.join(OUT, 'Export.csv');
    await download.saveAs(file);
    const text = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
    assert.match(text.split('\r\n')[0], /;Telefon;Zimmernummer;/);
    assert.match(text, /;Anna;Schmidt;17\.05\.1990;anna@example\.org;030 1234567;B 214;/);
    await context.close();
  });

  it('the admin list works on a phone', async () => {
    const { context, page } = await open(PHONE);
    await login(page);
    await page.locator('details.record').first().locator('summary').click();
    await shot(page, 'phone-6-admin-list');
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.getByText('Willkommen zurück.').waitFor();
    await page.goto(app.base + '/admin');
    await page.getByText('Willkommen zurück.').waitFor();
    await context.close();
  });

  it('no script errors on any page', () => {
    assert.deepEqual(consoleErrors, []);
  });
});
