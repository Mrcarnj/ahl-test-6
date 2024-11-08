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
    admin: boolean;
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
}

type ScheduleContext = {
    allGames: Schedule[];
    myGames: Schedule[];
    loading: boolean;
    error: string | null;
    refreshSchedule: () => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContext>({
    allGames: [],
    myGames: [],
    loading: false,
    error: null,
    refreshSchedule: async () => {},
});

export default function ScheduleProvider({ children }: PropsWithChildren) {
    const { roster } = useRoster();
    const [allGames, setAllGames] = useState<Schedule[]>([]);
    const [myGames, setMyGames] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSchedule = async () => {
        if (!roster?.lastfirstfullname) {
            console.log('No roster data available');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Fetch all games with team data
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedule')
                .select(`
                    *,
                    homeTeamData:teams!schedule_hometeam_fkey(
                        id, 
                        city, 
                        abbreviation, 
                        arenaname, 
                        timezone, 
                        arenaaddress, 
                        logo,
                        headcoachname,
                        eqname,
                        eqphone
                    ),
                    awayTeamData:teams!schedule_awayteam_fkey(
                        id, 
                        city, 
                        abbreviation, 
                        logo,
                        headcoachname,
                        eqname,
                        eqphone
                    )
                `)
                .order('gamedate', { ascending: true })
                .order('gametime', { ascending: true });

            if (scheduleError) throw scheduleError;

            // Process and set all games
            const processedGames = scheduleData || [];
            setAllGames(processedGames);

            // Filter for games where the roster member is assigned as any official
            const myFilteredGames = processedGames.filter(game => 
                game.referee1 === roster.lastfirstfullname ||
                game.referee2 === roster.lastfirstfullname ||
                game.linesperson1 === roster.lastfirstfullname ||
                game.linesperson2 === roster.lastfirstfullname
            );

            setMyGames(myFilteredGames);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An error occurred';
            console.error('Fetch schedule error:', errorMessage);
            setError(errorMessage);
            setAllGames([]);
            setMyGames([]);
        } finally {
            setLoading(false);
        }
    };

    // Fetch schedule when roster data changes
    useEffect(() => {
        fetchSchedule();
    }, [roster?.lastfirstfullname]);

    return (
        <ScheduleContext.Provider value={{
            allGames,
            myGames,
            loading,
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
export const getTeamLogo = (team?: Team) => {
    return team?.logo || '/default-team-logo.png'; // Replace with your default logo path
};