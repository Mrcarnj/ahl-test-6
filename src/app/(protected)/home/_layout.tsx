// app/(protected)/home/_layout.tsx
import { Stack } from "expo-router";

const stackLayout = () => {
  
  return (
    <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="index" 
          options={{
            headerTitle: "Home",
            headerShown: false, // Keep this false to show drawer header
          }}
        />
        <Stack.Screen 
          name="[gameId]" 
          options={{
            headerTitle: "Game Details",
            headerShown: true, // Show header for game details
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
    </Stack>
  );
};

export default stackLayout;