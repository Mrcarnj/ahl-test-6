// Upload a clip: pick a video, the game it's from (today or earlier, from the
// official's own schedule), a title and at least one tag.
//
// Order matters: files first, then the row. The row is what the crew's lists
// and alerts react to, so it only appears once the video is really there.

import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import TagPicker from '@/src/components/clips/TagPicker';
import { Alert } from '@/src/lib/alert';
import {
  compressVideo,
  type CompressHandle,
  makeThumbnail,
  pickVideo,
  type PickedVideo,
  uploadFile,
  type UploadHandle,
} from '@/src/lib/clipUpload';
import {
  CLIP_TAG_CATEGORIES,
  CLIPS_BUCKET,
  formatClipDuration,
  insertClip,
  newClipId,
  sendClipUploadedNotification,
} from '@/src/lib/clips';
import { isWeb } from '@/src/lib/platform';
import { currentSeasonLabel } from '@/src/lib/season';
import { supabase } from '@/src/lib/supabase';
import { useClips } from '@/src/providers/ClipsProvider';
import { formatGameDate, useSchedule } from '@/src/providers/ScheduleProvider';

// Matches the `clips` bucket's file_size_limit (sql/2026-10-04_clips.sql).
const MAX_BYTES = 500 * 1024 * 1024;
const GAMES_SHOWN_INITIALLY = 6;

function formatMb(bytes: number | null): string | null {
  return bytes == null ? null : `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export default function UploadClipScreen() {
  const params = useLocalSearchParams<{ scheduleId?: string }>();
  const { myGames } = useSchedule();
  const { addClip } = useClips();

  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [scheduleId, setScheduleId] = useState<number | null>(params.scheduleId ? Number(params.scheduleId) : null);
  const [showAllGames, setShowAllGames] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  // Submit runs in two phases: wait for compression (if still going), then upload.
  const [phase, setPhase] = useState<'compressing' | 'uploading'>('uploading');
  const uploadRef = useRef<UploadHandle | null>(null);
  const submitCancelledRef = useRef(false);
  // Compression starts as soon as a video is picked and runs while the
  // official fills in the rest of the form.
  const compressRef = useRef<CompressHandle | null>(null);
  const [compressProgress, setCompressProgress] = useState<number | null>(null);
  const [compressed, setCompressed] = useState<PickedVideo | null>(null);
  const [compressError, setCompressError] = useState<string | null>(null);
  useEffect(() => () => compressRef.current?.cancel(), []);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // This season's games that have happened (or are happening today), newest
  // first. myGames keeps prior seasons, so filter on the same season label the
  // sync writes to `schedule.season`.
  const eligibleGames = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const season = currentSeasonLabel();
    return myGames
      .filter((g) => g.id > 0 && g.season === season && g.gamedate <= today)
      .sort((a, b) => b.gamedate.localeCompare(a.gamedate) || b.gametime.localeCompare(a.gametime));
  }, [myGames]);

  const selectedIndex = eligibleGames.findIndex((g) => g.id === scheduleId);
  const visibleGames =
    showAllGames || selectedIndex >= GAMES_SHOWN_INITIALLY
      ? eligibleGames
      : eligibleGames.slice(0, GAMES_SHOWN_INITIALLY);

  const uploading = progress !== null;
  // Judged on the file that will actually upload, once compression is done.
  const finalSize = compressed?.sizeBytes ?? (compressError ? video?.sizeBytes : null) ?? null;
  const tooBig = finalSize != null && finalSize > MAX_BYTES;
  const compressing = !!video && !compressed && !compressError;
  const barFraction = (phase === 'compressing' ? compressProgress : progress) ?? 0;
  const canSubmit = !!video && !tooBig && selectedIndex >= 0 && title.trim().length > 0 && tags.length > 0 && !uploading;

  const choose = async () => {
    setPicking(true);
    try {
      const picked = await pickVideo();
      if (!picked) return;
      compressRef.current?.cancel();
      setVideo(picked);
      setCompressed(null);
      setCompressError(null);
      setCompressProgress(0);
      const handle = compressVideo(picked, (f) => {
        if (compressRef.current === handle) setCompressProgress(f);
      });
      compressRef.current = handle;
      handle.promise.then(
        (v) => {
          if (compressRef.current === handle) setCompressed(v);
        },
        (e) => {
          if (compressRef.current !== handle) return;
          // Upload the original rather than block the official.
          console.warn('⚠️ CLIPS: Compression failed, uploading original:', e);
          setCompressError(e instanceof Error ? e.message : 'Compression failed');
        },
      );
      setThumbUri(null);
      setThumbUri(await makeThumbnail(picked));
    } catch (e) {
      Alert.alert('Could not open video', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPicking(false);
    }
  };

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const submit = async () => {
    if (!video || selectedIndex < 0) return;
    const game = eligibleGames[selectedIndex];
    const clipId = newClipId();
    const base = `${game.id}/${clipId}`;
    const thumbPath = thumbUri ? `${base}.jpg` : null;
    const uploaded: string[] = [];
    submitCancelledRef.current = false;

    setProgress(0);
    try {
      // Wait for compression if it's still running; fall back to the original
      // if it failed.
      let final: PickedVideo = compressed ?? video;
      if (!compressed && !compressError && compressRef.current) {
        setPhase('compressing');
        final = await compressRef.current.promise.catch(() => video);
      }
      if (submitCancelledRef.current) throw new Error('Upload cancelled');
      if (final.sizeBytes != null && final.sizeBytes > MAX_BYTES) {
        throw new Error('This video is over 500 MB. Trim it and try again.');
      }
      setPhase('uploading');
      setProgress(0);
      const videoPath = `${base}.${final.ext}`;

      if (thumbPath && thumbUri) {
        uploadRef.current = uploadFile(thumbPath, thumbUri, 'image/jpeg');
        await uploadRef.current.promise;
        uploaded.push(thumbPath);
      }
      uploadRef.current = uploadFile(videoPath, final.uri, final.mimeType, setProgress);
      await uploadRef.current.promise;
      uploaded.push(videoPath);

      const clip = await insertClip({
        id: clipId,
        schedule_id: game.id,
        title: title.trim(),
        notes: notes.trim() || null,
        tags,
        video_path: videoPath,
        thumbnail_path: thumbPath,
        duration_seconds: final.durationSeconds,
        size_bytes: final.sizeBytes,
      });
      addClip(clip);
      if (!isWeb) void sendClipUploadedNotification(clip);

      // Back to wherever the upload started (the Clips list or a game's
      // clips), where the new clip is already at the top. Skipped if the
      // official already left this screen, so we don't pop something else.
      if (mountedRef.current) {
        if (router.canGoBack()) router.back();
        else router.replace('/(protected)/(tabs)/clips');
      }
    } catch (e) {
      // Don't leave orphaned files behind a clip that never got its row.
      if (uploaded.length > 0) void supabase.storage.from(CLIPS_BUCKET).remove(uploaded);
      if (mountedRef.current) {
        setProgress(null);
        const msg = e instanceof Error ? e.message : 'Please try again.';
        if (msg !== 'Upload cancelled') Alert.alert('Upload failed', msg);
      }
    } finally {
      uploadRef.current = null;
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Video */}
        <Text style={styles.label}>Video</Text>
        <Pressable style={styles.videoPicker} onPress={choose} disabled={picking || uploading}>
          {video ? (
            <View style={styles.videoChosen}>
              {thumbUri ? (
                <Image source={{ uri: thumbUri }} style={styles.preview} contentFit="cover" />
              ) : (
                <View style={[styles.preview, styles.previewEmpty]}>
                  <Ionicons name="videocam-outline" size={24} color="#666" />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.videoInfo}>
                  {[
                    formatClipDuration(video.durationSeconds),
                    compressed ? formatMb(compressed.sizeBytes) : formatMb(video.sizeBytes),
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Video selected'}
                </Text>
                <Text style={styles.change}>
                  {compressing
                    ? `Optimizing for upload… ${Math.round((compressProgress ?? 0) * 100)}%`
                    : compressed && compressed !== video && video.sizeBytes
                      ? `Optimized from ${formatMb(video.sizeBytes)}`
                      : uploading
                        ? ''
                        : 'Tap to choose a different video'}
                </Text>
              </View>
            </View>
          ) : picking ? (
            <ActivityIndicator color="#ff6600" />
          ) : (
            <View style={styles.videoEmpty}>
              <Ionicons name="film-outline" size={28} color="#ff6600" />
              <Text style={styles.videoEmptyText}>Choose a video</Text>
            </View>
          )}
        </Pressable>
        {tooBig ? <Text style={styles.error}>This video is over 500 MB. Trim it and try again.</Text> : null}

        {/* 2. Game */}
        <Text style={styles.label}>Game</Text>
        {eligibleGames.length === 0 ? (
          <Text style={styles.muted}>No games this season yet. Clips can be added to this season’s games from today or earlier.</Text>
        ) : (
          <View style={styles.games}>
            {visibleGames.map((g) => {
              const on = g.id === scheduleId;
              return (
                <Pressable
                  key={g.id}
                  style={[styles.gameRow, on && styles.gameRowOn]}
                  onPress={() => setScheduleId(g.id)}
                  disabled={uploading}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? '#ff6600' : '#555'} />
                  <View style={styles.flex}>
                    <Text style={styles.gameMatchup}>
                      {g.awayteam} @ {g.hometeam} <Text style={styles.gameNum}>· Game {g.gameid}</Text>
                    </Text>
                    <Text style={styles.gameDate}>{formatGameDate(g.gamedate)}</Text>
                  </View>
                </Pressable>
              );
            })}
            {visibleGames.length < eligibleGames.length ? (
              <Pressable onPress={() => setShowAllGames(true)} style={styles.moreGames}>
                <Text style={styles.moreGamesText}>Show {eligibleGames.length - visibleGames.length} earlier games</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* 3. Details */}
        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. 2nd period offside challenge"
          placeholderTextColor="#666"
          style={styles.input}
          maxLength={120}
          editable={!uploading}
        />
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Time in the period, what to look for…"
          placeholderTextColor="#666"
          style={[styles.input, styles.notes]}
          multiline
          maxLength={1000}
          editable={!uploading}
        />

        {/* 4. Tags */}
        <Text style={styles.label}>Tags {tags.length > 0 ? `(${tags.length})` : ''}</Text>
        <TagPicker categories={CLIP_TAG_CATEGORIES} selected={tags} onToggle={uploading ? () => {} : toggleTag} />

        {uploading ? (
          <View style={styles.progressBox}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(barFraction * 100)}%` }]} />
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {phase === 'compressing'
                  ? `Optimizing video… ${Math.round(barFraction * 100)}%`
                  : progress !== null && progress >= 1
                    ? 'Saving…'
                    : `Uploading… ${Math.round(barFraction * 100)}%`}
              </Text>
              <Pressable
                onPress={() => {
                  submitCancelledRef.current = true;
                  uploadRef.current?.cancel();
                }}
                hitSlop={8}
              >
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={[styles.submit, !canSubmit && styles.submitDisabled]} onPress={submit} disabled={!canSubmit}>
            <Text style={styles.submitText}>Upload Clip</Text>
          </Pressable>
        )}
        {!uploading && video && !canSubmit && !tooBig ? (
          <Text style={styles.hint}>
            {selectedIndex < 0 ? 'Pick a game. ' : ''}
            {title.trim() ? '' : 'Add a title. '}
            {tags.length ? '' : 'Pick at least one tag.'}
          </Text>
        ) : null}
        {uploading ? <Text style={styles.hint}>Your crew will be notified when the upload finishes.</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  label: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  videoPicker: {
    minHeight: 96,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#444',
    borderRadius: 12,
    justifyContent: 'center',
    padding: 12,
  },
  videoEmpty: {
    alignItems: 'center',
    gap: 6,
  },
  videoEmptyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  videoChosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preview: {
    width: 128,
    height: 72,
    borderRadius: 8,
  },
  previewEmpty: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoInfo: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  change: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  games: {
    gap: 6,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#111',
  },
  gameRowOn: {
    borderColor: '#ff6600',
  },
  gameMatchup: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  gameNum: {
    color: '#999',
    fontWeight: '400',
  },
  gameDate: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  moreGames: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  moreGamesText: {
    color: '#ff6600',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  notes: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  muted: {
    color: '#888',
    fontSize: 14,
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 6,
  },
  submit: {
    marginTop: 28,
    backgroundColor: '#ff6600',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  progressBox: {
    marginTop: 28,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#222',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff6600',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  cancel: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
