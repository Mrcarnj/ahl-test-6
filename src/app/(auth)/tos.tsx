// app/(auth)/tos.tsx
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, BackHandler, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import { router, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { useRoster } from '@/src/providers/RosterProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

export default function TermsOfService() {
  const { user } = useAuth();
  const { refreshRoster } = useRoster();
  const [hasReachedBottom, setHasReachedBottom] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const router = useRouter();

  // Handle hardware back button
  useEffect(() => {
    const backAction = () => {
      handleDecline();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20; // Adjust this value as needed
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom;

    if (isCloseToBottom && !hasReachedBottom) {
      setHasReachedBottom(true);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  const handleDecline = () => {
    Alert.alert(
      "Decline Terms of Service",
      "If you decline the Terms of Service, you will be signed out and cannot use the app. Do you want to continue?",
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
    if (!user || !hasReachedBottom) return;

    setLoading(true);
    console.log('📝 Starting TOS acceptance process...');
    
    try {
      // Update the roster table
      console.log('📝 Updating roster with TOS acceptance...');
      const { data, error } = await supabase
        .from('roster')
        .update({
          accepted_tos: true,
          tos_accepted_at: new Date().toISOString()
        })
        .eq('auth_id', user.id)
        .select();

      if (error) {
        console.error('❌ TOS acceptance update failed:', error);
        throw error;
      }

      console.log('✅ TOS acceptance updated successfully:', data);

      // Force refresh roster data
      console.log('🔄 Forcing roster refresh...');
      try {
        await refreshRoster();
        console.log('✅ Roster refresh complete');
      } catch (refreshError) {
        console.error('❌ Roster refresh failed:', refreshError);
        // Continue even if refresh fails
      }
      
      // Verify the update was successful and check for iCal URL
      console.log('🔍 Verifying TOS update...');
      try {
        const { data: verifyData, error: verifyError } = await supabase
          .from('roster')
          .select('accepted_tos, tos_accepted_at, ical_url')
          .eq('auth_id', user.id)
          .single();
        
        if (verifyError) {
          console.error('❌ Verification failed:', verifyError);
        } else {
          console.log('✅ Verification result:', verifyData);
          
          // Reset loading state before navigation
          setLoading(false);
          
          // Navigate based on iCal URL status
          console.log('🔄 Checking iCal URL status...');
          setTimeout(() => {
            if (!verifyData.ical_url) {
              console.log('🔄 Navigating to iCal setup...');
              router.replace('/(auth)/ical-setup');
            } else {
              console.log('🔄 Navigating to home page...');
              router.replace('/(protected)/home');
            }
          }, 500);
        }
      } catch (verifyError) {
        console.error('❌ Verification error:', verifyError);
        // Continue even if verification fails
        setLoading(false);
        setTimeout(() => {
          router.replace('/(protected)/home');
        }, 500);
      }
      
      console.log('✅ TOS acceptance process complete');
    } catch (error) {
      console.error('❌ TOS acceptance error:', error);
      Alert.alert('Error', 'Failed to accept terms of service. Please try again.');
    } finally {
      // Ensure loading state is always reset
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="gavel" size={40} color="#ff6600" />
        <Text style={styles.title}>Terms of Service</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={400}
      >
        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.text}>
          By accessing or using AHL Officials App ("the App"), you agree to comply with and be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the App.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.text}>
          The App is a tool designed to provide users with information about upcoming hockey games in the American Hockey League (AHL) and official scheduling details. The App aggregates this information from external sources, including but not limited to:
        </Text>
        <Text style={styles.bullet}>• The official AHL website for game information.</Text>
        <Text style={styles.bullet}>• Horizon Web Ref for official scheduling data.</Text>

        <Text style={styles.sectionTitle}>3. External Data Disclaimer</Text>
        <Text style={styles.subTitle}>3.1 Source of Truth</Text>
        <Text style={styles.text}>
          All information displayed on the App is pulled from external sources. The App is not the source of truth for any game or scheduling information. Users should refer to the following official sources for accurate and up-to-date information:
        </Text>
        <Text style={styles.bullet}>• The official AHL website for all game-related information.</Text>
        <Text style={styles.bullet}>• Horizon Web Ref for official scheduling data.</Text>

        <Text style={styles.subTitle}>3.2 No Liability for Errors or Inaccuracies</Text>
        <Text style={styles.text}>
          The App makes reasonable efforts to present accurate information as retrieved from external sources, but it does not guarantee the accuracy, completeness, or timeliness of any data displayed. The App is not liable for any errors, omissions, or inaccuracies in the data or for any decisions made based on the data.
        </Text>

        <Text style={styles.subTitle}>3.3 Data Currency Responsibility</Text>
        <Text style={styles.text}>
          The data presented on the App may not always be up to date. It is the user's responsibility to verify how current the data is by cross-referencing it with the official sources mentioned above. Reliance on the App for time-sensitive or critical information is done at the user's own risk.
        </Text>

        <Text style={styles.sectionTitle}>4. User Responsibilities</Text>
        <Text style={styles.text}>
          It is the user's responsibility to verify any information displayed on the App with the official sources mentioned above. The App is intended to be a supplementary tool, and reliance on its data is at the user's own risk.
        </Text>

        <Text style={styles.sectionTitle}>5. Intellectual Property</Text>
        <Text style={styles.text}>
          All intellectual property rights in the App and its content, except for the data aggregated from external sources, are owned by Mike Dietrich. Unauthorized use of the App's intellectual property is prohibited.
        </Text>

        <Text style={styles.sectionTitle}>6. Limitation of Liability</Text>
        <Text style={styles.text}>
          To the fullest extent permitted by law:
        </Text>
        <Text style={styles.bullet}>• Mike Dietrich and its affiliates, employees, and agents are not liable for any direct, indirect, incidental, special, or consequential damages arising from the use of the App or reliance on its content.</Text>
        <Text style={styles.bullet}>• The App disclaims all liability for decisions or actions taken by users based on the information provided through the App.</Text>
        <Text style={styles.bullet}>• Mike Dietrich is not responsible for any discrepancies between the information displayed on the App and the information on the official sources.</Text>

        <Text style={styles.sectionTitle}>7. No Endorsement</Text>
        <Text style={styles.text}>
          The App is not affiliated with, endorsed by, or sponsored by the American Hockey League or Horizon Web Ref. Any trademarks or copyrighted materials mentioned in the App belong to their respective owners.
        </Text>

        <Text style={styles.sectionTitle}>8. Updates to the App</Text>
        <Text style={styles.text}>
          The App is provided "as is" and may be updated or modified at any time without notice. Dan Flynn is not obligated to maintain or support the App.
        </Text>

        <Text style={styles.sectionTitle}>9. Termination</Text>
        <Text style={styles.text}>
          Mike Dietrich reserves the right to terminate or suspend user access to the App for any reason, including but not limited to violations of these Terms.
        </Text>

        <Text style={styles.sectionTitle}>10. Governing Law</Text>
        <Text style={styles.text}>
          These Terms are governed by the laws of Massachusetts. Any disputes arising from these Terms or the use of the App shall be resolved in the courts of Massachusetts.
        </Text>

        <Text style={styles.sectionTitle}>11. Contact Information</Text>
        <Text style={styles.text}>
          If you have any questions about these Terms, please contact mike.f.dietrich@gmail.com.
        </Text>

        <Text style={styles.finalText}>
          By using the App, you acknowledge that you have read, understood, and agree to these Terms of Service.
        </Text>
      </ScrollView>

      <View style={styles.buttonContainer}>
        {!hasReachedBottom && (
          <Text style={styles.scrollPrompt}>
            Please read the entire Terms of Service to continue
          </Text>
        )}
        <TouchableOpacity
          style={[
            styles.button,
            styles.acceptButton,
            (!hasReachedBottom || loading) && styles.buttonDisabled
          ]}
          onPress={handleAcceptTOS}
          disabled={!hasReachedBottom || loading}
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
  subTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6600',
    marginTop: 15,
    marginBottom: 8,
  },
  text: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
    marginBottom: 15,
  },
  bullet: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
    marginBottom: 10,
    marginLeft: 15,
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
    opacity: 0.5,
    backgroundColor: '#666',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  finalText: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
    marginVertical: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scrollPrompt: {
    color: '#ff6600',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
    fontStyle: 'italic',
  },
});