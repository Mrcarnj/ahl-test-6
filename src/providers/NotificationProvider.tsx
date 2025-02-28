import { createContext, useContext, useEffect, useState, PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { useSchedule } from './ScheduleProvider';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, scheduleGameDayNotification } from '../lib/notificationService';
import { DeviceEventEmitter } from 'react-native';

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
        router.push(`/(protected)/home/${gameId}`);
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
    
    console.log('🔄 Setting up app refresh listener in NotificationProvider...');
    
    const appRefreshListener = DeviceEventEmitter.addListener('appRefresh', async () => {
      console.log('📱 App refresh event received in NotificationProvider, rescheduling notifications...');
      
      // We don't need to do anything here as notifications will be rescheduled
      // when myGames updates from the ScheduleProvider refresh
      console.log('ℹ️ Notifications will be rescheduled when game data refreshes');
    });
    
    return () => {
      console.log('🧹 Cleaning up app refresh listener in NotificationProvider...');
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