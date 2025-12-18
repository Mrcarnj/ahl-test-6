import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { registerForPushNotificationsAsync, scheduleGameDayNotification } from '../lib/notificationService';
import { performAutoSync } from '../lib/icalHockeySync';
import { APP_REFRESH_EVENT } from '../lib/events';
import { useAuth } from './AuthProvider';
import { useSchedule } from './ScheduleProvider';

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

  useEffect(() => {
    if (user?.id) {
      registerForPushNotificationsAsync(user.id).then(token => {
        if (token) {
          setPushToken(token.data);
        }
      });
    }
  }, [user?.id]);

  useEffect(() => {
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
      
      // The notification will automatically show as a banner
      // On iOS: User can pull down to expand and see full message
      // On Android: User can tap to expand and see full message (BigTextStyle)
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

    if (myGames.length > 0) {
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
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);