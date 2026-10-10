// The iPad home screen's Clips sector: the league's newest clips, newest first,
// from every official (every official can watch every clip —
// sql/2026-10-10_clips_read_all_officials.sql). Reads ClipsProvider's list,
// so it costs no extra fetch; "See all" opens the Clips tab.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ClipCard from '@/src/components/clips/ClipCard';
import { useThumbnailUrls } from '@/src/components/clips/useThumbnailUrls';
import type { Clip } from '@/src/lib/clips';
import { useClips } from '@/src/providers/ClipsProvider';
import { useRoster } from '@/src/providers/RosterProvider';

/** Enough to scroll through; the Clips tab has the rest, with search. */
const FEED_LIMIT = 50;

export default function ClipsFeed() {
    const { clips, loaded } = useClips();
    const { roster } = useRoster();
    const myId = roster?.auth_id;

    // ClipsProvider keeps the list newest first already.
    const recent = useMemo(() => clips.slice(0, FEED_LIMIT), [clips]);
    const thumbs = useThumbnailUrls(recent);

    const openClip = useCallback((clip: Clip) => {
        router.push({ pathname: '/(protected)/(tabs)/clips/[clipId]', params: { clipId: clip.id } });
    }, []);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Leaguewide Clips</Text>
                <Pressable
                    onPress={() => router.push('/(protected)/(tabs)/clips')}
                    hitSlop={10}
                    style={styles.seeAll}
                >
                    <Text style={styles.seeAllText}>See all</Text>
                    <Ionicons name="chevron-forward" size={16} color="#ff6600" />
                </Pressable>
            </View>
            {!loaded ? (
                <ActivityIndicator color="#ff6600" style={styles.loading} />
            ) : (
                <FlatList
                    data={recent}
                    keyExtractor={(c) => c.id}
                    renderItem={({ item }) => (
                        <ClipCard
                            clip={item}
                            thumbnailUrl={item.thumbnail_path ? thumbs[item.thumbnail_path] : undefined}
                            isMine={item.uploaded_by === myId}
                            onPress={openClip}
                        />
                    )}
                    ListEmptyComponent={<Text style={styles.empty}>No clips yet</Text>}
                    initialNumToRender={6}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 4,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    seeAll: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    seeAllText: {
        color: '#ff6600',
        fontSize: 14,
        fontWeight: '600',
    },
    loading: {
        marginTop: 24,
    },
    empty: {
        color: '#999',
        fontSize: 14,
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 24,
    },
});
