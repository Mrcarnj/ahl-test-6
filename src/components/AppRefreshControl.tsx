import React, { useState, useCallback } from 'react';
import { RefreshControl } from 'react-native';
import { withTimeout } from '@/src/lib/withTimeout';
import { useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';

interface AppRefreshControlProps {
  colors?: string[];
  tintColor?: string;
}

/**
 * A custom RefreshControl component that performs a real refresh of
 * key app data.
 */
export const AppRefreshControl: React.FC<AppRefreshControlProps> = ({ 
  colors = ['#ff6600'], 
  tintColor = '#ff6600' 
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const { refreshRoster } = useRoster();
  const { syncScheduleFromIcal } = useSchedule();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Manual refresh flow:
      // 1) Run iCal schedule sync (always)
      // 2) Refresh roster
      const syncResult = await withTimeout(syncScheduleFromIcal({ source: 'manual', showInBanner: true }), 65000, 'Schedule sync');
      const rosterRes = await withTimeout(refreshRoster(), 15000, 'Roster refresh');

      const errors: string[] = [];
      if (!rosterRes.success) errors.push(rosterRes.error || 'Roster refresh failed');
      if (!syncResult.success) errors.push(syncResult.error || 'Schedule sync failed');

      if (errors.length > 0) {
        console.error('Refresh failed:', errors.join(' | '));
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setRefreshing(false);
    }
  }, [refreshRoster, syncScheduleFromIcal]);

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