// app/(auth)/tos.tsx
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, BackHandler } from 'react-native';
import React, { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

export default function TermsOfService() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  // Handle hardware back button
  useEffect(() => {
    const backAction = () => {
      handleDecline();
      return true; // Prevents default back action
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  const handleDecline = () => {
    Alert.alert(
      "Decline Terms of Service",
      "If you decline the Terms of Service, you cannot use the app and will be signed out. Do you want to continue?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Decline and Sign Out",
          style: "destructive",
          onPress: handleSignOut
        }
      ]
    );
  };

  const handleAcceptTOS = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('roster')
        .update({
          accepted_tos: true,
          tos_accepted_at: new Date().toISOString()
        })
        .eq('auth_id', user.id);

      if (error) throw error;

      router.replace('/(protected)/home');
    } catch (error) {
      Alert.alert('Error', 'Failed to accept terms of service. Please try again.');
      console.error('TOS acceptance error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="gavel" size={40} color="#ff6600" />
        <Text style={styles.title}>Terms of Service</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <Text style={styles.text}>
          Welcome to the AHL Officials App. Before you continue, please read and accept our Terms of Service.
        </Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.text}>
          By accessing and using this app, you agree to be bound by these Terms of Service.
        </Text>

        <Text style={styles.sectionTitle}>2. Confidentiality</Text>
        <Text style={styles.text}>
          You acknowledge that this app contains confidential information. You agree not to share any information, 
          including but not limited to game assignments, official information, and internal communications.
        </Text>

        {/* Add more sections as needed */}
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton, loading && styles.buttonDisabled]}
          onPress={handleAcceptTOS}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Accepting...' : 'I Accept'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={handleDecline}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6600',
    marginTop: 20,
    marginBottom: 10,
  },
  text: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
    marginBottom: 15,
  },
  buttonContainer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 10,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#ff6600',
  },
  declineButton: {
    backgroundColor: '#333',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});