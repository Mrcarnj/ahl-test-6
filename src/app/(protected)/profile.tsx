import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, RefreshControl } from 'react-native';
import React, { useMemo, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { getOfficialPhoto, useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';

const Profile = () => {
    const { user } = useAuth();
    const { roster, refreshRoster } = useRoster();
    const { myGames, refreshSchedule } = useSchedule();
    const [refreshing, setRefreshing] = useState(false);

    // Cache the profile data
    const profileData = useMemo(() => ({
        photo: roster ?.photo || 'https://via.placeholder.com/150',
        name: roster ? `${roster.firstname} ${roster.lastname}` : '',
        email: roster?.email || '',
        phone: roster?.phonenumber || '',
        gameCount: myGames.length
    }), [roster, myGames]);

    // Handle manual refresh
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                refreshRoster(),
                refreshSchedule()
            ]);
        } catch (error) {
            console.error('Refresh error:', error);
        } finally {
            setRefreshing(false);
        }
    }, [refreshRoster, refreshSchedule]);

    if (!roster) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <Text style={styles.loadingText}>Loading...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView 
                style={styles.scrollView} 
                contentContainerStyle={styles.container}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#ff6600"
                        colors={['#ff6600']}
                    />
                }
            >
                <Image
                    source={ profileData.photo ?
                        { uri: profileData.photo}
                    : require('../../../assets/images/noPhoto.png')
                }
                    style={styles.profileImage}
                />
                <Text style={styles.name}>{profileData.name}</Text>
                <Text style={styles.gameCount}>
                    Game Count: {profileData.gameCount}
                </Text>
                <View style={styles.infoSection}>
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value}>{profileData.email}</Text>
                        </View>
                    </View>

                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Phone</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value}>{profileData.phone}</Text>
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
        justifyContent: 'center',
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