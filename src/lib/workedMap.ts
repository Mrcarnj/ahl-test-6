// src/lib/workedMap.ts
//
// Data behind the Profile "Where I've Worked" map: which home-team cities an
// official has a game in, and where each lands on assets/images/worked-map.png.

import type { Schedule } from '@/src/providers/ScheduleProvider';

/**
 * Projection of worked-map.png, printed by render_worked_map.py. Re-rendering
 * the image means copying its output here, or every pin drifts.
 */
const MAP_META = {
    lon0: -96.0,
    lat0: 40.0,
    lat1: 30.0,
    lat2: 60.0,
    minX: -0.3708593239938171,
    minY: -0.3146810348609509,
    maxX: 0.4851613082999675,
    maxY: 0.2620504836623534,
    width: 3600,
    height: 2425,
};

export const MAP_ASPECT = MAP_META.width / MAP_META.height;

const rad = (deg: number) => (deg * Math.PI) / 180;
const N = (Math.sin(rad(MAP_META.lat1)) + Math.sin(rad(MAP_META.lat2))) / 2;
const C = Math.cos(rad(MAP_META.lat1)) ** 2 + 2 * N * Math.sin(rad(MAP_META.lat1));
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(rad(MAP_META.lat0))) / N;

/**
 * Albers equal-area conic, as fractions (0..1) of the image's width and
 * height. Null when the point falls outside the image.
 */
export function projectToMap(lat: number, lon: number): { x: number; y: number } | null {
    const rho = Math.sqrt(C - 2 * N * Math.sin(rad(lat))) / N;
    const theta = N * rad(lon - MAP_META.lon0);
    const px = rho * Math.sin(theta);
    const py = -(RHO0 - rho * Math.cos(theta));
    const x = (px - MAP_META.minX) / (MAP_META.maxX - MAP_META.minX);
    const y = (py - MAP_META.minY) / (MAP_META.maxY - MAP_META.minY);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
    return { x, y };
}

export type WorkedCity = {
    /** Home team abbreviation. */
    team: string;
    city: string;
    x: number;
    y: number;
    /** Games already played (on or before today). */
    worked: number;
    /** Games still to come. */
    upcoming: number;
};

/**
 * One entry per home team the official has a game at, among `games`. A pin is
 * placed at the team's arena (`teams.parking_latitude/longitude`); a team
 * without coordinates is left off. Most-worked first.
 */
export function workedCities(games: Schedule[], today: string): WorkedCity[] {
    const byTeam = new Map<string, WorkedCity>();
    for (const game of games) {
        const home = game.homeTeamData;
        if (!home || home.parking_latitude == null || home.parking_longitude == null) continue;
        let entry = byTeam.get(home.abbreviation);
        if (!entry) {
            const point = projectToMap(home.parking_latitude, home.parking_longitude);
            if (!point) continue;
            entry = { team: home.abbreviation, city: home.city, ...point, worked: 0, upcoming: 0 };
            byTeam.set(home.abbreviation, entry);
        }
        if (game.gamedate <= today) entry.worked += 1;
        else entry.upcoming += 1;
    }
    return [...byTeam.values()].sort(
        (a, b) => b.worked - a.worked || b.upcoming - a.upcoming || a.city.localeCompare(b.city)
    );
}
