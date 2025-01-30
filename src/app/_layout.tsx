// app/_layout.tsx
import { Stack } from "expo-router";
import AuthProvider from "../providers/AuthProvider";
import { useAuth } from "../providers/AuthProvider";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { supabase } from "../lib/supabase";

const BACKGROUND_FETCH_TASK = 'background-fetch';

// Define the background task
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    // Attempt to refresh the session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // If we have a session, attempt to refresh it
      await supabase.auth.refreshSession();
      // Return success result
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    
    // If no session, return no data result
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('Background fetch failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Function to register background fetch
async function registerBackgroundFetch() {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 60 * 60, // 1 hour in seconds
      stopOnTerminate: false,    // iOS only
      startOnBoot: true,         // Android only
    });
    console.log("Background fetch registered");
  } catch (err) {
    console.error("Task Register failed:", err);
  }
}

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
    useEffect(() => {
        // Register background fetch when app starts
        registerBackgroundFetch();

        // Check if the task is already registered
        const checkTask = async () => {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
            if (!isRegistered) {
                await registerBackgroundFetch();
            }
        };

        checkTask();
    }, []);

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