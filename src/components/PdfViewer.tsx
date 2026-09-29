// src/components/PdfViewer.tsx
//
// Native implementation: the platform WebView already renders PDFs inline on
// both iOS and Android. See PdfViewer.web.tsx for the browser version.

import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

export type PdfViewerProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  onLoadStart?: () => void;
  onLoad?: () => void;
  onError?: () => void;
};

export default function PdfViewer({
  uri,
  style,
  onLoadStart,
  onLoad,
  onError,
}: PdfViewerProps) {
  return (
    <WebView
      key={uri}
      source={{ uri }}
      style={[styles.viewer, style]}
      onLoadStart={onLoadStart}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
});
