// src/lib/platform.ts
//
// Small platform/layout helpers shared by the native app and the web build.
// Keeping these in one place means screens branch on intent ("is this a wide
// layout?") rather than re-deriving Platform checks and breakpoints inline.

import { Platform, useWindowDimensions } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isNative = !isWeb;

/** True on any iPad, whatever its window size. */
export const isPad = Platform.OS === 'ios' && Platform.isPad;

/**
 * Narrowest window that gets the iPad split layout. The app is locked to
 * landscape on iPad (`UISupportedInterfaceOrientations~ipad` in app.json), and
 * the smallest iPad is ~1130pt wide that way; a narrower window means Stage
 * Manager or a resizable window, which gets the phone layout instead.
 */
export const TABLET_MIN_WIDTH = 900;

/**
 * Width at which the web build swaps the slide-in drawer for a permanent
 * sidebar. Matches the tablet-portrait breakpoint used by the content
 * max-width below so the two never disagree.
 */
export const SIDEBAR_BREAKPOINT = 900;

/** Width of the web build's permanent sidebar (`components/nav/SideNav`). */
export const SIDEBAR_WIDTH = 220;

/**
 * Keeps page content from stretching across an ultrawide monitor. Wide enough
 * for the iPad layouts at a 13" iPad's landscape width (1366pt), which the web
 * build draws too.
 */
export const CONTENT_MAX_WIDTH = 1366;

/**
 * Max width for a centred form column (login, change password, iCal setup).
 * Below this the layout is full-bleed, so phones are unaffected.
 */
export const FORM_MAX_WIDTH = 420;

/** Max width for a column of body text, e.g. the terms of service. */
export const READING_MAX_WIDTH = 720;

export type Responsive = {
  /** True only on web at >= SIDEBAR_BREAKPOINT: render the permanent sidebar. */
  isWideLayout: boolean;
  /** True on native, and on web below the breakpoint: use the drawer/tab bar. */
  isCompactLayout: boolean;
  width: number;
  height: number;
};

/**
 * True when a screen should draw its iPad layout (home's four-sector view).
 * The web build draws it too, once the content column beside the sidebar is as
 * wide as an iPad's window would need to be. Re-renders on window resize, so a
 * narrowed window falls back to the phone layout.
 */
export function useTabletLayout(): boolean {
  const { width } = useWindowDimensions();
  if (isWeb) {
    const content = width >= SIDEBAR_BREAKPOINT ? width - SIDEBAR_WIDTH : width;
    return Math.min(content, CONTENT_MAX_WIDTH) >= TABLET_MIN_WIDTH;
  }
  return isPad && width >= TABLET_MIN_WIDTH;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isWideLayout = isWeb && width >= SIDEBAR_BREAKPOINT;

  return { isWideLayout, isCompactLayout: !isWideLayout, width, height };
}
