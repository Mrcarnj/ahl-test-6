import React, { useState } from 'react'
import { StyleSheet, View, TextInput, TouchableOpacity, Text } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import KeyboardSafeScrollView from '@/src/components/KeyboardSafeScrollView'
import { Alert } from '@/src/lib/alert'
import { supabase } from '@/src/lib/supabase'
import { FORM_MAX_WIDTH } from '@/src/lib/platform'
import { useAuth } from '@/src/providers/AuthProvider'

// Forgot password, in two steps on one screen:
//   1. email -> checked against auth.users (email_has_account RPC), then
//      Supabase emails a one-time code (the "Reset Password" template must
//      include {{ .Token }}; see "Password reset" in CLAUDE.md)
//   2. code + new password -> verifyOtp signs in, updateUser sets the password
//
// A code instead of a link means no deep link to set up, and it works the
// same on iOS, Android and web. Verifying the code creates a session, so
// recoveringPassword holds the root layout on (auth) until the new password
// is saved; if saving fails the user is signed out again, never left signed
// in with a password they don't know.

const validateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 255

// Same rules as the change-password screen.
const passwordProblem = (password: string): string | null => {
  if (password.length < 6) return 'Password must be at least 6 characters.'
  if (password.length > 64) return 'Password must be 64 characters or fewer.'
  if (/[<>{}()'"`;]/.test(password)) return 'Password contains characters that are not allowed.'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.'
  if (!/\d/.test(password)) return 'Password must contain a number.'
  if (/^(.)\1+$/.test(password)) return 'Password cannot be one repeated character.'
  return null
}

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>()
  const { setRecoveringPassword } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const cleanEmail = email.trim().toLowerCase()

  async function sendCode() {
    if (!validateEmail(cleanEmail)) {
      Alert.alert('Please enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      // Catch a wrong address here, before a code is "sent" to it. Supabase
      // itself answers success for unknown emails and sends nothing, which
      // left officials waiting for an email that never came. If the check
      // itself fails, carry on and send.
      const { data: hasAccount, error: checkError } = await supabase.rpc('email_has_account', { p_email: cleanEmail })
      if (!checkError && hasAccount === false) {
        Alert.alert(
          'Account not found',
          'This email is not associated with an account. Please try your default HorizonWebRef email.'
        )
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail)
      if (error) {
        Alert.alert(
          error.status === 429 ? 'Too many requests' : 'Could not send the code',
          error.status === 429 ? 'Please wait a few minutes and try again.' : error.message
        )
        return
      }
      setStep('code')
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword() {
    const token = code.replace(/\s/g, '')
    if (!/^\d{6,10}$/.test(token)) {
      Alert.alert('Enter the code from the email.')
      return
    }
    const problem = passwordProblem(newPassword)
    if (problem) {
      Alert.alert(problem)
      return
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match.')
      return
    }

    setLoading(true)
    setRecoveringPassword(true)
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token,
        type: 'recovery',
      })
      if (verifyError || !data.user) {
        setRecoveringPassword(false)
        Alert.alert('That code is incorrect or has expired.', 'Check the email, or go back and send a new code.')
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        await supabase.auth.signOut()
        setRecoveringPassword(false)
        Alert.alert('Could not set the new password', updateError.message)
        return
      }

      // They chose this password themselves, so skip the first-login
      // change-password step. Best effort: the reset already worked.
      await supabase.from('roster').update({ changedpassword: true }).eq('auth_id', data.user.id)

      setRecoveringPassword(false)
      Alert.alert('Password updated', 'You are now signed in.')
      // index routes to TOS / iCal setup / home as needed.
      router.replace('/')
    } catch (error) {
      await supabase.auth.signOut()
      setRecoveringPassword(false)
      Alert.alert('Error', error instanceof Error ? error.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardSafeScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>Reset Password</Text>

        {step === 'email' ? (
          <>
            <Text style={styles.subtitle}>
              Enter your account email and we&apos;ll send you a code to reset your password.
            </Text>
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
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
            <TouchableOpacity
              disabled={loading}
              onPress={sendCode}
              style={[styles.button, loading && styles.buttonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Code'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              We sent a code to {cleanEmail}. Enter it below with your new password. The password needs 6+ characters, an uppercase letter and a number.
            </Text>
            <TextInput
              style={styles.inputField}
              onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
              value={code}
              maxLength={10}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholderTextColor={'#666'}
              placeholder="Code"
              accessibilityLabel="Code from email"
            />
            <TextInput
              style={styles.inputField}
              onChangeText={(text) => setNewPassword(text.trim())}
              value={newPassword}
              secureTextEntry
              maxLength={64}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholderTextColor={'#666'}
              placeholder="New Password"
              accessibilityLabel="New password"
              autoCapitalize={'none'}
            />
            <TextInput
              style={styles.inputField}
              onChangeText={(text) => setConfirmPassword(text.trim())}
              value={confirmPassword}
              secureTextEntry
              maxLength={64}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholderTextColor={'#666'}
              placeholder="Confirm New Password"
              accessibilityLabel="Confirm new password"
              autoCapitalize={'none'}
              returnKeyType="done"
              onSubmitEditing={resetPassword}
            />
            <TouchableOpacity
              disabled={loading}
              onPress={resetPassword}
              style={[styles.button, loading && styles.buttonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              <Text style={styles.buttonText}>{loading ? 'Updating...' : 'Set New Password'}</Text>
            </TouchableOpacity>
            <Text
              style={styles.link}
              accessibilityRole="button"
              onPress={() => { if (!loading) { setCode(''); setStep('email') } }}
            >
              Didn&apos;t get it? Send a new code
            </Text>
          </>
        )}

        <Text
          style={styles.link}
          accessibilityRole="button"
          onPress={() => { if (!loading) router.replace('/(auth)/login') }}
        >
          Back to Sign In
        </Text>
      </View>
    </KeyboardSafeScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 8,
  },
  formContainer: {
    width: '100%',
    maxWidth: FORM_MAX_WIDTH,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#fff',
  },
  subtitle: {
    fontSize: 15,
    color: '#999',
    marginBottom: 20,
    textAlign: 'center',
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 8,
    marginTop: 16,
  },
});
