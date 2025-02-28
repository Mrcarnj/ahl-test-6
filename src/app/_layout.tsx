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
    console.log('🔄 Background fetch task running...');
    
    // Attempt to refresh the session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      console.log('✅ Session found in background task, refreshing...');
      // If we have a session, attempt to refresh it
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('❌ Background session refresh failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
      
      console.log('✅ Session successfully refreshed in background');
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    
    console.log('⚠️ No session found in background task');
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('❌ Background fetch failed:', error);
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
                    console.log('🔄 Setting up background fetch task...');
                    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
                    
                    if (!isRegistered) {
                        console.log('📝 Registering background fetch task...');
                        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
                            minimumInterval: 15 * 60, // 15 minutes (reduced from 1 hour)
                            stopOnTerminate: false,
                            startOnBoot: true,
                        });
                        console.log('✅ Background fetch task registered successfully');
                    } else {
                        console.log('ℹ️ Background fetch task already registered');
                    }
                    
                    // Set the task to fetch immediately when registered
                    await BackgroundFetch.setMinimumIntervalAsync(15 * 60); // 15 minutes
                } else {
                    // Request permissions if not allowed
                    console.log('🔒 Background fetch not allowed, requesting permissions...');
                    await requestBackgroundPermissions();
                }
            } catch (error) {
                console.error('❌ Background task setup error:', error);
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