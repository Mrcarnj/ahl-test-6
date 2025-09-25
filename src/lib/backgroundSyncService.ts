// Background Sync Service for Hockey Schedule
// Handles automatic syncing based on app state and time intervals

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { getLastSyncTime, performAutoSync, shouldAutoSync } from './icalHockeySync';

export class BackgroundSyncService {
  private static instance: BackgroundSyncService;
  private appStateSubscription: any = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): BackgroundSyncService {
    if (!BackgroundSyncService.instance) {
      BackgroundSyncService.instance = new BackgroundSyncService();
    }
    return BackgroundSyncService.instance;
  }

  public async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('Initializing background sync service...');
    
    // Set up app state listener
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    
    // Perform initial sync check
    await this.checkAndPerformSync();
    
    this.isInitialized = true;
    console.log('Background sync service initialized');
  }

  public destroy() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.isInitialized = false;
    console.log('Background sync service destroyed');
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log('App state changed to:', nextAppState);
    
    if (nextAppState === 'active') {
      // App became active, check if we should sync
      await this.checkAndPerformSync();
    }
  };

  private async checkAndPerformSync() {
    try {
      const shouldSync = await shouldAutoSync();
      
      if (shouldSync) {
        console.log('Performing background sync...');
        const result = await performAutoSync();
        
        if (result.success && !('skipped' in result && result.skipped)) {
          console.log('Background sync completed successfully');
          await this.logSyncResult(result);
        } else if ('skipped' in result && result.skipped) {
          console.log('Background sync skipped - recent sync found');
        } else {
          const errorMessage = 'error' in result ? result.error : 'Unknown error';
          console.error('Background sync failed:', errorMessage);
          await this.logSyncError(errorMessage);
        }
      } else {
        console.log('Background sync not needed - recent sync found');
      }
    } catch (error) {
      console.error('Background sync check error:', error);
      await this.logSyncError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async logSyncResult(result: any) {
    try {
      const syncLog = {
        timestamp: new Date().toISOString(),
        type: 'success',
        newGames: result.newGames || 0,
        updatedGames: result.updatedGames || 0,
        gamesProcessed: result.gamesProcessed || 0,
      };
      
      await AsyncStorage.setItem('hockey_sync_log', JSON.stringify(syncLog));
    } catch (error) {
      console.error('Error logging sync result:', error);
    }
  }

  private async logSyncError(error: string) {
    try {
      const syncLog = {
        timestamp: new Date().toISOString(),
        type: 'error',
        error: error,
      };
      
      await AsyncStorage.setItem('hockey_sync_log', JSON.stringify(syncLog));
    } catch (logError) {
      console.error('Error logging sync error:', logError);
    }
  }

  public async getLastSyncLog() {
    try {
      const logData = await AsyncStorage.getItem('hockey_sync_log');
      return logData ? JSON.parse(logData) : null;
    } catch (error) {
      console.error('Error getting sync log:', error);
      return null;
    }
  }

  public async forceSync() {
    console.log('Force sync requested...');
    const result = await performAutoSync();
    
    if (result.success) {
      await this.logSyncResult(result);
    } else {
      const errorMessage = 'error' in result ? result.error : 'Unknown error';
      await this.logSyncError(errorMessage);
    }
    
    return result;
  }

  public async getSyncStatus() {
    try {
      const lastSync = await getLastSyncTime();
      const lastLog = await this.getLastSyncLog();
      
      return {
        lastSyncTime: lastSync,
        lastSyncLog: lastLog,
        isInitialized: this.isInitialized,
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        lastSyncTime: null,
        lastSyncLog: null,
        isInitialized: this.isInitialized,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const backgroundSyncService = BackgroundSyncService.getInstance();
