// Every clip this official can see — their own and their crews' — in one list,
// grouped by game (newest game first), with search, a Mine / Crew toggle and
// tag filters. Filtering runs on the already-loaded list, so it's instant.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ClipCard from '@/src/components/clips/ClipCard';
import TagPicker from '@/src/components/clips/TagPicker';
import { useThumbnailUrls } from '@/src/components/clips/useThumbnailUrls';
import { CLIP_TAGS, type Clip, displayName, formatGameShort } from '@/src/lib/clips';
import { useClips } from '@/src/providers/ClipsProvider';
import { useRoster } from '@/src/providers/RosterProvider';

type Scope = 'all' | 'mine' | 'crew';
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'crew', label: 'Crew' },
];

type Section = { scheduleId: number; title: string; data: Clip[]; gamedate: string };

function matchesSearch(clip: Clip, q: string): boolean {
  if (!q) return true;
  const g = clip.game;
  const haystack = [
    clip.title,
    clip.notes ?? '',
    clip.uploader_name,
    displayName(clip.uploader_name),
    ...clip.tags,
    g?.gameid ?? '',
    g?.awayteam ?? '',
    g?.hometeam ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export default function ClipsScreen() {
  const { clips, loaded, refreshing, error, refresh } = useClips();
  const { roster } = useRoster();
  const myId = roster?.auth_id;

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [tags, setTags] = useState<string[]>([]);

  // Offer only tags that some clip actually has, in the preset order, then
  // any retired tags still on older clips.
  const usedTags = useMemo(() => {
    const used = new Set(clips.flatMap((c) => c.tags));
    const preset = CLIP_TAGS.filter((t) => used.has(t));
    const retired = [...used].filter((t) => !(CLIP_TAGS as readonly string[]).includes(t)).sort();
    return [...preset, ...retired];
  }, [clips]);

  const filtered = useMemo(
    () =>
      clips.filter(
        (c) =>
          (scope === 'all' || (scope === 'mine') === (c.uploaded_by === myId)) &&
          tags.every((t) => c.tags.includes(t)) &&
          matchesSearch(c, query.trim()),
      ),
    [clips, scope, tags, query, myId],
  );

  const sections = useMemo<Section[]>(() => {
    const byGame = new Map<number, Section>();
    for (const c of filtered) {
      let s = byGame.get(c.schedule_id);
      if (!s) {
        s = { scheduleId: c.schedule_id, title: formatGameShort(c.game), data: [], gamedate: c.game?.gamedate ?? '' };
        byGame.set(c.schedule_id, s);
      }
      s.data.push(c);
    }
    return [...byGame.values()].sort(
      (a, b) => b.gamedate.localeCompare(a.gamedate) || b.data[0].created_at.localeCompare(a.data[0].created_at),
    );
  }, [filtered]);

  const thumbs = useThumbnailUrls(filtered);

  const toggleTag = useCallback(
    (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])),
    [],
  );

  const openClip = useCallback((clip: Clip) => {
    router.push({ pathname: '/(protected)/(tabs)/clips/[clipId]', params: { clipId: clip.id } });
  }, []);

  const filtersActive = scope !== 'all' || tags.length > 0 || query.trim() !== '';

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title, tag, team, game #, official"
          placeholderTextColor="#666"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <View style={styles.scopeRow}>
        {SCOPES.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setScope(s.key)}
            style={[styles.scopeBtn, scope === s.key && styles.scopeBtnOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === s.key }}
          >
            <Text style={[styles.scopeText, scope === s.key && styles.scopeTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {usedTags.length > 0 ? (
        <View style={styles.tagRow}>
          <TagPicker tags={usedTags} selected={tags} onToggle={toggleTag} horizontal />
        </View>
      ) : null}

      {!loaded ? (
        <View style={styles.center}>
          {error ? <Text style={styles.emptyText}>{error}</Text> : <ActivityIndicator color="#ff6600" />}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          stickySectionHeadersEnabled
          initialNumToRender={12}
          windowSize={7}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#ff6600" colors={['#ff6600']} />
          }
          renderSectionHeader={({ section }) => (
            <Pressable
              style={styles.sectionHeader}
              onPress={() =>
                router.push({
                  pathname: '/(protected)/(tabs)/clips/game/[scheduleId]',
                  params: { scheduleId: String(section.scheduleId) },
                })
              }
            >
              <Text style={styles.sectionTitle} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={styles.sectionCount}>
                {section.data.length} <Ionicons name="chevron-forward" size={12} color="#888" />
              </Text>
            </Pressable>
          )}
          renderItem={({ item }) => (
            <ClipCard
              clip={item}
              thumbnailUrl={item.thumbnail_path ? thumbs[item.thumbnail_path] : undefined}
              isMine={item.uploaded_by === myId}
              onPress={openClip}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="videocam-outline" size={40} color="#444" />
              <Text style={styles.emptyTitle}>{filtersActive ? 'No matching clips' : 'No clips yet'}</Text>
              <Text style={styles.emptyText}>
                {filtersActive
                  ? 'Try a different search or clear a filter.'
                  : 'Clips you or your crews upload to your games show up here.'}
              </Text>
              {!filtersActive ? (
                <Pressable style={styles.uploadBtn} onPress={() => router.push('/(protected)/(tabs)/clips/upload')}>
                  <Text style={styles.uploadBtnText}>Upload a clip</Text>
                </Pressable>
              ) : null}
            </View>
          }
          contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 10,
  },
  scopeRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 9,
    padding: 3,
  },
  scopeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 7,
  },
  scopeBtnOn: {
    backgroundColor: '#333',
  },
  scopeText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  scopeTextOn: {
    color: '#fff',
  },
  tagRow: {
    marginTop: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  sectionTitle: {
    flex: 1,
    color: '#ff6600',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionCount: {
    color: '#888',
    fontSize: 12,
    marginLeft: 8,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
  },
  uploadBtn: {
    marginTop: 18,
    backgroundColor: '#ff6600',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  uploadBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
});
