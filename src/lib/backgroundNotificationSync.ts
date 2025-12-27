// Background Notification Sync Handler
// Handles syncing game data when notifications are received in the background

import * as TaskManager from 'expo-task-manager';
import { performAutoSync } from './icalHockeySync';
import { supabase } from './supabase';

const BACKGROUND_NOTIFICATION_SYNC_TASK = 'background-notification-sync';

// Define the background task handler
TaskManager.defineTask(BACKGROUND_NOTIFICATION_SYNC_TASK, async ({ data, error, executionInfo }) => {
  if (error) {
    console.error('❌ Background notification sync task error:', error);
    return;
  }

  try {
    console.log('🔄 Background notification sync task started');
    console.log('📱 Task data:', data);
    console.log('📱 Execution info:', executionInfo);

    // Check if we have a user session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      console.log('⏭️ No user session found, skipping sync');
      return;
    }

    // Check if this is a game change notification
    const notificationData = data as any;
    if (notificationData?.type === 'game_change' || notificationData?.gameId) {
      console.log('📱 Game change notification detected, triggering sync...');
      
      // Perform the sync
      const result = await performAutoSync();
      
      if (result.success) {
        console.log('✅ Background sync completed successfully');
        if ('newGames' in result) {
          console.log(`📊 New games: ${result.newGames}, Updated games: ${result.updatedGames}`);
        }
      } else {
        const errorMsg = 'error' in result ? result.error : 'Unknown error';
        console.error('❌ Background sync failed:', errorMsg);
      }
    } else {
      console.log('ℹ️ Not a game change notification, skipping sync');
    }
  } catch (error) {
    console.error('❌ Error in background notification sync task:', error);
  }
});

export { BACKGROUND_NOTIFICATION_SYNC_TASK };




