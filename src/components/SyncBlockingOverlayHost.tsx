import React, { useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useSchedule } from '@/src/providers/ScheduleProvider';

/**
 * A "splash-like" blocking overlay shown during initial/long-absence schedule sync,
 * to prevent flashing stale/empty DB data before the schedule sync finishes.
 *
 * Note: iOS/Android OS splash screens cannot be shown again when returning from background,
 * so we use an in-app overlay instead.
 */
export default function SyncBlockingOverlayHost() {
  const { blockingOverlayVisible, scheduleSyncStatus } = useSchedule();

  const text = useMemo(() => {
    if (scheduleSyncStatus.status === 'running') return 'Loading latest schedule…';
    return 'Loading…';
  }, [scheduleSyncStatus.status]);

  if (!blockingOverlayVisible) return null;

  const showComplete = scheduleSyncStatus.status === 'success';
  const newGames = scheduleSyncStatus.newGames ?? 0;
  const updatedGames = scheduleSyncStatus.updatedGames ?? 0;

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color="#ff6600" />
      <Text style={styles.title}>{text}</Text>
      {showComplete && (
        <Text style={styles.completeText}>
          Schedule Sync complete — New: {newGames}, Updated: {updatedGames}
        </Text>
      )}
      <Text style={styles.subtitle}>Please wait</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 30,
    borderRadius: 30,
  },
  title: {
    marginTop: 16,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  completeText: {
    marginTop: 10,
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    color: '#bbb',
    fontSize: 13,
    textAlign: 'center',
  },
});


