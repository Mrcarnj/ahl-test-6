import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

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
    const [isCheckingTos, setIsCheckingTos] = useState(false);

    const checkTosAcceptance = async (userId: string) => {
        if (isCheckingTos) return;
        
        try {
            setIsCheckingTos(true);
            const { data, error } = await supabase
                .from('roster')
                .select('accepted_tos, changedpassword')
                .eq('auth_id', userId)
                .single();

            if (error) {
                console.error('Error checking TOS:', error);
                return;
            }

            // Handle different auth states
            if (!data.changedpassword) {
                router.replace('/(auth)/changepassword');
            } else if (!data.accepted_tos) {
                router.replace('/(auth)/tos');
            }
        } catch (error) {
            console.error('Error in TOS check:', error);
        } finally {
            setIsCheckingTos(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        let authSubscription: { unsubscribe: () => void } | null = null;

        const setupAuth = async () => {
            try {
                // Try AsyncStorage first
                const storedSession = await AsyncStorage.getItem('session');
                
                if (storedSession && isMounted) {
                    const parsedSession = JSON.parse(storedSession);
                    setSession(parsedSession);
                    await supabase.auth.setSession(parsedSession);
                    if (parsedSession.user) {
                        await checkTosAcceptance(parsedSession.user.id);
                    }
                }

                // Get Supabase session
                const { data: { session: currentSession } } = await supabase.auth.getSession();

                if (currentSession && isMounted) {
                    setSession(currentSession);
                    await AsyncStorage.setItem('session', JSON.stringify(currentSession));
                    await checkTosAcceptance(currentSession.user.id);
                }

                // Set up auth listener
                const { data: { subscription } } = supabase.auth.onAuthStateChange(
                    async (event, session) => {
                        if (!isMounted) return;

                        if (session) {
                            setSession(session);
                            await AsyncStorage.setItem('session', JSON.stringify(session));
                            await checkTosAcceptance(session.user.id);
                        } else if (event === 'SIGNED_OUT') {
                            setSession(null);
                            await AsyncStorage.removeItem('session');
                        }
                    }
                );

                authSubscription = subscription;

                // Initialize and start auto-refresh
                await supabase.auth.initialize();
                supabase.auth.startAutoRefresh();
            } catch (error) {
                console.error('Error in setupAuth:', error);
            }
        };

        setupAuth();

        // Cleanup function
        return () => {
            isMounted = false;
            if (authSubscription) {
                authSubscription.unsubscribe();
            }
            supabase.auth.stopAutoRefresh();
        };
    }, []); // Empty dependency array

    return (
        <AuthContext.Provider value={{ 
            session, 
            user: session?.user ?? null 
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};