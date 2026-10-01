import { parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { Alert } from '@/src/lib/alert';
import { supabase } from '../lib/supabase';
import { Schedule } from '../providers/ScheduleProvider';
// Import background task handler to register it
import '../lib/backgroundNotificationSync';

// Configure how notifications should be handled
// This handler processes notifications in both foreground and background
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log('📱 Notification handler processing notification:', notification.request.identifier);
    const data = notification.request.content.data;
    
    // If this is a game change notification with content-available, 
    // the app will be woken in background to process it
    if (data?.type === 'game_change' || data?.gameId) {
      console.log('🔄 Game change notification detected in handler');
    }
    
    // A game change that arrives while the app is open is shown as a blocking
    // in-app pop-up (NotificationProvider), so skip the OS banner for it.
    // When the app is closed or backgrounded this handler is not consulted and
    // the OS shows its normal banner; tapping it opens the game.
    const isGameChange = data?.type === 'game_change';
    return {
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: !isGameChange,
      shouldShowAlert: !isGameChange,
      shouldShowList: true,
    };
  },
});

// Set up notification categories for iOS and channels for Android
async function setupNotificationCategories() {
  // Categories/channels are native-only; on web the call just throws.
  if (Platform.OS === 'web') return;
  try {
    // Define notification category for game changes (iOS)
    await Notifications.setNotificationCategoryAsync('GAME_CHANGE', [
      {
        identifier: 'VIEW_GAME',
        buttonTitle: 'View Game',
        options: { opensAppToForeground: true },
      },
    ], {
      intentIdentifiers: [],
      previewPlaceholder: 'Game change notification',
      categorySummaryFormat: '%u more game changes',
    });
    
    // Set up Android notification channel for game changes
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('game_changes', {
        name: 'Game Changes',
        description: 'Notifications for game assignment and time changes',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
    
    console.log('✅ Notification categories and channels set up successfully');
  } catch (error) {
    console.error('Error setting up notification categories:', error);
  }
}

// Initialize notification categories and channels on module load
setupNotificationCategories();

export async function registerForPushNotificationsAsync(authId: string) {
  console.log('📱 Starting push notification registration for user:', authId);
  
  if (!Device.isDevice) {
    console.log('❌ Must use physical device for Push Notifications');
    return;
  }

  // Check if we have permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('📱 Current notification permission status:', existingStatus);
  
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    console.log('📱 Requesting notification permissions...');
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log('📱 Permission request result:', status);
  } else {
    console.log('✅ Notifications already enabled');
  }

  if (finalStatus !== 'granted') {
    console.log('❌ Failed to get notification permission. Status:', finalStatus);
    return;
  }

  try {
    // Get Expo push token
    console.log('📱 Getting Expo push token...');
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'd1103638-3c9e-4c41-8846-38a4a1486029', // Your EAS project ID
    });

    console.log('✅ Push token received:', token.data.substring(0, 50) + '...');

    // Store token in Supabase
    console.log('📱 Storing push token in Supabase...');
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

    if (error) {
      console.error('❌ Error storing push token:', error);
      throw error;
    }

    console.log('✅ Push token stored successfully in database');

    // Note: Notification channels are set up in setupNotificationCategories()
    // which runs on module load, so they should already be available

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
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: localNotificationDate },
    });

    return notificationId;
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
}

export async function sendGameChangeNotification(
  gameId: string,
  season: string,
  gameData: {
    awayteam: string;
    hometeam: string;
    gamedate: string;
    gametime: string;
  },
  changes: string[],
  replacedPerson?: string
) {
  try {
    console.log(`📱 Sending game change notification for ${gameId}...`);
    
    // Get all people assigned to this game (excluding the replaced person)
    const assignedPeople = await getGameAssignments(gameId, season, replacedPerson);
    
    if (assignedPeople.length === 0) {
      console.log(`📱 No other people assigned to game ${gameId}, skipping notification`);
      return;
    }
    
    // Check if this is a time change notification
    const timeChanges = changes.filter(change => change.startsWith('gametime:'));
    const isTimeChange = timeChanges.length > 0;
    
    // Format date as MM/DD/YYYY
    const formattedDate = formatGameDate(gameData.gamedate);
    
    // Format time as readable format with timezone
    const formattedTime = formatGameTime(gameData.gametime);
    
    let title: string;
    let body: string;
    
    // Prepare changes text for all scenarios
    const changesText = changes.join(', ');
    
    if (isTimeChange) {
      // Special format for time changes
      title = "🚨 Game Time Change 🚨";
      
      // Extract old and new times from the change string
      const timeChange = timeChanges[0]; // Take the first time change
      const timeMatch = timeChange.match(/gametime: "([^"]+)" → "([^"]+)"/);
      
      if (timeMatch) {
        const oldTime = formatGameTime(timeMatch[1]);
        const newTime = formatGameTime(timeMatch[2]);
        const gameInfo = `${gameData.awayteam} @ ${gameData.hometeam}`;
        
        body = `The game time for ${formattedDate} ${gameId} ${gameInfo} has changed from ${oldTime} to ${newTime}`;
      } else {
        // Fallback if parsing fails
        body = `The game time for ${formattedDate} ${gameId} (${gameData.awayteam} @ ${gameData.hometeam}) has changed. ${timeChanges.join(', ')}`;
      }
    } else {
      // Standard format for official changes
      title = "🏒 Game Assignment Change";
      const gameInfo = `${gameData.awayteam} @ ${gameData.hometeam}`;
      
      body = `One of your teammates has changed on game ${gameId} (${gameInfo}) ${formattedDate} ${formattedTime}. ${changesText}`;
    }
    
    console.log(`📱 Notification: ${title} - ${body}`);
    
    // Get push tokens for all assigned people
    const { data: pushTokens, error } = await supabase
      .from('user_push_tokens')
      .select('push_token')
      .in('auth_id', assignedPeople.map(person => person.auth_id));
    
    if (error) {
      console.error('Error fetching push tokens:', error);
      return;
    }
    
    // For testing in simulator, use local notifications if no push tokens
    if (!pushTokens || pushTokens.length === 0) {
      console.log(`📱 No push tokens found for assigned people on game ${gameId}`);
      console.log(`📱 Sending local notification for testing...`);
      
      // Send local notification for testing with expandable content
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          // iOS category for expandable notifications
          categoryIdentifier: 'GAME_CHANGE',
          // Android channel
          ...(Platform.OS === 'android' && {
            android: {
              channelId: 'game_changes',
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
          }),
          data: { 
            gameId, 
            type: 'game_change',
            changes: changesText,
            fullMessage: body, // Store full message for expansion
          },
        },
        trigger: null, // Show immediately
      });
      
      console.log(`📱 Local notification sent for game ${gameId}`);
      return;
    }
    
    // Send push notifications with expandable content
    // Format according to Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
    const messages = pushTokens.map(token => ({
      to: token.push_token,
      sound: 'default',
      title,
      body,
      // iOS-specific: category for expandable notifications
      categoryId: 'GAME_CHANGE',
      // Ensure notification appears even when app is in background
      priority: 'high',
      // iOS: content-available wakes the app in background to process the notification
      // This allows the app to sync data when notification is received
      'content-available': 1,
      // Android-specific configuration
      android: {
        channelId: 'game_changes',
        priority: 'high',
        // BigTextStyle for expandable notifications on Android
        // Note: Expo handles this automatically when body is long enough
        sound: 'default',
        vibrate: [0, 250, 250, 250],
      },
      data: { 
        gameId, 
        type: 'game_change',
        changes: changesText,
        fullMessage: body, // Store full message for expansion
        isTimeChange: isTimeChange.toString(),
        // Include task name to trigger background sync
        taskName: 'background-notification-sync',
      },
    }));
    
    // Send via Expo Push API
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    
    const result = await response.json();
    console.log(`📱 Push notification result for game ${gameId}:`, result);
    
  } catch (error) {
    console.error('Error sending game change notification:', error);
  }
}

async function getGameAssignments(gameId: string, season: string, excludePerson?: string) {
  try {
    // Get the game data to find all assigned people
    const { data: game, error } = await supabase
      .from('schedule')
      .select('referee1, referee2, linesperson1, linesperson2')
      .eq('gameid', gameId)
      .eq('season', season)
      .single();
    
    if (error || !game) {
      console.error('Error fetching game assignments:', error);
      return [];
    }
    
    // Collect all assigned people (excluding nulls and the replaced person)
    const assignedPeople = [
      game.referee1,
      game.referee2, 
      game.linesperson1,
      game.linesperson2
    ].filter(person => person && person !== excludePerson);
    
    // Get roster data for these people to get their auth_id
    const { data: rosterData, error: rosterError } = await supabase
      .from('roster')
      .select('auth_id, lastfirstfullname')
      .in('lastfirstfullname', assignedPeople);
    
    if (rosterError) {
      console.error('Error fetching roster data:', rosterError);
      return [];
    }
    
    return rosterData || [];
    
  } catch (error) {
    console.error('Error getting game assignments:', error);
    return [];
  }
}

function formatGameDate(dateString: string): string {
  try {
    // Input format: YYYY-MM-DD
    // Output format: MM/DD/YYYY
    const [year, month, day] = dateString.split('-');
    return `${month}/${day}/${year}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString; // Return original if formatting fails
  }
}

function formatGameTime(timeString: string): string {
  try {
    // Input format: HH:MM:SS-TZ (e.g., "16:00:00-08")
    // Output format: H:MM AM/PM TZ (e.g., "4:00 PM PST")
    
    const [timePart, tzPart] = timeString.split(/([+-]\d{2})$/);
    const [hours, minutes] = timePart.split(':');
    
    const hour24 = parseInt(hours, 10);
    const minute = parseInt(minutes, 10);
    
    // Convert to 12-hour format
    let hour12 = hour24;
    let period = 'AM';
    
    if (hour24 === 0) {
      hour12 = 12;
    } else if (hour24 === 12) {
      period = 'PM';
    } else if (hour24 > 12) {
      hour12 = hour24 - 12;
      period = 'PM';
    }
    
    // Format timezone
    let timezone = 'PST'; // Default
    if (tzPart) {
      const tzOffset = parseInt(tzPart, 10);
      if (tzOffset === -8) {
        timezone = 'PST';
      } else if (tzOffset === -7) {
        timezone = 'MST';
      } else if (tzOffset === -6) {
        timezone = 'CST';
      } else if (tzOffset === -5) {
        timezone = 'EST';
      } else if (tzOffset === -4) {
        timezone = 'EDT';
      } else if (tzOffset === 0) {
        timezone = 'UTC';
      } else {
        timezone = `UTC${tzOffset > 0 ? '+' : ''}${tzOffset}`;
      }
    }
    
    return `${hour12}:${minute.toString().padStart(2, '0')} ${period} ${timezone}`;
    
  } catch (error) {
    console.error('Error formatting time:', error);
    return timeString; // Return original if formatting fails
  }
}

// Function to check background refresh status (iOS only)
export async function checkBackgroundRefreshStatus(): Promise<{
  available: boolean;
  needsSettings: boolean;
  message?: string;
}> {
  if (Platform.OS !== 'ios') {
    // Android doesn't have this restriction for push notifications
    return { available: true, needsSettings: false };
  }

  try {
    const status = await BackgroundFetch.getStatusAsync();
    
    switch (status) {
      case BackgroundFetch.BackgroundFetchStatus.Available:
        return { available: true, needsSettings: false };
      
      case BackgroundFetch.BackgroundFetchStatus.Restricted:
      case BackgroundFetch.BackgroundFetchStatus.Denied:
        return {
          available: false,
          needsSettings: true,
          message: 'Background App Refresh is disabled. Please enable it in Settings > AHL Officials > Background App Refresh to receive notifications when the app is closed.',
        };
      
      default:
        return { available: false, needsSettings: false };
    }
  } catch (error) {
    console.error('Error checking background refresh status:', error);
    return { available: false, needsSettings: false };
  }
}

// Function to open app settings (iOS) or notification settings (Android)
export async function openAppSettings() {
  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  } catch (error) {
    console.error('Error opening settings:', error);
    Alert.alert(
      'Open Settings',
      'Please go to Settings > AHL Officials to enable Background App Refresh and Notifications.',
    );
  }
}

// Function to manually trigger notification permission request with background refresh check
export async function requestNotificationPermissions(authId: string) {
  console.log('🔔 Manually requesting notification permissions...');
  
  try {
    // First, request notification permissions
    const result = await registerForPushNotificationsAsync(authId);
    
    if (result) {
      console.log('✅ Notification permissions granted and token registered');
      
      // Check background refresh status (iOS)
      if (Platform.OS === 'ios') {
        const bgStatus = await checkBackgroundRefreshStatus();
        
        if (bgStatus.needsSettings) {
          Alert.alert(
            'Background App Refresh Recommended',
            bgStatus.message || 'To receive notifications when the app is closed, please enable Background App Refresh in Settings.',
            [
              {
                text: 'Later',
                style: 'cancel',
              },
              {
                text: 'Open Settings',
                onPress: () => openAppSettings(),
              },
            ],
          );
        }
      }
      
      return result;
    } else {
      console.log('❌ Notification permissions denied or failed');
      Alert.alert(
        'Notifications Disabled',
        'To receive game change notifications, please enable notifications in Settings.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Open Settings',
            onPress: () => openAppSettings(),
          },
        ],
      );
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error requesting notification permissions:', error);
    return null;
  }
}
