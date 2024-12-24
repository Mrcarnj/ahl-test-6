// app/(protected)/game/[id].tsx
import { View, Text, Linking, Alert, Platform, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatGameDate, formatGameDateTime, useSchedule, formatGameTime, Schedule, getTeamLogo, getTeamCoach, formatGameDate2 } from '@/src/providers/ScheduleProvider';
import { getOfficialPhoto, useRoster } from '@/src/providers/RosterProvider';
import { format } from 'date-fns';
import { AntDesign, FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';



const GameDetails = () => {
  const { id, source } = useLocalSearchParams<{ id: string; source: string }>();
  const { allGames, myGames } = useSchedule();
  const { allRosters } = useRoster();

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

  const handlePhonePress = (phone: any) => {
    Alert.alert(
      "Contact Equipment Manager",
      "Choose an action",
      [
        {
          text: "Call",
          onPress: () => Linking.openURL(`tel:${phone}`)
        },
        {
          text: "Message",
          onPress: () => Linking.openURL(`sms:${phone}?body=`)
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.card}>
      <Text style={styles.gameDate}>
    {formatGameDate2(game.gamedate)}
</Text>
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
          <TouchableOpacity onPress={() => handleArenaPress(game)}>
            <Text style={styles.arena}>
              {game.homeTeamData?.arenaname || 'Arena not specified'}
            </Text>
          </TouchableOpacity>
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
      <View style={styles.separator} />

      <Text style={styles.titles}>Officials Crew</Text>
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
                style={styles.profileImageLines}
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
                style={styles.profileImageLines}
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

      <Text style={styles.titles}>Head Coaches</Text>
      <View style={styles.headCoachesRow}>
        <View style={styles.headCoachContainer}>
          <Image
            source={{ uri: getTeamCoach(game.awayTeamData) || 'https://via.placeholder.com/150' }}
            style={styles.headCoachPic}
          />
          <Text style={styles.headCoachText}>
            {game.awayTeamData?.headcoachname || 'N/A'}
          </Text>
        </View>
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

      <Text style={styles.titles}>Equipment Managers</Text>
      <View style={styles.equipmentManagersRow}>
        <View style={styles.equipmentManagerContainer}>
          <Text style={styles.equipmentManagerName}>
            {game.awayTeamData?.eqname || 'N/A'}
          </Text>
          <TouchableOpacity
            onPress={() => game.awayTeamData?.eqphone && handlePhonePress(game.awayTeamData.eqphone)}
          >
            <Text style={styles.equipmentManagerPhone}>
              {game.awayTeamData?.eqphone || 'N/A'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.equipmentManagerContainer}>
          <Text style={styles.equipmentManagerName}>
            {game.homeTeamData?.eqname || 'N/A'}
          </Text>
          <TouchableOpacity
            onPress={() => game.homeTeamData?.eqphone && handlePhonePress(game.homeTeamData.eqphone)}
          >
            <Text style={styles.equipmentManagerPhone}>
              {game.homeTeamData?.eqphone || 'N/A'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.separator} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    padding: 20,
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
    justifyContent: 'space-around',
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
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  refereeContainer: {
    alignItems: 'center',
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
});

export default GameDetails;