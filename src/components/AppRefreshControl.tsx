import React from 'react';
import { RefreshControl } from 'react-native';
import { useAppRefresh } from '@/src/hooks/useAppRefresh';

interface AppRefreshControlProps {
  colors?: string[];
  tintColor?: string;
}

/**
 * A custom RefreshControl component that performs a real refresh of
 * key app data. The web sidebar exposes the same refresh as a button,
 * since desktop browsers have no pull gesture.
 */
export const AppRefreshControl: React.FC<AppRefreshControlProps> = ({
  colors = ['#ff6600'],
  tintColor = '#ff6600',
}) => {
  const { refreshing, refresh } = useAppRefresh();

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
      colors={colors}
      tintColor={tintColor}
    />
  );
};

export default AppRefreshControl;
