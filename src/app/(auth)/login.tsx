import React, { useState } from 'react'
import { Alert, StyleSheet, View, AppState, TextInput, Button, TouchableOpacity, Text, Image } from 'react-native'
import { supabase } from '../../lib/supabase'
import { Redirect, router } from 'expo-router'
import { useAuth } from '@/src/providers/AuthProvider'
import { useRoster } from '@/src/providers/RosterProvider'

// Tells Supabase Auth to continuously refresh the session automatically if
// the app is in the foreground. When this is added, you will continue to receive
// `onAuthStateChange` events with the `TOKEN_REFRESHED` or `SIGNED_OUT` event
// if the user's session is terminated. This should only be registered once.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { session, user } = useAuth();
  const { roster } = useRoster();

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length < 255;
  };

  const validatePassword = (password: string): boolean => {
    // Ensure password meets minimum requirements and has no illegal chars
    return /^[a-zA-Z0-9!@#$%^&*(),.?":{}|<>]{6,64}$/.test(password);
  };

  async function signInWithEmail() {
    setLoading(true);
    try {
      // Validate inputs before sending
      if (!validateEmail(email)) {
        Alert.alert('Invalid email format');
        return;
      }

      if (!validatePassword(password)) {
        Alert.alert('Invalid password format');
        return;
      }

      const sanitizedEmail = email.trim().toLowerCase();

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password: password,
      });

      if (error) {
        Alert.alert(error.message);
        return;
      }

      // Use the ID from the sign in response instead of the context
      const { data: rosterData, error: rosterError } = await supabase
        .from('roster')
        .select('changedpassword, accepted_tos, ical_url')
        .eq('auth_id', authData.user.id)  // Use authData.user.id here
        .single();

      if (rosterError) {
        throw rosterError;
      }

      // Handle the routing based on user status
      if (!rosterData.changedpassword) {
        router.replace('/(auth)/changepassword');
      } else if (!rosterData.accepted_tos) {
        router.replace('/(auth)/tos');
      } else if (!rosterData.ical_url) {
        router.replace('/(auth)/ical-setup');
      } else {
        router.replace('/(protected)/(tabs)/home');
      }

    } catch (error) {
      console.log('Error details:', error); // Add this for debugging
      if (error instanceof Error) {
        Alert.alert('Error', error.message || 'An unknown error occurred');
      } else {
        Alert.alert('Error', 'An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={require('../../../assets/images/icon.png')}
          style={styles.logo}
        />
      </View>
      <View style={styles.formContainer}>
        <TextInput
          style={styles.inputField}
          onChangeText={(text) => setEmail(text.trim())}
          value={email}
          maxLength={255}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholderTextColor={'#666'}
          placeholder="email@address.com"
          autoCapitalize={'none'}
          returnKeyType="done"              // Add this
          blurOnSubmit={true}              // Add this
          enablesReturnKeyAutomatically     // Add this
        />
        <TextInput
          style={styles.inputField}
          onChangeText={(text) => setPassword(text.trim())}
          value={password}
          secureTextEntry={true}
          maxLength={64}
          autoComplete="password"
          textContentType="password"
          placeholderTextColor={'#666'}
          placeholder="Password"
          autoCapitalize={'none'}
          returnKeyType="done"              // Add this
          blurOnSubmit={true}              // Add this
          enablesReturnKeyAutomatically     // Add this
        />

        <TouchableOpacity
          disabled={loading}
          onPress={() => signInWithEmail()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 8,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 40,  // This adds space between the image and login form
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 25,
  },
  formContainer: {
    width: '100%',
  },
  inputField: {
    marginVertical: 4,
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 4,
    borderColor: '#ccc',
    borderWidth: 1,
    height: 50,
  },
  button: {
    backgroundColor: '#ff6600',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});