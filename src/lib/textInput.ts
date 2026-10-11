// Cleaning for free text typed into the app before it is saved.
//
// Supabase sends values as parameters, never spliced into SQL, and React
// renders text as text (no HTML), so the job here is not escaping. It is
// stripping characters that have no business in a title or a note: control
// characters (NULs, escape sequences) and invisible bidi overrides, which can
// make a title display as something other than what was stored. The DB checks
// in sql/2026-10-11_text_input_checks.sql enforce the same rules for any
// client that skips this.

// C0/C1 controls and DEL, except tab and newline (kept for multi-line notes).
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Bidi embeddings/overrides/isolates, zero-width chars and the BOM.
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** A one-line field (title, URL): no line breaks, trimmed. */
export function cleanSingleLine(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    .trim();
}

/** A multi-line field (notes): line breaks kept, at most two in a row, trimmed. */
export function cleanMultiLine(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The only feed the app syncs from. The Cloudflare proxy enforces the same
// prefix (cloudflare-worker/ical-proxy.js), and so does the DB.
export const ICAL_URL_PREFIX = 'https://www.horizonwebref.com/syncICS';

export function isValidIcalUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith(ICAL_URL_PREFIX) && u.length <= 2048 && !/\s/.test(u);
}
