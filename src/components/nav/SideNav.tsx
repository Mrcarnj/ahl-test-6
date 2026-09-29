// src/components/nav/SideNav.tsx
//
// The left-hand menu for the web build. Rendered permanently at wide widths
// and inside a slide-in drawer below the breakpoint, so it takes an
// `onNavigate` callback the drawer uses to close itself after a tap.

import React, { useCallback } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useRoster } from '@/src/providers/RosterProvider';
import { useAppRefresh } from '@/src/hooks/useAppRefresh';
import { useHockeySync } from '@/src/hooks/useHockeySync';
import { WEB_NAV_ITEMS, type NavItem } from './navItems';

// Sized to the widest content: the "Situation Book" menu row (icon + gap +
// label + padding) and the "AHL Officials" brand row. Anything wider is just
// dead space.
export const SIDEBAR_WIDTH = 220;

type SideNavProps = {
  /** Called after a menu item is chosen, so the drawer can dismiss itself. */
  onNavigate?: () => void;
};

/**
 * `/home/AllGames` should still light up the "Home" item, so match on the
 * leading segment rather than the full path.
 */
function isItemActive(pathname: string, item: NavItem) {
  return pathname === `/${item.name}` || pathname.startsWith(`/${item.name}/`);
}

export default function SideNav({ onNavigate }: SideNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { roster } = useRoster();
  const { refreshing, refresh } = useAppRefresh();
  const { formatLastSyncTime } = useHockeySync();
  const lastSync = formatLastSyncTime();

  const handlePress = useCallback(
    (item: NavItem) => {
      router.push(item.href as never);
      onNavigate?.();
    },
    [router, onNavigate],
  );

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image
          source={require('../../../assets/images/ahlLogo.png')}
          style={styles.logo}
        />
        <View style={styles.brandText}>
          <Text style={styles.brandTitle}>AHL Officials</Text>
          {roster?.firstname ? (
            <Text style={styles.brandSubtitle} numberOfLines={1}>
              {roster.firstname} {roster.lastname}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.menu} contentContainerStyle={styles.menuContent}>
        {WEB_NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item);
          return (
            <Pressable
              key={item.name}
              onPress={() => handlePress(item)}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              style={({ hovered, pressed }) => [
                styles.item,
                (hovered || pressed) && styles.itemHovered,
                active && styles.itemActive,
              ]}
            >
              <FontAwesome
                name={item.icon}
                size={18}
                color={active ? '#ff6600' : '#999'}
                style={styles.itemIcon}
              />
              <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Desktop browsers have no pull-to-refresh, so surface it as a button. */}
      <View style={styles.footer}>
        <Pressable
          onPress={refresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh schedule"
          style={({ hovered, pressed }) => [
            styles.refreshButton,
            (hovered || pressed) && !refreshing && styles.itemHovered,
            refreshing && styles.refreshButtonDisabled,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#ff6600" />
          ) : (
            <FontAwesome name="refresh" size={16} color="#ff6600" />
          )}
          <Text style={styles.refreshLabel}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Text>
        </Pressable>
        {/* Relative time, so the column does not have to be wide enough for a
            full locale timestamp. */}
        <Text style={styles.lastSync} numberOfLines={1}>
          {lastSync === 'Never synced' ? 'Never synced' : `Synced ${lastSync}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    // `flex: 1` here would set flex-basis to 0 and let the sidebar grow to fill
    // half the row, overriding the width above. It needs a fixed width that
    // never shrinks, and full height in both the row and the absolute drawer.
    flexShrink: 0,
    height: '100%',
    backgroundColor: '#000',
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  logo: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
  brandText: {
    flex: 1,
  },
  brandTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  brandSubtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  menu: {
    flex: 1,
  },
  menuContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  itemHovered: {
    backgroundColor: '#1a1a1a',
  },
  itemActive: {
    backgroundColor: '#1a1a1a',
  },
  itemIcon: {
    width: 22,
    textAlign: 'center',
  },
  itemLabel: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '600',
  },
  itemLabelActive: {
    color: '#ff6600',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshLabel: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  lastSync: {
    color: '#666',
    fontSize: 11,
    paddingHorizontal: 14,
  },
});
