// app/(protected)/_layout.tsx
import { router, Tabs, useNavigation } from "expo-router";
import { useAuth } from "../../providers/AuthProvider";
import RosterProvider from "../../providers/RosterProvider";
import ScheduleProvider from "../../providers/ScheduleProvider";
import { useProtectedRoute } from "../../hooks/useProtectedRoute"; // We'll move this to a separate file
import { FontAwesome } from '@expo/vector-icons'; // or whatever icon set you prefer

export default function ProtectedLayout() {
  useProtectedRoute();

  return (
    <RosterProvider>
      <ScheduleProvider>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#000000',
              borderTopWidth: 0,
            },
            tabBarActiveTintColor: '#ff6600',
            tabBarInactiveTintColor: '#666',
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              headerTitle: "Home",
              tabBarLabel: "Home",
              tabBarIcon: ({ color }) => (
                <FontAwesome name="home" size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="calendar"
            options={{
              headerShown: false,
              tabBarLabel: "Calendar",
              tabBarIcon: ({ color }) => (
                <FontAwesome name="calendar" size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="roster"
            options={{
              tabBarLabel: "Roster",
              tabBarIcon: ({ color }) => (
                <FontAwesome name="users" size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarLabel: "Profile",
              tabBarIcon: ({ color }) => (
                <FontAwesome name="user" size={24} color={color} />
              ),
            }}
          />
        </Tabs>
      </ScheduleProvider>
    </RosterProvider>
  );
}