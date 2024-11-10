import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet, Platform, InputAccessoryView, Keyboard } from 'react-native';
import { useRoster } from '@/src/providers/RosterProvider';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { Roster } from '@/src/providers/ScheduleProvider';
import { router } from 'expo-router';

// Create a memoized item component
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
    const inputAccessoryViewID = 'uniqueID';

    useEffect(() => {
        refreshRoster();
    }, []);

    useEffect(() => {
        // Filter rosters based on search query
        const sortedAndFilteredRosters = allRosters
            .filter((roster) =>
                roster.lastfirstfullname.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .sort((a, b) => a.lastfirstfullname.localeCompare(b.lastfirstfullname));

        setFilteredRosters(sortedAndFilteredRosters);
    }, [searchQuery, allRosters]);

    const handleRosterPress = useCallback((id: number) => {
        router.push({
            pathname: "/(protected)/roster/details",
            params: { rosterId: id }
        });
    }, []);

    const keyExtractor = useCallback((item: Roster) => item.id.toString(), []);

    const renderItem = useCallback(({ item }: { item: Roster }) => (
        <RosterItem item={item} onPress={handleRosterPress} />
    ), [handleRosterPress]);

    if (loading) {
        return <ActivityIndicator size="large" color="#0000ff" />;
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
                    returnKeyType="search"              // Add this
                    blurOnSubmit={true}              // Add this
                    enablesReturnKeyAutomatically     // Add this
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
            <FlatList
                data={filteredRosters}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                initialNumToRender={10}        // Reduce initial render batch
                maxToRenderPerBatch={10}       // Reduce render batch size
                windowSize={5}                 // Reduce the window size
                removeClippedSubviews={true}   // Remove items that are off screen
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
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
        paddingRight: 35, // Make room for the clear button
        color: '#fff',
    },
    clearButton: {
        position: 'absolute',
        right: 10,
        top: 7, // Centers the icon vertically
        padding: 5, // Larger touch target
    },
    listContainer: {
        padding: 10,
    },
    itemContainer: {
        backgroundColor: '#1a1a1a',
        padding: 15,
        borderRadius: 8,
        marginBottom: 12,
        flexDirection: 'row',  // Add this to align content and arrow
        alignItems: 'center',  // Add this to center vertically
        justifyContent: 'space-between',
    },
    itemText: {
        fontSize: 16,
        color: '#fff',
    },
    inputAccessory: {
        backgroundColor: '#f1f1f1',
        padding: 8,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        borderTopWidth: 1,
        borderTopColor: '#ccc',
    },
    accessoryContainer: {
        backgroundColor: '#f8f8f8',
        alignItems: 'flex-end',
        paddingHorizontal: 8,
        borderTopWidth: 0.5,
        borderTopColor: '#919191',
    },
    doneButton: {
        padding: 12,
    },
    doneButtonText: {
        color: '#007AFF',
        fontSize: 17,
        fontWeight: '600',
    },
});

export default RosterScreen;
