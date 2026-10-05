// app/index.tsx
import { useAuth } from "../providers/AuthProvider";
import { useRoster } from "../providers/RosterProvider";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";

export default function Index() {
    const { session } = useAuth();
    const { roster } = useRoster();
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        const initTimeout = setTimeout(() => {
            setIsInitializing(false);
        }, 1000);

        return () => clearTimeout(initTimeout);
    }, []);

    if (isInitializing) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                <ActivityIndicator size="large" color="#ff6600" />
            </View>
        );
    }

    // If no session, redirect to login
    if (!session) {
        return <Redirect href="/(auth)/login" />;
    }

    // Check if user needs to accept TOS
    if (roster && !roster.accepted_tos) {
        return <Redirect href="/(loginflow)/tos" />;
    }

    // Check if user needs to set up iCal URL (an ahlAdmin never does: they
    // see every game straight from the DB)
    if (roster && roster.accepted_tos && !roster.ahlAdmin && !roster.ical_url) {
        return <Redirect href="/(loginflow)/ical-setup" />;
    }

    // If session exists, TOS is accepted, and iCal URL is set, go to protected home
    return <Redirect href="/(protected)/(tabs)/home" />;
}