// Cloudflare Turnstile (CAPTCHA) for the login form.
//
// The token is checked by Supabase Auth itself (Dashboard -> Authentication ->
// Bot and Abuse Protection, provider Turnstile, with the widget's secret), so
// there is no siteverify call in this codebase. Tokens are single-use: reset
// the widget after every sign-in attempt.
//
// Leave EXPO_PUBLIC_TURNSTILE_SITE_KEY unset to skip the widget (local dev).
// Once CAPTCHA is enabled in Supabase, a build without the key cannot sign in.

export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';
export const TURNSTILE_ACTION = 'login';

/**
 * Page the native WebView loads to render the widget. It is served from the
 * web deployment so the widget runs on a hostname registered with Turnstile.
 */
export const TURNSTILE_PAGE_URL =
  (process.env.EXPO_PUBLIC_SITE_URL || 'https://ahl-officials.expo.app') + '/turnstile.html';

export type TurnstileHandle = { reset: () => void };

export type TurnstileProps = {
  onToken: (token: string | null) => void;
};
