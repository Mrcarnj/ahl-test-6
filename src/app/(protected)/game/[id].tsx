// app/(protected)/game/[id].tsx
import { View, Text, Linking, Alert, Platform, TouchableOpacity, ScrollView, StyleSheet, Image, Dimensions, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatGameDate, formatGameDateTime, useSchedule, formatGameTime, Schedule, getTeamLogo, getTeamCoach, formatGameDate2 } from '@/src/providers/ScheduleProvider';
import { getOfficialPhoto, useRoster } from '@/src/providers/RosterProvider';
import { format } from 'date-fns';
import { AntDesign, FontAwesome, FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import { useAuth } from '@/src/providers/AuthProvider';




const GameDetails = () => {
  const { id, source } = useLocalSearchParams<{ id: string; source: string }>();
  const { allGames, myGames } = useSchedule();
  const { allRosters } = useRoster();
  const [activeTab, setActiveTab] = useState('crew');
  const [scrollViewRef, setScrollViewRef] = useState<ScrollView | null>(null);
  const screenWidth = Dimensions.get('window').width;
  const [refreshing, setRefreshing] = useState(false);
  const { refreshSchedule } = useSchedule();


  const game = myGames.find(g => g.gameid === id);

  if (!game) {
    return <Text>Game not found</Text>;
  }

  const generateUrl = (gameId: any, isGamesheet = false) => {
    const baseNumericID = 1026475;
    const numericID = baseNumericID + parseInt(gameId) - 1;

    if (isGamesheet) {
      return `https://lscluster.hockeytech.com/game_reports/official-game-report.php?lang_id=1&client_code=ahl&game_id=${numericID}`;
    } else {
      return `https://theahl.com/stats/game-center/${numericID}`;
    }
  };

  const getOfficialName = (lastfirstfullname: string) => {
    const ref = allRosters.find(r => r.lastfirstfullname === lastfirstfullname);
    return ref ? `${ref.firstname} ${ref.lastname}` : lastfirstfullname;
  };


  const handleOfficialPress = (rosterId: number) => {
    router.push({
      pathname: "/(protected)/official/[rosterId]",
      params: {
        rosterId: rosterId,
        source: 'game'
      }
    });
  };


  const handleGroupChat = async () => {
    console.log("HandleGroupChat started");

    const cleanPhoneNumber = (phone: string) => {
      if (!phone) return null;
      console.log("Cleaning phone number:", phone);
      return phone.replace(/\D/g, '');
    };

    // Get and clean all valid phone numbers
    const ref1 = allRosters.find(r => r.lastfirstfullname === game.referee1);
    const ref2 = allRosters.find(r => r.lastfirstfullname === game.referee2);
    const lines1 = allRosters.find(r => r.lastfirstfullname === game.linesperson1);
    const lines2 = allRosters.find(r => r.lastfirstfullname === game.linesperson2);

    console.log("Found officials:", {
      ref1: ref1?.phonenumber,
      ref2: ref2?.phonenumber,
      lines1: lines1?.phonenumber,
      lines2: lines2?.phonenumber
    });

    const phoneNumbers = [
      ref1?.phonenumber ? cleanPhoneNumber(ref1.phonenumber) : null,
      ref2?.phonenumber ? cleanPhoneNumber(ref2.phonenumber) : null,
      lines1?.phonenumber ? cleanPhoneNumber(lines1.phonenumber) : null,
      lines2?.phonenumber ? cleanPhoneNumber(lines2.phonenumber) : null
    ].filter(Boolean);

    console.log("Cleaned phone numbers:", phoneNumbers);

    if (phoneNumbers.length === 0) {
      console.log("No phone numbers found");
      Alert.alert("Error", "No phone numbers available for officials");
      return;
    }

    try {
      console.log("Attempting to copy to clipboard");
      await Clipboard.setStringAsync(phoneNumbers.join(', '));
      console.log("Successfully copied to clipboard");

      Alert.alert(
        "Numbers Copied!",
        "Numbers have been copied to your clipboard. Would you like to open Messages now?\n\nJust paste (tap and hold, then select Paste) in the 'To:' field to add all officials.",
        [
          {
            text: "Open Messages",
            onPress: () => Linking.openURL('sms:')
          },
          {
            text: "Cancel",
            style: "cancel"
          }
        ]
      );
    } catch (error) {
      console.error("Clipboard error:", error);
      Alert.alert("Error", "Failed to copy numbers to clipboard");
    }
  };

  const handleArenaPress = (game: Schedule) => {
    // Get arena address from the homeTeamData
    const arenaAddress = game.homeTeamData?.arenaaddress;

    if (!arenaAddress) {
      // Handle case where arena address isn't available
      Alert.alert('Error', 'Arena address not available');
      return;
    }

    const encodedAddress = encodeURIComponent(arenaAddress);
    const url = Platform.select({
      ios: `maps://app?daddr=${encodedAddress}`,
      android: `google.navigation:q=${encodedAddress}`,
    });

    // Check if the URL can be opened
    Linking.canOpenURL(url!).then(supported => {
      if (supported) {
        Linking.openURL(url!);
      } else {
        Alert.alert('Error', 'Unable to open maps application');
      }
    });
  };

  const handleParkingPress = (game: Schedule) => {
    if (!game.homeTeamData?.parking_latitude || !game.homeTeamData?.parking_longitude) {
      Alert.alert('Error', 'Parking location not available');
      return;
    }

    const url = Platform.select({
      ios: `maps://app?daddr=${game.homeTeamData.parking_latitude},${game.homeTeamData.parking_longitude}`,
      android: `google.navigation:q=${game.homeTeamData.parking_latitude},${game.homeTeamData.parking_longitude}`,
    });

    Linking.canOpenURL(url!).then(supported => {
      if (supported) {
        Linking.openURL(url!);
      } else {
        Alert.alert('Error', 'Unable to open maps application');
      }
    });
  };

  const CrewContent = ({ game, allRosters, handleOfficialPress, handleGroupChat }: { game: Schedule, allRosters: any[], handleOfficialPress: (id: number) => void, handleGroupChat: () => void }) => (
    <>
      <View style={styles.refereesRow}>
        <View style={styles.refereeContainer}>
          <TouchableOpacity
            onPress={() => {
              const ref = allRosters.find(r => r.lastfirstfullname === game.referee1);
              if (ref) {
                handleOfficialPress(ref.id);
              }
            }}
          >
            <Image
              source={
                allRosters.find(r => r.lastfirstfullname === game.referee1)?.photo
                  ? { uri: allRosters.find(r => r.lastfirstfullname === game.referee1)?.photo }
                  : require('../../../../assets/images/noPhoto.png')
              }
              style={styles.profileImageRef}
            />
            <Text style={styles.refereeText}>{getOfficialName(game.referee1)} </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.refereeContainer}>
          <TouchableOpacity
            onPress={() => {
              const ref = allRosters.find(r => r.lastfirstfullname === game.referee2);
              if (ref) {
                handleOfficialPress(ref.id);
              }
            }}
          >
            <Image
              source={
                allRosters.find(r => r.lastfirstfullname === game.referee2)?.photo
                  ? { uri: allRosters.find(r => r.lastfirstfullname === game.referee2)?.photo }
                  : require('../../../../assets/images/noPhoto.png')
              }
              style={styles.profileImageRef}
            />
            <Text style={styles.refereeText}>{getOfficialName(game.referee2)} </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.refereesRow}>
        <View style={styles.refereeContainer}>
          <TouchableOpacity
            onPress={() => {
              const ref = allRosters.find(r => r.lastfirstfullname === game.linesperson1);
              if (ref) {
                handleOfficialPress(ref.id);
              }
            }}
          >
            <Image
              source={
                allRosters.find(r => r.lastfirstfullname === game.linesperson1)?.photo
                  ? { uri: allRosters.find(r => r.lastfirstfullname === game.linesperson1)?.photo }
                  : require('../../../../assets/images/noPhoto.png')
              }
              style={styles.profileImageLines}
            />
            <Text style={styles.refereeText}>{getOfficialName(game.linesperson1)} </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.refereeContainer}>
          <TouchableOpacity
            onPress={() => {
              const ref = allRosters.find(r => r.lastfirstfullname === game.linesperson2);
              if (ref) {
                handleOfficialPress(ref.id);
              }
            }}
          >
            <Image
              source={
                allRosters.find(r => r.lastfirstfullname === game.linesperson2)?.photo
                  ? { uri: allRosters.find(r => r.lastfirstfullname === game.linesperson2)?.photo }
                  : require('../../../../assets/images/noPhoto.png')
              }
              style={styles.profileImageLines}
            />
            <Text style={styles.refereeText}>{getOfficialName(game.linesperson2)} </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity onPress={handleGroupChat}>
        <Text style={styles.groupChat}>
          Start Group Chat <AntDesign name="message1" size={25} />
        </Text>
      </TouchableOpacity>

      <View style={styles.separator} />

      <View style={styles.notesSection}>
        <Text style={styles.titles}> <FontAwesome5 name="parking" size={20} color="#ff6600" /> Parking Notes</Text>
        <View style={styles.notesContainer}>
          <View style={styles.noteItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.noteText}>
              {game.homeTeamData?.parking_instructions}
            </Text>
          </View>
          <View style={styles.notesSection}>
            <Text style={styles.titles}>
              <FontAwesome5 name="door-open" size={20} color="#ff6600" /> Locker Room Access
            </Text>
          </View>
          <View style={styles.noteItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.noteText}>
              {game.homeTeamData?.locker_room_instructions}
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  const AwayTeamContent = ({ game }: { game: Schedule }) => {
    const { teamRosters } = useSchedule();
    const teamAbbrev = game.awayTeamData?.abbreviation;
    const teamRoster = teamRosters
      .filter(player => player.team === teamAbbrev)
      .sort((a, b) => {
        // First sort by points (descending)
        if (b.points !== a.points) {
          return b.points - a.points;
        }
        // If points are equal, sort by games played (ascending)
        if (a.games_played !== b.games_played) {
          return a.games_played - b.games_played;
        }
        // If games played are equal, sort by goals (descending)
        if (b.goals !== a.goals) {
          return b.goals - a.goals;
        }
        // If goals are equal, sort by assists (descending)
        return b.assists - a.assists;
      });

    const pointsLeaders = [...teamRoster]
      .sort((a, b) => {
        // First sort by points (descending)
        if (b.points !== a.points) {
          return b.points - a.points;
        }
        // If points are equal, sort by games played (ascending)
        if (a.games_played !== b.games_played) {
          return a.games_played - b.games_played;
        }
        // If games played are equal, sort by goals (descending)
        if (b.goals !== a.goals) {
          return b.goals - a.goals;
        }
        // If goals are equal, sort by assists (descending)
        return b.assists - a.assists;
      })
      .slice(0, 5); // Get only top 5

    const pimLeaders = [...teamRoster]
      .sort((a, b) => {
        // First sort by penalty minutes (descending)
        if (b.penalty_minutes !== a.penalty_minutes) {
          return b.penalty_minutes - a.penalty_minutes;
        }
        // If pims are equal, sort by games played (ascending)
        return a.games_played - b.games_played;

      })
      .slice(0, 3); // Get only top 5

    return (
      <ScrollView style={styles.teamContentScrollView}>
        <View style={styles.teamContentContainer}>
          <View style={styles.leftColumn}>
            <Text style={styles.titles}>Head Coach</Text>
            <View style={styles.headCoachContainer}>
              <Image
                source={{ uri: getTeamCoach(game.awayTeamData) || 'https://via.placeholder.com/150' }}
                style={styles.headCoachPic}
              />
              <Text style={styles.headCoachText}>
                {game.awayTeamData?.headcoachname || 'N/A'}
              </Text>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.rightContentSection}>
              <Text style={styles.subtitles}>Assistant Coach</Text>
              <Text style={styles.staffText}>
                {game.awayTeamData?.assistantcoach1 || 'N/A'}
              </Text>
            </View>

            <View style={styles.rightContentSection}>
              <Text style={styles.subtitles}>Assistant Coach</Text>
              <Text style={styles.staffText}>
                {game.awayTeamData?.assistantcoach2 || 'N/A'}
              </Text>
            </View>

            <View style={styles.rightContentSection}>
              <Text style={styles.subtitles}>Equipment Manager</Text>
              <Text style={styles.staffText}>
                {game.awayTeamData?.eqname || 'N/A'}
              </Text>
              <View style={styles.iconsContainer}>
                <TouchableOpacity
                  onPress={() => game.awayTeamData?.eqphone && Linking.openURL(`tel:${game.awayTeamData?.eqphone}`)}
                  style={styles.iconButton}
                >
                  <FontAwesome name="phone" size={24} color="#ff6600" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => game.awayTeamData?.eqphone && Linking.openURL(`sms:${game.awayTeamData?.eqphone}?body=`)}
                  style={styles.iconButton}
                >
                  <AntDesign name="message1" size={24} color="#ff6600" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionTitle}>Points Leaders</Text>

          <View style={styles.rosterHeader}>
            <Text style={styles.headerText}>#</Text>
            <Text style={[styles.headerText, { flex: 4 }]}>Player</Text>
            <Text style={styles.headerText}>POS</Text>
            <Text style={styles.headerText}>GP</Text>
            <Text style={styles.headerText}>G</Text>
            <Text style={styles.headerText}>A</Text>
            <Text style={styles.headerText}>PTS</Text>
            <Text style={styles.headerText}>PPG</Text>
          </View>

          {pointsLeaders.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerText}>{player.number !== null ? player.number : "X"}</Text>
              <Text style={[styles.playerText, { flex: 4 }]}>
                {player.player_name.replace(/\s\+-\s*$/, '')}
              </Text>
              <Text style={styles.playerText}>{player.position}</Text>
              <Text style={styles.playerText}>{player.games_played}</Text>
              <Text style={styles.playerText}>{player.goals}</Text>
              <Text style={styles.playerText}>{player.assists}</Text>
              <Text style={styles.playerText}>{player.points}</Text>
              <Text style={styles.playerText}>{player.power_play_goals}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionTitle}>Penalty Leaders</Text>

          <View style={styles.rosterHeader}>
            <Text style={styles.headerText}>#</Text>
            <Text style={[styles.headerText, { flex: 2 }]}>Player</Text>
            <Text style={styles.headerText}>POS</Text>
            <Text style={styles.headerText}>GP</Text>
            <Text style={styles.headerText}>PIM</Text>
          </View>

          {pimLeaders.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerText}>{player.number !== null ? player.number : "X"}</Text>
              <Text style={[styles.playerText, { flex: 2 }]}>
                {player.player_name.replace(/\s\+-\s*$/, '')}
              </Text>
              <Text style={styles.playerText}>{player.position}</Text>
              <Text style={styles.playerText}>{player.games_played}</Text>
              <Text style={styles.playerText}>{player.penalty_minutes}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionTitle}>Team Roster</Text>

          <View style={styles.rosterHeader}>
            <Text style={styles.headerText}>#</Text>
            <Text style={[styles.headerText, { flex: 4 }]}>Player</Text>
            <Text style={styles.headerText}>POS</Text>
            <Text style={styles.headerText}>GP</Text>
            <Text style={styles.headerText}>G</Text>
            <Text style={styles.headerText}>A</Text>
            <Text style={styles.headerText}>PTS</Text>
            <Text style={styles.headerText}>+/-</Text>
            <Text style={styles.headerText}>PIM</Text>
            <Text style={styles.headerText}>PPG</Text>
          </View>

          {teamRoster.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerText}>{player.number !== null ? player.number : "X"}</Text>
              <Text style={[styles.playerText, { flex: 4 }]}>
                {player.player_name.replace(/\s\+-\s*$/, '')}
              </Text>
              <Text style={styles.playerText}>{player.position}</Text>
              <Text style={styles.playerText}>{player.games_played}</Text>
              <Text style={styles.playerText}>{player.goals}</Text>
              <Text style={styles.playerText}>{player.assists}</Text>
              <Text style={styles.playerText}>{player.points}</Text>
              <Text style={styles.playerText}>{player.plusMinus}</Text>
              <Text style={styles.playerText}>{player.penalty_minutes}</Text>
              <Text style={styles.playerText}>{player.power_play_goals}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const HomeTeamContent = ({ game }: { game: Schedule }) => {
    const { teamRosters } = useSchedule();
    const teamAbbrev = game.homeTeamData?.abbreviation;
    const teamRoster = teamRosters
      .filter(player => player.team === teamAbbrev)
      .sort((a, b) => {
        // First sort by points (descending)
        if (b.points !== a.points) {
          return b.points - a.points;
        }
        // If points are equal, sort by games played (ascending)
        if (a.games_played !== b.games_played) {
          return a.games_played - b.games_played;
        }
        // If games played are equal, sort by goals (descending)
        if (b.goals !== a.goals) {
          return b.goals - a.goals;
        }
        // If goals are equal, sort by assists (descending)
        return b.assists - a.assists;
      });

    const pointsLeaders = [...teamRoster]
      .sort((a, b) => {
        // First sort by points (descending)
        if (b.points !== a.points) {
          return b.points - a.points;
        }
        // If points are equal, sort by games played (ascending)
        if (a.games_played !== b.games_played) {
          return a.games_played - b.games_played;
        }
        // If games played are equal, sort by goals (descending)
        if (b.goals !== a.goals) {
          return b.goals - a.goals;
        }
        // If goals are equal, sort by assists (descending)
        return b.assists - a.assists;
      })
      .slice(0, 5); // Get only top 5

    const pimLeaders = [...teamRoster]
      .sort((a, b) => {
        // First sort by penalty minutes (descending)
        if (b.penalty_minutes !== a.penalty_minutes) {
          return b.penalty_minutes - a.penalty_minutes;
        }
        // If pims are equal, sort by games played (ascending)
        return a.games_played - b.games_played;

      })
      .slice(0, 3); // Get only top 5

    return (
      <ScrollView style={styles.teamContentScrollView}>
        <View style={styles.teamContentContainer}>
          <View style={styles.leftColumn}>
            <Text style={styles.titles}>Head Coach</Text>
            <View style={styles.headCoachContainer}>
              <Image
                source={{ uri: getTeamCoach(game.homeTeamData) || 'https://via.placeholder.com/150' }}
                style={styles.headCoachPic}
              />
              <Text style={styles.headCoachText}>
                {game.homeTeamData?.headcoachname || 'N/A'}
              </Text>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.rightContentSection}>
              <Text style={styles.subtitles}>Assistant Coach</Text>
              <Text style={styles.staffText}>
                {game.homeTeamData?.assistantcoach1 || 'N/A'}
              </Text>
            </View>

            <View style={styles.rightContentSection}>
              <Text style={styles.subtitles}>Assistant Coach</Text>
              <Text style={styles.staffText}>
                {game.homeTeamData?.assistantcoach2 || 'N/A'}
              </Text>
            </View>

            <View style={styles.rightContentSection}>
              <Text style={styles.subtitles}>Equipment Manager</Text>
              <Text style={styles.staffText}>
                {game.homeTeamData?.eqname || 'N/A'}
              </Text>
              <View style={styles.iconsContainer}>
                <TouchableOpacity
                  onPress={() => game.homeTeamData?.eqphone && Linking.openURL(`tel:${game.homeTeamData?.eqphone}`)}
                  style={styles.iconButton}
                >
                  <FontAwesome name="phone" size={24} color="#ff6600" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => game.homeTeamData?.eqphone && Linking.openURL(`sms:${game.homeTeamData?.eqphone}?body=`)}
                  style={styles.iconButton}
                >
                  <AntDesign name="message1" size={24} color="#ff6600" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionTitle}>Points Leaders</Text>

          <View style={styles.rosterHeader}>
            <Text style={styles.headerText}>#</Text>
            <Text style={[styles.headerText, { flex: 4 }]}>Player</Text>
            <Text style={styles.headerText}>POS</Text>
            <Text style={styles.headerText}>GP</Text>
            <Text style={styles.headerText}>G</Text>
            <Text style={styles.headerText}>A</Text>
            <Text style={styles.headerText}>PTS</Text>
            <Text style={styles.headerText}>PPG</Text>
          </View>

          {pointsLeaders.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerText}>{player.number !== null ? player.number : "X"}</Text>
              <Text style={[styles.playerText, { flex: 4 }]}>
                {player.player_name.replace(/\s\+-\s*$/, '')}
              </Text>
              <Text style={styles.playerText}>{player.position}</Text>
              <Text style={styles.playerText}>{player.games_played}</Text>
              <Text style={styles.playerText}>{player.goals}</Text>
              <Text style={styles.playerText}>{player.assists}</Text>
              <Text style={styles.playerText}>{player.points}</Text>
              <Text style={styles.playerText}>{player.power_play_goals}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionTitle}>Penalty Leaders</Text>

          <View style={styles.rosterHeader}>
            <Text style={styles.headerText}>#</Text>
            <Text style={[styles.headerText, { flex: 2 }]}>Player</Text>
            <Text style={styles.headerText}>POS</Text>
            <Text style={styles.headerText}>GP</Text>
            <Text style={styles.headerText}>PIM</Text>
          </View>

          {pimLeaders.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerText}>{player.number !== null ? player.number : "X"}</Text>
              <Text style={[styles.playerText, { flex: 2 }]}>
                {player.player_name.replace(/\s\+-\s*$/, '')}
              </Text>
              <Text style={styles.playerText}>{player.position}</Text>
              <Text style={styles.playerText}>{player.games_played}</Text>
              <Text style={styles.playerText}>{player.penalty_minutes}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionTitle}>Team Roster</Text>

          <View style={styles.rosterHeader}>
            <Text style={styles.headerText}>#</Text>
            <Text style={[styles.headerText, { flex: 4 }]}>Player</Text>
            <Text style={styles.headerText}>POS</Text>
            <Text style={styles.headerText}>GP</Text>
            <Text style={styles.headerText}>G</Text>
            <Text style={styles.headerText}>A</Text>
            <Text style={styles.headerText}>PTS</Text>
            <Text style={styles.headerText}>+/-</Text>
            <Text style={styles.headerText}>PIM</Text>
            <Text style={styles.headerText}>PPG</Text>
          </View>

          {teamRoster.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerText}>{player.number !== null ? player.number : "X"}</Text>
              <Text style={[styles.playerText, { flex: 4 }]}>
                {player.player_name.replace(/\s\+-\s*$/, '')}
              </Text>
              <Text style={styles.playerText}>{player.position}</Text>
              <Text style={styles.playerText}>{player.games_played}</Text>
              <Text style={styles.playerText}>{player.goals}</Text>
              <Text style={styles.playerText}>{player.assists}</Text>
              <Text style={styles.playerText}>{player.points}</Text>
              <Text style={styles.playerText}>{player.plusMinus}</Text>
              <Text style={styles.playerText}>{player.penalty_minutes}</Text>
              <Text style={styles.playerText}>{player.power_play_goals}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'crew':
        return <CrewContent
          game={game}
          allRosters={allRosters}
          handleOfficialPress={handleOfficialPress}
          handleGroupChat={handleGroupChat}
        />;
      case game.awayTeamData?.abbreviation?.toLowerCase():
        return <AwayTeamContent
          game={game}
        />;
      case game.homeTeamData?.abbreviation?.toLowerCase():
        return <HomeTeamContent
          game={game}
        />;
      default:
        return null;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.card}>
        <Text style={styles.gameDate}>{formatGameDate2(game.gamedate)}</Text>
        <Text style={styles.gameID}>Game# {game.gameid}</Text>
        <View style={styles.teamsContainer}>
          <Image
            source={{ uri: getTeamLogo(game.awayTeamData) || 'https://via.placeholder.com/150' }}
            style={styles.teamLogo}
          />
          <Text style={styles.atSymbol}>@</Text>
          <Image
            source={{ uri: getTeamLogo(game.homeTeamData) || 'https://via.placeholder.com/150' }}
            style={styles.teamLogo}
          />
        </View>
        <View style={styles.gameInfoContainer}>
          <Text style={styles.gameTime}>
            {formatGameTime(game.gametime, game.gamedate)}
          </Text>
          <View style={styles.arenaContainer}>
            <TouchableOpacity onPress={() => handleArenaPress(game)}>
              <Text style={styles.arena}>
                {game.homeTeamData?.arenaname || 'Arena not specified'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.divider}> // </Text>
            <TouchableOpacity onPress={() => handleParkingPress(game)}>
              <View style={styles.parkingContainer}>
                <FontAwesome5 name="parking" size={14} color="#666666" />
                <Text style={styles.arena}> Parking</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.floatingButtonsContainer}>
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={() => Linking.openURL(generateUrl(game.gameid))}
          >
            <View style={styles.iconContainer}>
              <FontAwesome5 name="hockey-puck" size={24} color="#ffffff" />
            </View>
            <Text style={styles.buttonText}>Game Center</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={() => Linking.openURL(generateUrl(game.gameid, true))}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="newspaper-outline" size={24} color="#ffffff" />
            </View>
            <Text style={styles.buttonText}>Gamesheet</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.disclaimer}>Note: Gamesheet not available until after completion of the game.</Text>

      <View style={styles.tabContainer}>
        {[
          'Crew',
          game.awayTeamData?.abbreviation || 'Away',
          game.homeTeamData?.abbreviation || 'Home'
        ].map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab.toLowerCase().replace(' ', ''))}
            style={[
              styles.tab,
              activeTab === tab.toLowerCase().replace(' ', '') && styles.activeTab
            ]}
          >
            <Text style={[
              styles.tabText,
              activeTab === tab.toLowerCase().replace(' ', '') && styles.activeTabText
            ]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.contentContainer}>
        {renderContent()}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container2: {
    flexDirection: 'row',
  },
  contentContainer: {
    padding: 10,
    paddingBottom: 20, // Add extra padding at the bottom
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 10,
    shadowColor: "#ffffff",
    shadowOffset: {
      width: -7,
      height: -7,
    },
    shadowOpacity: 0.7,
    shadowRadius: 3.84,
    elevation: 5,
  },
  separator: {
    marginVertical: 5,
    height: 1,
    width: '100%',
    backgroundColor: '#333',
  },
  teamsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  teamLogo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginHorizontal: 20,
  },
  atSymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginHorizontal: 10,
  },
  gameTime: {
    fontSize: 18,
    color: '#000000',
    marginTop: -10,
    marginBottom: 5,
    textAlign: 'center'
  },
  gameDate: {
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
    marginTop: 10,
  },
  arena: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    textDecorationLine: 'underline',
    fontStyle: 'italic',
  },
  gameID: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 10,
  },
  refereesRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: 20,
  },
  headCoachesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  headCoachContainer: {
    alignItems: 'center',
  },
  headCoachPic: {
    width: 100,
    height: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffffff',
    marginBottom: 10,
    marginTop: 10,
  },
  headCoachText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  equipmentManagersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  equipmentManagerContainer: {
    alignItems: 'center',
  },
  equipmentManagerName: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  equipmentManagerPhone: {
    fontSize: 14,
    color: '#4287f5',
    textAlign: 'left',
    paddingTop: 2,
    textDecorationLine: 'underline',
  },
  refereeContainer: {
    alignItems: 'center',
    marginHorizontal: 30,
  },
  profileImageRef: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: '#ff6600',
    marginBottom: 10,
  },
  profileImageLines: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: '#ffffff',
    marginBottom: 10,
  },
  refereeText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  refereeId: {
    fontSize: 12,
    color: '#cccccc',
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  titles: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 5,
  },
  gameInfoContainer: {
    alignItems: 'center',
    marginBottom: 5,
  },
  floatingButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    top: 5,
    left: 10,
    right: 10,
  },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 10,
    padding: 10,
  },
  iconContainer: {
    backgroundColor: '#ff6600',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  buttonText: {
    color: '#000000',
    fontSize: 12,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 11,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  teamAbbrev: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  groupChat: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6600',
    textAlign: 'center',
    marginBottom: 10,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#ff6600',
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#000',
    marginBottom: 10,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    position: 'relative',
  },
  tabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '400',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  tabContent: {
    padding: 20,
  },
  contentText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  teamContentContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  leftColumn: {
    flex: 0.8,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#333',
    paddingRight: 15,
  },
  rightColumn: {
    flex: 1,
    paddingLeft: 15,
    justifyContent: 'center',
  },
  subtitles: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 5,
  },
  subtitles2: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 5,
  },
  equipmentManagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginTop: 5, // Add space between name and icons
  },
  iconButton: {
    padding: 5,
  },
  staffText: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 2,
  },
  rightContentSection: {
    marginBottom: 20,
  },
  teamContentScrollView: {
    flex: 1,
    width: '100%',
  },
  rosterContainer: {
    marginTop: 20,
  },
  rosterTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerText: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  playerName: {
    color: '#ffffff',
    fontSize: 12,
    flex: 2,
  },
  playerStat: {
    color: '#ffffff',
    fontSize: 12,
    flex: 1,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 15,
    textAlign: 'center',
  },
  playerText: {
    color: '#ffffff',
    fontSize: 12,
    flex: 1,
    textAlign: 'center',
  },
  officialsText: {
    color: '#ffffff',
    fontSize: 12,
    flex: 1,
    textAlign: 'left',
  },
  notesSection: {
    marginTop: 15,
    marginBottom: 15,
  },
  notesContainer: {
    marginTop: 10,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  noteItem2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    textAlign: 'center',
  },
  bullet: {
    color: '#ff6600',  // Your app's accent color
    fontSize: 16,
    width: 20,
    lineHeight: 20,
  },
  noteText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 10,
  },
  arenaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    color: '#666666',
    marginHorizontal: 8,
    fontSize: 13,
    fontStyle: 'italic',
  },
  parkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});

export default GameDetails;