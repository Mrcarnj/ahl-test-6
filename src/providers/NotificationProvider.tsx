import { format } from 'date-fns';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { registerForPushNotificationsAsync, scheduleGameDayNotification } from '../lib/notificationService';
import { performAutoSync } from '../lib/icalHockeySync';
import { APP_REFRESH_EVENT, CLIPS_UPLOADED_EVENT, SCHEDULE_CHANGES_EVENT } from '../lib/events';
import { type Clip, clipAlertText, formatGameShort } from '../lib/clips';
import { useAuth } from './AuthProvider';
import { useSchedule } from './ScheduleProvider';
import { useRoster } from './RosterProvider';
import { isWeb } from '../lib/platform';
import GameChangeAlert, { GameChangeAlertData } from '../components/GameChangeAlert';
import { buildScheduleChangeAlerts } from '../lib/scheduleChangeAlerts';
import type { ScheduleChanges } from '../lib/scheduleChanges';

// A game change can reach this device twice: as a push (sent by whichever
// device synced it) and through the schedule diff after the next load. Within
// this window, whichever arrives second doesn't pop up again — compared per
// changed field, so a different change to the same game still shows.
const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;

const GAME_DAY_REMINDER_LIMIT = 30;

// Which diff fields a push covers, read from its `changes` text
// (e.g. `gametime: "19:00:00-04" → "19:30:00-04", referee2: "..." → "..."`).
function pushedFields(changes: unknown): string[] {
  const text = typeof changes === 'string' ? changes : '';
  const fields: string[] = [];
  if (/\bgametime:/.test(text)) fields.push('time');
  if (/\breferee\d:/.test(text)) fields.push('referees');
  if (/\blinesperson\d:/.test(text)) fields.push('linespersons');
  return fields;
}

type RecentAlerts = Map<string, number>; // `${gameId}|${field}` -> when shown

const clipsHref = (scheduleId: string | number) => `/(protected)/(tabs)/clips/game/${scheduleId}`;

/** One pop-up per game: the clip itself if there's one, a count if several. */
function buildClipAlerts(clips: Clip[]): GameChangeAlertData[] {
  const byGame = new Map<number, Clip[]>();
  clips.forEach(c => byGame.set(c.schedule_id, [...(byGame.get(c.schedule_id) ?? []), c]));
  return [...byGame.entries()].map(([scheduleId, list]) => {
    const { title, body } = list.length === 1
      ? clipAlertText(list[0])
      : { title: '🎬 New Clips', body: `${list.length} new clips were uploaded to ${formatGameShort(list[0].game)}.` };
    return {
      title,
      body,
      key: `clips:${list.map(c => c.id).sort().join(',')}`,
      dismissLabel: 'Close',
      action: { label: 'Go to Clips', href: clipsHref(scheduleId) },
    };
  });
}

function coveredRecently(recent: RecentAlerts, gameId: string, fields: string[]): boolean {
  const now = Date.now();
  return fields.length > 0 && fields.every(f => {
    const at = recent.get(`${gameId}|${f}`);
    return at !== undefined && now - at < RECENT_ALERT_WINDOW_MS;
  });
}

function remember(recent: RecentAlerts, gameId: string, fields: string[]) {
  const now = Date.now();
  for (const [key, at] of recent) {
    if (now - at >= RECENT_ALERT_WINDOW_MS) recent.delete(key);
  }
  fields.forEach(f => recent.set(`${gameId}|${f}`, now));
}

type NotificationContextType = {
  pushToken: string | null;
  scheduledNotifications: string[];
};

const NotificationContext = createContext<NotificationContextType>({
  pushToken: null,
  scheduledNotifications: [],
});

export function NotificationProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { myGames } = useSchedule();
  const { isAhlAdmin } = useRoster();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [scheduledNotifications, setScheduledNotifications] = useState<string[]>([]);
  // Game changes that arrived while the app was open, shown one at a time.
  const [alertQueue, setAlertQueue] = useState<GameChangeAlertData[]>([]);
  // Game changes recently shown from a push, and from the schedule diff.
  const pushAlertsRef = useRef<RecentAlerts>(new Map());
  const diffAlertsRef = useRef<RecentAlerts>(new Map());
  // Clip ids already shown this session, from a push or from ClipsProvider.
  const shownClipIdsRef = useRef<Set<string>>(new Set());

  const dismissAlert = useCallback(() => {
    setAlertQueue(queue => queue.slice(1));
  }, []);

  const viewCrew = useCallback((gameId: string) => {
    setAlertQueue(queue => queue.slice(1));
    router.push(`/(protected)/game/${gameId}`);
  }, []);

  const runAlertAction = useCallback((href: string) => {
    setAlertQueue(queue => queue.slice(1));
    router.push(href as never);
  }, []);

  useEffect(() => {
    // The web build has no push token and no local notification scheduling;
    // game changes still arrive live over the Supabase Realtime subscription.
    if (isWeb) return;

    if (user?.id) {
      registerForPushNotificationsAsync(user.id).then(token => {
        if (token) {
          setPushToken(token.data);
        }
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (isWeb) return;

    // Handle notifications when app is in foreground or background
    // This listener fires for all notifications, regardless of app state
    // When a notification with content-available: 1 is received:
    // - iOS: App is woken briefly in background to process the notification
    // - Android: Notification is processed when received
    const notificationSubscription = Notifications.addNotificationReceivedListener(async notification => {
      const appState = AppState.currentState;
      console.log(`📱 Received notification (app state: ${appState}):`, notification);
      const data = notification.request.content.data;
      console.log('📱 Notification data:', data);
      
      // The OS banner is suppressed for these while the app is open (see the
      // handler in notificationService); show the blocking pop-up instead.
      if (data?.type === 'game_change' && data?.gameId) {
        const { title, body } = notification.request.content;
        const gameId = String(data.gameId);
        const next: GameChangeAlertData = {
          title: title ?? 'Game Change',
          body: body ?? '',
          gameId,
        };
        const fields = pushedFields(data.changes);
        // The same change can be pushed more than once (the syncing device
        // and every open crew member's realtime listener both send it), so
        // don't stack identical pop-ups — nor repeat one the schedule diff
        // already showed.
        if (!coveredRecently(diffAlertsRef.current, gameId, fields)) {
          remember(pushAlertsRef.current, gameId, fields);
          setAlertQueue(queue =>
            queue.some(a => a.gameId === next.gameId && a.body === next.body) ? queue : [...queue, next]
          );
        }
      }

      // A crew member's clip. Realtime usually gets here first while the app
      // is open; whichever arrives second is dropped by clip id.
      if (data?.type === 'clip_uploaded' && data?.clipId && data?.scheduleId) {
        const clipId = String(data.clipId);
        if (!shownClipIdsRef.current.has(clipId)) {
          shownClipIdsRef.current.add(clipId);
          const { title, body } = notification.request.content;
          setAlertQueue(queue => [...queue, {
            title: title ?? '🎬 New Clip',
            body: body ?? '',
            key: `clips:${clipId}`,
            dismissLabel: 'Close',
            action: { label: 'Go to Clips', href: clipsHref(String(data.scheduleId)) },
          }]);
        }
        return;
      }

      // Check if this is a game change notification (older pushes carry only
      // a gameId). The local game-day reminder also has a gameId but changes
      // nothing, so it doesn't trigger a sync.
      if (data?.type === 'game_change' || (data?.gameId && data?.type !== 'game_day')) {
        console.log('🔄 Game change notification received, triggering sync...');
        console.log(`📱 App state: ${appState} - ${appState === 'background' ? 'Background sync triggered' : 'Foreground sync triggered'}`);
        
        // Trigger sync when game change notification is received
        // This works in both foreground and background (when app is woken by content-available)
        // Note: On iOS, background processing is limited to ~30 seconds
        try {
          const result = await performAutoSync();
          
          if (result.success) {
            console.log('✅ Sync completed after notification');
            if ('newGames' in result) {
              console.log(`📊 New games: ${result.newGames}, Updated games: ${result.updatedGames}`);
            }
            // Emit event to refresh schedule data in providers
            DeviceEventEmitter.emit(APP_REFRESH_EVENT, { source: 'notification', gameId: data?.gameId });
          } else {
            const errorMsg = 'error' in result ? result.error : 'Unknown error';
            console.error('❌ Sync failed after notification:', errorMsg);
          }
        } catch (error) {
          console.error('❌ Error syncing after notification:', error);
        }
      }
      
    });

    // Handle notification response (when user taps notification)
    // This fires when user taps the notification, whether app is in foreground or background
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('📱 Notification tapped:', response);
      const data = response.notification.request.content.data;
      if (data?.type === 'clip_uploaded' && data?.scheduleId) {
        if (data.clipId) shownClipIdsRef.current.add(String(data.clipId));
        router.push(clipsHref(String(data.scheduleId)) as never);
        return;
      }
      const gameId = data?.gameId;
      
      if (gameId) {
        console.log(`📱 Navigating to game ${gameId}`);
        // Navigate to the game page
        router.push(`/(protected)/game/${gameId}`);
      } else {
        console.log('📱 No gameId in notification data');
      }
    });

    return () => {
      notificationSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // Games added / changed / removed that a schedule load found (see
  // ScheduleProvider's change detection). Works on web too — no push needed.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SCHEDULE_CHANGES_EVENT, (changes: ScheduleChanges) => {
      // Skip updates a push pop-up already covered in full.
      const updated = changes.updated.filter(
        u => !coveredRecently(pushAlertsRef.current, String(u.after.gameid), u.fields)
      );
      updated.forEach(u => remember(diffAlertsRef.current, String(u.after.gameid), u.fields));
      const alerts = buildScheduleChangeAlerts({ ...changes, updated });
      if (alerts.length > 0) {
        setAlertQueue(queue => [...queue, ...alerts]);
      }
    });
    return () => sub.remove();
  }, []);

  // Clips a crew member uploaded to one of this official's games.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CLIPS_UPLOADED_EVENT, (clips: Clip[]) => {
      const fresh = clips.filter(c => !shownClipIdsRef.current.has(c.id));
      if (fresh.length === 0) return;
      fresh.forEach(c => shownClipIdsRef.current.add(c.id));
      const alerts = buildClipAlerts(fresh);
      setAlertQueue(queue => [...queue, ...alerts.filter(a => !queue.some(q => q.key === a.key))]);
    });
    return () => sub.remove();
  }, []);

  // 8 AM "It's gameday" reminders for upcoming games. myGames is replaced on
  // every schedule load, so only rebuild when the upcoming games actually
  // differ, and never run two rebuilds at once. An ahlAdmin's myGames is every
  // game in the league, none of them theirs, so they get no reminders.
  const gameDaySignatureRef = useRef<string | null>(null);
  const gameDayRunRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (isWeb || isAhlAdmin || myGames.length === 0) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const upcoming = myGames
      .filter(g => g.id > 0 && g.gamedate >= today)
      .sort((a, b) => a.gamedate.localeCompare(b.gamedate))
      // iOS keeps at most 64 pending local notifications.
      .slice(0, GAME_DAY_REMINDER_LIMIT);
    const signature = upcoming
      .map(g => [g.gameid, g.gamedate, g.gametime, g.awayteam, g.hometeam, g.homeTeamData?.arenaname].join('|'))
      .join(';');
    if (signature === gameDaySignatureRef.current) return;
    gameDaySignatureRef.current = signature;

    gameDayRunRef.current = gameDayRunRef.current.then(async () => {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        const ids: string[] = [];
        for (const game of upcoming) {
          const id = await scheduleGameDayNotification(game);
          if (id) ids.push(id);
        }
        setScheduledNotifications(ids);
      } catch (e) {
        console.error('❌ NOTIFICATION: Scheduling game-day reminders failed:', e);
        gameDaySignatureRef.current = null;
      }
    });
  }, [myGames, isAhlAdmin]);

  // Listen for app refresh events to reschedule notifications
  useEffect(() => {
    if (!user?.id) return;
    
    console.log('🔄 NOTIFICATION: Setting up app refresh listener...');
    
    const appRefreshListener = DeviceEventEmitter.addListener(APP_REFRESH_EVENT, async (data) => {
      console.log('📱 NOTIFICATION: App refresh event received - ' + new Date().toISOString(), data);
      
      // We don't need to do anything here as notifications will be rescheduled
      // when myGames updates from the ScheduleProvider refresh
      console.log('ℹ️ NOTIFICATION: Notifications will be rescheduled when game data refreshes');
    });
    
    return () => {
      console.log('🧹 NOTIFICATION: Cleaning up app refresh listener...');
      appRefreshListener.remove();
    };
  }, [user?.id]);

  return (
    <NotificationContext.Provider value={{ pushToken, scheduledNotifications }}>
      {children}
      <GameChangeAlert
        alert={alertQueue[0] ?? null}
        onDismiss={dismissAlert}
        onViewCrew={viewCrew}
        onAction={runAlertAction}
      />
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);