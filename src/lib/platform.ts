// src/lib/platform.ts
//
// Small platform/layout helpers shared by the native app and the web build.
// Keeping these in one place means screens branch on intent ("is this a wide
// layout?") rather than re-deriving Platform checks and breakpoints inline.

import { Platform, useWindowDimensions } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isNative = !isWeb;

/**
 * Width at which the web build swaps the slide-in drawer for a permanent
 * sidebar. Matches the tablet-portrait breakpoint used by the content
 * max-width below so the two never disagree.
 */
export const SIDEBAR_BREAKPOINT = 900;

/** Keeps page content readable instead of stretching across an ultrawide monitor. */
export const CONTENT_MAX_WIDTH = 1100;

export type Responsive = {
  /** True only on web at >= SIDEBAR_BREAKPOINT: render the permanent sidebar. */
  isWideLayout: boolean;
  /** True on native, and on web below the breakpoint: use the drawer/tab bar. */
  isCompactLayout: boolean;
  width: number;
  height: number;
};

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isWideLayout = isWeb && width >= SIDEBAR_BREAKPOINT;

  return { isWideLayout, isCompactLayout: !isWideLayout, width, height };
}
