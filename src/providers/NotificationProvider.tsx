import { createContext, useContext, useEffect, useState, PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { useSchedule } from './ScheduleProvider';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, scheduleGameDayNotification } from '../lib/notificationService';

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

  return (
    <NotificationContext.Provider value={{ pushToken, scheduledNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);