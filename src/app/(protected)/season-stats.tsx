// app/(protected)/season-stats.tsx
//
// Profile → "This Year's Stats": games worked, the "Where I've Worked" map, and
// top-5 lists of crew, arenas and teams, for this season or all time (every
// season in the official's schedule). Only games already played count;
// upcoming ones show as a total.

import { currentSeasonLabel } from '@/src/lib/season';
import { flipLastFirst, seasonStats, StatRow } from '@/src/lib/seasonStats';
import { useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const ORANGE = '#ff6600';

type Range = 'season' | 'all';

export default function SeasonStatsScreen() {
    const router = useRouter();
    const { myGames } = useSchedule();
    const { roster, allRosters } = useRoster();
    const season = currentSeasonLabel();
    const [range, setRange] = useState<Range>('season');

    const games = useMemo(
        () => (range === 'all' ? myGames : myGames.filter(g => g.season === season)),
        [myGames, range, season]
    );

    // "2023-24 – 2026-27" for All Time, from the seasons actually present.
    const subtitle = useMemo(() => {
        if (range === 'season') return `${season} Season`;
        const seasons = [...new Set(games.map(g => g.season).filter(Boolean))].sort();
        if (seasons.length <= 1) return 'All Time';
        return `All Time · ${seasons[0]} – ${seasons[seasons.length - 1]}`;
    }, [range, season, games]);

    const stats = useMemo(() => {
        const names = new Map(allRosters.map(r => [r.lastfirstfullname, `${r.firstname} ${r.lastname}`]));
        return seasonStats(
            games,
            format(new Date(), 'yyyy-MM-dd'),
            roster?.lastfirstfullname,
            name => names.get(name) ?? flipLastFirst(name)
        );
    }, [games, allRosters, roster?.lastfirstfullname]);

    const empty = range === 'season' ? 'No games worked yet this season.' : 'No games worked yet.';

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <View style={styles.segment}>
                {(['season', 'all'] as const).map(value => {
                    const active = value === range;
                    return (
                        <TouchableOpacity
                            key={value}
                            onPress={() => setRange(value)}
                            style={[styles.segmentItem, active && styles.segmentItemActive]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                        >
                            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                                {value === 'season' ? 'This Season' : 'All Time'}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <Text style={styles.season}>{subtitle}</Text>

            <TouchableOpacity
                style={styles.mapButton}
                onPress={() =>
                    router.push({
                        pathname: '/(protected)/worked-map',
                        params: { season: range === 'all' ? 'all' : season },
                    })
                }
                activeOpacity={0.7}
            >
                <Ionicons name="map" size={22} color={ORANGE} />
                <View style={styles.mapButtonBody}>
                    <Text style={styles.mapButtonText}>Where I&apos;ve Worked</Text>
                    <Text style={styles.mapButtonHint}>Turn your phone sideways</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            <View style={styles.tiles}>
                <Tile value={stats.gamesWorked} label="Games Worked" />
                <Tile value={stats.arenasVisited} label="Arenas" />
                <Tile value={stats.upcoming} label="Upcoming" />
            </View>

            <TopList title="Top Referees Worked With" icon="people" rows={stats.topReferees} empty={empty} />
            <TopList title="Top Linespersons Worked With" icon="people-outline" rows={stats.topLinespersons} empty={empty} />
            <TopList title="Most Visited Arenas" icon="location" rows={stats.topArenas} empty={empty} />
            <TopList title="Teams Seen Most" icon="shield" rows={stats.topTeams} empty={empty} />
        </ScrollView>
    );
}

function Tile({ value, label }: { value: number; label: string }) {
    return (
        <View style={styles.tile}>
            <Text style={styles.tileValue}>{value}</Text>
            <Text style={styles.tileLabel}>{label}</Text>
        </View>
    );
}

type TopListProps = {
    title: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    rows: StatRow[];
    /** Shown when there are no rows. */
    empty: string;
};

function TopList({ title, icon, rows, empty }: TopListProps) {
    const max = rows[0]?.count ?? 0;
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Ionicons name={icon} size={16} color={ORANGE} />
                <Text style={styles.cardTitle}>{title}</Text>
            </View>
            {rows.length === 0 ? (
                <Text style={styles.empty}>{empty}</Text>
            ) : (
                rows.map((row, i) => (
                    <View key={row.key} style={styles.row}>
                        <Text style={styles.rank}>{i + 1}</Text>
                        <View style={styles.rowBody}>
                            <View style={styles.rowTop}>
                                <Text style={styles.rowLabel} numberOfLines={1}>{row.label}</Text>
                                <Text style={styles.rowCount}>
                                    {row.count} {row.count === 1 ? 'game' : 'games'}
                                </Text>
                            </View>
                            {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                            <View style={styles.barTrack}>
                                <View style={[styles.bar, { width: `${(row.count / max) * 100}%` }]} />
                            </View>
                        </View>
                    </View>
                ))
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#000',
    },
    content: {
        padding: 16,
        paddingBottom: 40,
        gap: 16,
    },
    segment: {
        flexDirection: 'row',
        borderRadius: 10,
        backgroundColor: '#1a1a1a',
        padding: 3,
    },
    segmentItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 8,
    },
    segmentItemActive: {
        backgroundColor: ORANGE,
    },
    segmentText: {
        color: '#ccc',
        fontSize: 14,
        fontWeight: '600',
    },
    segmentTextActive: {
        color: '#000',
    },
    season: {
        color: '#999',
        fontSize: 14,
        textAlign: 'center',
        marginTop: -6,
    },
    mapButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: ORANGE,
        backgroundColor: '#1a1a1a',
    },
    mapButtonBody: {
        flex: 1,
    },
    mapButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: 'bold',
    },
    mapButtonHint: {
        color: '#999',
        fontSize: 12,
        marginTop: 2,
    },
    tiles: {
        flexDirection: 'row',
        gap: 10,
    },
    tile: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: '#1a1a1a',
    },
    tileValue: {
        color: ORANGE,
        fontSize: 26,
        fontWeight: 'bold',
    },
    tileLabel: {
        color: '#ccc',
        fontSize: 12,
        marginTop: 2,
    },
    card: {
        borderRadius: 10,
        backgroundColor: '#1a1a1a',
        padding: 14,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    cardTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    empty: {
        color: '#888',
        fontSize: 14,
        paddingVertical: 6,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 8,
    },
    rank: {
        color: ORANGE,
        fontSize: 16,
        fontWeight: 'bold',
        width: 16,
        textAlign: 'center',
    },
    rowBody: {
        flex: 1,
    },
    rowTop: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    rowLabel: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
    },
    rowCount: {
        color: '#ccc',
        fontSize: 13,
        fontVariant: ['tabular-nums'],
    },
    rowDetail: {
        color: '#888',
        fontSize: 12,
        marginTop: 1,
    },
    barTrack: {
        height: 4,
        borderRadius: 2,
        backgroundColor: '#2a2a2a',
        marginTop: 6,
        overflow: 'hidden',
    },
    bar: {
        height: 4,
        borderRadius: 2,
        backgroundColor: ORANGE,
    },
});
