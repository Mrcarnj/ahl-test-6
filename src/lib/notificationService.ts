import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Schedule } from '../providers/ScheduleProvider';
import { format, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// Configure how notifications should be handled
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(authId: string) {
  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    return;
  }

  // Check if we have permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return;
  }

  try {
    // Get Expo push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PROJECT_ID, // You'll need to add this to your app.config.js
    });

    // Store token in Supabase
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert({
        auth_id: authId,
        push_token: token.data,
        device_type: Platform.OS,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'auth_id, push_token'
      });

    if (error) throw error;

    // Additional setup for iOS
    if (Platform.OS === 'ios') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return token;
  } catch (error) {
    console.error('Error registering push token:', error);
  }
}

export async function scheduleGameDayNotification(game: Schedule) {
  try {
    // Parse game date and time
    const gameDate = parse(game.gamedate, 'yyyy-MM-dd', new Date());
    
    // Create notification date for 8 AM on game day
    const notificationDate = new Date(gameDate);
    notificationDate.setHours(8, 0, 0, 0);

    // Convert to user's timezone
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localNotificationDate = toZonedTime(notificationDate, userTimeZone);

    // Don't schedule if the game is in the past
    if (localNotificationDate < new Date()) return;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "🏒 IT'S GAMEDAY! 🏒",
        body: `${game.gametime} \n${game.awayTeamData?.city} @ ${game.homeTeamData?.city}\n${game.homeTeamData?.arenaname}`,
        data: { gameId: game.gameid },
      },
      trigger: {
        date: localNotificationDate,
      },
    });

    return notificationId;
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
}