// src/hooks/useAppRefresh.ts
//
// The manual refresh flow, shared by the native pull-to-refresh control and the
// web sidebar's refresh button (desktop browsers have no pull gesture).

import { useCallback, useState } from 'react';
import { withTimeout } from '@/src/lib/withTimeout';
import { useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';

export function useAppRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const { refreshRoster } = useRoster();
  const { syncScheduleFromIcal } = useSchedule();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1) Run iCal schedule sync (always), then 2) refresh roster.
      const syncResult = await withTimeout(
        syncScheduleFromIcal({ source: 'manual', showInBanner: true }),
        65000,
        'Schedule sync',
      );
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

  return { refreshing, refresh };
}
