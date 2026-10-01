// providers/AuthProvider.tsx
import { Session, User } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { safeAsyncStorage } from '../lib/asyncStorageWrapper';
import { supabase } from "../lib/supabase";
import { clearAllRosterCaches } from './RosterProvider';
import { APP_REFRESH_EVENT } from '../lib/events';
import { isWeb } from '../lib/platform';

type AuthContextType = {
    session: Session | null;
    user: User | null;
};

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
});

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [lastForegroundSyncAt, setLastForegroundSyncAt] = useState<number>(0);
    const startupSyncTriggeredRef = useRef(false);
    const lastBackgroundAtRef = useRef<number | null>(null);

    const triggerLoginSync = async () => {
        // Schedule sync is orchestrated by ScheduleProvider so we have one consistent pipeline
        // (iCal sync -> DB refresh -> stats/standings -> banner status).
        console.log('🔄 AUTH: Startup requested; schedule sync handled by ScheduleProvider');
        DeviceEventEmitter.emit(APP_REFRESH_EVENT, { source: 'auth_startup' });
    };

    // On app foreground, request a schedule sync refresh (debounced).
    //
    // Native only. On web, RN Web maps AppState to document visibility, so this
    // fires every time the user comes back to the app's browser tab — which is
    // not a "returning to the app" event the way it is on iOS/Android. The web
    // build therefore syncs on login/page load (the auth_startup emit below)
    // and on the manual refresh button, and never on tab focus.
    useEffect(() => {
        if (isWeb) return;

        const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
            if (next === 'background' || next === 'inactive') {
                lastBackgroundAtRef.current = Date.now();
                return;
            }
            if (next !== 'active') return;
            if (!session?.user) return;

            // Only force a “freshen up” sync if we were away long enough.
            const lastBg = lastBackgroundAtRef.current;
            if (lastBg && Date.now() - lastBg < 10 * 60 * 1000) {
                return;
            }

            const now = Date.now();
            // Debounce to avoid re-syncing too frequently when users bounce in/out quickly.
            if (now - lastForegroundSyncAt < 5 * 60 * 1000) {
                return;
            }
            setLastForegroundSyncAt(now);

            DeviceEventEmitter.emit(APP_REFRESH_EVENT, { source: 'foreground' });
        });

        return () => sub.remove();
    }, [session?.user, lastForegroundSyncAt]);

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
                    // Trigger sync for stored session (app startup)
                    if (parsedSession.user) {
                        console.log('🔄 AUTH: App started with stored session, triggering sync...');
                        if (!startupSyncTriggeredRef.current) {
                            startupSyncTriggeredRef.current = true;
                            triggerLoginSync();
                        }
                    }
                }

                // Get Supabase session
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                console.log('Current Supabase session:', currentSession ? 'exists' : 'none');

                if (currentSession) {
                    console.log('Setting current session');
                    setSession(currentSession);
                    await safeAsyncStorage.setItem('session', JSON.stringify(currentSession));
                    // Trigger sync for current session (app startup)
                    console.log('🔄 AUTH: App started with current session, triggering sync...');
                    if (!startupSyncTriggeredRef.current) {
                        startupSyncTriggeredRef.current = true;
                        triggerLoginSync();
                    }
                }

                // Set up auth listener
                const { data: { subscription } } = supabase.auth.onAuthStateChange(
                    async (event, session) => {
                        console.log('Auth state change:', event, session ? 'with session' : 'no session');
                        
                        if (session) {
                            setSession(session);
                            await safeAsyncStorage.setItem('session', JSON.stringify(session));
                            
                            // Trigger sync on successful authentication
                            if (event === 'SIGNED_IN') {
                                // On web, supabase-js re-validates the stored session when the
                                // browser tab regains focus and can re-emit SIGNED_IN for the
                                // same session. Gating on the startup ref keeps that from
                                // turning a tab switch into a schedule sync; the ref is
                                // cleared on SIGNED_OUT so a real re-login still syncs.
                                if (isWeb && startupSyncTriggeredRef.current) {
                                    console.log('⊘ AUTH: SIGNED_IN on web after startup sync — not re-syncing');
                                } else {
                                    console.log('🔄 AUTH: User signed in, triggering sync...');
                                    startupSyncTriggeredRef.current = true;
                                    // Run sync in background without blocking the auth flow
                                    triggerLoginSync();
                                }
                            }
                        } else {
                            if (event === 'SIGNED_OUT') {
                                console.log('Explicit sign out, clearing session');
                                startupSyncTriggeredRef.current = false;
                                setSession(null);
                                await safeAsyncStorage.removeItem('session');
                                // Clear all user-specific caches on logout
                                await clearAllRosterCaches();
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