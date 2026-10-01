// app/(protected)/(tabs)/profile.tsx
import { requestNotificationPermissions } from '@/src/lib/notificationService';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/src/lib/legal';
import { Alert } from '@/src/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';

const Profile = () => {
    const { user } = useAuth();
    const { roster, refreshRoster } = useRoster();
    const { myGames } = useSchedule();

    // State for collapsible sections
    const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
    const [expandedGamecodes, setExpandedGamecodes] = useState<Set<string>>(new Set());
    
    // State for iCal URL editing
    const [isEditingIcalUrl, setIsEditingIcalUrl] = useState(false);
    const [icalUrlValue, setIcalUrlValue] = useState(roster?.ical_url || '');
    const [savingIcalUrl, setSavingIcalUrl] = useState(false);

    // Cache the profile data and game breakdown
    const profileData = useMemo(() => {
        // Group games by season and gamecode
        const seasonBreakdown: Record<string, Record<string, any[]>> = {};
        let totalGames = 0;

        myGames.forEach(game => {
            const season = game.season || 'Unknown Season';
            const gamecode = game.gamecode || 'Unknown Gamecode';
            
            if (!seasonBreakdown[season]) {
                seasonBreakdown[season] = {};
            }
            if (!seasonBreakdown[season][gamecode]) {
                seasonBreakdown[season][gamecode] = [];
            }
            
            seasonBreakdown[season][gamecode].push(game);
            totalGames++;
        });

        // Convert to array format for FlatList
        const seasonsArray = Object.entries(seasonBreakdown).map(([season, gamecodes]) => {
            const seasonTotal = Object.values(gamecodes).reduce((sum, games) => sum + games.length, 0);
            const gamecodesArray = Object.entries(gamecodes).map(([gamecode, games]) => ({
                gamecode,
                games,
                count: games.length
            }));

            return {
                season,
                gamecodes: gamecodesArray,
                total: seasonTotal
            };
        }).sort((a, b) => a.season.localeCompare(b.season));

        return {
            photo: roster?.photo || 'https://via.placeholder.com/150',
            name: roster ? `${roster.firstname} ${roster.lastname}` : '',
            email: roster?.email || '',
            phone: roster?.phonenumber || '',
            icalUrl: roster?.ical_url || '',
            gameCount: totalGames,
            seasonsBreakdown: seasonsArray
        };
    }, [roster, myGames]);

    // Update iCal URL value when roster changes
    useEffect(() => {
        setIcalUrlValue(roster?.ical_url || '');
    }, [roster?.ical_url]);

    // Save iCal URL function
    const saveIcalUrl = async () => {
        if (!roster?.auth_id) {
            Alert.alert('Error', 'Unable to save: No user data available');
            return;
        }

        try {
            setSavingIcalUrl(true);
            
            const { error } = await supabase
                .from('roster')
                .update({ ical_url: icalUrlValue.trim() || null })
                .eq('auth_id', roster.auth_id);

            if (error) {
                throw error;
            }

            // Refresh roster data to get updated values
            await refreshRoster();
            setIsEditingIcalUrl(false);
            
            Alert.alert('Success', 'iCal URL updated successfully');
        } catch (error) {
            console.error('Error saving iCal URL:', error);
            Alert.alert('Error', 'Failed to save iCal URL. Please try again.');
        } finally {
            setSavingIcalUrl(false);
        }
    };

    // Cancel editing iCal URL
    const cancelEditIcalUrl = () => {
        setIcalUrlValue(roster?.ical_url || '');
        setIsEditingIcalUrl(false);
    };

    // Toggle functions for collapsible sections
    const toggleSeason = (season: string) => {
        const newExpanded = new Set(expandedSeasons);
        if (newExpanded.has(season)) {
            newExpanded.delete(season);
        } else {
            newExpanded.add(season);
        }
        setExpandedSeasons(newExpanded);
    };

    const toggleGamecode = (seasonGamecode: string) => {
        const newExpanded = new Set(expandedGamecodes);
        if (newExpanded.has(seasonGamecode)) {
            newExpanded.delete(seasonGamecode);
        } else {
            newExpanded.add(seasonGamecode);
        }
        setExpandedGamecodes(newExpanded);
    };

    // Render individual game item
    const renderGameItem = ({ item: game }: { item: any }) => {
        // Format date from YYYY-MM-DD to MM/DD/YYYY
        const formatDate = (dateString: string) => {
            const [year, month, day] = dateString.split('-');
            return `${month}/${day}/${year}`;
        };

        return (
            <View style={styles.gameItem}>
                <Text style={styles.gameText}>
                    {formatDate(game.gamedate)} - {game.awayteam} @ {game.hometeam}
                </Text>
            </View>
        );
    };

    // Render gamecode section
    const renderGamecodeSection = ({ item: gamecodeData }: { item: any }, season: string) => {
        const seasonGamecode = `${season}-${gamecodeData.gamecode}`;
        const isExpanded = expandedGamecodes.has(seasonGamecode);

        return (
            <View style={styles.gamecodeSection}>
                <TouchableOpacity 
                    style={styles.gamecodeHeader}
                    onPress={() => toggleGamecode(seasonGamecode)}
                >
                    <Text style={styles.gamecodeText}>{gamecodeData.gamecode}</Text>
                    <Text style={styles.countText}>{gamecodeData.count}</Text>
                    <Text style={styles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                {isExpanded && (
                    <View style={styles.gamecodeContent}>
                        <FlatList
                            data={gamecodeData.games}
                            renderItem={renderGameItem}
                            keyExtractor={(game) => `${game.id}-${game.gameid}`}
                            scrollEnabled={false}
                        />
                    </View>
                )}
            </View>
        );
    };

    // Render season section
    const renderSeasonSection = ({ item: seasonData }: { item: any }) => {
        const isExpanded = expandedSeasons.has(seasonData.season);

        return (
            <View style={styles.seasonSection}>
                <TouchableOpacity 
                    style={styles.seasonHeader}
                    onPress={() => toggleSeason(seasonData.season)}
                >
                    <Text style={styles.seasonText}>{seasonData.season}</Text>
                    <Text style={styles.countText}>{seasonData.total}</Text>
                    <Text style={styles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                {isExpanded && (
                    <View style={styles.seasonContent}>
                        <FlatList
                            data={seasonData.gamecodes}
                            renderItem={(item) => renderGamecodeSection(item, seasonData.season)}
                            keyExtractor={(gamecode) => `${seasonData.season}-${gamecode.gamecode}`}
                            scrollEnabled={false}
                        />
                    </View>
                )}
            </View>
        );
    };

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
            >
                <Image
                    source={ profileData.photo ?
                        { uri: profileData.photo}
                    : require('../../../../assets/images/noPhoto.png')
                }
                    style={styles.profileImage}
                />
                <Text style={styles.name}>{profileData.name}</Text>
                
                {/* Total Games Count */}
                <View style={styles.totalGamesContainer}>
                    <Text style={styles.totalGamesText}>
                        Total Games: {profileData.gameCount}
                    </Text>
                </View>

                {/* Collapsible Game Breakdown */}
                <View style={styles.breakdownContainer}>
                    <Text style={styles.breakdownTitle}>Game Breakdown</Text>
                    <FlatList
                        data={profileData.seasonsBreakdown}
                        renderItem={renderSeasonSection}
                        keyExtractor={(season) => season.season}
                        scrollEnabled={false}
                    />
                </View>
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

                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>iCal URL</Text>
                        {isEditingIcalUrl ? (
                            <View style={styles.editContainer}>
                                <TextInput
                                    style={styles.icalUrlInput}
                                    value={icalUrlValue}
                                    onChangeText={setIcalUrlValue}
                                    placeholder="Enter iCal URL..."
                                    placeholderTextColor="#666"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="url"
                                />
                                <View style={styles.editButtons}>
                                    <TouchableOpacity 
                                        style={[styles.editButton, styles.saveButton]} 
                                        onPress={saveIcalUrl}
                                        disabled={savingIcalUrl}
                                    >
                                        <Text style={[styles.editButtonText, styles.saveButtonText]}>
                                            {savingIcalUrl ? 'Saving...' : 'Save'}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.editButton, styles.cancelButton]} 
                                        onPress={cancelEditIcalUrl}
                                        disabled={savingIcalUrl}
                                    >
                                        <Text style={styles.editButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.valueContainer}>
                                <Text style={styles.value}>
                                    {profileData.icalUrl || 'Not set'}
                                </Text>
                                <TouchableOpacity 
                                    style={styles.editIconButton} 
                                    onPress={() => setIsEditingIcalUrl(true)}
                                >
                                    <Text style={styles.editIcon}>✏️</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Notification Settings */}
                    <TouchableOpacity
                        style={styles.notificationButton}
                        onPress={() => user?.id && requestNotificationPermissions(user.id)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.notificationButtonText}>🔔 Enable Notifications</Text>
                    </TouchableOpacity>

                    {/* Legal */}
                    <View style={styles.legalSection}>
                        <Text style={styles.legalHeading}>Legal</Text>
                        <TouchableOpacity
                            onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
                            accessibilityRole="link"
                            style={styles.legalRow}
                        >
                            <Text style={styles.legalLink}>Terms of Service</Text>
                            {roster?.tos_accepted_at ? (
                                <Text style={styles.legalMeta}>
                                    Accepted {new Date(roster.tos_accepted_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                </Text>
                            ) : null}
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                            accessibilityRole="link"
                            style={styles.legalRow}
                        >
                            <Text style={styles.legalLink}>Privacy Policy</Text>
                        </TouchableOpacity>
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
    totalGamesContainer: {
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
        padding: 15,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#ff6600',
    },
    totalGamesText: {
        fontSize: 20,
        color: '#ff6600',
        textAlign: 'center',
        fontWeight: 'bold',
    },
    notificationButton: {
        backgroundColor: '#ff6600',
        padding: 12,
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 8,
        alignItems: 'center',
    },
    notificationButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
    breakdownContainer: {
        width: '100%',
        marginBottom: 20,
    },
    breakdownTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 15,
        textAlign: 'center',
    },
    seasonSection: {
        marginBottom: 10,
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    seasonHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        backgroundColor: '#2a2a2a',
        borderRadius: 8,
    },
    seasonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
        flex: 1,
    },
    seasonContent: {
        paddingHorizontal: 15,
        paddingBottom: 10,
    },
    gamecodeSection: {
        marginBottom: 8,
        backgroundColor: '#333',
        borderRadius: 6,
        marginTop: 5,
    },
    gamecodeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
    },
    gamecodeText: {
        fontSize: 14,
        color: '#ff6600',
        fontWeight: '600',
        flex: 1,
    },
    gamecodeContent: {
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    countText: {
        fontSize: 14,
        color: '#fff',
        fontWeight: 'bold',
        marginRight: 10,
    },
    chevron: {
        fontSize: 12,
        color: '#ff6600',
        marginLeft: 5,
    },
    gameItem: {
        backgroundColor: '#444',
        borderRadius: 4,
        padding: 10,
        marginBottom: 5,
        borderLeftWidth: 3,
        borderLeftColor: '#ff6600',
    },
    gameText: {
        fontSize: 12,
        color: '#fff',
    },
    editContainer: {
        width: '100%',
    },
    icalUrlInput: {
        backgroundColor: '#333',
        color: '#fff',
        borderWidth: 1,
        borderColor: '#ff6600',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 10,
    },
    editButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
    },
    editButton: {
        flex: 1,
        padding: 10,
        borderRadius: 6,
        alignItems: 'center',
    },
    saveButton: {
        backgroundColor: '#ff6600',
    },
    cancelButton: {
        backgroundColor: '#666',
    },
    legalSection: {
        marginHorizontal: 20,
        marginBottom: 20,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#333',
        paddingTop: 12,
    },
    legalHeading: {
        color: '#aaa',
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    legalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        minHeight: 44,
    },
    legalLink: {
        color: '#ff8533',
        fontSize: 16,
        textDecorationLine: 'underline',
    },
    legalMeta: {
        color: '#aaa',
        fontSize: 13,
    },
    saveButtonText: {
        color: '#000',
    },
    editButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    editIconButton: {
        padding: 5,
        marginLeft: 10,
    },
    editIcon: {
        fontSize: 16,
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
    linkButton: {
        backgroundColor: '#ff6600',
        borderRadius: 8,
        padding: 12,
        marginBottom: 15,
        alignItems: 'center',
    },
    link: {
        fontSize: 18,
        color: '#000',
        fontWeight: 'bold',
    },
    loadingText: {
        fontSize: 18,
        color: '#fff',
        textAlign: 'center',
    },
});

export default Profile;