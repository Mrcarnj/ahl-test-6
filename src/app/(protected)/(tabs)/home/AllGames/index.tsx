import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSchedule, formatGameTime, Schedule } from '@/src/providers/ScheduleProvider';
import { format, parse, isToday as checkIsToday } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useAuth } from '@/src/providers/AuthProvider';

export default function AllGames() {
    const router = useRouter();
    const { myGames } = useSchedule();
    const [refreshing, setRefreshing] = useState(false);
    const { refreshSchedule } = useSchedule();


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

    const handleGamePress = (gameId: string) => {
        router.push({
            pathname: "/(protected)/game/[id]",
            params: {
                id: gameId,
                source: 'home'
            }
        });
    };

    return (
        <ScrollView
            style={styles.container}
        >
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Upcoming Games</Text>
                {upcomingGames.length > 0 ? (
                    upcomingGames.map(game => (
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
                    ))
                ) : (
                    <Text style={styles.noGamesText}>No upcoming games</Text>
                )}
            </View>

            <View style={styles.separator} />

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Games</Text>
                {pastGames.length > 0 ? (
                    pastGames.map(game => (
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
                    ))
                ) : (
                    <Text style={styles.noGamesText}>No past games</Text>
                )}
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
    noGamesText: {
        color: '#666',
        fontSize: 16,
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 20,
    },
});