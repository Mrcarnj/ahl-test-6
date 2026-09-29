// src/components/nav/navItems.ts
//
// Single source of truth for the app's primary navigation. The native tab bar
// and the web sidebar/drawer all read from this list so a route can never
// appear in one and be forgotten in the other.

import type { ComponentProps } from 'react';
import { FontAwesome } from '@expo/vector-icons';

export type NavItem = {
  /** Route segment under (protected)/(tabs), also the sidebar's active-state key. */
  name: string;
  label: string;
  icon: ComponentProps<typeof FontAwesome>['name'];
  href: string;
  /** Shown in the native bottom tab bar. */
  native: boolean;
  /** Shown in the web sidebar / drawer. */
  web: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    name: 'home',
    label: 'Home',
    icon: 'home',
    href: '/(protected)/(tabs)/home',
    native: true,
    web: true,
  },
  {
    name: 'calendar',
    label: 'Calendar',
    icon: 'calendar',
    href: '/(protected)/(tabs)/calendar',
    native: true,
    web: true,
  },
  {
    name: 'roster',
    label: 'Roster',
    icon: 'users',
    href: '/(protected)/(tabs)/roster',
    native: true,
    web: true,
  },
  // Rulebook and Situation Book are sidebar links on web. On native they stay
  // reachable as buttons on the home screen, so they are hidden from the tab
  // bar (which only has room for four) but the routes are identical.
  {
    name: 'rulebook',
    label: 'Rulebook',
    icon: 'book',
    href: '/(protected)/(tabs)/rulebook',
    native: false,
    web: true,
  },
  {
    name: 'situation-book',
    label: 'Situation Book',
    icon: 'question-circle',
    href: '/(protected)/(tabs)/situation-book',
    native: false,
    web: true,
  },
  {
    name: 'profile',
    label: 'Profile',
    icon: 'user',
    href: '/(protected)/(tabs)/profile',
    native: true,
    web: true,
  },
];

export const WEB_NAV_ITEMS = NAV_ITEMS.filter((item) => item.web);
