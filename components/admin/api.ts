// Small fetch helpers for the admin screens: German messages for network failures and
// tolerant JSON parsing (a proxy error page must not surface as a cryptic parse error).

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, any> = {},
  ) {
    super(message);
  }
}

export async function api<T = Record<string, any>>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      ...rest,
      ...(json === undefined
        ? {}
        : {
            body: JSON.stringify(json),
            headers: { 'Content-Type': 'application/json', ...rest.headers },
          }),
    });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      res.status,
      data.error || 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.',
      data,
    );
  return data as T;
}

// The ASCII name (e.g. Mitgliedsbestaetigung-Juergen-Oeztuerk.pdf) is preferred: browsers and
// mail programs handle it reliably, while non-ASCII names can fall back to "download".
function fileName(disposition: string | null, fallback: string) {
  const ascii = disposition?.match(/filename="([^"]+)"/i)?.[1];
  if (ascii) return ascii;
  const utf8 = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {}
  }
  return fallback;
}

/** Downloads a file via fetch so errors can be shown in the page instead of as raw JSON. */
export async function download(
  url: string,
  fallbackName: string,
  init: RequestInit & { json?: unknown } = {},
) {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      ...rest,
      ...(json === undefined
        ? {}
        : { body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } }),
    });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || 'Die Datei konnte nicht erstellt werden.', data);
  }
  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName(res.headers.get('content-disposition'), fallbackName);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export const dateTime = (value: string) =>
  new Date(value).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
