import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Alert } from '@/src/lib/alert';
import * as BackgroundFetch from 'expo-background-fetch';

export const useBackgroundPermissions = () => {
    const [isBackgroundAllowed, setIsBackgroundAllowed] = useState(false);

    const requestBackgroundPermissions = async () => {
        try {
            if (Platform.OS === 'ios') {
                const status = await BackgroundFetch.getStatusAsync();

                switch (status) {
                    case BackgroundFetch.BackgroundFetchStatus.Restricted:
                    case BackgroundFetch.BackgroundFetchStatus.Denied:
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
                        setIsBackgroundAllowed(false);
                        break;
                    
                    case BackgroundFetch.BackgroundFetchStatus.Available:
                        setIsBackgroundAllowed(true);
                        break;
                    
                    default:
                        setIsBackgroundAllowed(false);
                        break;
                }
            } else {
                // For Android, background fetch is generally available
                setIsBackgroundAllowed(true);
            }
        } catch (error) {
            console.error('Background permission error:', error);
            setIsBackgroundAllowed(false);
        }
    };

    useEffect(() => {
        requestBackgroundPermissions();
    }, []);

    return { isBackgroundAllowed, requestBackgroundPermissions };
};