// src/components/ArenaMap.tsx
//
// Native implementation: a Google-backed MapView with a single parking pin.
// See ArenaMap.web.tsx for the browser version.

import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export type ArenaMapProps = {
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
};

export default function ArenaMap({
  latitude,
  longitude,
  title = 'Official Parking',
  description = 'Designated parking location',
}: ArenaMapProps) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }}
    >
      <Marker
        coordinate={{ latitude, longitude }}
        title={title}
        description={description}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
