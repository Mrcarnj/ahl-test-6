import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { BackgroundFetchStatus } from 'expo-background-fetch';

const BACKGROUND_FETCH_TASK = 'background-fetch';

export const useBackgroundPermissions = () => {
    const [isBackgroundAllowed, setIsBackgroundAllowed] = useState(false);

    const requestBackgroundPermissions = async () => {
        try {
            if (Platform.OS === 'ios') {
                const status = await BackgroundFetch.getStatusAsync();
                const isAvailable = await BackgroundFetch.isAvailableAsync();

                if (!isAvailable) {
                    Alert.alert(
                        "Background Refresh",
                        "Please enable background refresh in your device settings to keep your game data up to date.",
                        [
                            { 
                                text: "OK",
                                onPress: () => console.log("OK Pressed")
                            }
                        ]
                    );
                    return;
                }
                if (status === BackgroundFetchStatus.Denied) {
                    Alert.alert(
                        "Background Refresh Required",
                        "This app requires background refresh to keep your game data up to date. Please enable it in Settings.",
                        [
                            { 
                                text: "OK",
                                onPress: () => console.log("OK Pressed")
                            }
                        ]
                    );
                    return;
                }

                setIsBackgroundAllowed(true);
            }
        } catch (error) {
            console.error('Background permission error:', error);
        }
    };

    useEffect(() => {
        requestBackgroundPermissions();
    }, []);

    return { isBackgroundAllowed, requestBackgroundPermissions };
};