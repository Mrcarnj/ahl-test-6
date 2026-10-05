// app/(protected)/(tabs)/calendar/day/[date].tsx
//
// Every game on one calendar day, opened from a day with more than one game
// (in practice an ahlAdmin's calendar, which holds the whole league). Pick a
// game to open its details.

import { Ionicons } from '@expo/vector-icons';
import { format, parse } from 'date-fns';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatGameTime, useSchedule } from '@/src/providers/ScheduleProvider';

export default function CalendarDay() {
    const { date } = useLocalSearchParams<{ date: string }>();
    const router = useRouter();
    const { myGames } = useSchedule();

    // myGames is already ordered by date then time.
    const games = useMemo(() => myGames.filter(game => game.gamedate === date), [myGames, date]);

    const day = date ? parse(date, 'yyyy-MM-dd', new Date()) : null;

    const handleGamePress = (gameId: string) => {
        router.push({
            pathname: "/(protected)/game/[id]",
            params: {
                id: gameId,
                source: 'calendar'
            }
        });
    };

    return (
        <ScrollView style={styles.container}>
            <Stack.Screen options={{ headerTitle: day ? format(day, 'MMM d, yyyy') : 'Games' }} />
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{day ? format(day, 'EEEE, MMMM d, yyyy') : ''}</Text>
                <Text style={styles.count}>
                    {games.length} {games.length === 1 ? 'game' : 'games'}
                </Text>
                {games.length > 0 ? (
                    games.map(game => (
                        <TouchableOpacity
                            key={game.id}
                            style={styles.gameCard}
                            onPress={() => handleGamePress(game.gameid)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.gameContent}>
                                <Text style={styles.gameId}>
                                    {formatGameTime(game.gametime, game.gamedate)}
                                </Text>
                                <Text style={styles.matchup}>
                                    {game.awayteam} @ {game.hometeam}
                                </Text>
                                <Text style={styles.gameDetails}>
                                    {`Game ${game.gameid}${game.homeTeamData?.arenaname ? ` // ${game.homeTeamData.arenaname}` : ''}`}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={24} color="#ff6600" />
                        </TouchableOpacity>
                    ))
                ) : (
                    <Text style={styles.noGamesText}>No games this day</Text>
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
        color: '#fff',
    },
    count: {
        fontSize: 14,
        color: '#999',
        marginTop: 4,
        marginBottom: 16,
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
    noGamesText: {
        color: '#999',
        fontSize: 16,
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 20,
    },
});
