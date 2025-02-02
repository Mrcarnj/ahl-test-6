import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useState, useRef } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AppState } from "react-native";

// Timezone helper functions
const isPST = (date: Date) => {
    return date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
};

const checkIfMidnight = () => {
    const pstTime = new Date(isPST(new Date()));
    return pstTime.getHours() === 0 && pstTime.getMinutes() < 5;
};

type AuthContext = {
    session: Session | null;
    user: User | null;
    handleRefresh: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContext>({
    session: null,
    user: null,
    handleRefresh: async () => false
});

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [isCheckingTos, setIsCheckingTos] = useState(false);
    const [lastDailyRefresh, setLastDailyRefresh] = useState<string | null>(null);
    const backgroundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    const handleRefresh = async () => {
        try {
            console.log('🔍 Checking current session...');
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            
            if (currentSession) {
                console.log('✅ Valid current session found');
                setSession(currentSession);
                await checkTosAcceptance(currentSession.user.id);
                return true;
            }
    
            console.log('⚠️ No current session, attempting refresh...');
            const { data: { session: refreshedSession }, error } = 
                await supabase.auth.refreshSession();
    
            if (error) {
                console.log('⚠️ Session refresh error, trying stored session...');
                const storedSession = await AsyncStorage.getItem('session');
                if (storedSession) {
                    console.log('📱 Found stored session, attempting to use it...');
                    const parsedSession = JSON.parse(storedSession);
                    await supabase.auth.setSession(parsedSession);
                    setSession(parsedSession);
                    await checkTosAcceptance(parsedSession.user.id);
                    return true;
                }
                throw error;
            }
    
            if (refreshedSession) {
                console.log('✅ Session successfully refreshed');
                setSession(refreshedSession);
                await checkTosAcceptance(refreshedSession.user.id);
                return true;
            }
    
            console.log('❌ No valid session found');
            return false;
        } catch (error) {
            console.error('❌ Auth refresh error:', error);
            if (session) {
                console.log('⚠️ Error occurred but existing session found');
                return true;
            }
            return false;
        }
    };

    const performDailyRefresh = async () => {
        const today = new Date().toDateString();
        
        // Check if we've already refreshed today
        if (lastDailyRefresh === today) {
            return;
        }

        try {
            const authRefreshed = await handleRefresh();
            if (authRefreshed) {
                // Store today's date as last refresh
                await AsyncStorage.setItem('lastDailyRefresh', today);
                setLastDailyRefresh(today);
            }
        } catch (error) {
            console.error('Daily refresh error:', error);
        }
    };

    useEffect(() => {
        let isMounted = true;
        let authSubscription: { unsubscribe: () => void } | null = null;

        const setupAuth = async () => {
            try {
                // Try to get stored session first
                const storedSession = await AsyncStorage.getItem('session');
                const storedLastRefresh = await AsyncStorage.getItem('lastDailyRefresh');
                
                if (storedLastRefresh) {
                    setLastDailyRefresh(storedLastRefresh);
                }
                
                if (storedSession && isMounted) {
                    const parsedSession = JSON.parse(storedSession);
                    setSession(parsedSession);
                    await supabase.auth.setSession(parsedSession);
                    if (parsedSession.user) {
                        await checkTosAcceptance(parsedSession.user.id);
                    }
                }

                const { data: { session: currentSession } } = await supabase.auth.getSession();

                if (currentSession && isMounted) {
                    setSession(currentSession);
                    await AsyncStorage.setItem('session', JSON.stringify(currentSession));
                    await checkTosAcceptance(currentSession.user.id);
                }

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
                await supabase.auth.initialize();
                supabase.auth.startAutoRefresh();
            } catch (error) {
                console.error('Error in setupAuth:', error);
            }
        };

        setupAuth();

        const subscription = AppState.addEventListener('change', async (nextAppState: string) => {
            if (nextAppState === 'active') {
                await handleRefresh();
            } else if (nextAppState === 'background') {
                // Clear any existing timer
                if (backgroundTimerRef.current) {
                    clearInterval(backgroundTimerRef.current);
                }
                // Set up new timer
                backgroundTimerRef.current = setInterval(() => {
                    if (checkIfMidnight()) {
                        performDailyRefresh();
                    }
                }, 60000);
            }
        });

        return () => {
            isMounted = false;
            subscription.remove();
            if (authSubscription) {
                authSubscription.unsubscribe();
            }
            if (backgroundTimerRef.current) {
                clearInterval(backgroundTimerRef.current);
                backgroundTimerRef.current = null;
            }
            supabase.auth.stopAutoRefresh();
        };
    }, []);

    return (
        <AuthContext.Provider value={{ 
            session, 
            user: session?.user ?? null,
            handleRefresh
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