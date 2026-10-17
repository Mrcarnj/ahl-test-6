// src/components/nav/WebShell.tsx
//
// Chrome for the web build: a permanent left sidebar at desktop widths, and a
// header + slide-in drawer below SIDEBAR_BREAKPOINT. Only ever rendered from
// `.web.tsx` layouts, so the native app never pays for it.

import React, { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { CONTENT_MAX_WIDTH, useResponsive } from '@/src/lib/platform';
import { WEB_NAV_ITEMS } from './navItems';
import SideNav, { SIDEBAR_WIDTH } from './SideNav';

/** Title for the mobile-web header, derived from the active route. */
function useRouteTitle() {
  const pathname = usePathname();
  const match = WEB_NAV_ITEMS.find(
    (item) => pathname === `/${item.name}` || pathname.startsWith(`/${item.name}/`),
  );
  return match?.label ?? 'AHL Officials';
}

export default function WebShell({ children }: PropsWithChildren) {
  const { isWideLayout } = useResponsive();
  const pathname = usePathname();
  const title = useRouteTitle();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Navigating away (including via browser back) should never leave the drawer
  // hanging open over the new screen.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Resizing past the breakpoint hands control back to the permanent sidebar.
  useEffect(() => {
    if (isWideLayout) setDrawerOpen(false);
  }, [isWideLayout]);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: drawerOpen ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, slide]);

  if (isWideLayout) {
    return (
      <View style={styles.wideRoot}>
        <SideNav />
        <View style={styles.content}>
          <View style={styles.contentInner}>{children}</View>
        </View>
      </View>
    );
  }

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-SIDEBAR_WIDTH, 0],
  });

  return (
    <View style={styles.compactRoot}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setDrawerOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={drawerOpen ? 'Close menu' : 'Open menu'}
          style={({ hovered, pressed }) => [
            styles.menuButton,
            (hovered || pressed) && styles.menuButtonActive,
          ]}
        >
          <FontAwesome name={drawerOpen ? 'close' : 'bars'} size={20} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.contentInner}>{children}</View>
      </View>

      {drawerOpen && (
        <Pressable
          style={styles.scrim}
          onPress={closeDrawer}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
      )}
      <Animated.View
        style={[styles.drawer, { transform: [{ translateX }] }]}
        // Keep the off-screen drawer out of the tab order and screen readers.
        pointerEvents={drawerOpen ? 'auto' : 'none'}
        aria-hidden={!drawerOpen}
      >
        <SideNav onNavigate={closeDrawer} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wideRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  compactRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  // The outer box fills the remaining space. It must NOT use alignSelf here:
  // wideRoot is a row, so the cross axis is vertical and `alignSelf: 'center'`
  // would drop the default stretch and collapse this to zero height.
  content: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#000',
  },
  // Centring happens one level in, where the parent is a column and the cross
  // axis is horizontal. Keeps line lengths readable on an ultrawide monitor.
  contentInner: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    paddingHorizontal: 12,
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  menuButtonActive: {
    backgroundColor: '#1a1a1a',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
});
