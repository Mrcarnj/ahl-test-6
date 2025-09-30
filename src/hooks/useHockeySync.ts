// Custom hook for hockey schedule sync functionality
// Provides easy access to sync operations and status

import { useEffect, useState } from 'react';
import { backgroundSyncService } from '../lib/backgroundSyncService';
import { fetchAndParseHockeySchedule } from '../lib/icalHockeySync';
import { useAuth } from '../providers/AuthProvider';

export interface SyncStatus {
  lastSyncTime: Date | null;
  lastSyncLog: any;
  isInitialized: boolean;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  gamesProcessed?: number;
  newGames?: number;
  updatedGames?: number;
  skippedGames?: number;
  error?: string;
  skipped?: boolean;
}

export function useHockeySync() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    lastSyncLog: null,
    isInitialized: false,
  });

  useEffect(() => {
    // Initialize background sync service
    backgroundSyncService.initialize();
    
    // Load initial sync status
    loadSyncStatus();
    
    return () => {
      // Cleanup on unmount
      backgroundSyncService.destroy();
    };
  }, []);

  const loadSyncStatus = async () => {
    try {
      const status = await backgroundSyncService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Error loading sync status:', error);
      setSyncStatus(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  };

  const performSync = async (): Promise<SyncResult> => {
    setIsLoading(true);
    
    try {
      const result = await fetchAndParseHockeySchedule(false, user?.id as any);
      
      if (result.success) {
        // Refresh sync status after successful sync
        await loadSyncStatus();
      }
      
      return result;
    } catch (error) {
      console.error('Sync error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const performTestSync = async (): Promise<SyncResult> => {
    setIsLoading(true);
    
    try {
      const result = await fetchAndParseHockeySchedule(true, user?.id as any);
      return result;
    } catch (error) {
      console.error('Test sync error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const forceBackgroundSync = async (): Promise<SyncResult> => {
    setIsLoading(true);
    
    try {
      const result = await backgroundSyncService.forceSync();
      
      if (result.success) {
        // Refresh sync status after successful sync
        await loadSyncStatus();
      }
      
      return result;
    } catch (error) {
      console.error('Force sync error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSyncStatus = async () => {
    await loadSyncStatus();
  };

  const formatLastSyncTime = (): string => {
    if (!syncStatus.lastSyncTime) {
      return 'Never synced';
    }
    
    const now = new Date();
    const lastSync = syncStatus.lastSyncTime;
    const diffMs = now.getTime() - lastSync.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
  };

  const getSyncStatusText = (): string => {
    if (syncStatus.error) {
      return `Error: ${syncStatus.error}`;
    }
    
    if (!syncStatus.isInitialized) {
      return 'Initializing...';
    }
    
    return formatLastSyncTime();
  };

  return {
    // State
    isLoading,
    syncStatus,
    
    // Actions
    performSync,
    performTestSync,
    forceBackgroundSync,
    refreshSyncStatus,
    
    // Helpers
    formatLastSyncTime,
    getSyncStatusText,
  };
}
