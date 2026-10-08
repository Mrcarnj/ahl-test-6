// app/(protected)/(tabs)/home/_layout.tsx
import { Stack } from "expo-router";
import HeaderBackButton from '@/src/components/HeaderBackButton';

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
        {/*
          Draws its own headerLeft instead of setting `headerBackTitle`: the
          native back item is dead in a stack whose other screens are
          headerless. See HeaderBackButton for the details.
        */}
        <Stack.Screen 
          name="AllGames/index"  // This handles the AllGames route
          options={{
            headerTitle: "All Games",
            headerShown: true,
            headerBackVisible: false,
            headerLeft: () => <HeaderBackButton label="Home" />,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
        {/* Its own stack, which draws the headers (see flights/_layout). */}
        <Stack.Screen name="flights" options={{ headerShown: false }} />
    </Stack>
  );
}
