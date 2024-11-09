import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet } from 'react-native';
import { useRoster } from '@/src/providers/RosterProvider';
import { Ionicons } from '@expo/vector-icons';
import { Roster } from '@/src/providers/ScheduleProvider';

const RosterScreen = () => {
    const { allRosters, loading, error, refreshRoster } = useRoster();
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredRosters, setFilteredRosters] = useState<Roster[]>([]);

    useEffect(() => {
        refreshRoster(); // Refresh the roster on component mount
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

    if (loading) {
        return <ActivityIndicator size="large" color="#0000ff" />;
    }

    if (error) {
        return <Text>Error: {error}</Text>;
    }

    const renderRosterItem = ({ item }: { item: { id: number; lastfirstfullname: string } }) => (
        <TouchableOpacity style={styles.itemContainer}>
            <Text style={styles.itemText}>{item.lastfirstfullname}</Text>
            <Ionicons name="chevron-forward" size={20} color="#ff6600" />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <TextInput
                style={styles.searchBar}
                placeholder="Search..."
                placeholderTextColor={'#ccc'}
                value={searchQuery}
                onChangeText={setSearchQuery}
            />
            <FlatList
                data={filteredRosters}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderRosterItem}
                contentContainerStyle={styles.listContainer}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    searchBar: {
        height: 40,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        paddingHorizontal: 10,
        margin: 10,
    },
    listContainer: {
        padding: 10,
    },
    itemContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
    },
    itemText: {
        fontSize: 16,
        color: '#fff',
    },
});

export default RosterScreen;
