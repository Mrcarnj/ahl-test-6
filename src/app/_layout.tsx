import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import AuthProvider, { useAuth } from "../providers/AuthProvider";
import RosterProvider from "../providers/RosterProvider";
import ScheduleProvider from "../providers/ScheduleProvider";

function useProtectedRoute() {
  const { user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const isInProtectedGroup = segments[0] === "(protected)";

    if (!user && isInProtectedGroup) {
      // Only redirect to login if trying to access protected routes while not logged in
      router.replace("/(auth)/login");
    }
  }, [user, segments]);
}

function ProtectedLayout() {
  useProtectedRoute();

  return (
    <RosterProvider>
      <ScheduleProvider>
      <Stack>
        <Stack.Screen name="(protected)/home" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      </Stack>
      </ScheduleProvider>
    </RosterProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
        <ProtectedLayout />
    </AuthProvider>
  );
}