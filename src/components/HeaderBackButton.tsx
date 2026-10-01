// src/components/HeaderBackButton.tsx
//
// A JS stand-in for the native stack's back button.
//
// react-native-screens 4.16 (the version Expo SDK 54 pins) ships an iOS 26 bug
// where the *native* back item goes dead in a stack whose other screens use
// `headerShown: false` — which is every screen in `(protected)`, since the tab
// navigator hides its header. Tapping it did nothing; only the swipe gesture or
// a programmatic `goBack()` still navigated.
// See software-mansion/react-native-screens#3294, fixed upstream in 4.17.
//
// Rendering the button ourselves sidesteps the dead native item, because the
// press handler is ours and `router.back()` was never affected. Remove this and
// go back to `headerBackTitle` once the pinned react-native-screens is >= 4.17.

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type HeaderBackButtonProps = {
  /** Text beside the chevron, as iOS would draw the previous screen's title. */
  label: string;
  /** Where to land when there is nothing to pop (e.g. opened from a notification). */
  fallback?: Parameters<ReturnType<typeof useRouter>['replace']>[0];
};

export default function HeaderBackButton({
  label,
  fallback = '/(protected)/(tabs)/home',
}: HeaderBackButtonProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallback);
        }
      }}
      style={styles.button}
    >
      <Ionicons name="chevron-back" size={26} color="#ffffff" />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    // The native item sits closer to the edge than a JS headerLeft does; pull
    // it back so the chevron lines up with the rest of the app's headers.
    marginLeft: -8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  label: {
    color: '#ffffff',
    fontSize: 17,
    marginLeft: -2,
  },
});
