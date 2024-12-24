// app/_layout.tsx
import { Stack } from "expo-router";
import AuthProvider from "../providers/AuthProvider";
import { useAuth } from "../providers/AuthProvider";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";

function RootLayoutNav() {
    const { session } = useAuth();
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        // Add a small delay to allow session restoration
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

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(protected)" />
        </Stack>
    );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* <Stack.Screen name="(auth)" /> */}
        <Stack.Screen name="(protected)" />
        {/* <Stack.Screen name="(admin)" /> */}
      </Stack>
    </AuthProvider>
  );
}