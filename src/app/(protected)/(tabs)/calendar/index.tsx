// app/(protected)/(tabs)/calendar/index.tsx

import React, { useState, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, RefreshControl, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import ViewShot from "react-native-view-shot";
import { useSchedule, formatGameTime } from '@/src/providers/ScheduleProvider';
import { MaterialIcons } from '@expo/vector-icons';
import { useHockeySync } from '@/src/hooks/useHockeySync';
import { withTimeout } from '@/src/lib/withTimeout';
import SyncBannerHost from '@/src/components/SyncBannerHost';
import { isWeb } from '@/src/lib/platform';

type CustomMarking = {
  gameTime?: string;
  selected?: boolean;
  text?: string;
  gameid?: string;
};

export default function CalendarScreen() {
  const calendarRef = useRef<ViewShot>(null);
  // On web the calendar sits inside the content column next to the sidebar, so
  // it has to size against its own container rather than the whole window.
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const { myGames, syncScheduleFromIcal } = useSchedule();
  const router = useRouter();
  const { syncStatus, refreshSyncStatus } = useHockeySync();

  // Create marked dates object from myGames
  const markedDates = React.useMemo(() => {
    return myGames.reduce((acc: {[key: string]: CustomMarking}, game) => {
      const formattedDate = game.gamedate; // Already in YYYY-MM-DD format
      acc[formattedDate] = {
        selected: true,
        text: `${game.awayTeamData?.abbreviation}\n@\n${game.homeTeamData?.abbreviation}`,
        gameTime: formatGameTime(game.gametime, game.gamedate),
        gameid: game.gameid,
      };
      return acc;
    }, {});
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
    const { width } = event.nativeEvent.layout;
    if (width > 0) setContainerWidth(width);
  };

  // react-native-calendars lays its grid out from explicit cell sizes, so these
  // have to be recomputed whenever the container resizes.
  const dynamicStyles = useMemo(() => {
    const calendarWidth = containerWidth * 0.98;
    return {
      calendar: { width: containerWidth },
      dayContainer: {
        width: calendarWidth / 7,
        height: (calendarWidth * 1.4) / 6,
      },
    };
  }, [containerWidth]);

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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container} onLayout={onContainerLayout}>
        <Text style={styles.disclaimer}>
          <MaterialIcons name="tips-and-updates" />{' '}
          {isWeb ? 'Use Refresh in the menu to sync' : 'Pull To Refresh'}
        </Text>
        <Text style={styles.disclaimer}>Tap orange game days to access game details</Text>
        <ViewShot ref={calendarRef} options={{ format: "jpg", quality: 0.9 }}>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#ff6600"
              colors={["#ff6600"]}
            />
          }
        >
          <SyncBannerHost />
          <Calendar
            current={format(currentMonth, 'yyyy-MM-dd')}
            onMonthChange={onMonthChange}
            monthFormat={'MMMM yyyy'}
            enableSwipeMonths={true}
            hideExtraDays={false}
            firstDay={0}
            showSixWeeks={true}
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
                  {marking?.text && (
                    <>
                      <Text style={styles.gameInfo}>{marking.text}</Text>
                      {marking.gameTime && (
                        <Text style={styles.gameTime}>{marking.gameTime}</Text>
                      )}
                    </>
                  )}
                </TouchableOpacity>
              );
            }}
          />
          <Text style={styles.lastSyncText}>
            Last sync: {syncStatus.lastSyncTime ? syncStatus.lastSyncTime.toLocaleString() : 'Never'}
          </Text>
          </ScrollView>
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
  scrollView: {
    flex: 1,
    height: '100%',
    
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