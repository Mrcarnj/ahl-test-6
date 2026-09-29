//src/providers/ScheduleProvider.tsx
import { format, parse } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import {
    shouldSyncPlayerRoster,
    shouldSyncPlayerStats,
    shouldSyncTeamStandings,
    syncPlayerRoster,
    syncPlayerStats,
    syncTeamStandings,
} from "../lib/playerStatsSync";
import { fetchAndParseHockeySchedule } from "../lib/icalHockeySync";
import { sendGameChangeNotification } from "../lib/notificationService";
import { fetchAllRegularSeasonTeamRosterRows } from "../lib/fetchAllTeamRosterRows";
import { supabase } from "../lib/supabase";
import { useRoster } from "./RosterProvider";
import { APP_REFRESH_EVENT } from "../lib/events";
import { withTimeout } from "../lib/withTimeout";
import { type PlayoffBracketData } from "../lib/playoffBracket";

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
    /**
     * Skater stats are nullable: `syncPlayerRoster` inserts a player as soon as
     * they appear on a team's roster, before `syncPlayerStats` has any numbers
     * for them, and writes these columns as null. The UI renders null as "–".
     */
    games_played: number | null;
    goals: number | null;
    assists: number | null;
    points: number | null;
    plusMinus: number | null;
    penalty_minutes: number | null;
    power_play_goals: number | null;
    number: string | null;
    rookie: boolean | null;
    veteran: boolean | null;
}

type ScheduleContextType = {
    allGames: Schedule[];
    myGames: Schedule[];
    /**
     * Playoff skater stats. Playoffs are hidden for 2026-27, so this is always
     * empty; kept on the context so the playoff screens still compile.
     */
    teamRosters: TeamRoster[];
    /** Active regular season skater stats (`teamRosters`, `season_id` 94). */
    teamRostersRegularSeason: TeamRoster[];
    loading: boolean;
    syncingPlayerStats: boolean; // kept for compatibility (stats OR standings)
    syncingSchedule: boolean;
    syncingStats: boolean;
    syncingStandings: boolean;
    playoffBracket: PlayoffBracketData | null;
    playoffBracketError: string | null;
    syncingPlayoffBracket: boolean;
    refreshPlayoffBracket: (options?: { force?: boolean }) => Promise<void>;
    scheduleSyncStatus: {
        status: 'idle' | 'running' | 'success' | 'error';
        source?: 'startup' | 'foreground' | 'manual' | 'other';
        showInBanner?: boolean;
        newGames?: number;
        updatedGames?: number;
        skippedGames?: number;
        error?: string;
        finishedAt?: number;
    };
    blockingOverlayVisible: boolean;
    error: string | null;
    refreshSchedule: () => Promise<{ success: boolean; error?: string }>;
    syncScheduleFromIcal: (options?: { blocking?: boolean; source?: 'startup' | 'foreground' | 'manual' | 'other'; showInBanner?: boolean }) => Promise<{ success: boolean; newGames?: number; updatedGames?: number; skippedGames?: number; error?: string }>;
    realtimeEnabled: boolean;
};

const ScheduleContext = createContext<ScheduleContextType>({
    allGames: [],
    myGames: [],
    teamRosters: [],
    teamRostersRegularSeason: [],
    loading: false,
    syncingPlayerStats: false,
    syncingSchedule: false,
    syncingStats: false,
    syncingStandings: false,
    playoffBracket: null,
    playoffBracketError: null,
    syncingPlayoffBracket: false,
    refreshPlayoffBracket: async () => {},
    scheduleSyncStatus: { status: 'idle', source: 'other', showInBanner: false },
    blockingOverlayVisible: false,
    error: null,
    refreshSchedule: async () => ({ success: false }),
    syncScheduleFromIcal: async () => ({ success: false }),
    realtimeEnabled: false,
});

export default function ScheduleProvider({ children }: PropsWithChildren) {
    const { roster } = useRoster();
    const [allGames, setAllGames] = useState<Schedule[]>([]);
    const [myGames, setMyGames] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncingStats, setSyncingStats] = useState(false);
    const [syncingStandings, setSyncingStandings] = useState(false);
    // Playoffs hidden for 2026-27 — these stay at their empty values. Restore the
    // useState versions along with `refreshPlayoffBracket` below.
    const playoffBracket: PlayoffBracketData | null = null;
    const playoffBracketError: string | null = null;
    const syncingPlayoffBracket = false;
    const [scheduleSyncStatus, setScheduleSyncStatus] = useState<ScheduleContextType['scheduleSyncStatus']>({ status: 'idle', source: 'other', showInBanner: false });
    const [blockingOverlayVisible, setBlockingOverlayVisible] = useState(false);
    const blockingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Playoffs hidden for 2026-27 — no playoff stats are fetched. See `teamRosters` on the context type.
    const teamRosters: TeamRoster[] = [];
    const [teamRostersRegularSeason, setTeamRostersRegularSeason] = useState<TeamRoster[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [realtimeEnabled, setRealtimeEnabled] = useState(false);
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
    const loadingRef = useRef(loading);
    loadingRef.current = loading;
    const isRefreshingRef = useRef(isRefreshing);
    isRefreshingRef.current = isRefreshing;
    const syncScheduleFromIcalRef = useRef<ScheduleContextType['syncScheduleFromIcal']>(async () => ({ success: false }));
    const fetchScheduleRef = useRef<() => Promise<{ success: boolean; error?: string }>>(async () => ({ success: false }));

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
            const { data: scheduleData, error: scheduleError } = await withTimeout(
                supabase
                    .from('schedule')
                    .select(`
                        *,
                        homeTeamData:teams!schedule_hometeam_fkey(*),
                        awayTeamData:teams!schedule_awayteam_fkey(*)
                    `)
                    .or(`referee1.eq."${roster.lastfirstfullname}",referee2.eq."${roster.lastfirstfullname}",linesperson1.eq."${roster.lastfirstfullname}",linesperson2.eq."${roster.lastfirstfullname}"`)
                    .order('gamedate', { ascending: true })
                    .order('gametime', { ascending: true }),
                20000,
                'Schedule fetch'
            );
                
            console.log(`🕒 SCHEDULE: Schedule fetch took ${Date.now() - fetchStart}ms`);
    
            console.log('👥 SCHEDULE: Fetching regular season team rosters...');
            const rostersStart = Date.now();
            
            const regularSeasonRosters = await withTimeout(
                fetchAllRegularSeasonTeamRosterRows(),
                60000,
                'Regular season team rosters fetch'
            );
                
            console.log(`🕒 SCHEDULE: Team rosters fetch took ${Date.now() - rostersStart}ms (${regularSeasonRosters.length} rows)`);
            if (scheduleError) {
                console.error('❌ SCHEDULE: Schedule fetch error:', scheduleError);
                throw scheduleError;
            }
    
            console.log('✅ SCHEDULE: Raw data fetched successfully');
            console.log(`📊 SCHEDULE: Processing ${scheduleData?.length || 0} games...`);
    
            // Process and set all games
            const processedGames = scheduleData || [];
            setAllGames(processedGames);
            setTeamRostersRegularSeason(regularSeasonRosters as unknown as TeamRoster[]);
    
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
    fetchScheduleRef.current = fetchSchedule;

    /**
     * Playoffs are hidden for the 2026-27 regular season, so this is a no-op and
     * `playoffBracket` stays null. To restore, delete this stub and un-comment
     * the implementation below it (plus the post-standings sync in
     * `runBackgroundSyncs`) once `PLAYOFF_BRACKET_SEASON_ID` points at the new
     * playoff season.
     */
    const refreshPlayoffBracket = useCallback(async (_options?: { force?: boolean }) => {
        return;
    }, []);

    /* Playoff bracket refresh — re-enable when playoffs come back.
    const refreshPlayoffBracket = useCallback(async (options?: { force?: boolean }) => {
        setSyncingPlayoffBracket(true);
        setPlayoffBracketError(null);
        try {
            let data = await withTimeout(fetchPlayoffBracketFromDb(), 15000, 'Playoff bracket DB fetch');
            const shouldSync = options?.force
                ? true
                : await withTimeout(shouldSyncPlayoffBracket(), 8000, 'Playoff bracket should-sync check');
            if (!data.rounds.length || shouldSync) {
                const syncResult = await withTimeout(syncPlayoffBracketToDb(), 20000, 'Playoff bracket sync');
                if (!syncResult.success) {
                    throw new Error(syncResult.error || 'Playoff bracket sync failed');
                }
                data = await withTimeout(fetchPlayoffBracketFromDb(), 15000, 'Playoff bracket DB fetch');
            }
            setPlayoffBracket(data);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Bracket fetch failed';
            setPlayoffBracketError(msg);
            console.error('❌ PLAYOFF BRACKET:', e);
        } finally {
            setSyncingPlayoffBracket(false);
        }
    }, []);
    */

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
                // Playoff bracket sync is off while playoffs are hidden.
            } else {
                console.log('⏭️ TEAM SYNC: Team standings sync not needed (recent sync found)');
            }

            // Player syncs write to `teamRosters` in the DB; refresh in-memory rows so game tabs show everyone.
            if (shouldStats || shouldRoster) {
                try {
                    const rsAfterSync = await withTimeout(
                        fetchAllRegularSeasonTeamRosterRows(),
                        60000,
                        'Regular season rosters refetch after player sync'
                    );
                    setTeamRostersRegularSeason(rsAfterSync as unknown as TeamRoster[]);
                    console.log(`✅ SCHEDULE: Team rosters refreshed (${rsAfterSync.length} rows)`);
                } catch (rostersRefetchError) {
                    console.error('❌ SCHEDULE: Post-sync team rosters refetch error:', rostersRefetchError);
                }
            }
        } catch (e) {
            console.error('❌ SYNC: Error performing background syncs:', e);
        } finally {
            setSyncingStats(false);
            setSyncingStandings(false);
        }
    };

    const syncScheduleFromIcal = async (options?: { blocking?: boolean; source?: 'startup' | 'foreground' | 'manual' | 'other'; showInBanner?: boolean }): Promise<{ success: boolean; newGames?: number; updatedGames?: number; skippedGames?: number; error?: string }> => {
        if (!roster?.auth_id) {
            return { success: false, error: 'No user roster/auth_id' };
        }

        // If already syncing, don't start another
        if (scheduleSyncStatus.status === 'running') {
            return { success: false, error: 'Schedule sync already in progress' };
        }

        const source = options?.source ?? 'other';
        const showInBanner = options?.showInBanner ?? false;

        if (options?.blocking) {
            if (blockingHideTimerRef.current) {
                clearTimeout(blockingHideTimerRef.current);
                blockingHideTimerRef.current = null;
            }
            setBlockingOverlayVisible(true);
        }
        setScheduleSyncStatus({ status: 'running', source, showInBanner });

        try {
            // 1) Fetch + parse + upsert schedule from iCal
            const result = await withTimeout(
                fetchAndParseHockeySchedule(false, roster.auth_id),
                45000,
                'Schedule iCal sync'
            );

            if (!result?.success) {
                const msg = result?.error || 'Unknown schedule sync error';
                setScheduleSyncStatus({ status: 'error', source, showInBanner, error: msg, finishedAt: Date.now() });
                return { success: false, error: msg };
            }

            // 2) Refresh schedule rows so UI shows latest DB state
            await withTimeout(fetchSchedule(), 20000, 'Schedule fetch after iCal sync');

            const summary = {
                status: 'success' as const,
                source,
                showInBanner,
                newGames: result.newGames ?? 0,
                updatedGames: result.updatedGames ?? 0,
                skippedGames: result.skippedGames ?? 0,
                finishedAt: Date.now(),
            };
            setScheduleSyncStatus(summary);

            // 3) Stats/standings sync (24h gated), non-blocking
            void runBackgroundSyncs();

            return { success: true, ...summary };
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown schedule sync error';
            setScheduleSyncStatus({ status: 'error', source, showInBanner, error: msg, finishedAt: Date.now() });
            return { success: false, error: msg };
        } finally {
            if (options?.blocking) {
                // Keep the blocking overlay up briefly after completion so users see the result,
                // then dismiss everything at once.
                blockingHideTimerRef.current = setTimeout(() => {
                    setBlockingOverlayVisible(false);
                    blockingHideTimerRef.current = null;
                }, 5000);
            }
        }
    };
    syncScheduleFromIcalRef.current = syncScheduleFromIcal;

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
                        await fetchScheduleRef.current();
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
        if (roster?.lastfirstfullname && !loadingRef.current && !isRefreshingRef.current) {
            console.log('👤 Roster data changed, triggering schedule fetch...');
            console.log('📋 Current state - loading:', loadingRef.current, 'refreshing:', isRefreshingRef.current);
            // IMPORTANT:
            // Run iCal sync first, then fetch schedule, so initial UI reflects newly inserted games.
            void syncScheduleFromIcalRef.current({ blocking: true, source: 'startup', showInBanner: false });
        } else {
            console.log('⏳ Skipping schedule fetch:', {
                hasRoster: !!roster?.lastfirstfullname,
                loading: loadingRef.current,
                isRefreshing: isRefreshingRef.current,
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
                    await Promise.race([syncScheduleFromIcalRef.current({ blocking: !!data?.blocking, source: data?.source ? 'foreground' : 'other', showInBanner: false }), timeoutPromise])
                        .catch(error => {
                            console.error('❌ SCHEDULE: Background refresh timed out or failed:', error);
                        });
                    
                    // runBackgroundSyncs is triggered after a successful iCal schedule sync
                        
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

            // After schedule refresh, run stats/standings syncs (24h gated).
            // Do NOT block the UI on these; they can take time.
            if (result?.success) {
                void runBackgroundSyncs();
            }
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
            teamRostersRegularSeason,
            loading: loading || isRefreshing,
            syncingPlayerStats: syncingStats || syncingStandings,
            syncingSchedule: loading || isRefreshing || scheduleSyncStatus.status === 'running',
            syncingStats,
            syncingStandings,
            playoffBracket,
            playoffBracketError,
            syncingPlayoffBracket,
            refreshPlayoffBracket,
            scheduleSyncStatus,
            blockingOverlayVisible,
            error,
            refreshSchedule,
            syncScheduleFromIcal,
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

/**
 * HockeyTech bracket `date_time` often ends with Z or ±00(:00) even though the clock is
 * arena-local (same numerals everywhere). Strip that so we do not treat it as a real offset.
 */
export function stripBracketFeedUtcNoise(timePart: string): string {
    let s = timePart.trim();
    s = s.replace(/[+-]0{2}(:0{2})?$/i, '').trim();
    s = s.replace(/Z$/i, '').trim();
    s = s.replace(/\.\d+$/, '').trim();
    return s;
}

/** Bracket / feed times often omit ±HH; treat as wall clock in the home team's IANA `teams.timezone`. */
export function formatGameTimeFromHomeWallClock(
    gameDate: string,
    wallTimeOrTimetz: string | null | undefined,
    homeIanaTimezone: string | null | undefined
): string {
    const raw = stripBracketFeedUtcNoise((wallTimeOrTimetz ?? '').trim());
    if (!raw) return '';
    if (!gameDate || gameDate === 'TBD') return raw;

    if (/\d{1,2}:\d{2}(:\d{2})?[+-]\d/.test(raw)) {
        const withSeconds = (() => {
            const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?([+-].+)$/);
            if (!m) return raw;
            const sec = m[3] ?? '00';
            return `${m[1]}:${m[2]}:${sec}${m[4]}`;
        })();
        return formatGameTime(withSeconds, gameDate);
    }

    if (!homeIanaTimezone) return raw;

    const hms = (() => {
        const clockOnly = (raw.split(/\s+/).pop() ?? raw).split(/[+-]/)[0].trim();
        const noFrac = clockOnly.replace(/\.\d+$/, '');
        const parts = noFrac.split(':').map((p) => p.replace(/\D/g, ''));
        if (parts.length < 2 || !parts[0] || !parts[1]) return null;
        const h = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const s = (parts[2] ?? '00').padStart(2, '0');
        return `${h}:${m}:${s}`;
    })();
    if (!hms) return raw;

    try {
        const [Y, M, D] = gameDate.split('-').map((x) => parseInt(x, 10));
        if (!Y || !M || !D) return raw;
        const [hs, ms, ss] = hms.split(':');
        const wall = new Date(Y, M - 1, D, parseInt(hs, 10), parseInt(ms, 10), parseInt(ss, 10));
        const utcInstant = fromZonedTime(wall, homeIanaTimezone);
        // Do not use formatGameTime here: it maps numeric offsets to EST/EDT vs CST/CDT, but CDT and EDT
        // both use -05, so Central teams were labeled Eastern. Use the team's IANA zone for abbrs.
        return formatInTimeZone(utcInstant, homeIanaTimezone, "h:mm a zzz", { locale: enUS });
    } catch {
        return raw;
    }
}