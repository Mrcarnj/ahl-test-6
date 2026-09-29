import { useCallback, useEffect, useState } from 'react';
import * as Contacts from 'expo-contacts';
import * as Device from 'expo-device';
import { isWeb } from '@/src/lib/platform';

export const useContactsPermissions = () => {
    // The web build hands the user a .vcf download rather than writing to an
    // address book, so there is no permission to ask for.
    const [hasPermission, setHasPermission] = useState(isWeb);

    const requestPermissions = useCallback(async () => {
        if (isWeb) return true;

        try {
            const { status } = await Contacts.requestPermissionsAsync();
            setHasPermission(status === 'granted');
            return status === 'granted';
        } catch (error) {
            console.error('Error requesting contacts permission:', error);
            setHasPermission(false);
            return false;
        }
    }, []);

    useEffect(() => {
        if (!isWeb && Device.isDevice) {
            requestPermissions();
        }
    }, [requestPermissions]);

    return { hasPermission, requestPermissions };
};
