// A compact month grid for the iPad home screen: game days are orange, with no
// matchup text, and the grid stretches to fill whatever box it is given. It
// opens games the same way the Calendar tab does: one game goes straight to
// it, several open that day's list.

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
    addDays,
    addMonths,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { useSchedule } from '@/src/providers/ScheduleProvider';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MiniCalendar() {
    const router = useRouter();
    const { myGames } = useSchedule();
    const [month, setMonth] = useState(() => startOfMonth(new Date()));

    // gameid of the only game that day, or null when there are several.
    const gamesByDate = useMemo(() => {
        const byDate = new Map<string, { count: number; gameid: string | null }>();
        for (const game of myGames) {
            const day = byDate.get(game.gamedate);
            if (day) {
                day.count += 1;
                day.gameid = null;
            } else {
                byDate.set(game.gamedate, { count: 1, gameid: game.gameid });
            }
        }
        return byDate;
    }, [myGames]);

    const weeks = useMemo(() => {
        const first = startOfWeek(startOfMonth(month));
        const last = endOfWeek(endOfMonth(month));
        const rows: Date[][] = [];
        for (let day = first; day <= last; day = addDays(day, 1)) {
            if (day.getDay() === 0) rows.push([]);
            rows[rows.length - 1].push(day);
        }
        return rows;
    }, [month]);

    const todayKey = format(new Date(), 'yyyy-MM-dd');

    const onDayPress = (dateKey: string) => {
        const day = gamesByDate.get(dateKey);
        if (!day) return;
        if (day.gameid) {
            router.push({
                pathname: '/(protected)/game/[id]',
                // It lives on the home screen, so back reads "Home".
                params: { id: day.gameid, source: 'home' },
            });
        } else {
            router.push({
                pathname: '/(protected)/(tabs)/calendar/day/[date]',
                params: { date: dateKey },
            });
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => setMonth(m => addMonths(m, -1))}
                    hitSlop={12}
                    accessibilityLabel="Previous month"
                >
                    <Ionicons name="chevron-back" size={22} color="#ff6600" />
                </TouchableOpacity>
                {/* Tapping the title jumps back to the current month. */}
                <TouchableOpacity onPress={() => setMonth(startOfMonth(new Date()))}>
                    <Text style={styles.monthTitle}>{format(month, 'MMMM yyyy')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setMonth(m => addMonths(m, 1))}
                    hitSlop={12}
                    accessibilityLabel="Next month"
                >
                    <Ionicons name="chevron-forward" size={22} color="#ff6600" />
                </TouchableOpacity>
            </View>
            <View style={styles.row}>
                {WEEKDAYS.map((d, i) => (
                    <Text key={i} style={styles.weekday}>{d}</Text>
                ))}
            </View>
            <View style={styles.grid}>
                {weeks.map(week => (
                    <View key={week[0].toISOString()} style={[styles.row, styles.weekRow]}>
                        {week.map(day => {
                            const dateKey = format(day, 'yyyy-MM-dd');
                            const inMonth = isSameMonth(day, month);
                            const hasGame = inMonth && gamesByDate.has(dateKey);
                            return (
                                <TouchableOpacity
                                    key={dateKey}
                                    style={styles.cell}
                                    onPress={() => onDayPress(dateKey)}
                                    disabled={!hasGame}
                                    activeOpacity={0.7}
                                >
                                    <View style={[
                                        styles.dayInner,
                                        hasGame && styles.gameDay,
                                        dateKey === todayKey && styles.today,
                                    ]}>
                                        <Text style={[styles.dayText, !inMonth && styles.outsideDayText]}>
                                            {day.getDate()}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    monthTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    row: {
        flexDirection: 'row',
    },
    weekday: {
        flex: 1,
        textAlign: 'center',
        color: '#999',
        fontSize: 12,
        marginBottom: 4,
    },
    grid: {
        flex: 1,
    },
    weekRow: {
        flex: 1,
    },
    cell: {
        flex: 1,
        padding: 2,
    },
    dayInner: {
        flex: 1,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    gameDay: {
        backgroundColor: '#ff6600',
    },
    today: {
        borderColor: '#fff',
    },
    dayText: {
        color: '#fff',
        fontSize: 13,
    },
    outsideDayText: {
        color: '#444',
    },
});
