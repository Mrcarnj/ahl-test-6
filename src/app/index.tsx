// app/index.tsx
import { useAuth } from "../providers/AuthProvider";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";

export default function Index() {
    const { session } = useAuth();
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

    if (session) {
        return <Redirect href="/(protected)/home" />;
    }

    return <Redirect href="/(auth)/login" />;
}
