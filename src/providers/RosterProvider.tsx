//src/providers/RosterProvider.tsx
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from "react";
import { safeAsyncStorage } from '../lib/asyncStorageWrapper';
import { withTimeout } from '../lib/withTimeout';
import { supabase } from "../lib/supabase";
import { fetchMyIcalUrl, ROSTER_COLUMNS } from '../lib/rosterColumns';
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

type RosterContextType = {
    roster: Roster | null;
    allRosters: Roster[];
    loading: boolean;
    error: string | null;
    /**
     * League-office admin (`roster.ahlAdmin`). They see every game rather than
     * an iCal-synced schedule of their own: no iCal setup, no game-change
     * alerts or game-day reminders, no game counts.
     */
    isAhlAdmin: boolean;
    refreshRoster: () => Promise<{ success: boolean; error?: string }>;
};

const RosterContext = createContext<RosterContextType>({
    roster: null,
    allRosters: [],
    loading: false,
    error: null,
    isAhlAdmin: false,
    refreshRoster: async () => ({ success: false }),
});

export default function RosterProvider({ children }: PropsWithChildren) {
    const { user } = useAuth();
    const [roster, setRoster] = useState<Roster | null>(null);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allRosters, setAllRosters] = useState<Roster[]>([]);
    // When the full officials list was last fetched. The list changes maybe
    // once a month, so it is reused for a day; the official's own row is
    // re-read on every launch (it holds the onboarding and admin flags).
    const lastAllFetchRef = useRef<number | null>(null);
    const allRostersRef = useRef<Roster[]>([]);
    allRostersRef.current = allRosters;
    const fetchRosterRef = useRef<(force?: boolean) => Promise<{ success: boolean; error?: string }>>(async () => ({ success: false }));
    const loadCachedDataRef = useRef<() => Promise<boolean>>(async () => false);

    const ROSTER_CACHE_VERSION = 1;
    const ALL_ROSTERS_TTL = 24 * 60 * 60 * 1000; // 24 hours
    const CACHE_KEY = user?.id ? `rosterCache_${user.id}` : 'rosterCache';

    // Shows whatever is cached, however old, so the Roster tab never waits on
    // the network. Returns whether a cache was found.
    const loadCachedData = async () => {
        try {
            const cachedData = await safeAsyncStorage.getItem(CACHE_KEY);
            if (cachedData) {
                const { roster, allRosters, timestamp, cacheVersion } = JSON.parse(cachedData);
                if (cacheVersion !== ROSTER_CACHE_VERSION) {
                    console.log('🧹 ROSTER: Cache version mismatch, clearing roster cache');
                    await safeAsyncStorage.removeItem(CACHE_KEY);
                    return false;
                }
                console.log('Using cached roster data');
                setRoster(roster);
                setAllRosters(allRosters);
                lastAllFetchRef.current = timestamp;
                return true;
            }
        } catch (e) {
            console.error('Error loading cache:', e);
        }
        return false;
    };
    loadCachedDataRef.current = loadCachedData;

    const saveToCache = async (rosterData: Roster | null, allRostersData: Roster[], timestamp: number) => {
        try {
            const cacheData = {
                roster: rosterData,
                allRosters: allRostersData,
                timestamp,
                cacheVersion: ROSTER_CACHE_VERSION,
            };
            await safeAsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (e) {
            console.error('Error saving to cache:', e);
        }
    };

    // Always re-reads the official's own row. The full list is re-read when
    // `force` is set (pull-to-refresh, onboarding) or once it is a day old.
    // Existing data stays on screen throughout, and through a failed fetch.
    const fetchRoster = async (force = false): Promise<{ success: boolean; error?: string }> => {
        if (!user?.id) return { success: false, error: 'No user' };

        const needAll = force
            || lastAllFetchRef.current === null
            || Date.now() - lastAllFetchRef.current > ALL_ROSTERS_TTL;

        try {
            setFetching(true);
            setError(null);

            const [{ data: userRosterRow, error: userRosterError }, icalUrl] = await withTimeout(
                Promise.all([
                    supabase
                        .from('roster')
                        .select(ROSTER_COLUMNS)
                        .eq('auth_id', user.id)
                        .single(),
                    fetchMyIcalUrl(),
                ]),
                12000,
                'Roster fetch'
            );

            if (userRosterError) throw userRosterError;
            const userRosterData = { ...(userRosterRow as unknown as Roster), ical_url: icalUrl };

            let allRostersList = allRostersRef.current;
            if (needAll) {
                const { data: allRostersData, error: allRostersError } = await withTimeout(
                    supabase
                        .from('roster')
                        .select(ROSTER_COLUMNS),
                    15000,
                    'All rosters fetch'
                );

                if (allRostersError) throw allRostersError;
                allRostersList = (allRostersData || []) as unknown as Roster[];
                lastAllFetchRef.current = Date.now();
                setAllRosters(allRostersList);
            }

            setRoster(userRosterData);

            await saveToCache(userRosterData, allRostersList, lastAllFetchRef.current ?? Date.now());

            return { success: true };
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An error occurred';
            console.error('Fetch roster error:', errorMessage);
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setFetching(false);
        }
    };
    fetchRosterRef.current = fetchRoster;

    // Clear roster data when user changes or logs out
    useEffect(() => {
        if (!user?.id) {
            console.log('🧹 No user ID, clearing roster data');
            setRoster(null);
            setAllRosters([]);
            lastAllFetchRef.current = null;
            setError(null);
        }
    }, [user?.id]);

    // Initial load - show the cache straight away, then refresh behind it.
    useEffect(() => {
        const initializeData = async () => {
            await loadCachedDataRef.current();
            fetchRosterRef.current();
        };

        if (user?.id) {
            initializeData();
        }
    }, [user?.id]);

    // Expose refreshRoster as a way to force fetch new data
    const refreshRoster = useCallback(() => fetchRosterRef.current(true), []);

    // Only "loading" when there is nothing to show yet; a refresh over
    // existing data happens silently.
    const loading = fetching && allRosters.length === 0;
    const isAhlAdmin = !!roster?.ahlAdmin;

    return (
        <RosterContext.Provider value={{ roster, allRosters, loading, error, isAhlAdmin, refreshRoster }}>
            {children}
        </RosterContext.Provider>
    );
}

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