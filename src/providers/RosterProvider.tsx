//src/providers/RosterProvider.tsx
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { safeAsyncStorage } from '../lib/asyncStorageWrapper';
import { supabase } from "../lib/supabase";
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
    isAdmin: boolean;
    changedpassword: boolean;
    ahlAdmin: boolean;
    accepted_tos: boolean;
    tos_accepted_at: string | null;
    ical_url: string | null;
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
    const [lastFetch, setLastFetch] = useState<Date | null>(null);
    
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const CACHE_KEY = user?.id ? `rosterCache_${user.id}` : 'rosterCache';

    const loadCachedData = async () => {
        try {
            const cachedData = await safeAsyncStorage.getItem(CACHE_KEY);
            if (cachedData) {
                const { roster, allRosters, timestamp } = JSON.parse(cachedData);
                const isExpired = new Date().getTime() - timestamp > CACHE_DURATION;
                
                if (!isExpired) {
                    console.log('Using cached roster data');
                    setRoster(roster);
                    setAllRosters(allRosters);
                    setLastFetch(new Date(timestamp));
                    return true; // Cache was valid and loaded
                }
            }
        } catch (e) {
            console.error('Error loading cache:', e);
        }
        return false; // No valid cache found
    };

    const saveToCache = async (rosterData: Roster | null, allRostersData: Roster[]) => {
        try {
            const cacheData = {
                roster: rosterData,
                allRosters: allRostersData,
                timestamp: new Date().getTime()
            };
            await safeAsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (e) {
            console.error('Error saving to cache:', e);
        }
    };

    const fetchRoster = async (force = false) => {
        if (!user?.id) return;

        // Check if we can use cached data
        if (!force && lastFetch && (new Date().getTime() - lastFetch.getTime() < CACHE_DURATION)) {
            console.log('Using memory-cached roster data');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Fetch user's roster
            const { data: userRosterData, error: userRosterError } = await supabase
                .from('roster')
                .select('*')
                .eq('auth_id', user.id)
                .single();

            if (userRosterError) throw userRosterError;

            // Fetch all rosters
            const { data: allRostersData, error: allRostersError } = await supabase
                .from('roster')
                .select('*');

            if (allRostersError) throw allRostersError;

            // Update state
            setRoster(userRosterData);
            setAllRosters(allRostersData || []);
            setLastFetch(new Date());

            // Save to cache
            await saveToCache(userRosterData, allRostersData || []);

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

    // Clear roster data when user changes or logs out
    useEffect(() => {
        if (!user?.id) {
            console.log('🧹 No user ID, clearing roster data');
            setRoster(null);
            setAllRosters([]);
            setLastFetch(null);
            setError(null);
        }
    }, [user?.id]);

    // Initial load - try cache first, then fetch if needed
    useEffect(() => {
        const initializeData = async () => {
            const hasCachedData = await loadCachedData();
            if (!hasCachedData) {
                fetchRoster();
            }
        };

        if (user?.id) {
            initializeData();
        }
    }, [user?.id]);

    // Expose refreshRoster as a way to force fetch new data
    const refreshRoster = async () => {
        return fetchRoster(true);
    };

    return (
        <RosterContext.Provider value={{ roster, allRosters, loading, error, refreshRoster: fetchRoster }}>
            {children}
        </RosterContext.Provider>
    );
}

export const getOfficialPhoto = (lastfirstfullname: string) => {
    if (lastfirstfullname) {
        // Simplified path - assuming logos are directly in the logos bucket
        const formattedName = lastfirstfullname.toLowerCase();
        const filePath = `roster/${formattedName}.png`;
        const { data: { publicUrl } } = supabase.storage.from('headshots').getPublicUrl(filePath);
        return publicUrl || 'https://via.placeholder.com/150';
    }
    return 'https://via.placeholder.com/150';
};

export const useRoster = () => useContext(RosterContext);

// Function to clear all roster caches (called on logout)
export const clearAllRosterCaches = async () => {
    try {
        console.log('🧹 Clearing all roster caches...');
        const keys = await safeAsyncStorage.getAllKeys();
        const rosterCacheKeys = keys.filter(key => key.startsWith('rosterCache'));
        
        for (const key of rosterCacheKeys) {
            await safeAsyncStorage.removeItem(key);
            console.log(`✅ Cleared cache: ${key}`);
        }
        
        if (rosterCacheKeys.length === 0) {
            console.log('ℹ️ No roster caches found to clear');
        } else {
            console.log(`✅ Cleared ${rosterCacheKeys.length} roster cache(s)`);
        }
    } catch (error) {
        console.error('❌ Error clearing roster caches:', error);
    }
};