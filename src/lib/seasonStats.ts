// src/lib/seasonStats.ts
//
// The numbers behind Profile → "This Year's Stats": who an official has worked
// with, where, and which teams they've seen, from their own schedule.

import type { Schedule } from '@/src/providers/ScheduleProvider';

export type StatRow = {
    key: string;
    label: string;
    /** Second line, e.g. the arena's city. */
    detail?: string;
    count: number;
};

export type SeasonStats = {
    gamesWorked: number;
    upcoming: number;
    arenasVisited: number;
    topReferees: StatRow[];
    topLinespersons: StatRow[];
    topArenas: StatRow[];
    topTeams: StatRow[];
};

const TOP_N = 5;

class Counter {
    private rows = new Map<string, StatRow>();

    add(key: string | null | undefined, label: string, detail?: string) {
        if (!key) return;
        const row = this.rows.get(key);
        if (row) row.count += 1;
        else this.rows.set(key, { key, label, detail, count: 1 });
    }

    get size() {
        return this.rows.size;
    }

    top(n = TOP_N): StatRow[] {
        return [...this.rows.values()]
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
            .slice(0, n);
    }
}

/**
 * Stats over `games` already played (on or before `today`, 'YYYY-MM-DD').
 * `me` is the official's `lastfirstfullname`, left out of the crew lists;
 * `displayName` turns a `lastfirstfullname` into the name to show.
 */
export function seasonStats(
    games: Schedule[],
    today: string,
    me: string | undefined,
    displayName: (lastfirstfullname: string) => string
): SeasonStats {
    const referees = new Counter();
    const linespersons = new Counter();
    const arenas = new Counter();
    const teams = new Counter();
    let gamesWorked = 0;
    let upcoming = 0;

    for (const game of games) {
        if (game.gamedate > today) {
            upcoming += 1;
            continue;
        }
        gamesWorked += 1;

        for (const name of [game.referee1, game.referee2]) {
            if (name && name !== me) referees.add(name, displayName(name));
        }
        for (const name of [game.linesperson1, game.linesperson2]) {
            if (name && name !== me) linespersons.add(name, displayName(name));
        }

        const home = game.homeTeamData;
        if (home?.arenaname) arenas.add(home.arenaname, home.arenaname, home.city);

        for (const team of [game.homeTeamData, game.awayTeamData]) {
            if (team) teams.add(team.abbreviation, team.city);
        }
    }

    return {
        gamesWorked,
        upcoming,
        arenasVisited: arenas.size,
        topReferees: referees.top(),
        topLinespersons: linespersons.top(),
        topArenas: arenas.top(),
        topTeams: teams.top(),
    };
}

/** "Dietrich, Mike" -> "Mike Dietrich", for names not found on the roster. */
export function flipLastFirst(lastfirstfullname: string): string {
    const [last, first] = lastfirstfullname.split(',').map(part => part.trim());
    return first ? `${first} ${last}` : lastfirstfullname;
}
