import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../providers/AuthProvider';
import { useRoster } from '../../providers/RosterProvider';
import { supabase } from '../../lib/supabase';
import { router } from 'expo-router';

export default function ICalSetup() {
  const { user } = useAuth();
  const { roster, refreshRoster } = useRoster();
  const [icalUrl, setIcalUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValidUrl, setIsValidUrl] = useState(false);

  useEffect(() => {
    console.log('🔍 iCal setup - Component mounted with data:', { 
      user: user?.id, 
      roster: roster?.auth_id, 
      icalUrl: roster?.ical_url 
    });
    
    // Set initial value if roster already has an ical_url
    if (roster?.ical_url) {
      setIcalUrl(roster.ical_url);
      validateUrl(roster.ical_url);
    }
  }, [roster?.ical_url, user?.id, roster?.auth_id]);

  const validateUrl = (url: string) => {
    const trimmedUrl = url.trim();
    const isValid = trimmedUrl.startsWith('https://www.horizonwebref.com/syncICS');
    setIsValidUrl(isValid);
    return isValid;
  };

  const handleUrlChange = (text: string) => {
    setIcalUrl(text);
    validateUrl(text);
  };

  const handleSave = async () => {
    console.log('🔍 iCal setup - User data:', { user: user?.id, roster: roster?.auth_id });
    
    if (!user) {
      console.error('❌ No user data available');
      Alert.alert('Error', 'Unable to save: No user data available');
      return;
    }

    const trimmedUrl = icalUrl.trim();
    
    if (!validateUrl(trimmedUrl)) {
      Alert.alert('Invalid URL', 'Please enter a valid iCal URL that starts with "https://www.horizonwebref.com/syncICS"');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('roster')
        .update({ ical_url: trimmedUrl })
        .eq('auth_id', user.id);

      if (error) {
        throw error;
      }

      // Refresh roster data to get updated values
      await refreshRoster();
      
      Alert.alert('Success', 'iCal URL saved successfully!', [
        {
          text: 'Continue',
          onPress: () => {
            // Navigate to home page
            router.replace('/(protected)/(tabs)/home');
          }
        }
      ]);
    } catch (error) {
      console.error('Error saving iCal URL:', error);
      Alert.alert('Error', 'Failed to save iCal URL. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>iCal Sync Setup</Text>
          <Text style={styles.subtitle}>
            To sync your schedule with your calendar, we need your iCal URL from Horizon Web Ref.
          </Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>iCal URL</Text>
          <TextInput
            style={[
              styles.textInput,
              icalUrl.trim() && !isValidUrl ? styles.textInputError : null
            ]}
            value={icalUrl}
            onChangeText={handleUrlChange}
            placeholder="https://www.horizonwebref.com/syncICS..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline={false}
          />
          {icalUrl.trim() && !isValidUrl && (
            <Text style={styles.errorText}>
              {`URL must start with "https://www.horizonwebref.com/syncICS"`}
            </Text>
          )}
        </View>

        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>How to get your iCal URL:</Text>
          <View style={styles.instructionsList}>
            <Text style={styles.instructionStep}>1. Open your Horizon Web Ref App</Text>
            <Text style={styles.instructionStep}>2. Log In</Text>
            <Text style={styles.instructionStep}>{`3. Navigate to "Schedule" from the homepage`}</Text>
            <Text style={styles.instructionStep}>4. Click iCal Sync URL at the top</Text>
            <Text style={styles.instructionStep}>5. Copy the generated link</Text>
            <Text style={styles.instructionStep}>6. Paste into field above</Text>
            <Text style={styles.instructionStep}>7. Click Save</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!isValidUrl || loading) && styles.saveButtonDisabled
          ]}
          onPress={handleSave}
          disabled={!isValidUrl || loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
  },
  formContainer: {
    marginBottom: 30,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: '#fff',
    minHeight: 50,
  },
  textInputError: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 5,
  },
  instructionsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 20,
    marginBottom: 30,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ff6600',
    marginBottom: 15,
  },
  instructionsList: {
    gap: 8,
  },
  instructionStep: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 22,
  },
  saveButton: {
    backgroundColor: '#ff6600',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonDisabled: {
    backgroundColor: '#666',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
});
