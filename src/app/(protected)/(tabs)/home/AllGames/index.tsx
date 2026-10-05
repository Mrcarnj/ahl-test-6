import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SectionList } from 'react-native';
import { useRouter } from 'expo-router';
import { useSchedule, Schedule } from '@/src/providers/ScheduleProvider';
import { format, parse } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

// An AHL season runs Sept–June, so July 1 is the rollover: a game in
// July 2025 or later (until June 2026) belongs to "2025-26".
const seasonLabel = (gamedate: string): string => {
    const [year, month] = gamedate.split('-').map(Number);
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

type GameSection = {
    key: string;
    /** 'list' sections get a big title; 'season' sections are a collapsible prior season. */
    kind: 'list' | 'season';
    title: string;
    data: Schedule[];
    /** Games in a prior season, shown in its header even while collapsed. */
    total?: number;
    expanded?: boolean;
    emptyText?: string;
};

const formatGameDate = (dateString: string) => {
    const date = parse(dateString, 'yyyy-MM-dd', new Date());
    return format(date, 'EEEE, MMMM d, yyyy');
};

/**
 * A virtualized list: an ahlAdmin's myGames is the whole league (over a
 * thousand games by season's end), and drawing every card up front in a
 * ScrollView stalled the screen. The games themselves are already in memory —
 * opening this screen never fetches.
 */
export default function AllGames() {
    const router = useRouter();
    const { myGames } = useSchedule();
    // Prior seasons start collapsed; this holds the ones the user opened.
    const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());

    const toggleSeason = useCallback((season: string) => {
        setExpandedSeasons(prev => {
            const next = new Set(prev);
            if (next.has(season)) next.delete(season);
            else next.add(season);
            return next;
        });
    }, []);

    // Upcoming (today on, earliest first), this season's past games (newest
    // first), then each earlier season as its own collapsible group, newest
    // first. gamedate is 'yyyy-MM-dd', so string comparison is chronological.
    const { upcomingGames, currentSeasonPastGames, priorSeasons } = useMemo(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        const currentSeason = seasonLabel(today);
        const upcoming: Schedule[] = [];
        const past: Schedule[] = [];
        for (const game of myGames) {
            if (game.gamedate >= today) upcoming.push(game);
            else past.push(game);
        }
        upcoming.sort((a, b) => a.gamedate.localeCompare(b.gamedate));
        past.sort((a, b) => b.gamedate.localeCompare(a.gamedate));

        const currentPast: Schedule[] = [];
        const prior: { season: string; games: Schedule[] }[] = [];
        for (const game of past) {
            const season = seasonLabel(game.gamedate);
            if (season === currentSeason) {
                currentPast.push(game);
                continue;
            }
            const last = prior[prior.length - 1];
            if (last?.season === season) last.games.push(game);
            else prior.push({ season, games: [game] });
        }
        return { upcomingGames: upcoming, currentSeasonPastGames: currentPast, priorSeasons: prior };
    }, [myGames]);

    const sections = useMemo<GameSection[]>(() => [
        { key: 'upcoming', kind: 'list', title: 'Upcoming Games', data: upcomingGames, emptyText: 'No upcoming games' },
        { key: 'past', kind: 'list', title: 'Past Games', data: currentSeasonPastGames, emptyText: 'No past games this season' },
        ...priorSeasons.map(({ season, games }): GameSection => {
            const expanded = expandedSeasons.has(season);
            return { key: season, kind: 'season', title: season, data: expanded ? games : [], total: games.length, expanded };
        }),
    ], [upcomingGames, currentSeasonPastGames, priorSeasons, expandedSeasons]);

    const handleGamePress = useCallback((gameId: string) => {
        router.push({
            pathname: "/(protected)/game/[id]",
            params: {
                id: gameId,
                source: 'home'
            }
        });
    }, [router]);

    const renderGameCard = ({ item: game, section }: { item: Schedule; section: GameSection }) => (
        <TouchableOpacity
            style={[styles.gameCard, section.kind === 'season' && styles.seasonGame]}
            onPress={() => handleGamePress(game.gameid)}
            activeOpacity={0.7}
        >
            <View style={styles.gameContent}>
                <Text style={styles.gameId}>
                    {formatGameDate(game.gamedate)}
                </Text>
                <Text style={styles.matchup}>
                    {game.awayteam} @ {game.hometeam}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#ff6600" />
        </TouchableOpacity>
    );

    const renderSectionHeader = ({ section }: { section: GameSection }) => {
        if (section.kind === 'list') {
            return (
                <>
                    {section.key === 'past' && <View style={styles.separator} />}
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                </>
            );
        }
        const total = section.total ?? 0;
        return (
            <TouchableOpacity
                style={styles.seasonHeader}
                onPress={() => toggleSeason(section.title)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: section.expanded }}
            >
                <Text style={styles.seasonTitle}>{section.title}</Text>
                <View style={styles.seasonHeaderRight}>
                    <Text style={styles.seasonCount}>
                        {total} {total === 1 ? 'game' : 'games'}
                    </Text>
                    <Ionicons
                        name={section.expanded ? 'chevron-up' : 'chevron-down'}
                        size={22}
                        color="#ff6600"
                    />
                </View>
            </TouchableOpacity>
        );
    };

    const renderSectionFooter = ({ section }: { section: GameSection }) =>
        section.kind === 'list' && section.data.length === 0
            ? <Text style={styles.noGamesText}>{section.emptyText}</Text>
            : null;

    return (
        <SectionList
            style={styles.container}
            contentContainerStyle={styles.content}
            sections={sections}
            keyExtractor={(game) => String(game.id)}
            renderItem={renderGameCard}
            renderSectionHeader={renderSectionHeader}
            renderSectionFooter={renderSectionFooter}
            stickySectionHeadersEnabled={false}
            initialNumToRender={15}
            windowSize={9}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    content: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#fff',
    },
    gameCard: {
        backgroundColor: '#1a1a1a',
        padding: 15,
        borderRadius: 8,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    gameContent: {
        flex: 1,
    },
    gameId: {
        fontSize: 14,
        color: '#ff6600',
        marginBottom: 4,
        fontWeight: 'bold',
    },
    matchup: {
        fontSize: 15,
        color: '#fff',
        padding: 2,
    },
    gameDetails: {
        fontSize: 14,
        fontStyle: 'italic',
        color: '#999',
        paddingTop: 4,
    },
    separator: {
        height: 1,
        backgroundColor: '#333',
        marginTop: 8,
        marginBottom: 24,
    },
    seasonHeader: {
        marginTop: 12,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    seasonTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    seasonHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    seasonCount: {
        fontSize: 14,
        color: '#999',
    },
    seasonGame: {
        marginLeft: 8,
    },
    noGamesText: {
        color: '#999',
        fontSize: 16,
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 20,
    },
});