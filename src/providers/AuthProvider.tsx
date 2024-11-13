import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthContext = {
    session: Session | null;
    user: User | null;
};

const AuthContext = createContext<AuthContext>({
    session: null,
    user: null,
});

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);

    useEffect(() => {
        const loadSession = async () => {
            // Try to load session from AsyncStorage
            const storedSession = await AsyncStorage.getItem('session');
            if (storedSession) {
                const parsedSession = JSON.parse(storedSession);
                setSession(parsedSession);
                supabase.auth.setSession(parsedSession); // Rehydrate session in Supabase
            }
        };

        loadSession();

        // Get initial session and save it
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSession(session);
                AsyncStorage.setItem('session', JSON.stringify(session)); // Store session
            }
        });

        // Handle app state changes
        const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                supabase.auth.startAutoRefresh();
            } else if (nextAppState === 'background' || nextAppState === 'inactive') {
                supabase.auth.stopAutoRefresh();
            }
        });

        // Listen for auth changes and store session in AsyncStorage
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setSession(session);
                if (session) {
                    await AsyncStorage.setItem('session', JSON.stringify(session));
                } else {
                    await AsyncStorage.removeItem('session');
                }
            }
        );

        supabase.auth.startAutoRefresh();

        // Cleanup on unmount
        return () => {
            authSubscription.unsubscribe();
            appStateSubscription.remove();
            supabase.auth.stopAutoRefresh();
        };
    }, []);

    return (
        <AuthContext.Provider value={{ 
            session, 
            user: session?.user ?? null 
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
