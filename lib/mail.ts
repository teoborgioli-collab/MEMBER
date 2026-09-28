// E-mail via Resend (https://resend.com). Server-side only; the API key is an environment variable.

export const DEFAULT_FROM = 'SSV Potsdamer Straße <info@ssvpotsdamerstr.de>';
export const DEFAULT_CLUB_INBOX = 'info@ssvpotsdamerstr.de';

export function mailConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = (env.RESEND_API_KEY ?? '').trim();
  return {
    configured: apiKey !== '',
    apiKey,
    from: (env.MAIL_FROM ?? '').trim() || DEFAULT_FROM,
    clubInbox: (env.CLUB_NOTIFY_EMAIL ?? '').trim() || DEFAULT_CLUB_INBOX,
    // Only overridden by the automated tests.
    apiUrl: ((env.RESEND_API_URL ?? '').trim() || 'https://api.resend.com').replace(/\/+$/, ''),
  };
}

/** A failed send. `code` is short and contains no personal data, so it can be logged and stored. */
export class MailError extends Error {
  constructor(public code: string) {
    super('E-mail failed: ' + code);
  }
}

export type Mail = {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
  /** Resend ignores a repeated request with the same key for 24 hours (no duplicate e-mails). */
  idempotencyKey: string;
  /** Optional PDF attachment sent through the Resend API. */
  attachments?: { filename: string; content: string }[];
};

export async function sendMail(mail: Mail) {
  const config = mailConfig();
  if (!config.configured) throw new MailError('NO_API_KEY');
  let res: Response;
  try {
    res = await fetch(config.apiUrl + '/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': mail.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        headers: { 'Auto-Submitted': 'auto-generated' },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new MailError((err as Error)?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { name?: unknown };
    const name =
      typeof data.name === 'string' ? data.name.replace(/[^a-z_]/gi, '').slice(0, 40) : '';
    throw new MailError(`HTTP_${res.status}${name ? '_' + name : ''}`);
  }
}

/** Explains a stored error code to the admin. */
export function mailErrorMessage(code: string) {
  if (code.includes('NO_API_KEY')) return 'RESEND_API_KEY ist in Vercel nicht gesetzt.';
  if (/HTTP_40[13]/.test(code))
    return 'Resend hat den Zugang abgelehnt (API-Schlüssel oder Absender-Domain prüfen).';
  if (/HTTP_422|validation/.test(code))
    return 'Resend hat die Nachricht abgelehnt (Absenderadresse, Domain oder Empfängeradresse prüfen).';
  if (/HTTP_429|LIMIT/.test(code)) return 'Versandlimit erreicht – bitte später erneut senden.';
  if (/TIMEOUT|NETWORK|HTTP_5/.test(code))
    return 'Resend war nicht erreichbar – bitte später erneut senden.';
  return 'Versand fehlgeschlagen.';
}
