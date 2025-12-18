//src/providers/ScheduleProvider.tsx
import { format, parse } from "date-fns";
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import {
    shouldSyncPlayerRoster,
    shouldSyncPlayerStats,
    shouldSyncTeamStandings,
    syncPlayerRoster,
    syncPlayerStats,
    syncTeamStandings,
} from "../lib/playerStatsSync";
import { sendGameChangeNotification } from "../lib/notificationService";
import { supabase } from "../lib/supabase";
import { useRoster } from "./RosterProvider";
import { APP_REFRESH_EVENT } from "../lib/events";

// Import or define interfaces
export interface Roster {
    id: number;
    auth_id: string;
    email: string;
    firstname: string;
    lastname: string;
    lastfirstfullname: string;
    photo: string | null;
    phonenumber: string;
    isAdmin: boolean;      // changed from admin to isAdmin
    ahlAdmin: boolean;     // added this field
    changedpassword: boolean;
    ical_url: string | null;
}

export interface Schedule {
    id: number;
    awayteam: string;
    gamedate: string;   // 'YYYY-MM-DD' format
    gameid: string;
    gametime: string;   // includes timezone
    hometeam: string;
    linesperson1: string;
    linesperson2: string;
    referee1: string;
    referee2: string;
    uuid: string;
    created_at: string;
    updated_at: string;
    season: string;
    gamecode: string;
    homeTeamData?: Team;  // For joined data
    awayTeamData?: Team;  // For joined data
}

export interface Team {
    id: number;
    city: string;
    abbreviation: string;
    headcoachname: string;
    headcoachpic: string | null;
    assistantcoach1: string;
    assistantcoach2: string;
    arenaname: string;
    timezone: string;
    arenaaddress: string;
    eqname: string;
    eqphone: string;
    logo: string | null;
    parking_latitude: number;
    parking_longitude: number;
    parking_instructions: string;
    locker_room_instructions: string;
    division: string | null;
    games_played: string | null;
    wins: string | null;
    losses: string | null;
    otl: string | null;
    sol: string | null;
    points: string | null;
    division_rank: string | null;
    overall_rank: string | null;
}

export interface TeamRoster {
    id: number;
    team: string;
    player_name: string;
    position: string;
    games_played: number;
    goals: number;
    assists: number;
    points: number;
    plusMinus: number;
    penalty_minutes: number;
    power_play_goals: number;
    number: string | null;
    rookie: boolean | null;
    veteran: boolean | null;
}

type ScheduleContext = {
    allGames: Schedule[];
    myGames: Schedule[];
    teamRosters: TeamRoster[];
    loading: boolean;
    syncingPlayerStats: boolean; // kept for compatibility (stats OR standings)
    syncingSchedule: boolean;
    syncingStats: boolean;
    syncingStandings: boolean;
    error: string | null;
    refreshSchedule: () => Promise<{ success: boolean; error?: string }>;
    realtimeEnabled: boolean;
};

const ScheduleContext = createContext<ScheduleContext>({
    allGames: [],
    myGames: [],
    teamRosters: [],
    loading: false,
    syncingPlayerStats: false,
    syncingSchedule: false,
    syncingStats: false,
    syncingStandings: false,
    error: null,
    refreshSchedule: async () => ({ success: false }),
    realtimeEnabled: false,
});

export default function ScheduleProvider({ children }: PropsWithChildren) {
    const { roster } = useRoster();
    const [allGames, setAllGames] = useState<Schedule[]>([]);
    const [myGames, setMyGames] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncingStats, setSyncingStats] = useState(false);
    const [syncingStandings, setSyncingStandings] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [teamRosters, setTeamRosters] = useState<TeamRoster[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [realtimeEnabled, setRealtimeEnabled] = useState(false);
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

    const fetchSchedule = async (): Promise<{ success: boolean; error?: string }> => {
        if (!roster?.lastfirstfullname) {
            console.log('❌ SCHEDULE: Fetch aborted - No roster data available');
            return { success: false, error: 'No roster data available' };
        }
    
        try {
            console.log('🔄 SCHEDULE: Starting fetch sequence - ' + new Date().toISOString());
            setLoading(true);
            setError(null);
    
            console.log('📅 SCHEDULE: Fetching schedule data with team details...');
            const fetchStart = Date.now();
            
            // Fetch all games with team data
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedule')
                .select(`
                    *,
                    homeTeamData:teams!schedule_hometeam_fkey(*),
                    awayTeamData:teams!schedule_awayteam_fkey(*)
                `)
                .or(`referee1.eq."${roster.lastfirstfullname}",referee2.eq."${roster.lastfirstfullname}",linesperson1.eq."${roster.lastfirstfullname}",linesperson2.eq."${roster.lastfirstfullname}"`)
                .order('gamedate', { ascending: true })
                .order('gametime', { ascending: true });
                
            console.log(`🕒 SCHEDULE: Schedule fetch took ${Date.now() - fetchStart}ms`);
    
            console.log('👥 SCHEDULE: Fetching team rosters data...');
            const rostersStart = Date.now();
            
            const { data: rostersData, error: rostersError } = await supabase
                .from('teamRosters')
                .select('*');
                
            console.log(`🕒 SCHEDULE: Team rosters fetch took ${Date.now() - rostersStart}ms`);
    
            if (rostersError) {
                console.error('❌ SCHEDULE: Team rosters fetch error:', rostersError);
                throw rostersError;
            }
            if (scheduleError) {
                console.error('❌ SCHEDULE: Schedule fetch error:', scheduleError);
                throw scheduleError;
            }
    
            console.log('✅ SCHEDULE: Raw data fetched successfully');
            console.log(`📊 SCHEDULE: Processing ${scheduleData?.length || 0} games...`);
    
            // Process and set all games
            const processedGames = scheduleData || [];
            setAllGames(processedGames);
            setTeamRosters(rostersData);
    
            console.log('🔍 SCHEDULE: Filtering games for official:', roster.lastfirstfullname);
            // Since we're already filtering at the database level, we can just use the processed games directly
            setMyGames(processedGames);
            console.log(`✅ SCHEDULE: Found ${processedGames.length} assigned games`);
            console.log('✅ SCHEDULE: Fetch and processing complete - ' + new Date().toISOString());
            return { success: true };
    
        } catch (error) {
            console.error('❌ SCHEDULE: Fetch error:', error);
            const msg = error instanceof Error ? error.message : 'An error occurred';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setLoading(false);
            console.log('🔄 SCHEDULE: Loading state reset');
        }
    };

    const runBackgroundSyncs = async () => {
        try {
            const shouldStats = await shouldSyncPlayerStats();
            const shouldRoster = await shouldSyncPlayerRoster();
            const shouldStandings = await shouldSyncTeamStandings();

            if (shouldStats || shouldRoster) {
                setSyncingStats(true);
            }
            if (shouldStandings) {
                setSyncingStandings(true);
            }

            if (shouldStats) {
                console.log('🔄 PLAYER SYNC: Running player stats sync...');
                await syncPlayerStats();
            } else {
                console.log('⏭️ PLAYER SYNC: Player stats sync not needed (recent sync found)');
            }

            if (shouldRoster) {
                console.log('🔄 PLAYER SYNC: Running player roster sync...');
                await syncPlayerRoster();
            } else {
                console.log('⏭️ PLAYER SYNC: Player roster sync not needed (recent sync found)');
            }

            if (shouldStandings) {
                console.log('🔄 TEAM SYNC: Running team standings sync...');
                await syncTeamStandings();
            } else {
                console.log('⏭️ TEAM SYNC: Team standings sync not needed (recent sync found)');
            }
        } catch (e) {
            console.error('❌ SYNC: Error performing background syncs:', e);
        } finally {
            setSyncingStats(false);
            setSyncingStandings(false);
        }
    };
    
    // Setup real-time subscription to schedule table
    useEffect(() => {
        if (!roster?.lastfirstfullname) return;
        
        console.log('🔌 Setting up real-time subscription to schedule table...');
        setRealtimeEnabled(false);
        
        const setupSubscription = async () => {
            // Clean up any existing subscription
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
                subscriptionRef.current = null;
            }
            
            // Set up new subscription
            const subscription = supabase
                .channel('schedule-changes')
                .on('postgres_changes', {
                    event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'schedule',
                }, async (payload) => {
                    console.log('🔄 Real-time update received:', payload);
                    
                    // Check if the change is relevant to the current user
                    const newData = payload.new as Schedule;
                    const oldData = payload.old as Schedule;
                    
                    const isRelevantToUser = (data: any) => {
                        if (!data) return false;
                        return data.referee1 === roster.lastfirstfullname ||
                               data.referee2 === roster.lastfirstfullname ||
                               data.linesperson1 === roster.lastfirstfullname ||
                               data.linesperson2 === roster.lastfirstfullname;
                    };
                    
                    // If the change affects the current user's games
                    if (isRelevantToUser(newData) || isRelevantToUser(oldData)) {
                        console.log('🔄 Change affects current user, processing...');
                        
                        // Detect what changed and send notification if needed
                        if (oldData && newData && payload.eventType === 'UPDATE') {
                            // Helper function to normalize field values for comparison
                            const normalizeValue = (value: any): string | null => {
                                if (value === null || value === undefined) return null;
                                let normalized = String(value).trim();
                                // Normalize timezone formats
                                normalized = normalized.replace(/([+-]\d{2}):(\d{2})$/, '$1');
                                return normalized;
                            };
                            
                            // Fields that trigger notifications
                            const notificationFields = ['referee1', 'referee2', 'linesperson1', 'linesperson2', 'gametime'];
                            const changedFields: string[] = [];
                            
                            for (const field of notificationFields) {
                                const oldValue = normalizeValue(oldData[field as keyof Schedule]);
                                const newValue = normalizeValue(newData[field as keyof Schedule]);
                                
                                if (oldValue !== newValue) {
                                    changedFields.push(`${field}: "${oldValue}" → "${newValue}"`);
                                }
                            }
                            
                            // Send notification if there are notification-worthy changes
                            if (changedFields.length > 0) {
                                console.log(`📱 Real-time change detected: ${changedFields.join(', ')}`);
                                
                                // Determine who was replaced (if any)
                                let replacedPerson: string | undefined = undefined;
                                const officialFields = ['referee1', 'referee2', 'linesperson1', 'linesperson2'];
                                for (const change of changedFields) {
                                    if (officialFields.some(field => change.startsWith(field))) {
                                        const oldValueMatch = change.match(/→ "([^"]+)"/);
                                        const oldValueBeforeMatch = change.match(/"([^"]+)" →/);
                                        if (oldValueBeforeMatch && oldValueBeforeMatch[1] !== 'null') {
                                            replacedPerson = oldValueBeforeMatch[1];
                                            break;
                                        }
                                    }
                                }
                                
                                // Send notification
                                try {
                                    await sendGameChangeNotification(
                                        newData.gameid,
                                        newData.season,
                                        {
                                            awayteam: newData.awayteam,
                                            hometeam: newData.hometeam,
                                            gamedate: newData.gamedate,
                                            gametime: newData.gametime,
                                        },
                                        changedFields,
                                        replacedPerson
                                    );
                                    console.log('✅ Notification sent for real-time change');
                                } catch (error) {
                                    console.error('❌ Error sending notification for real-time change:', error);
                                }
                            }
                        }
                        
                        // Refresh the schedule to update the UI
                        console.log('🔄 Refreshing schedule...');
                        await fetchSchedule();
                    } else {
                        console.log('ℹ️ Change does not affect current user, skipping refresh');
                    }
                })
                .subscribe((status) => {
                    console.log('Subscription status:', status);
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Successfully subscribed to schedule changes');
                        setRealtimeEnabled(true);
                    }
                });
                
            subscriptionRef.current = subscription;
        };
        
        setupSubscription();
        
        // Cleanup subscription when component unmounts or roster changes
        return () => {
            console.log('🧹 Cleaning up schedule subscription...');
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
                subscriptionRef.current = null;
            }
            setRealtimeEnabled(false);
        };
    }, [roster?.lastfirstfullname]);

    // Fetch schedule when roster data changes
    useEffect(() => {
        if (roster?.lastfirstfullname && !loading && !isRefreshing) {
            console.log('👤 Roster data changed, triggering schedule fetch...');
            console.log('📋 Current state - loading:', loading, 'refreshing:', isRefreshing);
            fetchSchedule();
            
            // Also run player stats sync on first load (but not on manual refresh)
            // This runs in the background and doesn't block the UI
            runBackgroundSyncs();
        } else {
            console.log('⏳ Skipping schedule fetch:', {
                hasRoster: !!roster?.lastfirstfullname,
                loading,
                isRefreshing
            });
        }
    }, [roster?.lastfirstfullname]);

    // Listen for app refresh events (triggered by notification/background sync)
    useEffect(() => {
        if (!roster?.lastfirstfullname) return;
        
        console.log('🔄 SCHEDULE: Setting up app refresh listener...');
        
        const appRefreshListener = DeviceEventEmitter.addListener(APP_REFRESH_EVENT, async (data) => {
            console.log('📱 SCHEDULE: App refresh event received - ' + new Date().toISOString(), data);
            
            if (!loading && !isRefreshing) {
                try {
                    console.log('🔄 SCHEDULE: Starting background refresh...');
                    setIsRefreshing(true);
                    
                    // Set a timeout to prevent hanging
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Schedule refresh timeout')), 10000)
                    );
                    
                    // Attempt to refresh with timeout protection
                    await Promise.race([fetchSchedule(), timeoutPromise])
                        .catch(error => {
                            console.error('❌ SCHEDULE: Background refresh timed out or failed:', error);
                        });
                    
                    // Also run player stats sync on app refresh (daily refresh)
                    // This runs in the background and doesn't block the UI
                    runBackgroundSyncs();
                        
                    console.log('✅ SCHEDULE: Background refresh complete');
                } catch (error) {
                    console.error('❌ SCHEDULE: Background refresh error:', error);
                } finally {
                    setIsRefreshing(false);
                    console.log('🔄 SCHEDULE: Refresh state reset after background refresh');
                }
            } else {
                console.log('⚠️ SCHEDULE: Skipping background refresh due to ongoing operations');
            }
        });
        
        return () => {
            console.log('🧹 SCHEDULE: Cleaning up app refresh listener...');
            appRefreshListener.remove();
        };
    }, [roster?.lastfirstfullname, loading, isRefreshing]);

    // Expose the refresh function
    const refreshSchedule = async (): Promise<{ success: boolean; error?: string }> => {
        if (isRefreshing || loading) {
            console.log('⚠️ SCHEDULE: Refresh already in progress, skipping...');
            return { success: false, error: 'Refresh already in progress' };
        }
        
        try {
            console.log('🔄 SCHEDULE: Starting manual refresh - ' + new Date().toISOString());
            setIsRefreshing(true);
            
            // Set a timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => {
                    console.error('⏱️ SCHEDULE: Refresh timeout reached');
                    reject(new Error('Schedule refresh timeout'));
                }, 15000)
            );
            
            // Attempt to fetch with timeout protection
            const result = await Promise.race([fetchSchedule(), timeoutPromise]) as { success: boolean; error?: string };
                
            console.log('✅ SCHEDULE: Manual refresh complete');
            return result;
        } catch (error) {
            console.error('❌ SCHEDULE: Manual refresh error:', error);
            // Reset state even on error
            return { success: false, error: error instanceof Error ? error.message : 'An error occurred' };
        } finally {
            // Ensure we always reset the loading state
            setIsRefreshing(false);
            console.log('🔄 SCHEDULE: Refresh state reset after manual refresh');
        }
    };

    return (
        <ScheduleContext.Provider value={{
            allGames,
            myGames,
            teamRosters,
            loading: loading || isRefreshing,
            syncingPlayerStats: syncingStats || syncingStandings,
            syncingSchedule: loading || isRefreshing,
            syncingStats,
            syncingStandings,
            error,
            refreshSchedule,
            realtimeEnabled
        }}>
            {children}
        </ScheduleContext.Provider>
    );
}

// Custom hook to use schedule data
export const useSchedule = () => {
    const context = useContext(ScheduleContext);
    if (context === undefined) {
        throw new Error('useSchedule must be used within a ScheduleProvider');
    }
    return context;
};

// Helper Functions
export const formatGameDate = (dateString: string) => {
    const date = parse(dateString, 'yyyy-MM-dd', new Date());
    return format(date, 'EEE. MMMM d, yyyy');
};

export const formatGameDate2 = (dateString: string) => {
    const date = parse(dateString, 'yyyy-MM-dd', new Date());
    return format(date, 'MM/d/yyyy');
};

// Updated getTeamLogo function
export const getTeamLogo = (team?: Team) => {
    if (team?.abbreviation) {
        // Simplified path - assuming logos are directly in the logos bucket
        const filePath = `${team.abbreviation}.png`;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(filePath);
        return publicUrl || 'https://via.placeholder.com/150';
    }
    return 'https://via.placeholder.com/150';
};

export const getTeamCoach = (team?: Team) => {
    if (team?.abbreviation) {
        // Simplified path - assuming logos are directly in the logos bucket
        const filePath = `headCoaches/${team.abbreviation}.png`;
        const { data: { publicUrl } } = supabase.storage.from('headshots').getPublicUrl(filePath);
        return publicUrl || 'https://via.placeholder.com/150';
    }
    return 'https://via.placeholder.com/150';
};

export const formatGameTime = (timetz: string, gameDate: string) => {
    const [time, offset] = timetz.split(/[+-]/);
    const [hours, minutes] = time.split(':');

    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;

    const date = parse(gameDate, 'yyyy-MM-dd', new Date());
    const isDST = (() => {
        const year = date.getFullYear();
        const dstStart = new Date(year, 2, year === 2024 ? 10 : 9);
        const dstEnd = new Date(year, 10, year === 2024 ? 3 : 2);
        return date >= dstStart && date < dstEnd;
    })();

    const getTimezoneAbbr = (offset: string) => {
        const gmtOffset = timetz.includes('+') ? `+${offset}` : `-${offset}`;
        switch (gmtOffset) {
            case '-04':
                return isDST ? 'EDT' : 'EST';
            case '-05':
                return isDST ? 'EDT' : 'EST';
            case '-06':
                return isDST ? 'CDT' : 'CST';
            case '-07':
                return isDST ? 'MDT' : 'MST';
            case '-08':
                return isDST ? 'PDT' : 'PST';
            default:
                return `GMT${gmtOffset}`;
        }
    };

    return `${hour12}:${minutes} ${ampm} ${getTimezoneAbbr(offset)}`;
};

// Helper function to format game date and time
export const formatGameDateTime = (gamedate: string, gametime: string) => {
    const dateTime = new Date(`${gamedate}T${gametime}`);
    return dateTime.toLocaleString();
};

// Helper function to get assignment role
export const getAssignmentRole = (game: Schedule, lastfirstfullname: string) => {
    if (game.referee1 === lastfirstfullname) return 'Referee 1';
    if (game.referee2 === lastfirstfullname) return 'Referee 2';
    if (game.linesperson1 === lastfirstfullname) return 'Linesperson 1';
    if (game.linesperson2 === lastfirstfullname) return 'Linesperson 2';
    return null;
};

// Helper function to get team logo URL or fallback