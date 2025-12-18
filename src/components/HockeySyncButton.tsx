import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { fetchAndParseHockeySchedule, getLastSyncTime } from '../lib/icalHockeySync';

interface HockeySyncButtonProps {
  onSyncComplete?: (result: any) => void;
  style?: any;
  textStyle?: any;
  showLastSync?: boolean;
}

export const HockeySyncButton: React.FC<HockeySyncButtonProps> = ({
  onSyncComplete,
  style,
  textStyle,
  showLastSync = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    loadLastSyncTime();
  }, []);

  const loadLastSyncTime = async () => {
    try {
      const lastSync = await getLastSyncTime();
      if (lastSync) {
        setLastSyncTime(lastSync.toLocaleString());
      }
    } catch (error) {
      console.error('Error loading last sync time:', error);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    
    try {
      const result = await fetchAndParseHockeySchedule(false);
      
      if (result.success) {
        // Reload from persisted storage to keep a single source of truth across the app
        await loadLastSyncTime();
        
        // Show success message
        Alert.alert(
          'Sync Complete',
          `Successfully synced ${result.gamesProcessed} games.\n` +
          `New: ${result.newGames}, Updated: ${result.updatedGames}`,
          [{ text: 'OK' }]
        );
        
        // Call completion callback
        if (onSyncComplete) {
          onSyncComplete(result);
        }
      } else {
        Alert.alert(
          'Sync Failed',
          `Error: ${result.error}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert(
        'Sync Error',
        'An unexpected error occurred during sync.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };


  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never synced';
    return `Last sync: ${lastSyncTime}`;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.syncButton, style, isLoading && styles.syncButtonDisabled]}
        onPress={handleSync}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.syncButtonText, textStyle]}>
            Sync Hockey Schedule
          </Text>
        )}
      </TouchableOpacity>
      
      {showLastSync && (
        <Text style={styles.lastSyncText}>
          {formatLastSync()}
        </Text>
      )}
      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 8,
  },
  syncButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    backgroundColor: '#999',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  lastSyncText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default HockeySyncButton;
