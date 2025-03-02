import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useState, useRef } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AppState, DeviceEventEmitter } from "react-native";

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
            console.log('🔍 AUTH: Checking current session... - ' + new Date().toISOString());
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            
            if (currentSession) {
                // Check if token is expired or about to expire (within 5 minutes)
                const expiresAt = currentSession.expires_at;
                const now = Math.floor(Date.now() / 1000);
                const isExpired = expiresAt && expiresAt < now;
                const isAboutToExpire = expiresAt && expiresAt < now + 300; // 5 minutes
                
                if (isExpired) {
                    console.log('⚠️ AUTH: Session token is expired, attempting refresh...');
                } else if (isAboutToExpire) {
                    console.log('⚠️ AUTH: Session token is about to expire, attempting refresh...');
                } else {
                    console.log('✅ AUTH: Valid current session found with expiry in ' + 
                        (expiresAt ? Math.floor((expiresAt - now) / 60) : 'unknown') + ' minutes');
                    setSession(currentSession);
                    await checkTosAcceptance(currentSession.user.id);
                    return true;
                }
            } else {
                console.log('⚠️ AUTH: No current session, attempting refresh...');
            }
    
            console.log('🔄 AUTH: Calling supabase.auth.refreshSession()...');
            const refreshStart = Date.now();
            const { data: { session: refreshedSession }, error } = 
                await supabase.auth.refreshSession();
            console.log(`🕒 AUTH: refreshSession took ${Date.now() - refreshStart}ms`);
    
            if (error) {
                console.log('⚠️ AUTH: Session refresh error:', error.message);
                console.log('🔍 AUTH: Trying stored session...');
                
                try {
                    const storedSession = await AsyncStorage.getItem('session');
                    if (storedSession) {
                        console.log('📱 AUTH: Found stored session, attempting to use it...');
                        const parsedSession = JSON.parse(storedSession);
                        
                        // Check if stored session is expired
                        const storedExpiresAt = parsedSession.expires_at;
                        const now = Math.floor(Date.now() / 1000);
                        if (storedExpiresAt && storedExpiresAt < now) {
                            console.log('⚠️ AUTH: Stored session is expired, cannot use it');
                            throw new Error('Stored session is expired');
                        }
                        
                        console.log('🔄 AUTH: Setting stored session...');
                        await supabase.auth.setSession(parsedSession);
                        setSession(parsedSession);
                        await checkTosAcceptance(parsedSession.user.id);
                        return true;
                    } else {
                        console.log('⚠️ AUTH: No stored session found');
                    }
                } catch (storageError) {
                    console.error('❌ AUTH: Error accessing stored session:', storageError);
                }
                
                throw error;
            }
    
            if (refreshedSession) {
                console.log('✅ AUTH: Session successfully refreshed');
                setSession(refreshedSession);
                
                // Store the refreshed session
                try {
                    await AsyncStorage.setItem('session', JSON.stringify(refreshedSession));
                    console.log('💾 AUTH: Refreshed session saved to storage');
                } catch (storageError) {
                    console.error('❌ AUTH: Error saving refreshed session:', storageError);
                }
                
                await checkTosAcceptance(refreshedSession.user.id);
                return true;
            }
    
            console.log('❌ AUTH: No valid session found after refresh attempt');
            return false;
        } catch (error) {
            console.error('❌ AUTH: Auth refresh error:', error);
            if (session) {
                console.log('⚠️ AUTH: Error occurred but existing session found');
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
                console.log('🔄 AUTH: App moved to foreground - ' + new Date().toISOString());
                // Clear any background timer when app becomes active
                if (backgroundTimerRef.current) {
                    clearInterval(backgroundTimerRef.current);
                    backgroundTimerRef.current = null;
                }
                
                // Force a session refresh when app comes to foreground
                try {
                    console.log('🔄 AUTH: Checking session state after background...');
                    
                    // Set a timeout to prevent hanging
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Auth refresh timeout')), 10000)
                    );
                    
                    // First refresh the auth session with timeout protection
                    const refreshResult = await Promise.race([handleRefresh(), timeoutPromise])
                        .catch(error => {
                            console.error('❌ AUTH: Background refresh timed out or failed:', error);
                            // If timeout, still try to emit the refresh event
                            // so other components can try to refresh their data
                            return false;
                        });
                    
                    console.log('🔄 AUTH: Background refresh result:', refreshResult);
                    
                    // Then emit an event for other components to refresh their data
                    // We do this even if auth refresh failed, as we might still have a valid session
                    console.log('📣 AUTH: Emitting appRefresh event...');
                    DeviceEventEmitter.emit('appRefresh', { 
                        timestamp: Date.now(),
                        authRefreshed: refreshResult 
                    });
                } catch (error) {
                    console.error('❌ AUTH: Error refreshing on app foreground:', error);
                    // Still try to emit the refresh event so other components can try
                    DeviceEventEmitter.emit('appRefresh', { 
                        timestamp: Date.now(),
                        authRefreshed: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            } else if (nextAppState === 'background') {
                console.log('📱 AUTH: App moved to background - ' + new Date().toISOString());
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