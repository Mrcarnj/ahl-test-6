import { supabase } from "../lib/supabase";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider"; // Adjust import path as needed

// Define the Roster type based on your table structure
type Roster = {
    id: number;
    auth_id: string;
    email: string;
    firstname: string;
    lastname: string;
    lastfirstfullname: string;
    photo: string;
    phonenumber: string;
    admin: boolean;
    changedpassword: boolean;
    // Add other roster fields here
};

type RosterContext = {
    roster: Roster | null;
    loading: boolean;
    error: string | null;
    refreshRoster: () => Promise<void>;
};

const RosterContext = createContext<RosterContext>({
    roster: null,
    loading: false,
    error: null,
    refreshRoster: async () => {},
});

export default function RosterProvider({ children }: PropsWithChildren) {
    const { user } = useAuth();
    const [roster, setRoster] = useState<Roster | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchRoster = async () => {
        setError(null);
        if (!user?.id) {

        
        return;
        }
        try {
            setLoading(true);
            setError(null);

            const { data, error } = await supabase
                .from('roster')
                .select('*')
                .eq('auth_id', user.id)
                .single();

            if (error) throw error;
            setRoster(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An error occurred');
            setRoster(null);
        } finally {
            setLoading(false);
        }
    };

        useEffect(() => {
            fetchRoster();
        }, [user?.id]);

    return (
        <RosterContext.Provider value={{ roster, loading, error, refreshRoster: fetchRoster }}>
            {children}
        </RosterContext.Provider>
    );
}

export const useRoster = () => useContext(RosterContext);