import { Stack } from "expo-router";
import AuthProvider from "../providers/AuthProvider";
import { useAuth } from "../providers/AuthProvider";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { supabase } from "../lib/supabase";
import { useBackgroundPermissions } from "../hooks/useBackgroundPermissions";

const BACKGROUND_FETCH_TASK = 'background-fetch';

// Define the background task
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    // Attempt to refresh the session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // If we have a session, attempt to refresh it
      await supabase.auth.refreshSession();
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('Background fetch failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

function RootLayoutNav() {
    const { session } = useAuth();
    const [isInitializing, setIsInitializing] = useState(true);
    const { isBackgroundAllowed, requestBackgroundPermissions } = useBackgroundPermissions();

    useEffect(() => {
        const initializeApp = async () => {
            try {
                // Register background fetch if allowed
                if (isBackgroundAllowed) {
                    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
                    if (!isRegistered) {
                        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
                            minimumInterval: 60 * 60, // 1 hour
                            stopOnTerminate: false,
                            startOnBoot: true,
                        });
                    }
                } else {
                    // Request permissions if not allowed
                    await requestBackgroundPermissions();
                }
            } catch (error) {
                console.error('Background task setup error:', error);
            } finally {
                // Set initialization complete
                const initTimeout = setTimeout(() => {
                    setIsInitializing(false);
                }, 1000);
                return () => clearTimeout(initTimeout);
            }
        };

        initializeApp();
    }, [isBackgroundAllowed]);

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
            <Stack.Screen name="(protected)" />
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <AuthProvider>
            <RootLayoutNav />
        </AuthProvider>
    );
}