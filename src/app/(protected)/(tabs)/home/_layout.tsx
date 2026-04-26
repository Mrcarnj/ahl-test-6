// app/(protected)/(tabs)/home/_layout.tsx
import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="index" 
          options={{
            headerShown: false,
            headerTitle: "Home",
            headerLeft: () => null,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen 
          name="AllGames/index"  // This handles the AllGames route
          options={{
            headerTitle: "All Games",
            headerBackTitle: "Home",  // This is the correct property
            headerShown: true,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen 
          name="rulebook" 
          options={{
            headerTitle: "Rulebook",
            headerBackTitle: "Home",  // This is the correct property
            headerShown: true,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen 
          name="SituationBook" 
          options={{
            headerTitle: "Situation Book",
            headerBackTitle: "Home",  // This is the correct property
            headerShown: true,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
    </Stack>
  );
}