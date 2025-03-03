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

// In AuthProvider.tsx

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);

    useEffect(() => {
        const setupAuth = async () => {
            try {
                // Log initial state
                console.log('Setting up auth...');

                // Try AsyncStorage first
                const storedSession = await AsyncStorage.getItem('session');
                console.log('Stored session from AsyncStorage:', storedSession ? 'exists' : 'none');
                
                if (storedSession) {
                    const parsedSession = JSON.parse(storedSession);
                    console.log('Setting stored session');
                    setSession(parsedSession);
                    await supabase.auth.setSession(parsedSession);
                }

                // Get Supabase session
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                console.log('Current Supabase session:', currentSession ? 'exists' : 'none');

                if (currentSession) {
                    console.log('Setting current session');
                    setSession(currentSession);
                    await AsyncStorage.setItem('session', JSON.stringify(currentSession));
                }

                // Set up auth listener
                const { data: { subscription } } = supabase.auth.onAuthStateChange(
                    async (event, session) => {
                        console.log('Auth state change:', event, session ? 'with session' : 'no session');
                        
                        if (session) {
                            setSession(session);
                            await AsyncStorage.setItem('session', JSON.stringify(session));
                        } else {
                            // Only clear on explicit sign out
                            if (event === 'SIGNED_OUT') {
                                console.log('Explicit sign out, clearing session');
                                setSession(null);
                                await AsyncStorage.removeItem('session');
                            } else {
                                console.log('Session null but not signing out, event:', event);
                            }
                        }
                    }
                );

                // Initialize and start auto-refresh
                await supabase.auth.initialize();
                supabase.auth.startAutoRefresh();

                return () => {
                    subscription.unsubscribe();
                };
            } catch (error) {
                console.error('Error in setupAuth:', error);
            }
        };

        setupAuth();
    }, []);

    // Also log any session changes from the state
    useEffect(() => {
        console.log('Session state changed:', session ? 'exists' : 'none');
    }, [session]);

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