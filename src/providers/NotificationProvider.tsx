import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { registerForPushNotificationsAsync, scheduleGameDayNotification } from '../lib/notificationService';
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
    // Handle notifications when app is foregrounded
    const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Received notification:', notification);
    });

    // Handle notification response (when user taps notification)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const gameId = response.notification.request.content.data?.gameId;
      if (gameId) {
        router.push(`/(protected)/game/${gameId}`);
      }
    });

    return () => {
      foregroundSubscription.remove();
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
    
    const appRefreshListener = DeviceEventEmitter.addListener('appRefresh', async (data) => {
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