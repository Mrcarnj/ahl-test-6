//src/providers/ScheduleProvider.tsx
import { format, parse } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import {
    shouldSyncPlayerRoster,
    shouldSyncPlayerStats,
    shouldSyncTeamStandings,
    syncPlayerRoster,
    syncPlayerStats,
    syncTeamStandings,
} from "../lib/playerStatsSync";
import { fetchAndParseHockeySchedule, setLastSyncTime } from "../lib/icalHockeySync";
import { fetchAllRegularSeasonTeamRosterRows } from "../lib/fetchAllTeamRosterRows";
import { supabase } from "../lib/supabase";
import { useRoster } from "./RosterProvider";
import { APP_REFRESH_EVENT, SCHEDULE_CHANGES_EVENT } from "../lib/events";
import { withTimeout } from "../lib/withTimeout";
import { type PlayoffBracketData } from "../lib/playoffBracket";
import {
    diffSchedule,
    hasScheduleChanges,
    loadScheduleSnapshot,
    saveScheduleSnapshot,
    snapshotFromGames,
    type ScheduleSnapshot,
} from "../lib/scheduleChanges";

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

type FetchScheduleOptions = {
    /**
     * Also (re)load team rosters, in the background. Defaults to only doing so
     * if they haven't loaded yet.
     */
    includeRosters?: boolean;
    /**
     * Whether to check the loaded games for changes to alert on. Defaults to
     * true unless an iCal sync is running: its inserts each fire a realtime
     * refetch, and the sync's own final reload reports them all together.
     */
    detectChanges?: boolean;
};

export type StatsSyncStatus = {
    status: 'idle' | 'running' | 'success' | 'error';
    error?: string;
    finishedAt?: number;
};

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
    /** False until the first DB load of this official's games lands. */
    scheduleLoaded: boolean;
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
    /** Last stats/rosters/standings run, for the sync banner. */
    statsSyncStatus: StatsSyncStatus;
    error: string | null;
    refreshSchedule: () => Promise<{ success: boolean; error?: string }>;
    syncScheduleFromIcal: (options?: { source?: 'startup' | 'foreground' | 'manual' | 'other'; showInBanner?: boolean }) => Promise<{ success: boolean; newGames?: number; updatedGames?: number; skippedGames?: number; error?: string }>;
    realtimeEnabled: boolean;
};

const ScheduleContext = createContext<ScheduleContextType>({
    allGames: [],
    myGames: [],
    teamRosters: [],
    teamRostersRegularSeason: [],
    loading: false,
    scheduleLoaded: false,
    syncingPlayerStats: false,
    syncingSchedule: false,
    syncingStats: false,
    syncingStandings: false,
    playoffBracket: null,
    playoffBracketError: null,
    syncingPlayoffBracket: false,
    refreshPlayoffBracket: async () => {},
    scheduleSyncStatus: { status: 'idle', source: 'other', showInBanner: false },
    statsSyncStatus: { status: 'idle' },
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
    const [scheduleLoaded, setScheduleLoaded] = useState(false);
    const [syncingStats, setSyncingStats] = useState(false);
    const [syncingStandings, setSyncingStandings] = useState(false);
    const [statsSyncStatus, setStatsSyncStatus] = useState<StatsSyncStatus>({ status: 'idle' });
    const statsSyncInFlightRef = useRef(false);
    // Playoffs hidden for 2026-27 — these stay at their empty values. Restore the
    // useState versions along with `refreshPlayoffBracket` below.
    const playoffBracket: PlayoffBracketData | null = null;
    const playoffBracketError: string | null = null;
    const syncingPlayoffBracket = false;
    const [scheduleSyncStatus, setScheduleSyncStatus] = useState<ScheduleContextType['scheduleSyncStatus']>({ status: 'idle', source: 'other', showInBanner: false });
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
    const fetchScheduleRef = useRef<(options?: FetchScheduleOptions) => Promise<{ success: boolean; error?: string }>>(async () => ({ success: false }));
    // Set synchronously so two sync requests in the same tick can't both start.
    const syncInFlightRef = useRef(false);
    // True once a roster load has started, cleared again if it fails.
    const teamRostersRequestedRef = useRef(false);
    // Schedule and roster fetches can overlap (startup load, post-sync refetch,
    // realtime refetch). A response is only applied if nothing started later
    // has been applied already, so older data can't overwrite newer data — or
    // read as a change.
    const fetchSeqRef = useRef(0);
    const appliedScheduleSeqRef = useRef(0);
    const appliedRostersSeqRef = useRef(0);
    // The schedule the official last saw, for change alerts. `load` is shared
    // so callers resume in order, and is replaced when the user changes.
    const snapshotRef = useRef<{ userKey: string; load: Promise<void>; games: ScheduleSnapshot | null } | null>(null);
    const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Last applied games, checked for changes when a sync finishes.
    const lastAppliedGamesRef = useRef<{ userKey: string; games: Schedule[] } | null>(null);

    useEffect(() => () => {
        if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    }, []);

    /**
     * Debounced: a crewmate's sync writes games one row at a time, each firing
     * a realtime refetch, and those should add up to one pop-up, not several.
     */
    const detectScheduleChanges = (userKey: string, games: Schedule[]) => {
        if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
        detectTimerRef.current = setTimeout(() => {
            detectTimerRef.current = null;
            compareWithLastSeen(userKey, games);
        }, 1000);
    };

    /**
     * Compares a loaded schedule with the one the official last saw and, if
     * games were added, changed or removed, emits SCHEDULE_CHANGES_EVENT for
     * NotificationProvider to pop up. The very first load for a user has
     * nothing to compare against and only records.
     */
    const compareWithLastSeen = (userKey: string, games: Schedule[]) => {
        if (snapshotRef.current?.userKey !== userKey) {
            const entry: { userKey: string; load: Promise<void>; games: ScheduleSnapshot | null } = {
                userKey,
                load: Promise.resolve(),
                games: null,
            };
            entry.load = loadScheduleSnapshot(userKey).then(stored => {
                entry.games = stored;
            });
            snapshotRef.current = entry;
        }
        const entry = snapshotRef.current;
        const current = snapshotFromGames(games);
        // Chaining on the shared promise keeps overlapping calls in call order.
        entry.load = entry.load.then(() => {
            if (snapshotRef.current !== entry) return;
            const previous = entry.games;
            entry.games = current;
            void saveScheduleSnapshot(userKey, current);
            if (!previous) {
                console.log('📸 SCHEDULE: No previous schedule snapshot — recorded baseline, no change alerts');
                return;
            }
            const changes = diffSchedule(previous, current);
            if (hasScheduleChanges(changes)) {
                console.log(`🔔 SCHEDULE: Changes detected — ${changes.added.length} added, ${changes.updated.length} updated, ${changes.removed.length} removed`);
                DeviceEventEmitter.emit(SCHEDULE_CHANGES_EVENT, changes);
            }
        }).catch(e => {
            console.error('❌ SCHEDULE: Change detection failed:', e);
        });
    };

    /**
     * Loads every team's regular season roster rows. Kept apart from the
     * schedule fetch because it is far slower (all rows, paged), and nothing
     * should wait on it before showing the official their games.
     */
    const loadTeamRosters = async () => {
        const seq = ++fetchSeqRef.current;
        teamRostersRequestedRef.current = true;
        const rostersStart = Date.now();
        try {
            console.log('👥 SCHEDULE: Fetching regular season team rosters...');
            const rows = await withTimeout(
                fetchAllRegularSeasonTeamRosterRows(),
                60000,
                'Regular season team rosters fetch'
            );
            console.log(`🕒 SCHEDULE: Team rosters fetch took ${Date.now() - rostersStart}ms (${rows.length} rows)`);
            if (seq >= appliedRostersSeqRef.current) {
                appliedRostersSeqRef.current = seq;
                setTeamRostersRegularSeason(rows as unknown as TeamRoster[]);
            }
        } catch (rostersError) {
            teamRostersRequestedRef.current = false;
            console.error('❌ SCHEDULE: Team rosters fetch error:', rostersError);
        }
    };

    /**
     * Loads this official's games from the DB, and kicks off a team roster
     * load if asked to (or if rosters never loaded). Resolves once the games
     * are applied; it does not wait for rosters.
     */
    const fetchSchedule = async (options?: FetchScheduleOptions): Promise<{ success: boolean; error?: string }> => {
        if (!roster?.lastfirstfullname) {
            console.log('❌ SCHEDULE: Fetch aborted - No roster data available');
            return { success: false, error: 'No roster data available' };
        }
    
        const seq = ++fetchSeqRef.current;
        const userKey = roster.auth_id;
        const detectChanges = options?.detectChanges ?? !syncInFlightRef.current;

        if (options?.includeRosters ?? !teamRostersRequestedRef.current) {
            void loadTeamRosters();
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
            if (scheduleError) {
                console.error('❌ SCHEDULE: Schedule fetch error:', scheduleError);
                throw scheduleError;
            }
    
            console.log('✅ SCHEDULE: Raw data fetched successfully');
            console.log(`📊 SCHEDULE: Processing ${scheduleData?.length || 0} games...`);
    
            const processedGames: Schedule[] = scheduleData || [];
            if (seq >= appliedScheduleSeqRef.current) {
                appliedScheduleSeqRef.current = seq;
                setAllGames(processedGames);
                // Since we're already filtering at the database level, we can just use the processed games directly
                setMyGames(processedGames);
                setScheduleLoaded(true);
                console.log(`✅ SCHEDULE: Found ${processedGames.length} assigned games`);
                lastAppliedGamesRef.current = { userKey, games: processedGames };
                if (detectChanges) {
                    detectScheduleChanges(userKey, processedGames);
                }
            } else {
                console.log('⏭️ SCHEDULE: Newer schedule already applied — discarding this response');
            }

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

    /**
     * Stats, rosters and standings from HockeyTech, once a day: each runs only
     * if nobody has synced it since the last 5 AM Eastern cutoff, so the first
     * official to open the app after that does it for everyone.
     */
    const runBackgroundSyncs = async () => {
        if (statsSyncInFlightRef.current) {
            console.log('⏭️ SYNC: Stats/standings sync already running');
            return;
        }
        statsSyncInFlightRef.current = true;
        let started = false;
        const failures: string[] = [];
        try {
            const [shouldStats, shouldRoster, shouldStandings] = await Promise.all([
                shouldSyncPlayerStats(),
                shouldSyncPlayerRoster(),
                shouldSyncTeamStandings(),
            ]);

            if (!shouldStats && !shouldRoster && !shouldStandings) {
                console.log('⏭️ SYNC: Stats, rosters and standings already synced since the nightly cutoff');
                return;
            }
            started = true;
            setStatsSyncStatus({ status: 'running' });
            if (shouldStats || shouldRoster) {
                setSyncingStats(true);
            }
            if (shouldStandings) {
                setSyncingStandings(true);
            }

            if (shouldStats) {
                console.log('🔄 PLAYER SYNC: Running player stats sync...');
                const res = await syncPlayerStats();
                if (!res.success) failures.push(`stats: ${res.error ?? 'failed'}`);
            }

            if (shouldRoster) {
                console.log('🔄 PLAYER SYNC: Running player roster sync...');
                const res = await syncPlayerRoster();
                if (!res.success) failures.push(`rosters: ${res.error ?? 'failed'}`);
            }
            setSyncingStats(false);

            if (shouldStandings) {
                console.log('🔄 TEAM SYNC: Running team standings sync...');
                const res = await syncTeamStandings();
                if (!res.success) failures.push(`standings: ${res.error ?? 'failed'}`);
                // Playoff bracket sync is off while playoffs are hidden.
            }

            // Player syncs write to `teamRosters` in the DB; refresh in-memory rows so game tabs show everyone.
            if (shouldStats || shouldRoster) {
                await loadTeamRosters();
            }
            // Standings live on `teams`, which arrive joined onto the games.
            if (shouldStandings) {
                await fetchScheduleRef.current();
            }
        } catch (e) {
            console.error('❌ SYNC: Error performing background syncs:', e);
            failures.push(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            statsSyncInFlightRef.current = false;
            setSyncingStats(false);
            setSyncingStandings(false);
            if (started || failures.length > 0) {
                if (failures.length > 0) console.error('❌ SYNC:', failures.join(' | '));
                setStatsSyncStatus(failures.length > 0
                    ? { status: 'error', error: failures.join(' · '), finishedAt: Date.now() }
                    : { status: 'success', finishedAt: Date.now() });
            }
        }
    };

    /**
     * Pulls the official's iCal feed into the DB, then reloads their games.
     * It never blocks the UI: whatever is already loaded stays usable while it
     * runs, and anything it changes surfaces through detectScheduleChanges as
     * a pop-up.
     */
    const syncScheduleFromIcal = async (options?: { source?: 'startup' | 'foreground' | 'manual' | 'other'; showInBanner?: boolean }): Promise<{ success: boolean; newGames?: number; updatedGames?: number; skippedGames?: number; error?: string }> => {
        if (!roster?.auth_id) {
            return { success: false, error: 'No user roster/auth_id' };
        }

        // If already syncing, don't start another
        const source = options?.source ?? 'other';
        const showInBanner = options?.showInBanner ?? false;
        // Stats don't depend on the schedule, so they run (once a day) whether
        // or not the iCal sync succeeds. They used to run only after a
        // successful one, so a failed or timed-out iCal fetch skipped them.
        void runBackgroundSyncs();

        if (syncInFlightRef.current) {
            return { success: false, error: 'Schedule sync already in progress' };
        }
        syncInFlightRef.current = true;

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
            await withTimeout(fetchSchedule({ detectChanges: true }), 20000, 'Schedule fetch after iCal sync');

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
            void setLastSyncTime();

            return { success: true, ...summary };
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown schedule sync error';
            setScheduleSyncStatus({ status: 'error', source, showInBanner, error: msg, finishedAt: Date.now() });
            return { success: false, error: msg };
        } finally {
            syncInFlightRef.current = false;
            // Loads that landed during the sync skipped change detection, and
            // the reload above may have been superseded by one of them (or the
            // sync failed before it). Check whatever is showing now; this is
            // debounced with the reload's own check and a no-op if it already
            // ran, so it never doubles an alert.
            const latest = lastAppliedGamesRef.current;
            if (latest && latest.userKey === roster.auth_id) {
                detectScheduleChanges(latest.userKey, latest.games);
            }
        }
    };
    syncScheduleFromIcalRef.current = syncScheduleFromIcal;
    const runBackgroundSyncsRef = useRef(runBackgroundSyncs);
    runBackgroundSyncsRef.current = runBackgroundSyncs;

    // Check the daily stats sync on every return to the app. The foreground
    // schedule sync (APP_REFRESH_EVENT) only fires after 10+ minutes in the
    // background and is skipped while a load runs, so an official who opened
    // the app at 4:58 and again at 5:05 would otherwise miss the morning sync.
    // The check is three one-row queries; the sync itself runs once a day.
    useEffect(() => {
        if (!roster?.auth_id) return;
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void runBackgroundSyncsRef.current();
        });
        return () => sub.remove();
    }, [roster?.auth_id]);

    /**
     * Realtime fires once per changed row, and an iCal sync that touches 20
     * games echoes 20 events back. Reloading on each one meant 20 back-to-back
     * schedule fetches and full re-renders, which is what made the app feel
     * locked while a sync ran. Coalesce them into one trailing reload, and
     * hold it while this device's own sync runs (that sync reloads at its end).
     */
    const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleRealtimeRefresh = useCallback(() => {
        const fire = () => {
            if (syncInFlightRef.current) {
                realtimeRefreshTimerRef.current = setTimeout(fire, 1500);
                return;
            }
            realtimeRefreshTimerRef.current = null;
            void fetchScheduleRef.current();
        };
        if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = setTimeout(fire, 1500);
    }, []);

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
                    console.log(`🔄 Real-time ${payload.eventType} on schedule`);
                    
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
                        
                        // Notifications are sent by the device whose iCal sync wrote the change
                        // (icalHockeySync). Sending again here meant every crew member with the
                        // app open re-broadcast the same change to the whole crew.

                        // Refresh the schedule to update the UI (coalesced)
                        scheduleRealtimeRefresh();
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
            if (realtimeRefreshTimerRef.current) {
                clearTimeout(realtimeRefreshTimerRef.current);
                realtimeRefreshTimerRef.current = null;
            }
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
                subscriptionRef.current = null;
            }
            setRealtimeEnabled(false);
        };
    }, [roster?.lastfirstfullname, scheduleRealtimeRefresh]);

    // Fetch schedule when roster data changes
    useEffect(() => {
        if (roster?.lastfirstfullname && !loadingRef.current && !isRefreshingRef.current) {
            console.log('👤 Roster data changed, triggering schedule fetch...');
            console.log('📋 Current state - loading:', loadingRef.current, 'refreshing:', isRefreshingRef.current);
            // Show what's already in the DB straight away so the app is usable,
            // and run the iCal sync behind it. The sync reloads the games when
            // it finishes; anything it added or changed pops up as an alert.
            void fetchScheduleRef.current({ includeRosters: true });
            void syncScheduleFromIcalRef.current({ source: 'startup', showInBanner: false });
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
                    await Promise.race([syncScheduleFromIcalRef.current({ source: data?.source ? 'foreground' : 'other', showInBanner: false }), timeoutPromise])
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
            const result = await Promise.race([fetchSchedule({ includeRosters: true }), timeoutPromise]) as { success: boolean; error?: string };
                
            console.log('✅ SCHEDULE: Manual refresh complete');

            // After schedule refresh, run stats/standings syncs (nightly gated).
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
            scheduleLoaded,
            syncingPlayerStats: syncingStats || syncingStandings,
            syncingSchedule: loading || isRefreshing || scheduleSyncStatus.status === 'running',
            syncingStats,
            syncingStandings,
            playoffBracket,
            playoffBracketError,
            syncingPlayoffBracket,
            refreshPlayoffBracket,
            scheduleSyncStatus,
            statsSyncStatus,
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