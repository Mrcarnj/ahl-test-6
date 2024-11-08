import { View, Text, Linking, Alert, Platform, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatGameDate, formatGameDateTime, useSchedule, formatGameTime, Schedule } from '@/src/providers/ScheduleProvider';
import { useRoster } from '@/src/providers/RosterProvider';
import { format } from 'date-fns';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';

const gameId = () => {
    const { gameId } = useLocalSearchParams<{ gameId: string }>();
    const { allGames, myGames } = useSchedule();
    const { allRosters } = useRoster();
    
    const game = myGames.find(g => g.gameid === gameId);

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
                    {format(new Date(game.gamedate), 'MM/dd/yyyy')}
                </Text>
                <Text style={styles.gameID}>Game# {game.gameid}</Text>
                <View style={styles.teamsContainer}>
                    <Text style={styles.teamAbbrev}>{game.awayTeamData?.abbreviation}</Text>
                    <Text style={styles.atSymbol}>@</Text>
                    <Text style={styles.teamAbbrev}>{game.homeTeamData?.abbreviation}</Text>
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
                    <Image
                        source={{ uri: 'https://via.placeholder.com/150' }}
                        style={styles.profileImageRef}
                    />
                    <Text style={styles.refereeText}>{getOfficialName(game.referee1)}</Text>
                </View>
                <View style={styles.refereeContainer}>
                    <Image
                        source={{ uri: 'https://via.placeholder.com/150' }}
                        style={styles.profileImageRef}
                    />
                    <Text style={styles.refereeText}>{getOfficialName(game.referee2)}</Text>
                </View>
            </View>
            
            <View style={styles.refereesRow}>
                <View style={styles.refereeContainer}>
                    <Image
                        source={{ uri: 'https://via.placeholder.com/150' }}
                        style={styles.profileImageLines}
                    />
                    <Text style={styles.refereeText}>{getOfficialName(game.linesperson1)}</Text>
                </View>
                <View style={styles.refereeContainer}>
                    <Image
                        source={{ uri: 'https://via.placeholder.com/150' }}
                        style={styles.profileImageLines}
                    />
                    <Text style={styles.refereeText}>{getOfficialName(game.linesperson2)}</Text>
                </View>
            </View>

            <View style={styles.separator} />
            
            <Text style={styles.titles}>Head Coaches</Text>
            <View style={styles.headCoachesRow}>
                <View style={styles.headCoachContainer}>
                    <Image
                        source={{ uri: game.awayTeamData?.headcoachpic || 'https://via.placeholder.com/150' }}
                        style={styles.headCoachPic}
                    />
                    <Text style={styles.headCoachText}>
                        {game.awayTeamData?.headcoachname || 'N/A'}
                    </Text>
                </View>
                <View style={styles.headCoachContainer}>
                    <Image
                        source={{ uri: game.homeTeamData?.headcoachpic || 'https://via.placeholder.com/150' }}
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
      top: 10,
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
  });

export default gameId;