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

  async function signInWithEmail() {
    setLoading(true)
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (error) {
        Alert.alert(error.message);
        return;
      }

      // Use the ID from the sign in response instead of the context
      const { data: rosterData, error: rosterError } = await supabase
        .from('roster')
        .select('changedpassword')
        .eq('auth_id', authData.user.id)  // Use authData.user.id here
        .single();

      if (rosterError) {
        throw rosterError;
      }

      // Redirect based on changedpassword status
      if (!rosterData.changedpassword) {
        router.replace('/(auth)/changepassword');
      } else {
        router.replace('/(protected)/home');
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
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholderTextColor={'#666'}
          placeholder="email@address.com"
          autoCapitalize={'none'}
        />
        <TextInput 
          style={styles.inputField}
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry={true}
          placeholderTextColor={'#666'}
          placeholder="Password"
          autoCapitalize={'none'}
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