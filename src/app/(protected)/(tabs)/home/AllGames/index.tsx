import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSchedule, Schedule } from '@/src/providers/ScheduleProvider';
import { format, parse, isToday as checkIsToday } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

// An AHL season runs Sept–June, so July 1 is the rollover: a game in
// July 2025 or later (until June 2026) belongs to "2025-26".
const seasonLabel = (gamedate: string): string => {
    const [year, month] = gamedate.split('-').map(Number);
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

export default function AllGames() {
    const router = useRouter();
    const { myGames } = useSchedule();
    // Prior seasons start collapsed; this holds the ones the user opened.
    const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());

    const toggleSeason = (season: string) => {
        setExpandedSeasons(prev => {
            const next = new Set(prev);
            if (next.has(season)) next.delete(season);
            else next.add(season);
            return next;
        });
    };


    const formatGameDate = (dateString: string) => {
        const date = parse(dateString, 'yyyy-MM-dd', new Date());
        return format(date, 'EEEE, MMMM d, yyyy');
    };

    // Split games into upcoming and past
    const { upcomingGames, pastGames } = myGames.reduce((acc: { upcomingGames: Schedule[], pastGames: Schedule[] }, game) => {
        const gameDate = parse(game.gamedate, 'yyyy-MM-dd', new Date());
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (checkIsToday(gameDate) || gameDate > today) {
            acc.upcomingGames.push(game);
        } else {
            acc.pastGames.push(game);
        }
        return acc;
    }, { upcomingGames: [], pastGames: [] });

    // Sort upcoming games by date (earliest first)
    upcomingGames.sort((a, b) => {
        const dateA = parse(a.gamedate, 'yyyy-MM-dd', new Date());
        const dateB = parse(b.gamedate, 'yyyy-MM-dd', new Date());
        return dateA.getTime() - dateB.getTime();
    });

    // Sort past games by date (most recent first)
    pastGames.sort((a, b) => {
        const dateA = parse(a.gamedate, 'yyyy-MM-dd', new Date());
        const dateB = parse(b.gamedate, 'yyyy-MM-dd', new Date());
        return dateB.getTime() - dateA.getTime();
    });

    // This season's past games stay in the flat list; each earlier season gets
    // its own collapsible group. pastGames is newest first, so both the groups
    // and the games inside them come out newest first too.
    const currentSeason = seasonLabel(format(new Date(), 'yyyy-MM-dd'));
    const currentSeasonPastGames: Schedule[] = [];
    const priorSeasons: { season: string; games: Schedule[] }[] = [];
    for (const game of pastGames) {
        const season = seasonLabel(game.gamedate);
        if (season === currentSeason) {
            currentSeasonPastGames.push(game);
            continue;
        }
        const last = priorSeasons[priorSeasons.length - 1];
        if (last?.season === season) last.games.push(game);
        else priorSeasons.push({ season, games: [game] });
    }

    const handleGamePress = (gameId: string) => {
        router.push({
            pathname: "/(protected)/game/[id]",
            params: {
                id: gameId,
                source: 'home'
            }
        });
    };

    const renderGameCard = (game: Schedule) => (
        <TouchableOpacity
            key={game.id}
            style={styles.gameCard}
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

    return (
        <ScrollView
            style={styles.container}
        >
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Upcoming Games</Text>
                {upcomingGames.length > 0 ? (
                    upcomingGames.map(renderGameCard)
                ) : (
                    <Text style={styles.noGamesText}>No upcoming games</Text>
                )}
            </View>

            <View style={styles.separator} />

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Games</Text>
                {currentSeasonPastGames.length > 0 ? (
                    currentSeasonPastGames.map(renderGameCard)
                ) : (
                    <Text style={styles.noGamesText}>No past games this season</Text>
                )}

                {priorSeasons.map(({ season, games }) => {
                    const expanded = expandedSeasons.has(season);
                    return (
                        <View key={season} style={styles.seasonGroup}>
                            <TouchableOpacity
                                style={styles.seasonHeader}
                                onPress={() => toggleSeason(season)}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityState={{ expanded }}
                            >
                                <Text style={styles.seasonTitle}>{season}</Text>
                                <View style={styles.seasonHeaderRight}>
                                    <Text style={styles.seasonCount}>
                                        {games.length} {games.length === 1 ? 'game' : 'games'}
                                    </Text>
                                    <Ionicons
                                        name={expanded ? 'chevron-up' : 'chevron-down'}
                                        size={22}
                                        color="#ff6600"
                                    />
                                </View>
                            </TouchableOpacity>
                            {expanded && (
                                <View style={styles.seasonGames}>
                                    {games.map(renderGameCard)}
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    section: {
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
        marginVertical: 20,
        marginHorizontal: 16,
    },
    seasonGroup: {
        marginTop: 12,
    },
    seasonHeader: {
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
    seasonGames: {
        marginTop: 12,
        paddingLeft: 8,
    },
    noGamesText: {
        color: '#999',
        fontSize: 16,
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 20,
    },
});