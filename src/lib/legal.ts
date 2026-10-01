// Public legal pages, linked from Profile and the sign-in screen.
//
// These point at the static pages shipped with the web build (public/*.html,
// text in docs/legal/). To host them on Notion instead, swap in the Notion
// page URLs here -- nothing else references them.
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || 'https://ahl-test-6.expo.app';

export const PRIVACY_POLICY_URL = `${SITE_URL}/privacy.html`;
export const TERMS_OF_SERVICE_URL = `${SITE_URL}/terms.html`;
