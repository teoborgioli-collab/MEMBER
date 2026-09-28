'use client';
import { useEffect, useState } from 'react';
import { fillTemplate } from '../../lib/form-settings';
import type { Status, Submission } from '../../lib/validation';
import { api, ApiError, dateTime, download } from './api';

type Filter = Status | 'all';
type Mail = { clubName: string; subject: string; body: string };
type Action = 'approve' | 'review' | 'reject' | 'sent' | 'delete';

const LABELS: Record<Status, string> = {
  pending: 'Offen',
  approved: 'Angenommen',
  reviewed: 'Abgeglichen',
  rejected: 'Abgelehnt',
};
const FILTERS: [Filter, string][] = [
  ...(Object.entries(LABELS) as [Status, string][]),
  ['all', 'Alle'],
];

const QUESTIONS: Record<Action, string> = {
  delete: 'Diesen Eintrag und alle zugehörigen Angaben unwiderruflich löschen?',
  approve:
    'Aufnahme ist nach der Satzung beschlossen und notwendige Zustimmungen (z. B. bei Minderjährigen) liegen vor?',
  review: 'Identität geprüft und Daten mit dem Mitgliederverzeichnis abgeglichen?',
  sent: 'Hast du die Bestätigung mit dem PDF-Anhang tatsächlich versendet?',
  reject: 'Diesen Antrag ablehnen? Die Person wird dadurch nicht automatisch benachrichtigt.',
};

const DONE: Record<Action, { text: string; filter?: Filter }> = {
  approve: {
    text: 'Aufnahme bestätigt. Unter „Angenommen“ kannst du jetzt das PDF herunterladen und die E-Mail vorbereiten.',
    filter: 'approved',
  },
  review: { text: 'Als abgeglichen markiert.', filter: 'reviewed' },
  reject: { text: 'Abgelehnt. Die Person wird nicht automatisch benachrichtigt.' },
  sent: { text: 'Versand vermerkt.' },
  delete: { text: 'Eintrag gelöscht.' },
};

const day = (value: string) =>
  new Date(value).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
const birthDay = (value: string) => value.split('-').reverse().join('.');
// Keep "@" readable for mail programs; encode everything else.
const mailAddress = (email: string) => email.split('@').map(encodeURIComponent).join('@');
const mailText = (text: string) => encodeURIComponent(text.replace(/\r?\n/g, '\r\n'));

export default function Submissions({
  session,
  onExpired,
}: {
  session: number;
  onExpired: () => void;
}) {
  const [rows, setRows] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [counts, setCounts] = useState<Partial<Record<Status, number>>>({});
  const [mail, setMail] = useState<Mail>({ clubName: '', subject: '', body: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; filter?: Filter } | null>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [working, setWorking] = useState('');

  async function load(append = false) {
    setLoading(true);
    setError('');
    try {
      const data = await api<{
        rows: Submission[];
        hasMore: boolean;
        counts: Partial<Record<Status, number>>;
        mail: Mail;
      }>(`/api/admin/submissions?status=${filter}&offset=${append ? rows.length : 0}`);
      setRows((old) => (append ? [...old, ...data.rows] : data.rows));
      setMore(data.hasMore);
      setCounts(data.counts);
      setMail(data.mail);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, session]);

  async function act(row: Submission, action: Action) {
    if (!window.confirm(QUESTIONS[action])) return;
    setWorking(row.id);
    setError('');
    setNotice(null);
    try {
      await api('/api/admin/submissions/' + row.id, {
        method: 'POST',
        json: { action, confirm: action === 'delete' ? row.id : undefined },
      });
      await load();
      setNotice(DONE[action]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      setError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    } finally {
      setWorking('');
    }
  }

  async function downloadPdf(row: Submission) {
    setWorking(row.id + ':pdf');
    setError('');
    try {
      await download(`/api/admin/submissions/${row.id}/pdf`, 'Mitgliedsbestaetigung.pdf');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      setError(err instanceof Error ? err.message : 'Das PDF konnte nicht erstellt werden.');
    } finally {
      setWorking('');
    }
  }

  function emailDraft(row: Submission) {
    const values = {
      vorname: row.first_name,
      nachname: row.last_name,
      verein: mail.clubName || 'Unser Verein',
    };
    return (
      'mailto:' +
      mailAddress(row.email) +
      '?subject=' +
      mailText(fillTemplate(mail.subject, values)) +
      '&body=' +
      mailText(fillTemplate(mail.body, values))
    );
  }

  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return (
    <>
      <div className="notice">
        Bestehende Mitgliedsdaten und E-Mail-Adressen werden nicht automatisch verifiziert. Bitte
        vor der Übernahme mit dem Mitgliederverzeichnis abgleichen. Bei Minderjährigen erforderliche
        Zustimmungen separat einholen.
      </div>
      <div className="tabs" role="group" aria-label="Einreichungen filtern">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? 'active' : ''}
            aria-pressed={filter === key}
            disabled={loading || !!working}
            onClick={() => {
              setNotice(null);
              setFilter(key);
            }}
          >
            {label} <span className="count">{key === 'all' ? total : (counts[key] ?? 0)}</span>
          </button>
        ))}
        <button onClick={() => load()} disabled={loading || !!working}>
          Aktualisieren
        </button>
      </div>
      {notice && (
        <div className="success-note" role="status">
          <span>{notice.text}</span>
          {notice.filter && notice.filter !== filter && (
            <button
              className="link-button"
              onClick={() => {
                setFilter(notice.filter!);
                setNotice(null);
              }}
            >
              Zu „{notice.filter === 'all' ? 'Alle' : LABELS[notice.filter]}“ wechseln
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Einreichungen werden geladen …</p>}
      {!loading && rows.length === 0 && !error && (
        <div className="form-card admin-empty">
          <h2>Alles im Blick.</h2>
          <p className="muted">In dieser Ansicht liegen keine Einreichungen vor.</p>
        </div>
      )}
      {rows.map((row) => (
        <details className="record" key={row.id}>
          <summary>
            <span>
              <strong>
                {row.first_name} {row.last_name}
              </strong>
              <br />
              <small>
                {row.kind === 'new' ? 'Mitgliedsantrag' : 'Datenaktualisierung'} ·{' '}
                {day(row.created_at)}
              </small>
            </span>
            <span className="pill">{LABELS[row.status]}</span>
          </summary>
          <dl>
            <dt>E-Mail</dt>
            <dd>
              <a href={'mailto:' + mailAddress(row.email)}>{row.email}</a>
            </dd>
            <dt>Geburtsdatum</dt>
            <dd>{birthDay(row.birth_date)}</dd>
            <dt>Eingegangen</dt>
            <dd>{dateTime(row.created_at)}</dd>
            <dt>Vorgangsnummer</dt>
            <dd>{row.id}</dd>
            <dt>Bestätigte Hinweise</dt>
            <dd>
              Version {row.document_version}
              <br />
              <a href={row.privacy_url} target="_blank" rel="noreferrer">
                Datenschutzhinweise
              </a>
              {row.kind === 'new' && (
                <>
                  {' · '}
                  <a href={row.statutes_url} target="_blank" rel="noreferrer">
                    Satzung
                  </a>
                </>
              )}
              {row.acknowledgements?.length > 0 && (
                <ul className="acks">
                  {row.acknowledgements.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              )}
            </dd>
            {row.decided_at && (
              <>
                <dt>Bearbeitet am</dt>
                <dd>{dateTime(row.decided_at)}</dd>
              </>
            )}
            {row.sent_at && (
              <>
                <dt>Versand vermerkt</dt>
                <dd>{dateTime(row.sent_at)}</dd>
              </>
            )}
          </dl>
          {row.status === 'approved' && (
            <div className="notice">
              <strong>Bestätigung versenden</strong>
              <br />
              1. PDF herunterladen. 2. E-Mail-Entwurf öffnen und das PDF selbst anhängen. 3. Aus dem
              Vereinspostfach senden. 4. Versand hier vermerken. Der Entwurf wird nicht automatisch
              versendet.
            </div>
          )}
          <div className="actions">
            {row.status === 'pending' && (
              <>
                <button
                  className="button"
                  disabled={!!working}
                  onClick={() => act(row, row.kind === 'new' ? 'approve' : 'review')}
                >
                  {row.kind === 'new' ? 'Aufnahme bestätigen' : 'Als abgeglichen markieren'}
                </button>
                <button
                  className="button secondary"
                  disabled={!!working}
                  onClick={() => act(row, 'reject')}
                >
                  Ablehnen
                </button>
              </>
            )}
            {row.status === 'approved' && (
              <>
                <button className="button" disabled={!!working} onClick={() => downloadPdf(row)}>
                  {working === row.id + ':pdf' ? 'PDF wird erstellt …' : 'PDF herunterladen'}
                </button>
                <a className="button secondary" href={emailDraft(row)}>
                  E-Mail-Entwurf öffnen
                </a>
                <button
                  className="button secondary"
                  disabled={!!working || !!row.sent_at}
                  onClick={() => act(row, 'sent')}
                >
                  {row.sent_at ? 'Versand vermerkt' : 'Als versendet markieren'}
                </button>
              </>
            )}
            <button
              className="button danger"
              disabled={!!working}
              onClick={() => act(row, 'delete')}
            >
              Eintrag löschen
            </button>
          </div>
        </details>
      ))}
      {more && (
        <button
          className="button secondary load-more"
          disabled={loading}
          onClick={() => load(true)}
        >
          Weitere Einreichungen laden
        </button>
      )}
    </>
  );
}
