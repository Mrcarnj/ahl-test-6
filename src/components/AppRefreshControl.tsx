import React from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';
import { useAppRefresh } from '@/src/hooks/useAppRefresh';

type AppRefreshControlProps = Partial<RefreshControlProps>;

/**
 * A custom RefreshControl component that performs a real refresh of
 * key app data. The web sidebar exposes the same refresh as a button,
 * since desktop browsers have no pull gesture.
 *
 * `rest` must be spread onto the RefreshControl: react-native-web's ScrollView
 * renders a refreshControl by cloning the element and passing the whole scroll
 * view as its `children`. A wrapper that drops those children renders an empty
 * page — which is exactly what happened here before.
 */
export const AppRefreshControl: React.FC<AppRefreshControlProps> = ({
  colors = ['#ff6600'],
  tintColor = '#ff6600',
  ...rest
}) => {
  const { refreshing, refresh } = useAppRefresh();

  return (
    <RefreshControl
      {...rest}
      refreshing={refreshing}
      onRefresh={refresh}
      colors={colors}
      tintColor={tintColor}
    />
  );
};

export default AppRefreshControl;
