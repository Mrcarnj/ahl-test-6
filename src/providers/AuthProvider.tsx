import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { AppState, AppStateStatus } from 'react-native';

type AuthContext = {
    session: Session | null;
    user: User | null;
};

const AuthContext = createContext<AuthContext>({
    session: null,
    user: null,
});

export default function AuthProvider({children}: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log('Initial session:', session);
            setSession(session);
        });

        // Handle app state changes
        const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                console.log('App became active, starting auto refresh');
                supabase.auth.startAutoRefresh();
            } else if (nextAppState === 'background' || nextAppState === 'inactive') {
                console.log('App going to background, stopping auto refresh');
                supabase.auth.stopAutoRefresh();
            }
        });

        // Listen for auth changes
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                console.log('Auth state changed:', _event);
                setSession(session);
            }
        );

        // Initial auto refresh start
        supabase.auth.startAutoRefresh();

        // Cleanup on unmount
        return () => {
            authSubscription.unsubscribe();
            subscription.remove();
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