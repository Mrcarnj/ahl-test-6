// app/(protected)/(tabs)/calendar/index.tsx

import React, { useState, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, RefreshControl, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import { differenceInCalendarWeeks, endOfMonth, format, startOfMonth } from 'date-fns';
import { useRouter } from 'expo-router';
import ViewShot from "react-native-view-shot";
import { Image } from 'expo-image';
import { useSchedule, formatGameTime, getTeamLogo } from '@/src/providers/ScheduleProvider';
import { MaterialIcons } from '@expo/vector-icons';
import { useHockeySync } from '@/src/hooks/useHockeySync';
import { withTimeout } from '@/src/lib/withTimeout';
import SyncBannerHost from '@/src/components/SyncBannerHost';
import { isWeb, useTabletLayout } from '@/src/lib/platform';

/**
 * Smallest day cell. Above it the month always fits the screen exactly; only
 * a window too short for this (a landscape phone, a tiny browser window)
 * scrolls, rather than squashing the matchups into an unreadable grid.
 */
const MIN_DAY_HEIGHT = 54;

/**
 * Before the first measurement: react-native-calendars' month title and
 * weekday row, which it draws itself above the grid. Measured and replaced
 * on the first layout.
 */
const INITIAL_GRID_CHROME = 75;

/**
 * A game day needs about this much height for its date, three-line matchup
 * and (on a phone, two-line) game time. Shorter cells — a six-week month on a
 * phone — switch to smaller game text so nothing is clipped.
 */
const FULL_TEXT_DAY_HEIGHT = 92;

type CustomMarking = {
  gameTime?: string;
  selected?: boolean;
  text?: string;
  /** Set when the day has exactly one game: tapping goes straight to it. */
  gameid?: string;
  /** Games that day. Above one, tapping opens the day's game list. */
  count?: number;
  /** One-game days: team logos, which iPad shows instead of the abbreviations. */
  awayLogo?: string;
  homeLogo?: string;
};

export default function CalendarScreen() {
  const calendarRef = useRef<ViewShot>(null);
  // On web the calendar sits inside the content column next to the sidebar, so
  // it has to size against its own container rather than the whole window.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [containerSize, setContainerSize] = useState({
    width: windowWidth,
    height: windowHeight,
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // Height the calendar has on screen (the ScrollView's viewport), and how much
  // of the calendar's own height is its header rather than week rows.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [gridChrome, setGridChrome] = useState(INITIAL_GRID_CHROME);
  const [refreshing, setRefreshing] = useState(false);
  const { myGames, syncScheduleFromIcal } = useSchedule();
  const router = useRouter();
  const { syncStatus, refreshSyncStatus } = useHockeySync();

  // Create marked dates object from myGames. A day with one game shows the
  // matchup; a day with several (every day, for an ahlAdmin, whose myGames is
  // the whole league) shows how many.
  const markedDates = React.useMemo(() => {
    const byDate: { [key: string]: typeof myGames } = {};
    for (const game of myGames) {
      // gamedate is YYYY-MM-DD
      if (byDate[game.gamedate]) byDate[game.gamedate].push(game);
      else byDate[game.gamedate] = [game];
    }
    const acc: { [key: string]: CustomMarking } = {};
    for (const [date, games] of Object.entries(byDate)) {
      if (games.length === 1) {
        const [game] = games;
        acc[date] = {
          selected: true,
          text: `${game.awayTeamData?.abbreviation}\n@\n${game.homeTeamData?.abbreviation}`,
          gameTime: formatGameTime(game.gametime, game.gamedate),
          gameid: game.gameid,
          count: 1,
          awayLogo: getTeamLogo(game.awayTeamData),
          homeLogo: getTeamLogo(game.homeTeamData),
        };
      } else {
        acc[date] = { selected: true, text: `${games.length}\ngames`, count: games.length };
      }
    }
    return acc;
  }, [myGames]);

  const captureCalendar = async () => {
    if (calendarRef.current) {
      try {
        if (calendarRef.current && calendarRef.current.capture) {
          const uri = await calendarRef.current.capture();
          return uri;
        }
        return null;
      } catch (error) {
        console.error('Error capturing calendar:', error);
        return null;
      }
    }
    return null;
  };

  global.captureCalendar = captureCalendar;

  const onContainerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setContainerSize({ width, height });
  };

  // Weeks this month spans (4-6), which is how many rows the calendar draws.
  const weekCount = differenceInCalendarWeeks(endOfMonth(currentMonth), startOfMonth(currentMonth)) + 1;

  // The whole month fits on screen, on any device: react-native-calendars lays
  // its grid out from explicit cell sizes (its swipe wrapper takes no style, so
  // rows can't simply flex), so the rows split whatever height is left under
  // its header between this month's weeks.
  const dayHeight = viewportHeight > 0
    // -1: sub-pixel rounding must never leave a sliver to scroll.
    ? Math.max(MIN_DAY_HEIGHT, (viewportHeight - gridChrome - 1) / weekCount)
    : MIN_DAY_HEIGHT;

  const compactText = dayHeight < FULL_TEXT_DAY_HEIGHT;
  // iPad cells are wide enough for "[away logo] @ [home logo]" on one line.
  const logoCells = useTabletLayout();
  const logoSize = Math.min(44, dayHeight * 0.38);

  const dynamicStyles = useMemo(() => {
    const calendarWidth = containerSize.width * 0.98;
    return {
      calendar: { width: containerSize.width },
      dayContainer: {
        width: calendarWidth / 7,
        height: dayHeight,
      },
    };
  }, [containerSize, dayHeight]);

  const onViewportLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) setViewportHeight(height);
  };

  // Whatever the rendered calendar has beyond its week rows is its header.
  // Self-correcting: measured against the row height it was drawn with.
  const onCalendarLayout = (event: LayoutChangeEvent) => {
    const chrome = event.nativeEvent.layout.height - weekCount * dayHeight;
    if (chrome > 0 && Math.abs(chrome - gridChrome) > 0.5) setGridChrome(chrome);
  };

  const onDayPress = (day: DateData) => {
    const selectedDate = day.dateString;
    const selectedGame = markedDates[selectedDate];
    if (selectedGame?.gameid) {
        router.push({
            pathname: "/(protected)/game/[id]",
            params: { 
                id: selectedGame.gameid,
                source: 'calendar'
            }
        });
    } else if ((selectedGame?.count ?? 0) > 1) {
        router.push({
            pathname: "/(protected)/(tabs)/calendar/day/[date]",
            params: { date: selectedDate },
        });
    }
};

  const onMonthChange = (month: DateData) => {
    setCurrentMonth(new Date(month.timestamp));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await withTimeout(syncScheduleFromIcal({ source: 'manual', showInBanner: true }), 65000, 'Schedule sync');
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setRefreshing(false);
      // Never block UI completion on AsyncStorage/status reads (some devices can hang).
      void withTimeout(refreshSyncStatus(), 4000, 'Sync status refresh').catch(() => {});
    }
  };

  // if (loading) {
  //   return (
  //     <SafeAreaView style={styles.safeArea}>
  //       <View style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
  //         <ActivityIndicator size="large" color="#ff6600"/>
  //       </View>
  //     </SafeAreaView>
  //   );
  // }

  return (
    // No bottom edge: the tab bar below already clears the home indicator.
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container} onLayout={onContainerLayout}>
        <Text style={styles.disclaimer}>
          <MaterialIcons name="tips-and-updates" />{' '}
          {isWeb ? 'Use Refresh in the menu to sync' : 'Pull To Refresh'}
        </Text>
        <Text style={styles.disclaimer}>Tap orange game days to access game details</Text>
        {/* Outside the ScrollView, so a sync banner shrinks the grid instead
            of pushing the last week off screen. */}
        <SyncBannerHost />
        <ViewShot ref={calendarRef} options={{ format: "jpg", quality: 0.9 }} style={styles.shot}>
        <ScrollView
          style={styles.scrollView}
          onLayout={onViewportLayout}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#ff6600"
              colors={["#ff6600"]}
            />
          }
        >
          <View onLayout={onCalendarLayout}>
          <Calendar
            current={format(currentMonth, 'yyyy-MM-dd')}
            onMonthChange={onMonthChange}
            monthFormat={'MMMM yyyy'}
            enableSwipeMonths={true}
            hideExtraDays={false}
            firstDay={0}
            style={[styles.calendar, dynamicStyles.calendar]}
            markingType={'custom'}
            markedDates={markedDates}
            theme={calendarTheme}
            onDayPress={onDayPress}
            dayComponent={({date, state, marking}: {date?: DateData; state?: string; marking?: CustomMarking}) => {
              const isDisabled = state === 'disabled';
              const isToday = state === 'today';
              return (
                <TouchableOpacity
                  onPress={() => date && onDayPress(date)}
                  style={[
                    styles.dayContainer,
                    dynamicStyles.dayContainer,
                    marking?.selected && styles.selectedDayContainer,
                    isToday && styles.todayContainer
                  ]}
                >
                  <Text style={[
                    styles.dayText,
                    isDisabled && styles.disabledDayText
                  ]}>
                    {date?.day}
                  </Text>
                  {logoCells && marking?.awayLogo && marking.homeLogo ? (
                    <View style={styles.logoGame}>
                      <View style={styles.logoRow}>
                        <Image
                          source={{ uri: marking.awayLogo }}
                          style={{ width: logoSize, height: logoSize }}
                          contentFit="contain"
                          cachePolicy="disk"
                        />
                        <Text style={styles.logoAt}>@</Text>
                        <Image
                          source={{ uri: marking.homeLogo }}
                          style={{ width: logoSize, height: logoSize }}
                          contentFit="contain"
                          cachePolicy="disk"
                        />
                      </View>
                      {marking.gameTime && (
                        <Text style={styles.logoGameTime}>{marking.gameTime}</Text>
                      )}
                    </View>
                  ) : marking?.text && (
                    <>
                      <Text style={[styles.gameInfo, compactText && styles.gameInfoCompact, (marking.count ?? 0) > 1 && styles.gameCount]}>{marking.text}</Text>
                      {marking.gameTime && (
                        <Text style={[styles.gameTime, compactText && styles.gameTimeCompact]}>{marking.gameTime}</Text>
                      )}
                    </>
                  )}
                </TouchableOpacity>
              );
            }}
          />
          </View>
          </ScrollView>
          <Text style={styles.lastSyncText}>
            Last sync: {syncStatus.lastSyncTime ? syncStatus.lastSyncTime.toLocaleString() : 'Never'}
          </Text>
        </ViewShot>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: -55, // Move everything up a bit more from the top
    paddingBottom: 0, // Remove safe area bottom padding to reach tab bar
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 0, // Reset since SafeAreaView is handling the positioning
    paddingBottom: 0, // Remove bottom padding to reach tab bar
  },
  calendar: {
    borderWidth: 0,
    flex: 1, // Use all available space
    paddingTop: -30, // Remove negative padding
    paddingBottom: 0, // Ensure no bottom padding
  },
  dayContainer: {
    justifyContent: 'flex-start',
    // At MIN_DAY_HEIGHT a matchup can be taller than its cell.
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#333333',
    padding: 2,
  },
  selectedDayContainer: {
    backgroundColor: '#ff6600',
    borderRadius: 5,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 2,
  },
  gameInfo: {
    fontSize: 12,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 13,
    marginBottom: 3,
  },
  logoGame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Sits a little above centre, clear of the time below.
    marginTop: -8,
  },
  logoAt: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logoGameTime: {
    color: '#fff',
    fontSize: 12,
    marginTop: 10,
  },
  gameInfoCompact: {
    fontSize: 10,
    lineHeight: 11,
    marginBottom: 1,
  },
  gameTimeCompact: {
    fontSize: 9,
    lineHeight: 10,
  },
  gameCount: {
    fontWeight: '700',
  },
  gameTime: {
    fontSize: 10,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 12,
  },
  disabledDayText: {
    color: '#444444',
  },
  todayContainer: {
    borderColor: '#ffffff',
    borderWidth: 2,
  },
  loadingText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 13,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 2,
    fontStyle: 'italic',
    marginTop: 0, // No margin to work with container padding
  },
  lastSyncText: {
    fontSize: 12,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 8,
  },
  shot: {
    flex: 1,
    alignSelf: 'stretch',
  },
  scrollView: {
    flex: 1,
  },
});

const calendarTheme = {
  backgroundColor: '#000000',
  calendarBackground: '#000000',
  textSectionTitleColor: '#ffffff',
  selectedDayBackgroundColor: '#ff6600',
  selectedDayTextColor: '#ffffff',
  todayTextColor: '#ff6600',
  dayTextColor: '#ffffff',
  textDisabledColor: '#444444',
  arrowColor: '#ff6600',
  monthTextColor: '#ffffff',
  textDayFontWeight: '300' as const,
  textMonthFontWeight: 'bold' as const,
  textDayHeaderFontWeight: '300' as const,
  textDayFontSize: 16,
  textMonthFontSize: 20,
  textDayHeaderFontSize: 14,
  'stylesheet.calendar.main': {
    week: {
      marginTop: 0,
      marginBottom: 0,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
  },
};