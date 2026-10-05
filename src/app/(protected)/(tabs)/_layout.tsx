// app/(protected)/(tabs)/_layout.tsx
//
// One Tabs navigator for both platforms, so every section keeps its own
// independent stack. Native shows the bottom tab bar; web suppresses it and
// WebShell supplies the left-hand menu instead.
//
// (This branches inside the file rather than using `_layout.web.tsx`, because
// expo-router derives route names from filenames without stripping a `.web`
// suffix — such a file would register as a route, not as the layout.)

import { Tabs } from "expo-router";
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { isWeb } from "@/src/lib/platform";
import WebShell from "@/src/components/nav/WebShell";

export default function TabsLayout() {
  const tabs = (
    <Tabs
      // On web the menu lives in WebShell, so the navigator renders no bar.
      tabBar={isWeb ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        tabBarStyle: isWeb
          ? { display: 'none' }
          : {
              backgroundColor: '#000000',
              borderTopWidth: 0,
            },
        tabBarActiveTintColor: '#ff6600',
        tabBarInactiveTintColor: '#999',
        sceneStyle: { backgroundColor: '#000000' },
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
        name="clips"
        options={{
          tabBarLabel: "Clips",
          // Same icon as the game page's Video Review button.
          tabBarIcon: ({ color }) => (
            <Ionicons name="videocam-outline" size={26} color={color} />
          ),
        }}
      />
      {/*
        Playoffs are hidden for the 2026-27 regular season. The routes still
        exist; `href: null` just drops the tab from the bar. Restore by putting
        back the tabBarLabel/tabBarIcon options below.
      */}
      <Tabs.Screen
        name="playoffs"
        options={{
          href: null,
        }}
      />
      {/*
        Rulebook and Situation Book are top-level routes so the web sidebar can
        link to them directly. The native tab bar is full, so there they stay
        hidden and are reached from the home screen instead.
      */}
      <Tabs.Screen name="rulebook" options={{ href: null }} />
      <Tabs.Screen name="situation-book" options={{ href: null }} />
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
  );

  return isWeb ? <WebShell>{tabs}</WebShell> : tabs;
}
