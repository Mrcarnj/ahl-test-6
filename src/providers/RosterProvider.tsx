//src/providers/RosterProvider.tsx
import { supabase } from "../lib/supabase";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider"; // Adjust import path as needed
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";

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
    const CACHE_KEY = 'rosterCache';

    const loadCachedData = async () => {
        try {
            const cachedData = await AsyncStorage.getItem(CACHE_KEY);
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
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (e) {
            console.error('Error saving to cache:', e);
        }
    };

    const fetchRoster = async (force = false) => {
        if (!user?.id) {
            console.log('❌ ROSTER: Fetch aborted - No user ID available');
            return;
        }
    
        try {
            console.log('🔄 ROSTER: Starting fetch sequence - ' + new Date().toISOString());
            setLoading(true);
            setError(null);
    
            console.log('👤 ROSTER: Fetching user roster...');
            const userFetchStart = Date.now();
            
            const { data: userRosterData, error: userRosterError } = await supabase
                .from('roster')
                .select('*')
                .eq('auth_id', user.id)
                .single();
                
            console.log(`🕒 ROSTER: User roster fetch took ${Date.now() - userFetchStart}ms`);
    
            if (userRosterError) {
                console.error('❌ ROSTER: User roster fetch error:', userRosterError);
                throw userRosterError;
            }
    
            console.log('👥 ROSTER: Fetching all rosters...');
            const allFetchStart = Date.now();
            
            const { data: allRostersData, error: allRostersError } = await supabase
                .from('roster')
                .select('*');
                
            console.log(`🕒 ROSTER: All rosters fetch took ${Date.now() - allFetchStart}ms`);
    
            if (allRostersError) {
                console.error('❌ ROSTER: All rosters fetch error:', allRostersError);
                throw allRostersError;
            }
    
            console.log('✅ ROSTER: Data fetched successfully');
            console.log(`📊 ROSTER: Processing ${allRostersData?.length || 0} roster entries...`);
            
            setRoster(userRosterData);
            setAllRosters(allRostersData || []);
            
            // Update the cache
            try {
                await saveToCache(userRosterData, allRostersData || []);
                console.log('💾 ROSTER: Cache updated successfully');
            } catch (cacheError) {
                console.error('⚠️ ROSTER: Cache update failed:', cacheError);
                // Continue even if cache fails
            }
            
            console.log('✅ ROSTER: Fetch and processing complete - ' + new Date().toISOString());
    
        } catch (error) {
            console.error('❌ ROSTER: Fetch error:', error);
            setError(error instanceof Error ? error.message : 'An error occurred');
            
            // Try to load from cache if fetch fails
            try {
                console.log('🔍 ROSTER: Attempting to load from cache after fetch failure...');
                const cacheLoaded = await loadCachedData();
                if (cacheLoaded) {
                    console.log('✅ ROSTER: Successfully loaded from cache after fetch failure');
                } else {
                    console.log('⚠️ ROSTER: No valid cache available after fetch failure');
                }
            } catch (cacheError) {
                console.error('❌ ROSTER: Cache load after fetch failure error:', cacheError);
            }
        } finally {
            setLoading(false);
            console.log('🔄 ROSTER: Loading state reset');
        }
    };

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

    // Listen for app refresh events (when app comes back from background)
    useEffect(() => {
        if (!user?.id) return;
        
        console.log('🔄 ROSTER: Setting up app refresh listener...');
        
        const appRefreshListener = DeviceEventEmitter.addListener('appRefresh', async (data) => {
            console.log('📱 ROSTER: App refresh event received - ' + new Date().toISOString(), data);
            
            if (!loading) {
                try {
                    console.log('🔄 ROSTER: Starting background refresh...');
                    setLoading(true);
                    
                    // Set a timeout to prevent hanging
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Roster refresh timeout')), 10000)
                    );
                    
                    // Attempt to refresh with timeout protection
                    await Promise.race([fetchRoster(true), timeoutPromise])
                        .catch(error => {
                            console.error('❌ ROSTER: Background refresh timed out or failed:', error);
                        });
                        
                    console.log('✅ ROSTER: Background refresh complete');
                } catch (error) {
                    console.error('❌ ROSTER: Background refresh error:', error);
                } finally {
                    setLoading(false);
                    console.log('🔄 ROSTER: Loading state reset after background refresh');
                }
            } else {
                console.log('⚠️ ROSTER: Skipping background refresh due to ongoing operations');
            }
        });
        
        return () => {
            console.log('🧹 ROSTER: Cleaning up app refresh listener...');
            appRefreshListener.remove();
        };
    }, [user?.id, loading]);

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