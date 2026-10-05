// One game's clips. The "New Clip" alert and push land here, as does the
// Clips button on a game's detail page.

import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import ClipCard from '@/src/components/clips/ClipCard';
import { useThumbnailUrls } from '@/src/components/clips/useThumbnailUrls';
import { type Clip, type ClipGame, displayName, formatGameShort } from '@/src/lib/clips';
import { currentSeasonLabel } from '@/src/lib/season';
import { supabase } from '@/src/lib/supabase';
import { useClips } from '@/src/providers/ClipsProvider';
import { useRoster } from '@/src/providers/RosterProvider';
import { useSchedule } from '@/src/providers/ScheduleProvider';

type CrewGame = ClipGame & {
  referee1: string | null;
  referee2: string | null;
  linesperson1: string | null;
  linesperson2: string | null;
};

export default function GameClipsScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>();
  const id = Number(scheduleId);
  const { clips, loaded, refreshing, refresh } = useClips();
  const { roster } = useRoster();
  const { myGames } = useSchedule();
  const myId = roster?.auth_id;

  const gameClips = useMemo(() => clips.filter((c) => c.schedule_id === id), [clips, id]);
  const thumbs = useThumbnailUrls(gameClips);

  // The game and its crew. Usually in the loaded schedule already; read it
  // from the DB otherwise (an admin viewing someone else's game, or a game
  // older than the loaded schedule).
  const scheduled = useMemo(() => myGames.find((g) => g.id === id), [myGames, id]);
  const [fetched, setFetched] = useState<CrewGame | null>(null);
  useEffect(() => {
    if (scheduled || !Number.isFinite(id)) return;
    supabase
      .from('schedule')
      .select('id, gameid, gamedate, gametime, awayteam, hometeam, season, referee1, referee2, linesperson1, linesperson2')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setFetched((data as CrewGame | null) ?? null));
  }, [scheduled, id]);
  const game: CrewGame | null = scheduled ?? fetched;

  const crew = game
    ? [game.referee1, game.referee2, game.linesperson1, game.linesperson2].filter((n): n is string => !!n)
    : [];
  const onCrew = !!roster?.lastfirstfullname && crew.includes(roster.lastfirstfullname);
  // Same rule as the upload screen's game list: this season, today or earlier.
  const canUpload =
    onCrew &&
    !!game &&
    game.season === currentSeasonLabel() &&
    game.gamedate <= format(new Date(), 'yyyy-MM-dd');

  const openClip = useCallback((clip: Clip) => {
    router.push({ pathname: '/(protected)/(tabs)/clips/[clipId]', params: { clipId: clip.id } });
  }, []);

  const header = (
    <View style={styles.header}>
      <Text style={styles.gameTitle}>{game ? formatGameShort(game) : 'Game'}</Text>
      {crew.length > 0 ? (
        <Text style={styles.crew} numberOfLines={2}>
          Crew: {crew.map(displayName).join(', ')}
        </Text>
      ) : null}
      <View style={styles.headerButtons}>
        {canUpload ? (
          <Pressable
            style={styles.primaryBtn}
            onPress={() =>
              router.push({ pathname: '/(protected)/(tabs)/clips/upload', params: { scheduleId: String(id) } })
            }
          >
            <Ionicons name="cloud-upload-outline" size={16} color="#000" />
            <Text style={styles.primaryBtnText}>Upload clip</Text>
          </Pressable>
        ) : null}
        {scheduled ? (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() =>
              router.push({ pathname: '/(protected)/game/[id]', params: { id: scheduled.gameid, source: 'home' } })
            }
          >
            <Text style={styles.secondaryBtnText}>Game details</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.count}>
        {gameClips.length} {gameClips.length === 1 ? 'clip' : 'clips'}
      </Text>
    </View>
  );

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#ff6600" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={gameClips}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <ClipCard
          clip={item}
          thumbnailUrl={item.thumbnail_path ? thumbs[item.thumbnail_path] : undefined}
          isMine={item.uploaded_by === myId}
          onPress={openClip}
        />
      )}
      ListEmptyComponent={<Text style={styles.empty}>No clips for this game yet.</Text>}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#ff6600" colors={['#ff6600']} />
      }
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
    marginBottom: 4,
  },
  gameTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  crew: {
    color: '#999',
    fontSize: 13,
    marginTop: 6,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ff6600',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  count: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 32,
  },
});
