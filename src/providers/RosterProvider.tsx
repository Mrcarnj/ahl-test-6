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
    allRosters: Roster[]; // Add this
    loading: boolean;
    error: string | null;
    refreshRoster: () => Promise<void>;
};

const RosterContext = createContext<RosterContext>({
    roster: null,
    allRosters: [],
    loading: false,
    error: null,
    refreshRoster: async () => {},
});

export default function RosterProvider({ children }: PropsWithChildren) {
    const { user } = useAuth();
    const [roster, setRoster] = useState<Roster | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allRosters, setAllRosters] = useState<Roster[]>([]); // Add this

    const fetchRoster = async () => {
        if (!user?.id) {
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // First get the logged-in user's roster (keep this as it was)
            const { data: userRosterData, error: userRosterError } = await supabase
                .from('roster')
                .select('*')
                .eq('auth_id', user.id)
                .single();

            setRoster(userRosterData);

            // Then fetch all rosters in a separate query
            const { data: allRostersData, error: allRostersError } = await supabase
                .from('roster')
                .select('*');

            setAllRosters(allRostersData || []);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An error occurred';
            console.error('Fetch roster error:', errorMessage);
            setError(errorMessage);
            setRoster(null);
            setAllRosters([]);
        } finally {
            setLoading(false);
        }
    };

        useEffect(() => {
            fetchRoster();
        }, [user?.id]);

    return (
        <RosterContext.Provider value={{ roster, allRosters, loading, error, refreshRoster: fetchRoster }}>
            {children}
        </RosterContext.Provider>
    );
}

export const useRoster = () => useContext(RosterContext);