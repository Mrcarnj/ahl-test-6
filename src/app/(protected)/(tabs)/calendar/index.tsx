// app/(protected)/(tabs)/calendar/index.tsx

import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Text, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import { format, parse } from 'date-fns';
import { useRouter } from 'expo-router';
import ViewShot from "react-native-view-shot";
import { useSchedule, formatGameTime } from '@/src/providers/ScheduleProvider';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/src/providers/AuthProvider';
import { useHockeySync } from '@/src/hooks/useHockeySync';
import { fetchAndParseHockeySchedule } from '@/src/lib/icalHockeySync';

const screenWidth = Dimensions.get('window').width;
const calendarWidth = screenWidth * 0.98;

type CustomMarking = {
  gameTime?: string;
  selected?: boolean;
  text?: string;
  gameid?: string;
};

export default function CalendarScreen() {
  const calendarRef = useRef<ViewShot>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const { myGames, loading } = useSchedule();
  const router = useRouter();
  const { getSyncStatusText } = useHockeySync();

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
      const result = await fetchAndParseHockeySchedule(false);
      if (result.success) {
        setLastSyncTime(new Date().toLocaleString());
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setRefreshing(false);
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
      <View style={styles.container}>
        <Text style={styles.disclaimer}><MaterialIcons name="tips-and-updates" /> Tap orange game days to access game details</Text>
        {lastSyncTime && (
          <Text style={styles.lastSyncText}>
           Pull Down to Refresh // Last sync: {lastSyncTime}
          </Text>
        )}
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
          <Calendar
            current={format(currentMonth, 'yyyy-MM-dd')}
            onMonthChange={onMonthChange}
            monthFormat={'MMMM yyyy'}
            enableSwipeMonths={true}
            hideExtraDays={false}
            firstDay={0}
            showFiveWeeks={true}
            style={styles.calendar}
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
    width: screenWidth,
    borderWidth: 0,
    flex: 1, // Use all available space
    paddingTop: -30, // Remove negative padding
    paddingBottom: 0, // Ensure no bottom padding
  },
  dayContainer: {
    width: calendarWidth / 7,
    height: (calendarWidth * 1.4) / 6,
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
  textDayFontWeight: '300',
  textMonthFontWeight: 'bold',
  textDayHeaderFontWeight: '300',
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