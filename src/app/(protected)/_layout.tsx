// app/(protected)/_layout.tsx
import { Stack } from "expo-router";
import RosterProvider from "../../providers/RosterProvider";
import ScheduleProvider from "../../providers/ScheduleProvider";
import ClipsProvider from "../../providers/ClipsProvider";
import { NotificationProvider } from "../../providers/NotificationProvider";
import HeaderBackButton from '@/src/components/HeaderBackButton';

type GameRouteParams = {
  id: string;
  source: 'calendar' | 'home';
}

type DetailsRouteParams = {
  rosterId: string;
  source: 'roster' | 'game';
}

export default function ProtectedLayout() {
  return (
    <RosterProvider>
      <ScheduleProvider>
        <ClipsProvider>
          {/*
            Innermost: NotificationProvider reads myGames (game-day
            reminders). It used to wrap the others, so useSchedule() got the
            empty default context and no reminder was ever scheduled.
          */}
          <NotificationProvider>
            <Stack>
              <Stack.Screen 
                name="(tabs)" 
                options={{ headerShown: false }} 
              />
              {/*
                These screens draw their own headerLeft instead of setting
                `headerBackTitle`: the pinned react-native-screens renders a dead
                native back item in a stack that also holds headerless screens.
                See HeaderBackButton for the details.
              */}
              <Stack.Screen 
                name="game/[id]" 
                options={({ route }) => {
                  const fromCalendar =
                    (route.params as GameRouteParams)?.source === 'calendar';
                  return {
                    headerTitle: "Game Details",
                    headerShown: true,
                    headerBackVisible: false,
                    headerLeft: () => (
                      <HeaderBackButton
                        label={fromCalendar ? 'Calendar' : 'Home'}
                        fallback={
                          fromCalendar
                            ? '/(protected)/(tabs)/calendar'
                            : '/(protected)/(tabs)/home'
                        }
                      />
                    ),
                    headerStyle: {
                      backgroundColor: '#000000',
                    },
                    headerTintColor: '#ffffff',
                  };
                }}
              />
              <Stack.Screen
                name="incident-report/[id]"
                options={{
                  headerTitle: "Incident Report",
                  headerShown: true,
                  headerBackVisible: false,
                  headerLeft: () => (
                    <HeaderBackButton
                      label="Game"
                      fallback="/(protected)/(tabs)/home"
                    />
                  ),
                  headerStyle: {
                    backgroundColor: '#000000',
                  },
                  headerTintColor: '#ffffff',
                }}
              />
              <Stack.Screen
                name="season-stats"
                options={{
                  headerTitle: "This Year's Stats",
                  headerShown: true,
                  headerBackVisible: false,
                  headerLeft: () => (
                    <HeaderBackButton
                      label="Profile"
                      fallback="/(protected)/(tabs)/profile"
                    />
                  ),
                  headerStyle: {
                    backgroundColor: '#000000',
                  },
                  headerTintColor: '#ffffff',
                }}
              />
              <Stack.Screen
                name="worked-map"
                options={{ headerShown: false, animation: 'fade' }}
              />
              <Stack.Screen 
                name="official/[rosterId]" 
                options={({ route }) => {
                  const fromGame =
                    (route.params as DetailsRouteParams)?.source === 'game';
                  return {
                    headerTitle: "Official's Details",
                    headerShown: true,
                    headerBackVisible: false,
                    headerLeft: () => (
                      <HeaderBackButton
                        label={fromGame ? 'Game' : 'Roster'}
                        fallback={
                          fromGame
                            ? '/(protected)/(tabs)/home'
                            : '/(protected)/(tabs)/roster'
                        }
                      />
                    ),
                    headerStyle: {
                      backgroundColor: '#000000',
                    },
                    headerTintColor: '#ffffff',
                  };
                }}
              />
            </Stack>
          </NotificationProvider>
        </ClipsProvider>
      </ScheduleProvider>
    </RosterProvider>
  );
}
