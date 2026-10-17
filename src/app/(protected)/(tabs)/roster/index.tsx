// app/(protected)/(tabs)/roster/index.tsx
import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRoster } from '@/src/providers/RosterProvider';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { Roster } from '@/src/providers/ScheduleProvider';
import { router } from 'expo-router';
import OfficialDetails from '@/src/components/OfficialDetails';
import SideDrawer from '@/src/components/SideDrawer';
import { useTabletLayout } from '@/src/lib/platform';

// Display order for the AHL Front Office section, by email. Anyone with
// ahlAdmin who isn't listed falls to the end, alphabetically.
const FRONT_OFFICE_ORDER = [
    'sthomson@theahl.com',
    'ryerkovich@theahl.com',
    'kdanahy@theahl.com',
    'jjordan@theahl.com',
    'mdemarin@theahl.com',
];

const frontOfficeRank = (roster: Roster): number => {
    const i = FRONT_OFFICE_ORDER.indexOf(roster.email?.toLowerCase());
    return i === -1 ? FRONT_OFFICE_ORDER.length : i;
};

const RosterItem = memo(function RosterItem({ item, onPress, selected }: {
    item: { id: number; lastfirstfullname: string },
    onPress: (id: number) => void,
    /** Open in the iPad drawer. */
    selected?: boolean,
}) {
    return (
    <TouchableOpacity
        style={[styles.itemContainer, selected && styles.selectedItem]}
        onPress={() => onPress(item.id)}
    >
        <Text style={styles.itemText}>{item.lastfirstfullname}</Text>
        <Ionicons name="chevron-forward" size={20} color="#ff6600" />
    </TouchableOpacity>
    );
});

const RosterScreen = () => {
    // The list comes from RosterProvider, which loads it from cache at launch
    // and keeps it current. Refreshing here on mount (as this screen used to)
    // put the whole tab back into its loading state on every first visit.
    const { allRosters, loading, error, refreshRoster } = useRoster();

    const [searchQuery, setSearchQuery] = useState('');
    const [pulling, setPulling] = useState(false);
    // On iPad a tapped official opens in a drawer over the right half, so the
    // list stays in view; null when it's closed.
    const isTablet = useTabletLayout();
    const [selectedId, setSelectedId] = useState<number | null>(null);

    // Derived during render, not in an effect, so the first frame already has
    // the list instead of an empty screen that fills in a frame later.
    const adminRosters = useMemo(() => allRosters
        .filter(roster => roster.ahlAdmin)
        .sort((a, b) => frontOfficeRank(a) - frontOfficeRank(b)
            || a.lastfirstfullname.localeCompare(b.lastfirstfullname)),
    [allRosters]);

    const filteredRosters = useMemo(() => {
        const query = searchQuery.replace(/[^a-zA-Z\s]/g, '').toLowerCase();
        return allRosters
            .filter((roster) => roster.lastfirstfullname.toLowerCase().includes(query))
            .sort((a, b) => a.lastfirstfullname.localeCompare(b.lastfirstfullname));
    }, [searchQuery, allRosters]);

    const onPullRefresh = useCallback(async () => {
        setPulling(true);
        try {
            await refreshRoster();
        } finally {
            setPulling(false);
        }
    }, [refreshRoster]);

    const handleRosterPress = useCallback((id: number) => {
        if (isTablet) {
            setSelectedId(id);
            return;
        }
        router.push({
            pathname: "/(protected)/official/[rosterId]",
            params: { 
                rosterId: id,
                source: 'roster'
            }
        });
    }, [isTablet]);

    const keyExtractor = useCallback((item: Roster) => item.id.toString(), []);

    const renderItem = useCallback(({ item }: { item: Roster }) => (
        <RosterItem item={item} onPress={handleRosterPress} selected={isTablet && item.id === selectedId} />
    ), [handleRosterPress, isTablet, selectedId]);

    // Only reached on a first-ever launch with no cache yet.
    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#ff6600" />
            </View>
        );
    }

    if (error && allRosters.length === 0) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.errorText}>Couldn&apos;t load the roster.</Text>
                <TouchableOpacity onPress={onPullRefresh} style={styles.retryButton}>
                    <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* With the drawer open the list keeps to the left half, so its
                rows end at the drawer instead of running under it. */}
            <View style={[styles.listPane, isTablet && selectedId !== null && styles.listPaneNarrow]}>
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
                        <AntDesign name="close-circle" size={16} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Main Content Container */}
            <View style={styles.contentContainer}>
                {/* Filtered Rosters Section */}
                <View style={styles.filteredRostersContainer}>
                    <ScrollView
                        style={styles.scrollableRosters}
                        refreshControl={
                            <RefreshControl
                                refreshing={pulling}
                                onRefresh={onPullRefresh}
                                tintColor="#ff6600"
                                colors={['#ff6600']}
                            />
                        }
                    >
                        <FlatList
                            data={filteredRosters}
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

            {isTablet && selectedId !== null && (
                <SideDrawer
                    title="Official's Details"
                    onClose={() => setSelectedId(null)}
                    style={styles.drawer}
                >
                    {/* Keyed so switching officials starts from a clean profile. */}
                    <OfficialDetails key={selectedId} rosterId={selectedId} />
                </SideDrawer>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        color: '#ccc',
        fontSize: 16,
        marginBottom: 12,
    },
    retryButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: '#ff6600',
    },
    retryText: {
        color: '#fff',
        fontWeight: 'bold',
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
    listPane: {
        flex: 1,
    },
    listPaneNarrow: {
        width: '50%',
    },
    selectedItem: {
        borderWidth: 1,
        borderColor: '#ff6600',
    },
    drawer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: '50%',
        borderLeftWidth: 1,
        borderLeftColor: '#333',
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
    list: {
        flex: 1,
    },
});

export default RosterScreen;