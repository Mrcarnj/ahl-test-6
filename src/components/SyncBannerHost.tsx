import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSchedule } from '@/src/providers/ScheduleProvider';

export default function SyncBannerHost() {
  const { syncingSchedule, syncingStats, syncingStandings, scheduleSyncStatus } = useSchedule();
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (scheduleSyncStatus.status === 'success' || scheduleSyncStatus.status === 'error') {
      setShowResult(true);
      const t = setTimeout(() => setShowResult(false), 5000);
      return () => clearTimeout(t);
    }
    // Hide any old result as soon as a new run starts or we return to idle.
    setShowResult(false);
    return;
  }, [scheduleSyncStatus.status, scheduleSyncStatus.finishedAt]);

  const banner = useMemo(() => {
    // Only show the banner when the last sync explicitly opted into showing it
    // (manual pull-to-refresh on calendar).
    if (!scheduleSyncStatus.showInBanner) return null;

    // Schedule has priority because it's the key user-facing data.
    if (scheduleSyncStatus.status === 'running' || syncingSchedule) {
      return { tone: 'info' as const, text: 'Schedule Sync in progress…' };
    }

    if (showResult && (scheduleSyncStatus.status === 'success' || scheduleSyncStatus.status === 'error')) {
      if (scheduleSyncStatus.status === 'success') {
        const n = scheduleSyncStatus.newGames ?? 0;
        const u = scheduleSyncStatus.updatedGames ?? 0;
        return { tone: 'success' as const, text: `Schedule Sync complete — New: ${n}, Updated: ${u}` };
      }
      return { tone: 'error' as const, text: `Schedule Sync failed — ${scheduleSyncStatus.error || 'Unknown error'}` };
    }

    if (syncingStats) {
      return { tone: 'info' as const, text: 'Stats Sync in progress…' };
    }
    if (syncingStandings) {
      return { tone: 'info' as const, text: 'Standings Sync in progress…' };
    }

    return null;
  }, [scheduleSyncStatus, syncingSchedule, syncingStats, syncingStandings, showResult]);

  if (!banner) return null;

  const toneStyle =
    banner.tone === 'success' ? styles.pillSuccess :
    banner.tone === 'error' ? styles.pillError :
    styles.pillInfo;

  // On screens where this is mounted (Calendar), the header already accounts for safe area.
  // Adding insets.top here pushes the banner too far down.
  return (
    <View style={styles.wrapper}>
      <View style={[styles.pill, toneStyle]}>
        <Text style={styles.text} numberOfLines={1}>{banner.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },
  pill: {
    maxWidth: '92%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillInfo: {
    backgroundColor: '#0b2239',
    borderColor: '#3b82f6',
  },
  pillSuccess: {
    backgroundColor: '#12361f',
    borderColor: '#22c55e',
  },
  pillError: {
    backgroundColor: '#3b0f12',
    borderColor: '#ef4444',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});


