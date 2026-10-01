// app/(protected)/arena/[teamId].tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import ArenaMap from '@/src/components/ArenaMap';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

interface ArenaDetails {
  arenaname: string;
  parking_latitude: number;
  parking_longitude: number;
  parking_instructions: string;
  locker_room_instructions: string;
}

export default function ArenaDetailsScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const [arenaDetails, setArenaDetails] = useState<ArenaDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArenaDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('teams')
          .select('arenaname, parking_latitude, parking_longitude, parking_instructions, locker_room_instructions')
          .eq('id', teamId)
          .single();

        if (error) throw error;
        setArenaDetails(data);
      } catch (error) {
        console.error('Error fetching arena details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchArenaDetails();
  }, [teamId]);

  const handleDirectionsPress = () => {
    if (!arenaDetails) return;

    const { parking_latitude, parking_longitude } = arenaDetails;
    const url = Platform.select({
      ios: `maps:?ll=${parking_latitude},${parking_longitude}&q=Parking`,
      android: `geo:${parking_latitude},${parking_longitude}?q=Parking`,
      // Browsers have no map scheme; hand off to Google Maps directions.
      web: `https://www.google.com/maps/dir/?api=1&destination=${parking_latitude},${parking_longitude}`,
    });

    if (url) {
      Linking.openURL(url);
    }
  };

  if (loading || !arenaDetails) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading arena details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>{arenaDetails.arenaname}</Text>
        
        <View style={styles.mapContainer}>
          <ArenaMap
            latitude={arenaDetails.parking_latitude}
            longitude={arenaDetails.parking_longitude}
          />
          
          <TouchableOpacity 
            style={styles.directionsButton}
            onPress={handleDirectionsPress}
          >
            <FontAwesome5 name="directions" size={20} color="#000" />
            <Text style={styles.directionsText}>Get Directions</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.instructionsContainer}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <FontAwesome5 name="parking" size={20} color="#ff6600" /> Parking Instructions
            </Text>
            <Text style={styles.instructionsText}>
              {arenaDetails.parking_instructions}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <FontAwesome5 name="door-open" size={20} color="#ff6600" /> Locker Room Access
            </Text>
            <Text style={styles.instructionsText}>
              {arenaDetails.locker_room_instructions}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    padding: 15,
  },
  mapContainer: {
    height: 300,
    margin: 15,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  directionsButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#ff6600',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  directionsText: {
    color: '#000',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  instructionsContainer: {
    padding: 15,
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
  },
});