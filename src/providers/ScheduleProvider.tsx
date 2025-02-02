//src/providers/ScheduleProvider.tsx
import { supabase } from "../lib/supabase";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { useRoster } from "./RosterProvider";
import { format, parse } from "date-fns";

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
    number: string;
}

type ScheduleContext = {
    allGames: Schedule[];
    myGames: Schedule[];
    teamRosters: TeamRoster[];
    loading: boolean;
    error: string | null;
    refreshSchedule: () => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContext>({
    allGames: [],
    myGames: [],
    teamRosters: [],
    loading: false,
    error: null,
    refreshSchedule: async () => { },
});

export default function ScheduleProvider({ children }: PropsWithChildren) {
    const { roster } = useRoster();
    const [allGames, setAllGames] = useState<Schedule[]>([]);
    const [myGames, setMyGames] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [teamRosters, setTeamRosters] = useState<TeamRoster[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchSchedule = async () => {
        if (!roster?.lastfirstfullname) {
            console.log('❌ Schedule fetch: No roster data available');
            return;
        }
    
        try {
            console.log('🔄 Starting schedule fetch sequence...');
            setLoading(true);
            setError(null);
    
            console.log('📅 Fetching schedule data with team details...');
            // Fetch all games with team data
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedule')
                .select(`
                    *,
                    homeTeamData:teams!schedule_hometeam_fkey(*),
                    awayTeamData:teams!schedule_awayteam_fkey(*)
                `)
                .order('gamedate', { ascending: true })
                .order('gametime', { ascending: true });
    
            console.log('👥 Fetching team rosters data...');
            const { data: rostersData, error: rostersError } = await supabase
                .from('teamRosters')
                .select('*');
    
            if (rostersError) {
                console.error('❌ Team rosters fetch error:', rostersError);
                throw rostersError;
            }
            if (scheduleError) {
                console.error('❌ Schedule fetch error:', scheduleError);
                throw scheduleError;
            }
    
            console.log('✅ Raw schedule data fetched successfully');
            console.log(`📊 Processing ${scheduleData?.length || 0} games...`);
    
            // Process and set all games
            const processedGames = scheduleData || [];
            setAllGames(processedGames);
            setTeamRosters(rostersData);
    
            console.log('🔍 Filtering games for official:', roster.lastfirstfullname);
            // Filter for games where the roster member is assigned
            const myFilteredGames = processedGames.filter(game =>
                game.referee1 === roster.lastfirstfullname ||
                game.referee2 === roster.lastfirstfullname ||
                game.linesperson1 === roster.lastfirstfullname ||
                game.linesperson2 === roster.lastfirstfullname
            );
    
            console.log(`✅ Found ${myFilteredGames.length} assigned games`);
            setMyGames(myFilteredGames);
            console.log('✅ Schedule fetch and processing complete');
    
        } catch (error) {
            console.error('❌ Schedule fetch error:', error);
            setError(error instanceof Error ? error.message : 'An error occurred');
        } finally {
            setLoading(false);
            console.log('🔄 Schedule loading state reset');
        }
    };
    
    // Fetch schedule when roster data changes
    useEffect(() => {
        if (roster?.lastfirstfullname && !loading && !isRefreshing) {
            console.log('👤 Roster data changed, triggering schedule fetch...');
            console.log('📋 Current state - loading:', loading, 'refreshing:', isRefreshing);
            fetchSchedule();
        } else {
            console.log('⏳ Skipping schedule fetch:', {
                hasRoster: !!roster?.lastfirstfullname,
                loading,
                isRefreshing
            });
        }
    }, [roster?.lastfirstfullname]);

    // Fetch schedule when roster data changes
    useEffect(() => {
        if (roster?.lastfirstfullname && !loading && !isRefreshing) {
            fetchSchedule();
        }
    }, [roster?.lastfirstfullname]);

    return (
        <ScheduleContext.Provider value={{
            allGames,
            myGames,
            teamRosters,
            loading: loading || isRefreshing, // Modified
            error,
            refreshSchedule: fetchSchedule
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