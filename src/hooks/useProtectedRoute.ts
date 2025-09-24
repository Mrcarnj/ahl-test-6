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
        const isInIcalSetupPage = segments[1] === "ical-setup";

        // Add a small delay to allow session restoration
        const initTimeout = setTimeout(() => {
            setIsInitializing(false);
        }, 1000);

        if (!isInitializing) {
            // If no user and trying to access protected routes, redirect to login
            if (!user && isInProtectedGroup) {
                router.replace("/(auth)/login");
                return;
            }

            // If user exists but hasn't accepted TOS and isn't already on TOS page
            if (user && roster && !roster.accepted_tos && !isInTosPage) {
                router.replace("/(auth)/tos");
                return;
            }

            // If user has accepted TOS but doesn't have iCal URL set and isn't already on iCal setup page
            if (user && roster?.accepted_tos && !roster.ical_url && !isInIcalSetupPage) {
                router.replace("/(auth)/ical-setup");
                return;
            }

            // If user has completed all setup but is trying to access auth routes
            if (user && roster?.accepted_tos && roster?.ical_url && isInAuthGroup) {
                router.replace("/(protected)/home");
                return;
            }
        }

        return () => clearTimeout(initTimeout);
    }, [user, roster, segments, isInitializing]);
}