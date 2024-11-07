import { View, Text, StyleSheet, ScrollView, Button } from 'react-native';
import React, { useMemo } from 'react';
import { useSchedule } from '@/src/providers/ScheduleProvider';
import { format, parse, isBefore, isToday } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';

const TestScheduleScreen = () => {
    const { myGames, loading } = useSchedule();

    const { pastGames, futureGames } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of day

        return {
            pastGames: myGames
                .filter(game => {
                    const gameDate = parse(game.gamedate, 'yyyy-MM-dd', new Date());
                    return isBefore(gameDate, today);
                })
                .sort((a, b) => {
                    // Sort most recent first
                    return parse(b.gamedate, 'yyyy-MM-dd', new Date()).getTime() - 
                           parse(a.gamedate, 'yyyy-MM-dd', new Date()).getTime();
                }),

            futureGames: myGames
                .filter(game => {
                    const gameDate = parse(game.gamedate, 'yyyy-MM-dd', new Date());
                    return isToday(gameDate) || isBefore(today, gameDate);
                })
                .sort((a, b) => {
                    // Sort earliest first
                    return parse(a.gamedate, 'yyyy-MM-dd', new Date()).getTime() - 
                           parse(b.gamedate, 'yyyy-MM-dd', new Date()).getTime();
                })
        };
    }, [myGames]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.loadingText}>Loading...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Future Games</Text>
                    {futureGames.length === 0 ? (
                        <Text style={styles.noGamesText}>No upcoming games</Text>
                    ) : (
                        futureGames.map(game => (
                            <View key={game.id} style={styles.gameCard}>
                                <Text style={styles.gameId}>Game #{game.gameid}</Text>
                                <Text style={styles.matchup}>
                                    {game.awayteam} @ {game.hometeam}
                                </Text>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Past Games</Text>
                    {pastGames.length === 0 ? (
                        <Text style={styles.noGamesText}>No past games</Text>
                    ) : (
                        pastGames.map(game => (
                            <View key={game.id} style={styles.gameCard}>
                                <Text style={styles.gameId}>Game #{game.gameid}</Text>
                                <Text style={styles.matchup}>
                                    {game.awayteam} @ {game.hometeam}
                                </Text>
                            </View>
                        ))
                    )}
                </View>
                <Button title="Sign Out" onPress={() => supabase.auth.signOut()}/>
            </ScrollView>
        </SafeAreaView>
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
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
    },
    gameId: {
        fontSize: 16,
        color: '#ff6600',
        marginBottom: 4,
    },
    matchup: {
        fontSize: 18,
        color: '#fff',
    },
    noGamesText: {
        color: '#666',
        fontSize: 16,
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 20,
    },
    loadingText: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        padding: 20,
    },
});

export default TestScheduleScreen;