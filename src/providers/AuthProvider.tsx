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

// Where this provider used to keep its own copy of the session. Read once,
// to migrate, then deleted.
const LEGACY_SESSION_KEY = 'session';

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

    // The Supabase client is the only owner of the session: it persists it,
    // rotates the refresh token and signs out when a refresh is refused. This
    // provider just mirrors what the client reports.
    //
    // It used to keep its own copy under the 'session' key and push it back
    // into the client with setSession() on every launch, before subscribing.
    // A copy whose refresh token had already been rotated made that refresh
    // fail; the client signed itself out, the SIGNED_OUT event fired before
    // anyone was listening, and the app went on showing a "signed-in" user
    // whose every query ran as anon. Under RLS that is an empty schedule and
    // "permission denied for function get_my_ical_url", fixed only by
    // signing out and back in.
    useEffect(() => {
        const startSync = () => {
            if (!startupSyncTriggeredRef.current) {
                startupSyncTriggeredRef.current = true;
                triggerLoginSync();
            }
        };

        // Subscribe first, so nothing the client does during start-up (a
        // refresh, or a sign-out because the refresh was refused) is missed.
        // No awaiting supabase calls in here: the client holds a lock while
        // it runs these callbacks.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            console.log('Auth state change:', event, nextSession ? 'with session' : 'no session');
            setSession(nextSession);

            if (event === 'INITIAL_SESSION' && nextSession) {
                console.log('🔄 AUTH: App started with a stored session, triggering sync...');
                startSync();
            } else if (event === 'SIGNED_IN') {
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
                    triggerLoginSync();
                }
            } else if (event === 'SIGNED_OUT') {
                console.log('Signed out, clearing user caches');
                startupSyncTriggeredRef.current = false;
                // Clear all user-specific caches on logout
                void clearAllRosterCaches();
            }
        });

        // One-time move off the old 'session' copy. Normally the client has
        // its own stored session and the copy is just deleted. Only if the
        // client has none is the copy tried; if its refresh token is dead the
        // user lands on the login screen, never in a half-signed-in app.
        const migrateLegacySession = async () => {
            try {
                const legacy = await safeAsyncStorage.getItem(LEGACY_SESSION_KEY);
                if (!legacy) return;
                await safeAsyncStorage.removeItem(LEGACY_SESSION_KEY);
                const { data: { session: current } } = await supabase.auth.getSession();
                if (current) return;
                const parsed = JSON.parse(legacy);
                if (parsed?.access_token && parsed?.refresh_token) {
                    const { error } = await supabase.auth.setSession(parsed);
                    if (error) console.log('AUTH: Old stored session no longer valid; user must sign in');
                }
            } catch (error) {
                console.error('Error migrating stored session:', error);
            }
        };
        void migrateLegacySession();

        supabase.auth.startAutoRefresh();

        return () => subscription.unsubscribe();
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