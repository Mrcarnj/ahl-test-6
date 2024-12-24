// hooks/useProtectedRoute.ts
import { useEffect, useState } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "../providers/AuthProvider";

export function useProtectedRoute() {
    const { user, session } = useAuth();
    const segments = useSegments();
    const router = useRouter();
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        const isInProtectedGroup = segments[0] === "(protected)";

        // Add a small delay to allow session restoration
        const initTimeout = setTimeout(() => {
            setIsInitializing(false);
        }, 1000);

        if (!isInitializing) {
            if (!user && isInProtectedGroup) {
                // Only redirect if we're sure we have no user after initialization
                router.replace("/(auth)/login");
            }
        }

        return () => clearTimeout(initTimeout);
    }, [user, segments, isInitializing]);
}