// app/(protected)/_layout.tsx
import { router, Tabs, Stack } from "expo-router";
import { useAuth } from "../../providers/AuthProvider";
import { useRoster } from "../../providers/RosterProvider";
import RosterProvider from "../../providers/RosterProvider";
import ScheduleProvider from "../../providers/ScheduleProvider";
import { useProtectedRoute } from "../../hooks/useProtectedRoute";
import { FontAwesome } from '@expo/vector-icons';
import { useEffect } from 'react';

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
  const { roster } = useRoster();

  // Add TOS check
  useEffect(() => {
    if (roster && !roster.accepted_tos) {
      router.replace('/(auth)/tos');
    }
  }, [roster]);

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
              headerBackTitle: (route.params as DetailsRouteParams)?.source === 'game' ? 'Game' : 'Roster',
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