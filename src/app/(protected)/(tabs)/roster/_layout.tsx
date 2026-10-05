//(protected)/(tabs)/roster/_layout.tsx

import { Stack } from "expo-router";

export default function RosterLayout() {
    return (
      // contentStyle: without it the stack paints its default (light) card
      // background, which flashed white before the screen's first frame.
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}>
          <Stack.Screen 
            name="index" 
            options={{
              headerShown: true,
              headerTitle: "Roster",
              headerStyle: {
                backgroundColor: '#000000',
              },
              headerTintColor: '#ffffff',
            }}
          />
          </Stack>
    );
  }