export interface SyncResult {
  success: boolean;
  newGames?: number;
  updatedGames?: number;
  skippedGames?: number;
  gamesProcessed?: number;
  skipped?: boolean;
  error?: string;
  testOutput?: unknown[];
}

export interface SyncStorageKeys {
  LAST_SYNC: string;
  SYNC_COUNT: string;
  LAST_ERROR: string;
}

export declare const SYNC_STORAGE_KEYS: SyncStorageKeys;

export declare function fetchAndParseHockeySchedule(
  testMode?: boolean,
  userId?: string | null
): Promise<SyncResult>;

export declare function getLastSyncTime(): Promise<Date | null>;

export declare function setLastSyncTime(): Promise<void>;

export declare function shouldAutoSync(): Promise<boolean>;

export declare function performAutoSync(): Promise<SyncResult>;
