// hooks/useProtectedRoute.ts
import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "../providers/AuthProvider";

export function useProtectedRoute() {
  const { user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const isInProtectedGroup = segments[0] === "(protected)";

    if (!user && isInProtectedGroup) {
      router.replace("/(auth)/login");
    }
  }, [user, segments]);
}