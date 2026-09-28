'use client';
import { useRef, useState } from 'react';
import { api } from './admin/api';
import Submissions from './admin/Submissions';
import SettingsEditor from './admin/SettingsEditor';

type View = 'submissions' | 'form';

const HEADINGS: Record<View, [string, string]> = {
  submissions: ['Einreichungen.', 'Prüfen, entscheiden und persönlich bestätigen.'],
  form: [
    'Formular bearbeiten.',
    'Texte, Links und Status des Portals. Nach dem Speichern sind Änderungen sofort online.',
  ],
};

export default function Admin({ authenticated, view }: { authenticated: boolean; view: View }) {
  const [logged, setLogged] = useState(authenticated);
  // Once shown, the view stays mounted behind the login form when the session expires,
  // so unsaved edits survive a re-login.
  const [mounted, setMounted] = useState(authenticated);
  const [session, setSession] = useState(0);
  const [error, setError] = useState('');
  const dirty = useRef(false);

  async function logout() {
    if (dirty.current && !window.confirm('Ungespeicherte Änderungen verwerfen und abmelden?'))
      return;
    setError('');
    try {
      await api('/api/admin/logout', { method: 'POST', json: {} });
      dirty.current = false;
      setLogged(false);
      setMounted(false);
    } catch {
      setError('Abmelden fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  const [title, subtitle] = HEADINGS[view];
  return (
    <>
      {!logged && (
        <Login
          expired={mounted}
          onSuccess={() => {
            setLogged(true);
            setMounted(true);
            setSession((n) => n + 1);
          }}
        />
      )}
      {mounted && (
        <main className="admin" hidden={!logged}>
          <div className="admin-top">
            <div>
              <span className="eyebrow">VEREINSVERWALTUNG</span>
              <h1>{title}</h1>
              <p className="muted">{subtitle}</p>
            </div>
            <button className="button secondary" onClick={logout}>
              Abmelden
            </button>
          </div>
          <nav className="admin-nav" aria-label="Verwaltung">
            <a href="/admin" aria-current={view === 'submissions' ? 'page' : undefined}>
              Einreichungen
            </a>
            <a href="/admin/formular" aria-current={view === 'form' ? 'page' : undefined}>
              Formular bearbeiten
            </a>
            <a href="/" target="_blank" rel="noreferrer">
              Portal ansehen <span aria-hidden="true">↗</span>
            </a>
          </nav>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {view === 'form' ? (
            <SettingsEditor onExpired={() => setLogged(false)} dirtyRef={dirty} />
          ) : (
            <Submissions session={session} onExpired={() => setLogged(false)} />
          )}
        </main>
      )}
    </>
  );
}

function Login({ expired, onSuccess }: { expired: boolean; onSuccess: () => void }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError('');
    try {
      await api('/api/admin/login', {
        method: 'POST',
        json: { password: new FormData(form).get('password') },
      });
      form.reset();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="admin">
      <section className="form-card login">
        <span className="eyebrow">VEREINSVERWALTUNG</span>
        <h2>{expired ? 'Bitte erneut anmelden.' : 'Willkommen zurück.'}</h2>
        <p className="muted">
          {expired
            ? 'Deine Sitzung ist abgelaufen. Nicht gespeicherte Änderungen bleiben erhalten.'
            : 'Melde dich an, um Einreichungen zu prüfen und das Formular zu bearbeiten.'}
        </p>
        <form onSubmit={submit}>
          <label>
            Verwaltungspasswort
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={256}
              autoFocus={expired}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button full" disabled={loading}>
            {loading ? 'Anmeldung …' : 'Anmelden'} <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
