// The player. The video streams from a signed URL fetched only here, so the
// list never downloads more than thumbnails.

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/src/lib/alert';
import {
  type Clip,
  deleteClip,
  displayName,
  fetchClip,
  formatClipDuration,
  formatGameShort,
  getSignedUrl,
} from '@/src/lib/clips';
import { useClips } from '@/src/providers/ClipsProvider';
import { useRoster } from '@/src/providers/RosterProvider';

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture
    />
  );
}

export default function ClipScreen() {
  const { clipId } = useLocalSearchParams<{ clipId: string }>();
  const { clips, isAdmin, removeClip } = useClips();
  const { roster } = useRoster();

  const listed = clips.find((c) => c.id === clipId) ?? null;
  const [fetched, setFetched] = useState<Clip | null>(null);
  const [missing, setMissing] = useState(false);
  const clip = listed ?? fetched;

  const [url, setUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Opened before the list has it (e.g. straight from a push).
  useEffect(() => {
    if (listed || !clipId) return;
    fetchClip(clipId)
      .then((c) => (c ? setFetched(c) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [listed, clipId]);

  const videoPath = clip?.video_path;
  useEffect(() => {
    if (!videoPath) return;
    let cancelled = false;
    getSignedUrl(videoPath)
      .then((u) => !cancelled && setUrl(u))
      .catch((e) => !cancelled && setUrlError(e instanceof Error ? e.message : 'Could not load video'));
    return () => {
      cancelled = true;
    };
  }, [videoPath]);

  if (!clip) {
    return (
      <View style={styles.center}>
        {missing ? (
          <Text style={styles.muted}>This clip was deleted or you don’t have access to it.</Text>
        ) : (
          <ActivityIndicator color="#ff6600" />
        )}
      </View>
    );
  }

  const isMine = clip.uploaded_by === roster?.auth_id;
  const canDelete = isMine || isAdmin;
  const duration = formatClipDuration(clip.duration_seconds);
  const uploaded = new Date(clip.created_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const confirmDelete = () => {
    Alert.alert('Delete clip?', `“${clip.title}” will be removed for the whole crew.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteClip(clip);
            removeClip(clip.id);
            router.back();
          } catch (e) {
            setDeleting(false);
            Alert.alert('Could not delete clip', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.videoWrap}>
        {url ? (
          <Player url={url} />
        ) : urlError ? (
          <Text style={styles.muted}>{urlError}</Text>
        ) : (
          <ActivityIndicator color="#ff6600" />
        )}
      </View>

      <View style={styles.details}>
        <Text style={styles.title}>{clip.title}</Text>
        <Text style={styles.meta}>
          {isMine ? 'You' : displayName(clip.uploader_name)} · {uploaded}
          {duration ? ` · ${duration}` : ''}
        </Text>

        <Pressable
          style={styles.gameRow}
          onPress={() =>
            router.push({
              pathname: '/(protected)/(tabs)/clips/game/[scheduleId]',
              params: { scheduleId: String(clip.schedule_id) },
            })
          }
        >
          <Ionicons name="calendar-outline" size={16} color="#ff6600" />
          <Text style={styles.gameText} numberOfLines={1}>
            {formatGameShort(clip.game)}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#666" />
        </Pressable>

        {clip.tags.length > 0 ? (
          <View style={styles.tags}>
            {clip.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {clip.notes ? <Text style={styles.notes}>{clip.notes}</Text> : null}

        {canDelete ? (
          <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={styles.deleteText}>Delete clip</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  videoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  details: {
    padding: 16,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    color: '#999',
    fontSize: 13,
    marginTop: 4,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 12,
    backgroundColor: '#111',
    borderRadius: 10,
  },
  gameText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  tag: {
    backgroundColor: '#2a1608',
    borderColor: '#663000',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagText: {
    color: '#ffb380',
    fontSize: 13,
  },
  notes: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 14,
  },
  muted: {
    color: '#888',
    textAlign: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#5c1a1a',
    borderRadius: 10,
    paddingVertical: 11,
  },
  deleteText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 15,
  },
});
