import { useEffect, useState } from 'react';
import * as Contacts from 'expo-contacts';
import * as Device from 'expo-device';

export const useContactsPermissions = () => {
    const [hasPermission, setHasPermission] = useState(false);

    const requestPermissions = async () => {
        try {
            const { status } = await Contacts.requestPermissionsAsync();
            setHasPermission(status === 'granted');
            return status === 'granted';
        } catch (error) {
            console.error('Error requesting contacts permission:', error);
            setHasPermission(false);
            return false;
        }
    };

    useEffect(() => {
        if (Device.isDevice) {
            requestPermissions();
        }
    }, []);

    return { hasPermission, requestPermissions };
};