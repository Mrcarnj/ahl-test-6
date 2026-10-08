import React, { useRef, useState } from 'react'
import { StyleSheet, View, AppState, TextInput, TouchableOpacity, Text, Image, Linking } from 'react-native';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/src/lib/legal';
import { Alert } from '@/src/lib/alert';
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { FORM_MAX_WIDTH } from '@/src/lib/platform'
import { fetchMyIcalUrl } from '@/src/lib/rosterColumns'

// Client-side backoff after repeated failures. The real limits are server-side
// (Supabase Auth's per-IP rate limits); this just stops a person or script
// on this page from hammering the button.
const FREE_ATTEMPTS = 3;
const lockoutMs = (failures: number) =>
  failures < FREE_ATTEMPTS ? 0 : Math.min(2 ** (failures - FREE_ATTEMPTS) * 5000, 5 * 60 * 1000);

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
  const failures = useRef(0)
  const lockedUntil = useRef(0)
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length < 255;
  };

  const validatePassword = (password: string): boolean => {
    // Length only. A character whitelist here locked out officials whose
    // password (set on the change-password screen, which allows far more
    // characters) contains e.g. - _ + = or a space. Supabase checks the rest.
    return password.length >= 6 && password.length <= 64;
  };

  async function signInWithEmail() {
    const waitMs = lockedUntil.current - Date.now();
    if (waitMs > 0) {
      Alert.alert('Too many attempts', `Please wait ${Math.ceil(waitMs / 1000)} seconds and try again.`);
      return;
    }

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
        failures.current += 1;
        lockedUntil.current = Date.now() + lockoutMs(failures.current);
        // Same message for unknown email and wrong password, so the form
        // can't be used to discover which emails have accounts.
        Alert.alert(
          error.status === 429 ? 'Too many attempts. Please wait a few minutes.' : 'Incorrect email or password.'
        );
        return;
      }
      failures.current = 0;

      // Use the ID from the sign in response instead of the context
      const { data: rosterData, error: rosterError } = await supabase
        .from('roster')
        .select('changedpassword, accepted_tos, "ahlAdmin"')
        .eq('auth_id', authData.user.id)  // Use authData.user.id here
        .single();

      if (rosterError) {
        throw rosterError;
      }
      // An ahlAdmin sees every game straight from the DB and has no iCal feed.
      const needsIcal = !rosterData.ahlAdmin && !(rosterData.accepted_tos && await fetchMyIcalUrl());

      // Handle the routing based on user status
      if (!rosterData.changedpassword) {
        router.replace('/(loginflow)/changepassword');
      } else if (!rosterData.accepted_tos) {
        router.replace('/(loginflow)/tos');
      } else if (needsIcal) {
        router.replace('/(loginflow)/ical-setup');
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
          source={require('../../../assets/images/icon-256.png')}
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
          accessibilityLabel="Email"
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
          accessibilityLabel="Password"
          autoCapitalize={'none'}
          returnKeyType="done"              // Add this
          blurOnSubmit={true}              // Add this
          enablesReturnKeyAutomatically     // Add this
        />

        <TouchableOpacity
          disabled={loading}
          onPress={() => signInWithEmail()}
          style={[styles.button, loading && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>

        <View style={styles.legalLinks}>
          <Text style={styles.legalLink} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
            Privacy Policy
          </Text>
          <Text style={styles.legalDot}>·</Text>
          <Text style={styles.legalLink} accessibilityRole="link" onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
            Terms of Service
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    // Centres the form column; below FORM_MAX_WIDTH this is a no-op, so phones
    // are unaffected. The other (loginflow) screens already set #000 — this one
    // was missing it and fell through to the platform default, which is why the
    // web login rendered on light grey.
    alignItems: 'center',
    backgroundColor: '#000',
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
    maxWidth: FORM_MAX_WIDTH,
  },
  inputField: {
    color: '#000',
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
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  legalLink: {
    color: '#aaa',
    fontSize: 14,
    textDecorationLine: 'underline',
    paddingVertical: 8,
  },
  legalDot: {
    color: '#aaa',
    marginHorizontal: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});