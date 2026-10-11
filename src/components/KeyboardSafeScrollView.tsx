// A ScrollView that keeps the focused text box above the keyboard. Use it for
// any form screen instead of wrapping a ScrollView in KeyboardAvoidingView.
//
// iOS: the ScrollView insets itself by exactly the part the keyboard covers
//      and scrolls the focused input into view (automaticallyAdjustKeyboardInsets).
//      That uses real window coordinates, so headers, tab bars and iPad
//      floating keyboards need no offsets.
// Android: SDK 54 is edge-to-edge, so the window no longer resizes for the
//      keyboard. A KeyboardAvoidingView pads the screen instead, and Android's
//      ScrollView brings the focused child back into view when it shrinks.
//      KAV measures itself relative to its parent, not the window, so the
//      header height is added back as keyboardVerticalOffset.
// Web: the browser handles it.

import { HeaderHeightContext } from '@react-navigation/elements';
import { useContext } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, type ScrollViewProps, StyleSheet } from 'react-native';

export default function KeyboardSafeScrollView({ children, ...props }: ScrollViewProps) {
  // The context is undefined on screens without a navigator header.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  const scroll = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets
      {...props}
    >
      {children}
    </ScrollView>
  );

  if (Platform.OS !== 'android') return scroll;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={headerHeight}>
      {scroll}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
