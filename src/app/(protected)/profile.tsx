import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';

const Profile = () => {
    const { user } = useAuth();
    const { roster } = useRoster();
    const { myGames } = useSchedule();

    if (!roster) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <Text style={styles.loadingText}>Loading...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
                <Image
                    source={{ 
                        uri: roster.photo || 'https://via.placeholder.com/150'
                    }}
                    style={styles.profileImage}
                />
                <Text style={styles.name}>
                    {roster.firstname} {roster.lastname}
                </Text>
                <Text style={styles.gameCount}>
                    Game Count: {myGames.length}
                </Text>
                <View style={styles.infoSection}>
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value}>{roster.email}</Text>
                        </View>
                    </View>

                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Phone</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value}>{roster.phonenumber}</Text>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={styles.linkButton} 
                        onPress={() => supabase.auth.signOut()}
                    >
                        <Text style={styles.link}>Sign out</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        padding: 20,
        alignItems: 'center',
    },
    profileImage: {
        width: 150,
        height: 150,
        borderRadius: 75,
        borderWidth: 3,
        borderColor: '#ff6600',
        marginBottom: 20,
    },
    name: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 10,
    },
    gameCount: {
        fontSize: 18,
        color: '#ff6600',
        textAlign: 'center',
        marginBottom: 20,
    },
    infoSection: {
        width: '100%',
        marginBottom: 20,
    },
    fieldContainer: {
        marginBottom: 15,
    },
    label: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ff6600',
        marginBottom: 5,
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    value: {
        fontSize: 16,
        color: '#fff',
        flex: 1,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#ff6600',
        paddingVertical: 5,
    },
    editButton: {
        padding: 5,
    },
    linkButton: {
        backgroundColor: '#ff6600',
        borderRadius: 8,
        padding: 12,
        marginBottom: 15,
        alignItems: 'center',
    },
    link: {
        fontSize: 18,
        color: '#fff',
        fontWeight: 'bold',
    },
    loadingText: {
        fontSize: 18,
        color: '#fff',
        textAlign: 'center',
    },
});

export default Profile;