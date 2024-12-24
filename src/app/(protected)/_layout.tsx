// app/(protected)/_layout.tsx
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

type DetailsRouteParams = {
  rosterId: string;
  source: 'roster' | 'game';
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
          <Stack.Screen 
            name="official/[rosterId]" 
            options={({ route }) => ({
              headerTitle: "Official's Details",
              headerBackTitle: (route.params as DetailsRouteParams)?.source === 'game' ? 'Game Details' : 'Roster',
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