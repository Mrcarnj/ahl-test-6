// providers/AuthProvider.tsx
import { Session, User } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { safeAsyncStorage } from '../lib/asyncStorageWrapper';
import { AUTH_STORAGE_KEY, supabase } from "../lib/supabase";
import { clearAllRosterCaches } from './RosterProvider';
import { APP_REFRESH_EVENT } from '../lib/events';
import { isWeb } from '../lib/platform';

type AuthContextType = {
    session: Session | null;
    user: User | null;
    // True until the stored session (or its absence) is known. Nothing should
    // route on `session` before then.
    initializing: boolean;
    // True while the forgot-password screen is mid-reset. Verifying the
    // emailed code signs the user in; this keeps the root layout on (auth)
    // until the new password is saved, instead of dropping them into the app.
    recoveringPassword: boolean;
    setRecoveringPassword: (recovering: boolean) => void;
};

// Where this provider used to keep its own copy of the session. Read once,
// to migrate, then deleted.
const LEGACY_SESSION_KEY = 'session';

// Bump AUTH_EPOCH to sign everyone out once, on the first launch of the
// update that carries the bump. Only for an update that can't run on an
// existing session (one that needs everyone to sign in again); otherwise a
// session lasts until the official signs out. Never lower it.
export const AUTH_EPOCH = 1;
const AUTH_EPOCH_KEY = 'authEpoch';

// A device with no stored epoch predates this check and counts as epoch 1.
const applyAuthEpoch = async () => {
    try {
        const raw = await safeAsyncStorage.getItem(AUTH_EPOCH_KEY);
        const stored = raw === null ? 1 : Number(raw) || 1;
        if (stored < AUTH_EPOCH) {
            console.log(`AUTH: Sign-in epoch ${stored} -> ${AUTH_EPOCH}; signing out for this update`);
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            // signOut keeps the session when it can't reach the server;
            // drop it from storage directly so the update still takes.
            if (error) await safeAsyncStorage.removeItem(AUTH_STORAGE_KEY);
        }
        if (raw !== String(AUTH_EPOCH)) {
            await safeAsyncStorage.setItem(AUTH_EPOCH_KEY, String(AUTH_EPOCH));
        }
    } catch (error) {
        console.error('Error checking sign-in epoch:', error);
    }
};

// One-time move off the old 'session' copy. Normally the client has its own
// stored session and the copy is just deleted. Only if the client has none is
// the copy tried; if its refresh token is dead the user lands on the login
// screen, never in a half-signed-in app.
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

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    initializing: true,
    recoveringPassword: false,
    setRecoveringPassword: () => {},
});

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [initializing, setInitializing] = useState(true);
    const [recoveringPassword, setRecoveringPassword] = useState(false);
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
    // provider mirrors what the client reports, with one exception (below).
    //
    // It used to keep its own copy under the 'session' key and push it back
    // into the client with setSession() on every launch, before subscribing.
    // A copy whose refresh token had already been rotated made that refresh
    // fail; the client signed itself out, the SIGNED_OUT event fired before
    // anyone was listening, and the app went on showing a "signed-in" user
    // whose every query ran as anon. Under RLS that is an empty schedule and
    // "permission denied for function get_my_ical_url", fixed only by
    // signing out and back in.
    //
    // The exception: only SIGNED_OUT signs the user out. After a while away
    // the app cold-starts with an expired access token, and if the refresh
    // fails for a passing reason (network not back yet, a 503) the client
    // keeps the session in storage but still reports INITIAL_SESSION with
    // none. Treating that as signed out sent officials to the login screen
    // although their session was fine. Instead the stored session is shown
    // and the client's auto-refresh retries; its TOKEN_REFRESHED starts the
    // sync. A refresh the server refuses still ends in SIGNED_OUT.
    useEffect(() => {
        let cancelled = false;
        let subscription: { unsubscribe: () => void } | null = null;
        // Bumped on each sign-out, so a stored-session read already under way
        // can't bring back a session that has just ended.
        let signOutCount = 0;

        const startSync = () => {
            if (!startupSyncTriggeredRef.current) {
                startupSyncTriggeredRef.current = true;
                triggerLoginSync();
            }
        };

        const showStoredSession = async () => {
            const count = signOutCount;
            let stored: Session | null = null;
            try {
                const raw = await safeAsyncStorage.getItem(AUTH_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : null;
                if (parsed?.refresh_token && parsed?.user) stored = parsed;
            } catch (error) {
                console.error('Error reading stored session:', error);
            }
            if (cancelled || count !== signOutCount) return;
            if (stored) {
                console.log('AUTH: Session not refreshed yet; staying signed in while the client retries');
                setSession(stored);
            }
            setInitializing(false);
        };

        const setup = async () => {
            // Both before subscribing, so INITIAL_SESSION reports where they
            // left things (migrating first, so an epoch sign-out can't be
            // undone by an old copy).
            await migrateLegacySession();
            await applyAuthEpoch();
            if (cancelled) return;

            // No awaiting supabase calls in here: the client holds a lock
            // while it runs these callbacks.
            const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
                console.log('Auth state change:', event, nextSession ? 'with session' : 'no session');

                if (event === 'SIGNED_OUT') {
                    console.log('Signed out, clearing user caches');
                    signOutCount++;
                    setSession(null);
                    setInitializing(false);
                    startupSyncTriggeredRef.current = false;
                    // Clear all user-specific caches on logout
                    void clearAllRosterCaches();
                    return;
                }

                if (!nextSession) {
                    if (event === 'INITIAL_SESSION') void showStoredSession();
                    return;
                }

                setSession(nextSession);
                setInitializing(false);

                if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                    // TOKEN_REFRESHED matters after showStoredSession: the
                    // sync waits until queries carry a valid token. Later
                    // refreshes find the sync already started.
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
                }
            });
            subscription = data.subscription;

            supabase.auth.startAutoRefresh();
        };
        void setup();

        return () => {
            cancelled = true;
            subscription?.unsubscribe();
        };
    }, []);

    useEffect(() => {
        console.log('Session state changed:', session ? 'exists' : 'none');
    }, [session]);

    return (
        <AuthContext.Provider value={{ 
            session,
            user: session?.user ?? null,
            initializing,
            recoveringPassword,
            setRecoveringPassword,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);