import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { fetchAndParseHockeySchedule } from '../lib/icalHockeySync';

interface ParsedGame {
  uid: string;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  endTime: string;
  venue: string;
  gameCode: string;
  referees: string[];
  linespeople: string[];
  organizer: string;
}

export const HockeyTestViewer: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [parsedGames, setParsedGames] = useState<ParsedGame[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const handleTestParse = async () => {
    setIsLoading(true);
    setParsedGames([]);
    
    try {
      const result = await fetchAndParseHockeySchedule(true);
      
      if (result.success && result.testOutput) {
        setParsedGames(result.testOutput);
        Alert.alert(
          'Test Parse Complete',
          `Successfully parsed ${result.testOutput.length} games!\n\nTap "Show Details" to see the parsed data.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Test Parse Failed',
          `Error: ${result.error}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Test parse error:', error);
      Alert.alert(
        'Test Parse Error',
        'An unexpected error occurred during parsing.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    try {
      const date = new Date(timeString);
      return date.toLocaleString();
    } catch {
      return timeString;
    }
  };

  const renderGameDetails = (game: ParsedGame, index: number) => (
    <View key={game.uid} style={styles.gameCard}>
      <Text style={styles.gameTitle}>Game #{index + 1}</Text>
      <Text style={styles.gameId}>ID: {game.gameId}</Text>
      <Text style={styles.teams}>{game.awayTeam} @ {game.homeTeam}</Text>
      <Text style={styles.time}>Start: {formatTime(game.startTime)}</Text>
      <Text style={styles.time}>End: {formatTime(game.endTime)}</Text>
      <Text style={styles.venue}>Venue: {game.venue || 'N/A'}</Text>
      <Text style={styles.gameCode}>Code: {game.gameCode || 'N/A'}</Text>
      
      <Text style={styles.sectionTitle}>Referees:</Text>
      {game.referees.map((ref, idx) => (
        <Text key={idx} style={styles.official}>• {ref}</Text>
      ))}
      
      <Text style={styles.sectionTitle}>Linespeople:</Text>
      {game.linespeople.map((lines, idx) => (
        <Text key={idx} style={styles.official}>• {lines}</Text>
      ))}
      
      <Text style={styles.organizer}>Organizer: {game.organizer}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏒 Hockey Schedule Parser Test</Text>
      <Text style={styles.subtitle}>Test iCal parsing without uploading to database</Text>
      
      <TouchableOpacity
        style={[styles.testButton, isLoading && styles.testButtonDisabled]}
        onPress={handleTestParse}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.testButtonText}>
            Test Parse iCal Data
          </Text>
        )}
      </TouchableOpacity>

      {parsedGames.length > 0 && (
        <View style={styles.resultsContainer}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              Parsed {parsedGames.length} Games
            </Text>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowDetails(!showDetails)}
            >
              <Text style={styles.toggleButtonText}>
                {showDetails ? 'Hide Details' : 'Show Details'}
              </Text>
            </TouchableOpacity>
          </View>

          {showDetails && (
            <ScrollView style={styles.detailsContainer}>
              {parsedGames.map((game, index) => renderGameDetails(game, index))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 20,
  },
  testButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  testButtonDisabled: {
    backgroundColor: '#666',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  toggleButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  detailsContainer: {
    flex: 1,
  },
  gameCard: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6600',
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 4,
  },
  gameId: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 4,
  },
  teams: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: '#ccc',
    marginBottom: 2,
  },
  venue: {
    fontSize: 12,
    color: '#ccc',
    marginBottom: 2,
  },
  gameCode: {
    fontSize: 12,
    color: '#ccc',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff6600',
    marginTop: 4,
    marginBottom: 2,
  },
  official: {
    fontSize: 12,
    color: '#fff',
    marginLeft: 8,
    marginBottom: 1,
  },
  organizer: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
});

export default HockeyTestViewer;
