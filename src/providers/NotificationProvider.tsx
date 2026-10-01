import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { registerForPushNotificationsAsync, scheduleGameDayNotification } from '../lib/notificationService';
import { performAutoSync } from '../lib/icalHockeySync';
import { APP_REFRESH_EVENT, SCHEDULE_CHANGES_EVENT } from '../lib/events';
import { useAuth } from './AuthProvider';
import { useSchedule } from './ScheduleProvider';
import { isWeb } from '../lib/platform';
import GameChangeAlert, { GameChangeAlertData } from '../components/GameChangeAlert';
import { buildScheduleChangeAlerts } from '../lib/scheduleChangeAlerts';
import type { ScheduleChanges } from '../lib/scheduleChanges';

// A game change can reach this device twice: as a push (sent by whichever
// device synced it) and through the schedule diff after the next load. Within
// this window, whichever arrives second doesn't pop up again — compared per
// changed field, so a different change to the same game still shows.
const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;

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
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [scheduledNotifications, setScheduledNotifications] = useState<string[]>([]);
  // Game changes that arrived while the app was open, shown one at a time.
  const [alertQueue, setAlertQueue] = useState<GameChangeAlertData[]>([]);
  // Game changes recently shown from a push, and from the schedule diff.
  const pushAlertsRef = useRef<RecentAlerts>(new Map());
  const diffAlertsRef = useRef<RecentAlerts>(new Map());

  const dismissAlert = useCallback(() => {
    setAlertQueue(queue => queue.slice(1));
  }, []);

  const viewCrew = useCallback((gameId: string) => {
    setAlertQueue(queue => queue.slice(1));
    router.push(`/(protected)/game/${gameId}`);
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

      // Check if this is a game change notification
      if (data?.type === 'game_change' || data?.gameId) {
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

  useEffect(() => {
    const scheduleNotifications = async () => {
      // Cancel all existing notifications first
      await Notifications.cancelAllScheduledNotificationsAsync();
      const newScheduledIds: string[] = [];

      // Schedule new notifications for upcoming games
      for (const game of myGames) {
        const notificationId = await scheduleGameDayNotification(game);
        if (notificationId) {
          newScheduledIds.push(notificationId);
        }
      }

      setScheduledNotifications(newScheduledIds);
    };

    if (!isWeb && myGames.length > 0) {
      scheduleNotifications();
    }
  }, [myGames]);

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
      <GameChangeAlert alert={alertQueue[0] ?? null} onDismiss={dismissAlert} onViewCrew={viewCrew} />
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);