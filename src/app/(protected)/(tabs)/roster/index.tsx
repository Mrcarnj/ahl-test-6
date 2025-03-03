// app/(protected)/(tabs)/roster/index.tsx
import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet, Platform, InputAccessoryView, Keyboard, ScrollView, RefreshControl } from 'react-native';
import { useRoster } from '@/src/providers/RosterProvider';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { Roster } from '@/src/providers/ScheduleProvider';
import { router } from 'expo-router';
import { useAuth } from '@/src/providers/AuthProvider';

// RosterItem component remains the same
const RosterItem = memo(({ item, onPress }: {
    item: { id: number; lastfirstfullname: string },
    onPress: (id: number) => void
}) => (
    <TouchableOpacity
        style={styles.itemContainer}
        onPress={() => onPress(item.id)}
    >
        <Text style={styles.itemText}>{item.lastfirstfullname}</Text>
        <Ionicons name="chevron-forward" size={20} color="#ff6600" />
    </TouchableOpacity>
));

const RosterScreen = () => {
    const { allRosters, loading, error, refreshRoster } = useRoster();

    const [searchQuery, setSearchQuery] = useState('');
    const [filteredRosters, setFilteredRosters] = useState<Roster[]>([]);
    const [adminRosters, setAdminRosters] = useState<Roster[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        refreshRoster();
    }, []);


    const sanitizeSearchQuery = (query: string): string => {
        return query.replace(/[^a-zA-Z\s]/g, '');
    };
     
    useEffect(() => {
        const sortedAdminRosters = allRosters
            .filter(roster => roster.ahlAdmin)
            .sort((b, a) => a.lastfirstfullname.localeCompare(b.lastfirstfullname));
        setAdminRosters(sortedAdminRosters);
     
        const sanitizedQuery = sanitizeSearchQuery(searchQuery);
        const sortedAndFilteredRosters = allRosters
            .filter((roster) =>
                roster.lastfirstfullname.toLowerCase().includes(sanitizedQuery.toLowerCase())
            )
            .sort((a, b) => a.lastfirstfullname.localeCompare(b.lastfirstfullname));
     
        setFilteredRosters(sortedAndFilteredRosters);
     }, [searchQuery, allRosters]);

    const handleRosterPress = useCallback((id: number) => {
        router.push({
            pathname: "/(protected)/official/[rosterId]",
            params: { 
                rosterId: id,
                source: 'roster'
            }
        });
    }, []);

    const keyExtractor = useCallback((item: Roster) => item.id.toString(), []);

    const renderItem = useCallback(({ item }: { item: Roster }) => (
        <RosterItem item={item} onPress={handleRosterPress} />
    ), [handleRosterPress]);

    if (loading) {
        return <ActivityIndicator size="large" color="##ff6600" />;
    }

    if (error) {
        return <Text>Error: {error}</Text>;
    }

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchBar}
                    placeholder="Search..."
                    placeholderTextColor={'#ccc'}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    blurOnSubmit={true}
                    enablesReturnKeyAutomatically
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity
                        onPress={() => setSearchQuery('')}
                        style={styles.clearButton}
                    >
                        <AntDesign name="closecircle" size={16} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Main Content Container */}
            <View style={styles.contentContainer}>
                {/* Filtered Rosters Section */}
                <View style={styles.filteredRostersContainer}>
                    <ScrollView style={styles.scrollableRosters}>
                        <FlatList
                            data={filteredRosters} // Limit to 15 items
                            keyExtractor={keyExtractor}
                            renderItem={renderItem}
                            scrollEnabled={false} // Disable FlatList scroll since we're using ScrollView
                            initialNumToRender={15}
                            contentContainerStyle={styles.listContainer}
                        />
                    </ScrollView>
                </View>

                <View style={styles.separator} />
                <Text style={styles.sectionTitle}>AHL Front Office</Text>

                {/* AHL Admin Section */}
                <ScrollView style={styles.adminSection}>
                    <FlatList
                        data={adminRosters}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        scrollEnabled={false}
                        initialNumToRender={10}
                    />
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    contentContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    filteredRostersContainer: {
        height: 400, // Fixed height for the filtered rosters section
        paddingHorizontal: 10,
    },
    scrollableRosters: {
        flex: 1,
    },
    adminSection: {
        paddingHorizontal: 10,
        paddingBottom: 20,
    },
    searchContainer: {
        position: 'relative',
        margin: 10,
    },
    searchBar: {
        height: 40,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        paddingHorizontal: 10,
        paddingRight: 35,
        color: '#fff',
    },
    clearButton: {
        position: 'absolute',
        right: 10,
        top: 7,
        padding: 5,
    },
    listContainer: {
        paddingVertical: 10,
    },
    itemContainer: {
        backgroundColor: '#1a1a1a',
        padding: 15,
        borderRadius: 8,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    itemText: {
        fontSize: 16,
        color: '#fff',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ff6600',
        marginBottom: 10,
        marginHorizontal: 12,
    },
    separator: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 10,
        marginHorizontal: 10,
    },
});

export default RosterScreen;