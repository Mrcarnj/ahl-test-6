// src/components/PdfViewer.web.tsx
//
// Browser implementation of PdfViewer. Every current browser ships a built-in
// PDF viewer, so an <iframe> gives us scrolling, zoom, page jumps and print
// for free — no PDF.js bundle needed.

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import type { PdfViewerProps } from './PdfViewer';

export type { PdfViewerProps };

export default function PdfViewer({
  uri,
  style,
  onLoadStart,
  onLoad,
  onError,
}: PdfViewerProps) {
  // The iframe only fires `load` once, on mount or when `uri` changes, so
  // announce the start of that load from an effect keyed on the same value.
  const startedRef = useRef<string | null>(null);
  useEffect(() => {
    if (startedRef.current !== uri) {
      startedRef.current = uri;
      onLoadStart?.();
    }
  }, [uri, onLoadStart]);

  return (
    <View style={[styles.container, style]}>
      <iframe
        key={uri}
        src={uri}
        title="Document"
        onLoad={() => onLoad?.()}
        onError={() => onError?.()}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#000',
          display: 'block',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
