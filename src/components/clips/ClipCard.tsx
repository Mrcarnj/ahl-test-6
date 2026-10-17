import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Clip, displayName, formatClipDuration } from '@/src/lib/clips';

type Props = {
  clip: Clip;
  thumbnailUrl?: string;
  isMine: boolean;
  onPress: (clip: Clip) => void;
};

function ClipCard({ clip, thumbnailUrl, isMine, onPress }: Props) {
  const duration = formatClipDuration(clip.duration_seconds);
  const uploaded = new Date(clip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Pressable
      onPress={() => onPress(clip)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Play clip ${clip.title}`}
    >
      <View style={styles.thumbWrap}>
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl, cacheKey: clip.thumbnail_path ?? undefined }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="videocam-outline" size={22} color="#666" />
          </View>
        )}
        <View style={styles.playBadge}>
          <Ionicons name="play" size={12} color="#fff" />
        </View>
        {duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {clip.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {isMine ? 'You' : displayName(clip.uploader_name)} · {uploaded}
        </Text>
        {clip.tags.length > 0 ? (
          <View style={styles.tags}>
            {clip.tags.slice(0, 3).map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText} numberOfLines={1}>
                  {t}
                </Text>
              </View>
            ))}
            {clip.tags.length > 3 ? <Text style={styles.moreTags}>+{clip.tags.length - 3}</Text> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default memo(ClipCard);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  pressed: {
    backgroundColor: '#111',
  },
  thumbWrap: {
    width: 128,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 102, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2,
  },
  durationBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: '#999',
    fontSize: 12,
    marginTop: 3,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  tag: {
    backgroundColor: '#2a1608',
    borderColor: '#663000',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    maxWidth: 120,
  },
  tagText: {
    color: '#ffb380',
    fontSize: 11,
  },
  moreTags: {
    color: '#999',
    fontSize: 11,
  },
});
