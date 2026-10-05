// (protected)/(tabs)/clips/_layout.tsx
//
// index            every clip you can see, grouped by game
// game/[scheduleId] one game's clips (where the "New Clip" alert lands)
// [clipId]         the player
// upload           pick a video, a game, a title and tags
// edit/[clipId]    change a clip's title, notes and tags (uploader or admin)
//
// Sub-screens draw their own back button; see HeaderBackButton for why.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { StyleSheet, TouchableOpacity } from 'react-native';
import HeaderBackButton from '@/src/components/HeaderBackButton';

// Deep links (an alert, a push) open a game's clips directly; keep the list
// underneath so back lands somewhere sensible.
export const unstable_settings = {
  initialRouteName: 'index',
};

const header = {
  headerShown: true,
  headerStyle: { backgroundColor: '#000000' },
  headerTintColor: '#ffffff',
  headerBackVisible: false,
} as const;

const back = (label: string) =>
  function ClipsBackButton() {
    return <HeaderBackButton label={label} fallback="/(protected)/(tabs)/clips" />;
  };

export default function ClipsLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: '#000000' } }}>
      <Stack.Screen
        name="index"
        options={{
          ...header,
          headerTitle: 'Clips',
          headerRight: () => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Upload a clip"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              onPress={() => router.push('/(protected)/(tabs)/clips/upload')}
              style={styles.addButton}
            >
              {/* iOS 26 draws its own circular glass behind header items, so
                  this is a bare glyph in a fixed, centered square. */}
              <Ionicons name="add" size={28} color="#ff6600" />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="game/[scheduleId]"
        options={{ ...header, headerTitle: 'Game Clips', headerLeft: back('Clips') }}
      />
      <Stack.Screen
        name="[clipId]"
        options={{ ...header, headerTitle: 'Clip', headerLeft: back('Back') }}
      />
      <Stack.Screen
        name="upload"
        options={{ ...header, headerTitle: 'Upload Clip', headerLeft: back('Cancel') }}
      />
      <Stack.Screen
        name="edit/[clipId]"
        options={{ ...header, headerTitle: 'Edit Clip', headerLeft: back('Cancel') }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
