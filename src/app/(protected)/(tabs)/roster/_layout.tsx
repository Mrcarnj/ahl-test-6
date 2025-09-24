//(protected)/(tabs)/roster/_layout.tsx

import { Stack } from "expo-router";

export default function RosterLayout() {
    return (
      <Stack screenOptions={{ headerShown: false }}>
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