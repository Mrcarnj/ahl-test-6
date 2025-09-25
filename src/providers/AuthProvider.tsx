// providers/AuthProvider.tsx
import { Session, User } from "@supabase/supabase-js";
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { safeAsyncStorage } from '../lib/asyncStorageWrapper';
import { performAutoSync } from '../lib/icalHockeySync';
import { supabase } from "../lib/supabase";

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

    const checkTosAcceptance = async (userId: string) => {
        try {
            console.log('Checking TOS acceptance for user:', userId);
            const { data, error } = await supabase
                .from('roster')
                .select('accepted_tos, changedpassword, ical_url')
                .eq('auth_id', userId)
                .single();

            if (error) {
                console.error('Error checking TOS:', error);
                return;
            }

            console.log('TOS check result:', data);

            // Handle different auth states
            if (!data.changedpassword) {
                console.log('Password needs to be changed');
                router.replace('/(loginflow)/changepassword');
            } else if (!data.accepted_tos) {
                console.log('TOS needs to be accepted');
                router.replace('/(loginflow)/tos');
            } else if (!data.ical_url) {
                console.log('iCal URL needs to be set up');
                router.replace('/(loginflow)/ical-setup');
            }
        } catch (error) {
            console.error('Error in TOS check:', error);
        }
    };

    const triggerLoginSync = async () => {
        try {
            console.log('🔄 AUTH: Triggering login sync...');
            const result = await performAutoSync();
            
            if (result.success) {
                if ('skipped' in result && result.skipped) {
                    console.log('⏭️ AUTH: Login sync skipped - recent sync found');
                } else {
                    console.log('✅ AUTH: Login sync completed successfully');
                }
            } else {
                const errorMsg = 'error' in result ? result.error : 'Unknown error';
                console.error('❌ AUTH: Login sync failed:', errorMsg);
            }
        } catch (error) {
            console.error('❌ AUTH: Login sync error:', error);
        }
    };

    useEffect(() => {
        const setupAuth = async () => {
            try {
                console.log('Setting up auth...');

                // Try AsyncStorage first
                const storedSession = await safeAsyncStorage.getItem('session');
                console.log('Stored session from AsyncStorage:', storedSession ? 'exists' : 'none');
                
                if (storedSession) {
                    const parsedSession = JSON.parse(storedSession);
                    console.log('Setting stored session');
                    setSession(parsedSession);
                    await supabase.auth.setSession(parsedSession);
                    // Check TOS for stored session
                    if (parsedSession.user) {
                        await checkTosAcceptance(parsedSession.user.id);
                        // Trigger sync for stored session (app startup)
                        console.log('🔄 AUTH: App started with stored session, triggering sync...');
                        triggerLoginSync();
                    }
                }

                // Get Supabase session
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                console.log('Current Supabase session:', currentSession ? 'exists' : 'none');

                if (currentSession) {
                    console.log('Setting current session');
                    setSession(currentSession);
                    await safeAsyncStorage.setItem('session', JSON.stringify(currentSession));
                    // Check TOS for current session
                    await checkTosAcceptance(currentSession.user.id);
                    // Trigger sync for current session (app startup)
                    console.log('🔄 AUTH: App started with current session, triggering sync...');
                    triggerLoginSync();
                }

                // Set up auth listener
                const { data: { subscription } } = supabase.auth.onAuthStateChange(
                    async (event, session) => {
                        console.log('Auth state change:', event, session ? 'with session' : 'no session');
                        
                        if (session) {
                            setSession(session);
                            await safeAsyncStorage.setItem('session', JSON.stringify(session));
                            // Check TOS on auth state change
                            await checkTosAcceptance(session.user.id);
                            
                            // Trigger sync on successful authentication
                            if (event === 'SIGNED_IN') {
                                console.log('🔄 AUTH: User signed in, triggering sync...');
                                // Run sync in background without blocking the auth flow
                                triggerLoginSync();
                            }
                        } else {
                            if (event === 'SIGNED_OUT') {
                                console.log('Explicit sign out, clearing session');
                                setSession(null);
                                await safeAsyncStorage.removeItem('session');
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