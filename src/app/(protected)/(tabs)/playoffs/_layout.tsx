// app/(protected)/(tabs)/playoffs/_layout.tsx
import { Stack } from 'expo-router';

export default function PlayoffsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: '#ff6600',
        headerTitleStyle: { color: '#fff', fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Calder Cup Playoffs' }} />
      <Stack.Screen name="[seriesLetter]" options={{ title: 'Series Details' }} />
    </Stack>
  );
}
