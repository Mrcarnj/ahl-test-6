// Edit a clip's title, notes and tags. Open to the uploader and admins only —
// the same rule as delete, enforced by RLS (sql/2026-10-05_clips_edit.sql).
// The video and the game it belongs to can't be changed; that's a new upload.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
  type Clip,
  CLIP_TAG_CATEGORIES,
  CLIP_TAGS,
  type ClipTagCategory,
  fetchClip,
  formatGameShort,
  updateClip,
} from '@/src/lib/clips';
import { useClips } from '@/src/providers/ClipsProvider';
import { useRoster } from '@/src/providers/RosterProvider';

// Matches the table's check constraint on `tags`.
const MAX_TAGS = 20;

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));

export default function EditClipScreen() {
  const { clipId } = useLocalSearchParams<{ clipId: string }>();
  const { clips, isAdmin, replaceClip } = useClips();
  const { roster } = useRoster();

  const listed = clips.find((c) => c.id === clipId) ?? null;
  const [fetched, setFetched] = useState<Clip | null>(null);
  const [missing, setMissing] = useState(false);
  const clip = listed ?? fetched;

  // Opened before the list has it.
  useEffect(() => {
    if (listed || !clipId) return;
    fetchClip(clipId)
      .then((c) => (c ? setFetched(c) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [listed, clipId]);

  // The form is filled from the clip once, so a Realtime refresh of the same
  // clip doesn't wipe out what's being typed.
  const [form, setForm] = useState<{ title: string; notes: string; tags: string[] } | null>(null);
  useEffect(() => {
    if (clip && !form) setForm({ title: clip.title, notes: clip.notes ?? '', tags: clip.tags });
  }, [clip, form]);

  const [saving, setSaving] = useState(false);

  if (!clip || !form) {
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

  if (clip.uploaded_by !== roster?.auth_id && !isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Only the official who uploaded this clip, or an admin, can edit it.</Text>
      </View>
    );
  }

  // Tags since retired from the preset lists stay on the clip and stay
  // pickable (under "Other"), so an edit doesn't quietly drop them.
  const retired = clip.tags.filter((t) => !(CLIP_TAGS as readonly string[]).includes(t));
  const tagChoices: readonly ClipTagCategory[] = retired.length
    ? [...CLIP_TAG_CATEGORIES, { name: 'Other', tags: retired }]
    : CLIP_TAG_CATEGORIES;

  const title = form.title.trim();
  const notes = form.notes.trim();
  const changed =
    title !== clip.title || notes !== (clip.notes ?? '') || !sameTags(form.tags, clip.tags);
  const canSave = changed && title.length > 0 && form.tags.length > 0 && !saving;

  const toggleTag = (t: string) => {
    if (saving) return;
    setForm((f) => {
      if (!f) return f;
      if (f.tags.includes(t)) return { ...f, tags: f.tags.filter((x) => x !== t) };
      if (f.tags.length >= MAX_TAGS) return f;
      return { ...f, tags: [...f.tags, t] };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateClip(clip.id, { title, notes: notes || null, tags: form.tags });
      replaceClip(updated);
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/(protected)/(tabs)/clips/[clipId]', params: { clipId: clip.id } });
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save changes', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.game} numberOfLines={2}>
          {formatGameShort(clip.game)}
        </Text>

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={form.title}
          onChangeText={(v) => setForm((f) => (f ? { ...f, title: v } : f))}
          placeholder="e.g. 2nd period offside challenge"
          placeholderTextColor="#666"
          style={styles.input}
          maxLength={120}
          editable={!saving}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          value={form.notes}
          onChangeText={(v) => setForm((f) => (f ? { ...f, notes: v } : f))}
          placeholder="Time in the period, what to look for…"
          placeholderTextColor="#666"
          style={[styles.input, styles.notes]}
          multiline
          maxLength={1000}
          editable={!saving}
        />

        <Text style={styles.label}>Tags {form.tags.length > 0 ? `(${form.tags.length})` : ''}</Text>
        <TagPicker categories={tagChoices} selected={form.tags} onToggle={toggleTag} />

        <Pressable style={[styles.submit, !canSave && styles.submitDisabled]} onPress={save} disabled={!canSave}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>Save Changes</Text>}
        </Pressable>
        {!saving && changed && !canSave ? (
          <Text style={styles.hint}>
            {title ? '' : 'Add a title. '}
            {form.tags.length ? '' : 'Pick at least one tag.'}
          </Text>
        ) : null}
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
  center: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  muted: {
    color: '#888',
    textAlign: 'center',
  },
  game: {
    color: '#999',
    fontSize: 14,
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
});
