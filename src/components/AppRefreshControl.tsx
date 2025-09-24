import React, { useState, useCallback } from 'react';
import { RefreshControl, DeviceEventEmitter } from 'react-native';
import { APP_REFRESH_EVENT } from '../app/(protected)/_layout';

interface AppRefreshControlProps {
  colors?: string[];
  tintColor?: string;
}

/**
 * A custom RefreshControl component that triggers a complete app refresh
 * by remounting all providers through the DeviceEventEmitter.
 */
export const AppRefreshControl: React.FC<AppRefreshControlProps> = ({ 
  colors = ['#ff6600'], 
  tintColor = '#ff6600' 
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    
    // Emit the refresh event
    console.log('🔄 Triggering app refresh event...');
    DeviceEventEmitter.emit(APP_REFRESH_EVENT);
    
    // Add a small delay to show the refresh animation
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={colors}
      tintColor={tintColor}
    />
  );
};

export default AppRefreshControl; 