import React, { useState, useCallback } from 'react';
import { RefreshControl } from 'react-native';
import { emitSyncToast } from '@/src/lib/syncToast';
import { useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';

interface AppRefreshControlProps {
  colors?: string[];
  tintColor?: string;
}

/**
 * A custom RefreshControl component that performs a real refresh of
 * key app data and shows a success/failure cue via the global SyncToast.
 */
export const AppRefreshControl: React.FC<AppRefreshControlProps> = ({ 
  colors = ['#ff6600'], 
  tintColor = '#ff6600' 
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const { refreshRoster } = useRoster();
  const { refreshSchedule } = useSchedule();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    emitSyncToast({ type: 'info', message: 'Refreshing…' });

    try {
      const [rosterRes, scheduleRes] = await Promise.all([
        refreshRoster(),
        refreshSchedule(),
      ]);

      const errors: string[] = [];
      if (!rosterRes.success) errors.push(rosterRes.error || 'Roster refresh failed');
      if (!scheduleRes.success) errors.push(scheduleRes.error || 'Schedule refresh failed');

      if (errors.length > 0) {
        emitSyncToast({
          type: 'error',
          message: 'Refresh failed',
          detail: errors.join('\n'),
        });
      } else {
        emitSyncToast({ type: 'success', message: 'Refresh complete' });
      }
    } catch (e) {
      emitSyncToast({
        type: 'error',
        message: 'Refresh failed',
        detail: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setRefreshing(false);
    }
  }, [refreshRoster, refreshSchedule]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={colors}
      tintColor={tintColor}
    />
  );
};

export default AppRefreshControl; 