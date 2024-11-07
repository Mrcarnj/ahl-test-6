import { View, Text, StyleSheet, ScrollView, Button, RefreshControl, TouchableOpacity } from 'react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { formatGameDateTime, useSchedule, formatGameTime } from '@/src/providers/ScheduleProvider';
import { format, parse, isBefore, isToday as checkIsToday, differenceInDays, addDays } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';


const TestScheduleScreen = () => {
    const router = useRouter();
    const { myGames, loading, refreshSchedule } = useSchedule();
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshSchedule();
        setRefreshing(false);
    }, [refreshSchedule]);

    const handleGamePress = (gameId: string) => {
        router.push({
            pathname: "/(protected)/home/[gameId]",
            params: { gameId }
        });
    };

    const todayEvent = useMemo(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return myGames.find(game => game.gamedate === today);
    }, [myGames]);

    const upcomingEvents = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return myGames
            .filter(game => {
                const gameDate = parse(game.gamedate, 'yyyy-MM-dd', new Date());
                return !checkIsToday(gameDate) && gameDate > today;
            })
            .sort((a, b) => {
                const dateA = parse(a.gamedate, 'yyyy-MM-dd', new Date());
                const dateB = parse(b.gamedate, 'yyyy-MM-dd', new Date());
                return dateA.getTime() - dateB.getTime();
            })
            .slice(0, 3);
    }, [myGames]);
   
    const formatGameDate = (dateString: string) => {
        const date = parse(dateString, 'yyyy-MM-dd', new Date());
        return format(date, 'EEEE, MMMM d, yyyy');
    };

    const getNextExpenseReportDue = useCallback(() => {
        const startDate = new Date(2024, 9, 21);
        const endDate = new Date(2025, 5, 30);
        const today = new Date();
        let nextDueDate = startDate;

        while (nextDueDate <= endDate) {
            if (nextDueDate >= today) {
                const daysUntilDue = differenceInDays(addDays(nextDueDate, 1), today);
                const rangeEndDate = new Date(nextDueDate);
                const rangeStartDate = new Date(rangeEndDate);
                rangeStartDate.setDate(rangeStartDate.getDate() - 14);

                const dateRange = `${format(rangeStartDate, 'MMMM d')} - ${format(addDays(rangeEndDate, -1), 'MMMM d')}`;

                if (daysUntilDue === 0) {
                    return { text: "TODAY by 12pm EST", isToday: true, isTomorrow: false, dateRange, rangeStartDate, rangeEndDate };
                } else if (daysUntilDue === 1) {
                    return { text: "TOMORROW", isToday: false, isTomorrow: true, dateRange, rangeStartDate, rangeEndDate };
                } else {
                    return { text: `${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`, isToday: false, isTomorrow: false, dateRange, rangeStartDate, rangeEndDate };
                }
            }
            nextDueDate = addDays(nextDueDate, 14);
        }

        return { text: "No more expense reports due", isToday: false, isTomorrow: false, dateRange: "", rangeStartDate: null, rangeEndDate: null };
    }, []);

    const getGamesInDateRange = useCallback((dateRange: string) => {
        if (!dateRange) return [];
        
        const { rangeStartDate, rangeEndDate } = getNextExpenseReportDue();
        if (!rangeStartDate || !rangeEndDate) return [];

        const startDateStr = format(rangeStartDate, 'yyyy-MM-dd');
        const endDateStr = format(rangeEndDate, 'yyyy-MM-dd');

        return myGames
            .filter(game => game.gamedate >= startDateStr && game.gamedate <= endDateStr)
            .map(game => game.gameid)
            .sort((a, b) => Number(a) - Number(b));
    }, [myGames, getNextExpenseReportDue]);

    const { text, isToday, isTomorrow, dateRange } = getNextExpenseReportDue();

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.loadingText}>Loading...</Text>
            </SafeAreaView>
        );
    }


    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.contentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#ff6600']}
                        tintColor="#ff6600"
                    />
                }
            >
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Today</Text>
                    {todayEvent ? (
                        <View style={styles.gameCard}>
                            <Text style={styles.gameId}>{formatGameDate(todayEvent.gamedate)}</Text>
                            <Text style={styles.matchup}>
                                {todayEvent.awayteam} @ {todayEvent.hometeam}
                            </Text>
                        </View>
                    ) : (
                        <Text style={styles.noGamesText}>No Game Today</Text>
                    )}
                </View>

                <View style={styles.separator} />

                <View style={styles.section}>
                    <View style={styles.expenseReportContainer}>
                        <Text style={styles.reportTitle}>Expense Report Due: </Text>
                        <Text style={[
                            styles.expenseReportText,
                            isToday && styles.expenseReportToday,
                            isTomorrow && styles.expenseReportTomorrow
                        ]}>
                            {text}
                        </Text>
                    </View>

                    {dateRange && (
                        <>
                            <Text style={styles.dateRangeText}>
                                Date Range Due: {dateRange}
                            </Text>
                            <Text style={styles.dateRangeText}>
                                Games on Report: {getGamesInDateRange(dateRange).length > 0
                                    ? getGamesInDateRange(dateRange).join(', ')
                                    : 'No games in this period'}
                            </Text>
                        </>
                    )}
                </View>

                <View style={styles.separator} />

                <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Games</Text>
            {upcomingEvents.length > 0 ? (
                upcomingEvents.map(game => (
                    <TouchableOpacity 
                        key={game.id} 
                        style={styles.gameCard}
                        onPress={() => handleGamePress(game.gameid)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.gameContent}>
                            <Text style={styles.gameId}>{formatGameDate(game.gamedate)}</Text>
                            <Text style={styles.matchup}>
                                {game.awayteam} @ {game.hometeam}
                            </Text>
                            <Text style={styles.gameDetails}>
                                {formatGameTime(game.gametime, game.gamedate)} // {game.homeTeamData?.arenaname}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color="#ff6600" />
                    </TouchableOpacity>
                ))
            ) : (
                <Text style={styles.noGamesText}>No upcoming games</Text>
            )}
        </View>

                <View style={styles.section}>
                    <Button title="Sign Out" onPress={() => supabase.auth.signOut()} />
                </View>
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
        flexDirection: 'row',  // Add this to align content and arrow
        alignItems: 'center',  // Add this to center vertically
        justifyContent: 'space-between', // Add this to put arrow on right
    },
    gameContent: {
        flex: 1,  // Add this to take up remaining space
    },
    gameId: {
        fontSize: 16,
        color: '#ff6600',
        marginBottom: 4,
        fontWeight: 'bold',
    },
    matchup: {
        fontSize: 18,
        color: '#fff',
        padding: 2,
    },
    separator: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 20,
        marginHorizontal: 16,
    },
    expenseReportContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reportTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    gameDetails: {
        fontSize: 14,
        fontStyle: 'italic',
        color: '#999',
        paddingTop: 4,
    },
    expenseReportText: {
        fontSize: 18,
        color: '#ff6600',
        fontWeight: 'bold',
        marginLeft: 5,
    },
    expenseReportToday: {
        color: '#ff0000',
    },
    expenseReportTomorrow: {
        color: '#ffa500',
    },
    dateRangeText: {
        color: '#888',
        fontSize: 14,
        marginTop: 10,
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
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1,
    },
});

export default TestScheduleScreen;