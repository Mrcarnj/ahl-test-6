import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatGameDate, formatGameDateTime, useSchedule, formatGameTime } from '@/src/providers/ScheduleProvider';

const gameId = () => {
    const { gameId } = useLocalSearchParams<{ gameId: string }>();
    const { allGames, myGames } = useSchedule();
    
    const game = myGames.find(g => g.gameid === gameId);

    if (!game) {
        return <Text>Game not found</Text>;
    }

    return (
        <View>
            {/* Your game details UI */}
            <Text>Game Details for Game #{gameId}</Text>
            <Text>{formatGameDate(game.gamedate)}</Text>
            <Text>{formatGameTime(game.gametime, game.gamedate)}</Text>
            <Text>{game.awayteam} @ {game.hometeam}</Text>
            <Text>{game.homeTeamData?.arenaname}</Text>
            <Text>Referees: {game.referee1} // {game.referee2}</Text>
            <Text>Linespersons: {game.linesperson1} // {game.linesperson2}</Text>
        </View>
    );
}

export default gameId;