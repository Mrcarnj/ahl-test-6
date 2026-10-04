import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSchedule } from '@/src/providers/ScheduleProvider';

export default function SyncBannerHost() {
  const { syncingSchedule, syncingStats, syncingStandings, scheduleSyncStatus, statsSyncStatus } = useSchedule();
  const [showResult, setShowResult] = useState(false);
  const [showStatsResult, setShowStatsResult] = useState(false);

  useEffect(() => {
    if (statsSyncStatus.status === 'success' || statsSyncStatus.status === 'error') {
      setShowStatsResult(true);
      const t = setTimeout(() => setShowStatsResult(false), statsSyncStatus.status === 'error' ? 8000 : 4000);
      return () => clearTimeout(t);
    }
    setShowStatsResult(false);
    return;
  }, [statsSyncStatus.status, statsSyncStatus.finishedAt]);

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
    // Schedule status only shows when the sync opted in (manual refresh), and
    // has priority because it's the key user-facing data.
    if (scheduleSyncStatus.showInBanner) {
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
    }

    // Stats/standings show on every run, including the nightly one in the
    // background, and clear themselves shortly after finishing.
    if (syncingStats) {
      return { tone: 'info' as const, text: 'Updating player stats & rosters…' };
    }
    if (syncingStandings) {
      return { tone: 'info' as const, text: 'Updating standings…' };
    }
    if (showStatsResult) {
      if (statsSyncStatus.status === 'success') {
        return { tone: 'success' as const, text: 'Stats & standings updated' };
      }
      if (statsSyncStatus.status === 'error') {
        return { tone: 'error' as const, text: `Stats update failed — ${statsSyncStatus.error || 'Unknown error'}` };
      }
    }

    return null;
  }, [scheduleSyncStatus, statsSyncStatus, syncingSchedule, syncingStats, syncingStandings, showResult, showStatsResult]);

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


