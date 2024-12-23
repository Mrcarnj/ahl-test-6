import { router, Tabs, Stack } from "expo-router";
import { useAuth } from "../../providers/AuthProvider";
import RosterProvider from "../../providers/RosterProvider";
import ScheduleProvider from "../../providers/ScheduleProvider";
import { useProtectedRoute } from "../../hooks/useProtectedRoute";
import { FontAwesome } from '@expo/vector-icons';

// Define the type for our route params
type GameRouteParams = {
  id: string;
  source: 'calendar' | 'home';
}

export default function ProtectedLayout() {
  useProtectedRoute();

  return (
    <RosterProvider>
      <ScheduleProvider>
        <Stack>
          <Stack.Screen 
            name="(tabs)" 
            options={{ headerShown: false }} 
          />
          <Stack.Screen 
            name="game/[id]" 
            options={({ route }) => ({
              headerTitle: "Game Details",
              // Type assertion to access params
              headerBackTitle: (route.params as GameRouteParams)?.source === 'calendar' ? 'Calendar' : 'Home',
              headerShown: true,
              headerStyle: {
                backgroundColor: '#000000',
              },
              headerTintColor: '#ffffff',
            })}
          />
        </Stack>
      </ScheduleProvider>
    </RosterProvider>
  );
}