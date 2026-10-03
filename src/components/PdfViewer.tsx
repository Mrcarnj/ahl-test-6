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
      // A 4xx/5xx (e.g. an expired storage link) still "loads" as an error
      // page; surface it as a failure instead.
      onHttpError={onError}
    />
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
});
