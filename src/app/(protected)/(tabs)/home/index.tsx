// app/(protected)/(tabs)/home/index.tsx
import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { useRoster } from '@/src/providers/RosterProvider';
import { formatGameTime, useSchedule } from '@/src/providers/ScheduleProvider';
import { Entypo, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { addDays, isToday as checkIsToday, differenceInDays, format, parse } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHockeySync } from '@/src/hooks/useHockeySync';
import SyncBannerHost from '@/src/components/SyncBannerHost';
import { isWeb } from '@/src/lib/platform';

/**
 * The season the expense-report cycle covers. Expense reports fall every 14
 * days from the start date up to the end date, and — just as importantly —
 * only games inside this window belong on a report.
 *
 * Officials' `myGames` still contains last season's games (including its
 * playoffs), so without this bound they leak onto the current season's first
 * reports. Bump both when the season rolls over.
 *
 * START must be a MONDAY: reports are due on Mondays, and every due date is a
 * whole number of 14-day steps from it. 2025-26 used Sept 22, a Monday that
 * year; carried over unchanged to 2026-27 it fell on a Tuesday, and every
 * report showed as due a day late.
 */
const EXPENSE_SEASON_START = new Date(2026, 8, 21); // Monday, September 21, 2026
const EXPENSE_SEASON_END = new Date(2027, 5, 30);   // June 30, 2027


const TestScheduleScreen = () => {
    const router = useRouter();
    const { myGames, playoffBracket, scheduleLoaded, scheduleSyncStatus } = useSchedule();
    const { roster, isAhlAdmin } = useRoster();
    const { syncStatus, refreshSyncStatus } = useHockeySync();

    // "Last refresh" is read from storage once on mount; re-read it whenever a
    // schedule sync finishes so it reflects pull-to-refresh and foreground syncs.
    useEffect(() => {
        if (scheduleSyncStatus.status === 'success') void refreshSyncStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scheduleSyncStatus.finishedAt]);

    const externalLinks = [
        { title: 'Rulebook', screenName: "/(protected)/(tabs)/rulebook" },
        { title: 'Situation Book', screenName: "/(protected)/(tabs)/situation-book" },
        { title: 'AHL Google Drive', url: 'https://drive.google.com/drive/folders/1AIzYzQHyOxXqt1kHhKYbsHEORgjS9lVz' },
    ];

    const openLink = useCallback(async (link: typeof externalLinks[number]) => {
        if (link.url) {
            const supported = await Linking.canOpenURL(link.url);
            if (supported) {
                await Linking.openURL(link.url);
            } else {
                console.log(`Don't know how to open this URL: ${link.url}`);
            }
        } else if (link.screenName) {
            router.push({ pathname: link.screenName as any });
        }
    }, [router]);

    // On web these two live in the left-hand menu, so the home screen does not
    // repeat them as buttons.
    const ruleLinks = isWeb ? [] : externalLinks.filter(link => link.screenName);
    const externalUrlLinks = externalLinks.filter(link => link.url);


    const handleGamePress = (gameId: string) => {
        router.push({
            pathname: "/(protected)/game/[id]",
            params: {
                id: gameId,
                source: 'home'
            }
        });
    };

    // An official has at most one; an ahlAdmin's myGames is the whole league,
    // so this is every game being played today.
    const todayEvents = useMemo(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return myGames.filter(game => game.gamedate === today);
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

    // Today's date, refreshed on every return to the app, so the due date
    // rolls over ("TOMORROW" -> "TODAY") without a restart. The home tab stays
    // mounted for the life of the app, so computing it once on mount went stale
    // overnight.
    const [todayKey, setTodayKey] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') setTodayKey(format(new Date(), 'yyyy-MM-dd'));
        });
        return () => sub.remove();
    }, []);

    const expenseReportData = useMemo(() => {
        const endDate = EXPENSE_SEASON_END;
        const today = parse(todayKey, 'yyyy-MM-dd', new Date()); // local midnight
        // Copy, so the loop below can never advance the shared constant.
        let nextDueDate = new Date(EXPENSE_SEASON_START);
    
        while (nextDueDate <= endDate) {
            // Create date objects for comparison that are set to start of day
            const currentDueDate = new Date(nextDueDate);
            currentDueDate.setHours(0, 0, 0, 0);
            
            // Create a copy for tomorrow comparison
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
    
            if (currentDueDate >= today) {
                const rangeEndDate = new Date(currentDueDate);
                const rangeStartDate = new Date(rangeEndDate);
                rangeStartDate.setDate(rangeStartDate.getDate() - 14);
    
                const dateRange = `${format(rangeStartDate, 'MMMM d')} - ${format(addDays(rangeEndDate, -1), 'MMMM d')}`;
    
                // Check if it's due today
                if (currentDueDate.getTime() === today.getTime()) {
                    return { 
                        text: "TODAY by 12pm EST", 
                        isToday: true, 
                        isTomorrow: false, 
                        dateRange,
                        rangeStartDate,
                        rangeEndDate 
                    };
                }
                
                // Check if it's due tomorrow
                if (currentDueDate.getTime() === tomorrow.getTime()) {
                    return { 
                        text: "TOMORROW", 
                        isToday: false, 
                        isTomorrow: true, 
                        dateRange,
                        rangeStartDate,
                        rangeEndDate 
                    };
                }
    
                // If not today or tomorrow, show days until due
                const daysUntilDue = differenceInDays(currentDueDate, today);
                return { 
                    text: `${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`, 
                    isToday: false, 
                    isTomorrow: false, 
                    dateRange,
                    rangeStartDate,
                    rangeEndDate 
                };
            }
            nextDueDate = addDays(nextDueDate, 14);
        }
        
        return { 
            text: "No more expense reports due", 
            isToday: false, 
            isTomorrow: false, 
            dateRange: "", 
            rangeStartDate: null, 
            rangeEndDate: null 
        };
    }, [todayKey]);

    const gamesOnExpenseReport = useMemo(() => {
        const { rangeStartDate, rangeEndDate } = expenseReportData;
        if (!rangeStartDate || !rangeEndDate) return [];

        // Only this season's games can appear on this season's expense reports.
        // `myGames` keeps prior seasons, and the playoff branch below ignores
        // dates entirely, so without this bound last season's playoff games
        // (e.g. M2, O3 from May) show up on the first report of the new season.
        // gamedate is 'yyyy-MM-dd', so string comparison is chronological.
        const seasonStartStr = format(EXPENSE_SEASON_START, 'yyyy-MM-dd');
        const seasonEndStr = format(EXPENSE_SEASON_END, 'yyyy-MM-dd');
        const seasonGames = myGames.filter(
            (game) => game.gamedate >= seasonStartStr && game.gamedate <= seasonEndStr,
        );

        const getPlayoffCode = (game: typeof myGames[number]): string => {
            const rawGameId = String(game.gameid || '').trim().toUpperCase();
            const rawGameCode = String(game.gamecode || '').trim().toUpperCase();

            const hasSeriesPattern = (value: string): boolean => /[A-Z]\d+/.test(value);

            // Prefer whichever field actually contains the playoff series/game token (e.g., M2, O3).
            if (hasSeriesPattern(rawGameId)) return rawGameId.match(/[A-Z]\d+/)?.[0] ?? rawGameId;
            if (hasSeriesPattern(rawGameCode)) return rawGameCode.match(/[A-Z]\d+/)?.[0] ?? rawGameCode;
            return '';
        };

        const numericGameId = (game: typeof myGames[number]): string | null => {
            const raw = String(game.gameid ?? '').trim();
            if (!raw) return null;
            return /^\d+$/.test(raw) ? raw : null;
        };

        const isPlayoffGame = (game: typeof myGames[number]): boolean => {
            const id = getPlayoffCode(game);
            if (!id) return false;
            if (id.startsWith('EX')) return false;
            return /^[A-Z]\d+$/.test(id);
        };

        const seriesLetterFromCode = (gameCode: string): string | null => {
            const normalized = gameCode.trim().toUpperCase();
            const startMatch = normalized.match(/^([A-Z])/);
            if (startMatch) return startMatch[1];
            const embeddedMatch = normalized.match(/([A-Z])\d+/);
            if (embeddedMatch) return embeddedMatch[1];
            const alphaMatch = normalized.match(/([A-Z])/);
            if (alphaMatch && alphaMatch[1] !== 'E') return alphaMatch[1];
            return null;
        };

        const fallbackRoundFromSeriesLetter = (seriesLetter: string | null): number | undefined => {
            if (!seriesLetter) return undefined;
            const letter = seriesLetter.toUpperCase().charCodeAt(0);
            if (!Number.isFinite(letter)) return undefined;
            // HockeyTech fallback buckets when bracket mapping is temporarily unavailable.
            // Keeps known behavior: G => R1, M/O => R2.
            if (letter >= 65 && letter <= 76) return 1; // A-L
            if (letter >= 77 && letter <= 82) return 2; // M-R
            if (letter >= 83 && letter <= 85) return 3; // S-U
            if (letter >= 86 && letter <= 90) return 4; // V-Z
            return undefined;
        };

        const displayCodeForGame = (game: typeof myGames[number]): string => {
            const playoffCode = getPlayoffCode(game);
            if (!playoffCode) return '';
            const normalized = playoffCode.match(/[A-Z]\d+/);
            return normalized ? normalized[0] : playoffCode;
        };

        const gameIdSort = (a: string, b: string): number => {
            const aMatch = a.toUpperCase().match(/^([A-Z]+)(\d+)$/);
            const bMatch = b.toUpperCase().match(/^([A-Z]+)(\d+)$/);
            if (aMatch && bMatch) {
                if (aMatch[1] !== bMatch[1]) return aMatch[1].localeCompare(bMatch[1]);
                return Number(aMatch[2]) - Number(bMatch[2]);
            }
            const aNum = Number(a);
            const bNum = Number(b);
            if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
            return a.localeCompare(b);
        };

        const playoffRoundBySeries = new Map<string, number>();
        const playoffRoundByGameId = new Map<string, number>();
        const openPlayoffRounds = new Set<number>();

        playoffBracket?.rounds.forEach((round) => {
            const roundNum = Number(round.round);
            if (!Number.isFinite(roundNum)) return;

            let roundStillOpen = false;
            round.matchups.forEach((matchup) => {
                const seriesLetter = String(matchup.series_letter ?? '').trim().toUpperCase();
                if (!seriesLetter) return;
                playoffRoundBySeries.set(seriesLetter, roundNum);

                (matchup.games ?? []).forEach((bracketGame) => {
                    const bracketGameId = String(bracketGame.game_id ?? '').trim();
                    if (bracketGameId) {
                        playoffRoundByGameId.set(bracketGameId, roundNum);
                    }
                });

                const isActive = String(matchup.active ?? '').toLowerCase();
                const winner = String(matchup.winner ?? '').trim();
                const hasWinner = winner !== '' && winner !== '0';
                if (isActive === '1' || isActive === 'true' || isActive === 'yes' || !hasWinner) {
                    roundStillOpen = true;
                }
            });

            if (roundStillOpen) {
                openPlayoffRounds.add(roundNum);
            }
        });

        const playoffGamesWithRound = seasonGames
            .filter((game) => isPlayoffGame(game))
            .map((game) => {
                const byGameIdRound = numericGameId(game)
                    ? playoffRoundByGameId.get(numericGameId(game)!)
                    : undefined;
                if (Number.isFinite(byGameIdRound)) {
                    return { game, round: byGameIdRound as number };
                }

                const seriesLetter = seriesLetterFromCode(getPlayoffCode(game));
                const bySeriesRound = seriesLetter ? playoffRoundBySeries.get(seriesLetter) : undefined;
                const fallbackRound = fallbackRoundFromSeriesLetter(seriesLetter);
                return { game, round: bySeriesRound ?? fallbackRound };
            })
            .filter((entry): entry is { game: typeof myGames[number]; round: number } => Number.isFinite(entry.round));

        if (playoffGamesWithRound.length > 0) {
            const myOpenRounds = playoffGamesWithRound
                .map(({ round }) => round)
                .filter((round) => openPlayoffRounds.has(round));

            const currentRound = myOpenRounds.length > 0
                ? Math.min(...myOpenRounds)
                : Math.max(...playoffGamesWithRound.map(({ round }) => round));

            return playoffGamesWithRound
                .filter(({ round }) => round === currentRound)
                .map(({ game }) => displayCodeForGame(game))
                .filter((code) => Boolean(code))
                .sort(gameIdSort);
        }

        const startDateStr = format(rangeStartDate, 'yyyy-MM-dd');
        const endDateStr = format(rangeEndDate, 'yyyy-MM-dd');

        return seasonGames
            .filter(game => game.gamedate >= startDateStr && game.gamedate <= endDateStr)
            .map(game => game.gameid)
            .sort(gameIdSort);
    }, [myGames, expenseReportData, playoffBracket]);

    const { text, isToday, isTomorrow, dateRange } = expenseReportData;

    return (
        <SafeAreaView style={styles.container}
            edges={['left', 'right', 'top']}>
            {/* Outside the ScrollView so it stays pinned while a sync runs. */}
            <SyncBannerHost />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.contentContainer}
                refreshControl={<AppRefreshControl />}
            >
                <View style={styles.header}>
                    <Image
                        source={require('../../../../../assets/images/ahlLogo.png')}
                        style={styles.leagueLogo}
                    />
                    <Text style={styles.headerText}>Welcome, {roster?.firstname}  <MaterialCommunityIcons name="whistle" style={styles.headericon} /></Text>
                </View>
                {todayEvents.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Today</Text>
                        {todayEvents.map((todayEvent, i) => (
                            <TouchableOpacity
                                key={todayEvent.id}
                                style={[styles.gameCardToday, i > 0 && styles.gameCardTodaySpaced]}
                                onPress={() => handleGamePress(todayEvent.gameid)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.gameContent}>
                                    <Text style={styles.gameId}>{formatGameDate(todayEvent.gamedate)}</Text>
                                    <Text style={styles.matchup}>
                                        {todayEvent.awayteam} @ {todayEvent.hometeam}
                                    </Text>
                                    <Text style={styles.gameDetails}>
                                        {`${formatGameTime(todayEvent.gametime, todayEvent.gamedate)} // ${todayEvent.homeTeamData?.arenaname ?? ''}`}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={24} color="#ff6600" />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

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
                                {/* An ahlAdmin files no report of their own games. */}
                                {!isAhlAdmin && <Text style={styles.dateRangeText}>
                                    Games on Report: {gamesOnExpenseReport.length > 0
                                        ? gamesOnExpenseReport.join(', ')
                                        : scheduleLoaded ? 'No games in this period' : '…'}
                                </Text>}
                        </>
                    )}
                </View>

                <View style={styles.separator} />

                <View style={styles.section}>
                    {/* An ahlAdmin's next few league games say little; they
                        have Today, the calendar and View All Games. */}
                    {!isAhlAdmin && (
                        <>
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
                                            {`${formatGameTime(game.gametime, game.gamedate)} // ${game.homeTeamData?.arenaname ?? ''}`}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={24} color="#ff6600" />
                                </TouchableOpacity>
                            ))
                        ) : scheduleLoaded ? (
                            <Text style={styles.noGamesText}>No upcoming games</Text>
                        ) : (
                            // First load of the schedule from the DB is still in flight.
                            <ActivityIndicator color="#ff6600" style={styles.gamesLoading} />
                        )}
                        </>
                    )}
                    <TouchableOpacity
                        style={styles.gameCard}
                        onPress={() => router.push("/(protected)/(tabs)/home/AllGames")}
                    >
                        <Text style={styles.link}>View All Games</Text>
                        <Ionicons name="chevron-forward" size={24} color="#ff6600" />
                    </TouchableOpacity>
                </View>
                {ruleLinks.length > 0 && (
                  <>
                <View style={styles.separator} />

                <View style={styles.section}>
                    {ruleLinks.map((link) => (
                        <TouchableOpacity
                            key={link.title}
                            onPress={() => openLink(link)}
                            style={styles.gameCard}
                        >
                            <View style={styles.linkTitleContainer}>
                                <Text style={styles.link}>{link.title}</Text>
                                {link.title === 'Rulebook' && <Entypo name="book" size={20} color="#fff" style={styles.bookIcon} />}
                                {link.title === 'Situation Book' && <MaterialCommunityIcons name="head-question-outline" size={24} color="#fff" style={styles.bookIcon} />}
                            </View>
                            <Ionicons name="chevron-forward" size={24} color="#ff6600" />
                        </TouchableOpacity>
                    ))}
                </View>
                  </>
                )}

                <View style={styles.separator} />

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>External Links</Text>
                    {externalUrlLinks.map((link) => (
                        <TouchableOpacity
                            key={link.title}
                            onPress={() => openLink(link)}
                            style={styles.linkButton}
                        >
                            <Text style={styles.link}>{link.title}</Text>
                        </TouchableOpacity>
                    ))}
                    {/* An ahlAdmin has no games of their own to fly to. */}
                    {!isAhlAdmin && (
                        <TouchableOpacity
                            onPress={() => router.push('/(protected)/(tabs)/home/flights')}
                            style={[styles.linkButton, styles.linkButtonRow]}
                        >
                            <Ionicons name="airplane" size={16} color="#fff" />
                            <Text style={styles.link}>Flights</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.lastSyncRow}>
                    <Text style={styles.lastSyncText}>
                        Last refresh: {syncStatus.lastSyncTime ? syncStatus.lastSyncTime.toLocaleString() : 'Never'}
                    </Text>
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
    header: {
        alignItems: 'center',
        fontSize: 20,
        marginBottom: 16,
    },
    headerText: {
        color: '#ffffff',
        fontSize: 20,
    },
    lastSyncRow: {
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 18,
        backgroundColor: '#000',
    },
    lastSyncText: {
        color: '#ccc',
        fontSize: 12,
        textAlign: 'center',
    },
    headericon: {
        color: '#ff6600',
        fontSize: 26,
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
    gameCardToday: {
        backgroundColor: '#1a1a1a',
        padding: 15,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    gameCardTodaySpaced: {
        marginTop: 12,
    },
    gameContent: {
        flex: 1,
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
        marginVertical: 10,
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
        color: '#aaa',
        fontSize: 14,
        marginTop: 10,
    },
    gamesLoading: {
        marginVertical: 12,
    },
    noGamesText: {
        color: '#999',
        fontSize: 16,
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 20,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1,
    },
    linkButton: {
        backgroundColor: '#ff6600',
        borderRadius: 8,
        padding: 10,
        marginBottom: 15,
        alignItems: 'center',
    },
    linkButtonRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    link: {
        fontSize: 15,
        color: '#fff',
        fontWeight: 'bold',
    },
    linkTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8, // Space between text and icon
    },
    bookIcon: {
        marginLeft: 8, // Backup for gap if not supported
    },
    leagueLogo: {
        marginTop: 5,
        width: 80,
        height: 80,
        resizeMode: 'contain',
        marginBottom: 10,
    },
});

export default TestScheduleScreen;