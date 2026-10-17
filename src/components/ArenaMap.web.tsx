// src/components/ArenaMap.web.tsx
//
// Browser implementation of ArenaMap. react-native-maps has no web build, so
// this embeds Google Maps directly. The `q=` embed form needs no API key and
// drops a pin on the coordinates, which is all the arena screen shows.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ArenaMapProps } from './ArenaMap';

export type { ArenaMapProps };

export default function ArenaMap({
  latitude,
  longitude,
  title = 'Official Parking',
}: ArenaMapProps) {
  const src = `https://maps.google.com/maps?q=${latitude},${longitude}&z=17&output=embed`;

  return (
    <View style={styles.map}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
