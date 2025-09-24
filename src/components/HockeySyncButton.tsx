import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  View,
} from 'react-native';
import { fetchAndParseHockeySchedule, getLastSyncTime } from '../lib/icalHockeySync';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        // Update last sync time display
        setLastSyncTime(new Date().toLocaleString());
        
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

  const handleTestSync = async () => {
    setIsLoading(true);
    
    try {
      const result = await fetchAndParseHockeySchedule(true);
      
      if (result.success) {
        console.log('Test sync result:', result.testOutput);
        Alert.alert(
          'Test Sync Complete',
          `Parsed ${result.testOutput?.length || 0} games. Check console for details.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Test Sync Failed',
          `Error: ${result.error}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Test sync error:', error);
      Alert.alert(
        'Test Sync Error',
        'An unexpected error occurred during test sync.',
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
      
      <TouchableOpacity
        style={[styles.testButton, isLoading && styles.testButtonDisabled]}
        onPress={handleTestSync}
        disabled={isLoading}
      >
        <Text style={styles.testButtonText}>
          Test Parse (Console)
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
  },
  syncButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    backgroundColor: '#999',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  testButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  testButtonDisabled: {
    backgroundColor: '#999',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  lastSyncText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default HockeySyncButton;
