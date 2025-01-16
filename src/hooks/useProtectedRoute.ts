// hooks/useProtectedRoute.ts
import { useEffect, useState } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "../providers/AuthProvider";
import { useRoster } from "../providers/RosterProvider";

export function useProtectedRoute() {
    const { user, session } = useAuth();
    const { roster } = useRoster();
    const segments = useSegments();
    const router = useRouter();
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        const isInProtectedGroup = segments[0] === "(protected)";
        const isInAuthGroup = segments[0] === "(auth)";
        const isInTosPage = segments[1] === "tos";

        const initTimeout = setTimeout(() => {
            if (!user && isInProtectedGroup) {
                router.replace("/(auth)/login");
            } else if (user && roster && !roster.accepted_tos && !isInTosPage) {
                router.replace("/(auth)/tos");
            } else if (user && roster?.accepted_tos && isInAuthGroup) {
                router.replace("/(protected)/home");
            }
            setIsInitializing(false);
        }, 1000);

        return () => clearTimeout(initTimeout);
    }, [user, roster?.accepted_tos, segments]); // Changed from full roster to just tos
}