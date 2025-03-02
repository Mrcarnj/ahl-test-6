import React, { useState, useEffect } from 'react';
import { Alert, StyleSheet, View, TextInput, TouchableOpacity, Text } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { useRoster } from '@/src/providers/RosterProvider';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';

const validatePassword = (password: string): boolean => {
 // Check for common attack patterns and invalid characters
 const invalidPatterns = /[<>{}()'"`;]/g;
 if (invalidPatterns.test(password)) {
   return false;
 }
 
 // Add maximum length check
 if (password.length > 64) {
   return false;
 }
 
 return true;
};

export default function ChangePassword() {
 const [newPassword, setNewPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [loading, setLoading] = useState(false);
 const { user } = useAuth();
 const { roster, refreshRoster } = useRoster();
 const router = useRouter();

 const [validations, setValidations] = useState({
   length: false,
   uppercase: false,
   number: false,
   notRepeating: false,
   matching: false,
 });

 useEffect(() => {
   if (validatePassword(newPassword)) {
     setValidations({
       length: newPassword.length >= 6,
       uppercase: /[A-Z]/.test(newPassword),
       number: /\d/.test(newPassword),
       notRepeating: !/^(.)\1+$/.test(newPassword),
       matching: newPassword === confirmPassword && newPassword !== '',
     });
   }
 }, [newPassword, confirmPassword]);

 const allValidationsPassed = Object.values(validations).every(v => v);

 const ValidationItem = ({ passed, text }: { passed: boolean; text: string }) => (
   <View style={styles.validationItem}>
     {passed ? (
       <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
     ) : (
       <Feather name="x-circle" size={20} color="#FF3B30" />
     )}
     <Text style={[styles.validationText, passed && styles.validationPassed]}>
       {text}
     </Text>
   </View>
 );

 const handleNewPassword = (text: string) => {
   const sanitizedText = text.trim();
   if (validatePassword(sanitizedText)) {
     setNewPassword(sanitizedText);
   }
 };

 const handleConfirmPassword = (text: string) => {
   const sanitizedText = text.trim();
   if (validatePassword(sanitizedText)) {
     setConfirmPassword(sanitizedText);
   }
 };

 const handleChangePassword = async () => {
   if (!user || !allValidationsPassed || !validatePassword(newPassword)) return;

   setLoading(true);
   try {
     // First update the auth password
     const { error: authError } = await supabase.auth.updateUser({
       password: newPassword
     });

     if (authError) throw authError;

     // Then update the roster table
     const { error: rosterError } = await supabase
       .from('roster')
       .update({ changedpassword: true })
       .eq('auth_id', user.id);

     if (rosterError) {
       // If roster update fails, we should handle this case
       console.error('Failed to update roster:', rosterError);
       throw new Error('Failed to complete password change process. Please try again.');
     }

     // Only refresh roster and redirect if both operations succeed
     await refreshRoster();
     Alert.alert('Success', 'Password updated successfully');
     router.replace('/(protected)/home');
   } catch (error) {
     console.error('Password change error:', error);
     Alert.alert('Error', error instanceof Error ? error.message : 'An unknown error occurred');
     setLoading(false); // Reset loading state on error
   }
 };

 return (
   <View style={styles.container}>
     <Text style={styles.title}>Change Password</Text>
     <Text style={styles.subtitle}>Please set a new password for your account</Text>
     
     <TextInput
       style={styles.input}
       value={newPassword}
       onChangeText={handleNewPassword}
       placeholder="New Password"
       placeholderTextColor="#666"
       secureTextEntry
       autoCapitalize="none"
       maxLength={64}
       returnKeyType="done"
       blurOnSubmit={true}
       enablesReturnKeyAutomatically
     />
     
     <TextInput
       style={styles.input}
       value={confirmPassword}
       onChangeText={handleConfirmPassword}
       placeholder="Confirm New Password"
       placeholderTextColor="#666"
       secureTextEntry
       autoCapitalize="none"
       maxLength={64}
       returnKeyType="done"
       blurOnSubmit={true}
       enablesReturnKeyAutomatically
     />

     <View style={styles.validationContainer}>
       <ValidationItem 
         passed={validations.length} 
         text="At least 6 characters long" 
       />
       <ValidationItem 
         passed={validations.uppercase} 
         text="Contains uppercase letter" 
       />
       <ValidationItem 
         passed={validations.number} 
         text="Contains number" 
       />
       <ValidationItem 
         passed={validations.matching} 
         text="Passwords match" 
       />
     </View>

     <TouchableOpacity
       style={[
         styles.button, 
         (!allValidationsPassed || loading) && styles.buttonDisabled
       ]}
       onPress={handleChangePassword}
       disabled={!allValidationsPassed || loading}
     >
       <Text style={styles.buttonText}>
         {loading ? 'Updating...' : 'Update Password'}
       </Text>
     </TouchableOpacity>
   </View>
 );
}

const styles = StyleSheet.create({
 container: {
   flex: 1,
   padding: 20,
   justifyContent: 'center',
   backgroundColor: '#000',
 },
 title: {
   fontSize: 24,
   fontWeight: 'bold',
   marginBottom: 10,
   textAlign: 'center',
   color: '#fff',
 },
 subtitle: {
   fontSize: 16,
   color: '#666',
   marginBottom: 30,
   textAlign: 'center',
 },
 input: {
   backgroundColor: '#f9f9f9',
   padding: 15,
   borderRadius: 8,
   marginBottom: 15,
   borderWidth: 1,
   borderColor: '#ddd',
 },
 validationContainer: {
   marginBottom: 20,
   padding: 10,
 },
 validationItem: {
   flexDirection: 'row',
   alignItems: 'center',
   marginBottom: 10,
 },
 validationText: {
   marginLeft: 10,
   color: '#FF3B30',
   fontSize: 14,
 },
 validationPassed: {
   color: '#4CAF50',
 },
 button: {
   backgroundColor: '#ff6600',
   padding: 15,
   borderRadius: 8,
   alignItems: 'center',
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