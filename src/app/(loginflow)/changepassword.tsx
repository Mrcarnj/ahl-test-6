import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { useRoster } from '@/src/providers/RosterProvider';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '@/src/lib/alert';
import { FORM_MAX_WIDTH } from '@/src/lib/platform';

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
 const { refreshRoster } = useRoster();
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
     console.log('🔄 Starting password update...');
     
     console.log('🔄 Calling supabase.auth.updateUser...');
     const { error: authError } = await supabase.auth.updateUser({
       password: newPassword
     });

     if (authError) {
       console.error('❌ Auth update error:', authError);
       throw authError;
     }
     console.log('✅ Auth password updated');
     
     // Small delay to let auth state settle
     console.log('🔄 Waiting for auth state to settle...');
     await new Promise(resolve => setTimeout(resolve, 1000));
     console.log('✅ Auth state settled');

     console.log('🔄 Updating roster database...');
     const { error: rosterError } = await supabase
       .from('roster')
       .update({ changedpassword: true })
       .eq('auth_id', user.id);

     if (rosterError) throw rosterError;
     console.log('✅ Roster updated');

     console.log('🔄 Refreshing roster...');
     
     // Add timeout to prevent hanging
     const rosterRefreshPromise = refreshRoster();
     const timeoutPromise = new Promise((_, reject) => 
       setTimeout(() => reject(new Error('Roster refresh timeout')), 5000)
     );
     
     try {
       await Promise.race([rosterRefreshPromise, timeoutPromise]);
       console.log('✅ Roster refreshed');
     } catch (error) {
       console.warn('⚠️ Roster refresh failed or timed out:', error);
       // Continue anyway - the password was updated successfully
     }

     setLoading(false); // Reset loading state
     
     Alert.alert('Success', 'Password updated successfully', [
       {
         text: 'OK',
         onPress: async () => {
           console.log('🔄 Redirecting to TOS...');
           // Small delay to ensure roster data is refreshed
           await new Promise(resolve => setTimeout(resolve, 500));
           router.replace('/(loginflow)/tos');
         }
       }
     ]);
   } catch (error) {
     console.error('❌ Password update error:', error);
     Alert.alert('Error', (error as Error).message);
     setLoading(false);
   }
 };

 return (
   <View style={styles.container}>
     <View style={styles.card}>
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
   </View>
 );
}

const styles = StyleSheet.create({
 container: {
   flex: 1,
   padding: 20,
   justifyContent: 'center',
   alignItems: 'center',
   backgroundColor: '#000',
 },
 // Centred form column. Below FORM_MAX_WIDTH this is full-bleed, so phones
 // look exactly as before; it only stops the form stretching on a wide screen.
 card: {
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