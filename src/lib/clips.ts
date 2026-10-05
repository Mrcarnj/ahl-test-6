// src/lib/clips.ts
//
// Game clips: rows in `clips`, files in the private `clips` bucket at
// `{schedule_id}/{clip_id}.{ext}` (+ `.jpg` thumbnail). Who can see what is
// decided by RLS (sql/2026-10-04_clips.sql): the game's crew and admins.
// Uploading lives in clipUpload.ts / clipUpload.web.ts.

import { supabase } from './supabase';

export const CLIPS_BUCKET = 'clips';

/**
 * The only tags a clip can carry. Edit this list to change what officials can
 * pick; existing clips keep whatever tags they were saved with.
 */
export const CLIP_TAGS = [
  'Goal Review',
  'Goaltender Interference',
  'Offside',
  'Icing',
  'Too Many Men',
  'Hand Pass',
  'High Stick (Puck)',
  'Boarding',
  'Charging',
  'Checking from Behind',
  'Cross-Checking',
  'Elbowing',
  'Fighting',
  'Head Contact',
  'High-Sticking',
  'Holding',
  'Hooking',
  'Interference',
  'Roughing',
  'Slashing',
  'Tripping',
  'Delay of Game',
  'Unsportsmanlike',
  'Abuse of Officials',
  'Faceoff',
  'Positioning',
  'Good Call',
  'Missed Call',
  'Training',
] as const;

export type ClipTag = (typeof CLIP_TAGS)[number];

export type ClipGame = {
  id: number;
  gameid: string;
  gamedate: string;
  gametime: string;
  awayteam: string;
  hometeam: string;
  season: string;
};

export type Clip = {
  id: string;
  schedule_id: number;
  uploaded_by: string;
  uploader_name: string;
  title: string;
  notes: string | null;
  tags: string[];
  video_path: string;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  created_at: string;
  /** Joined from `schedule`; admins see clips of games outside their own schedule. */
  game: ClipGame | null;
};

const CLIP_SELECT =
  'id, schedule_id, uploaded_by, uploader_name, title, notes, tags, video_path, ' +
  'thumbnail_path, duration_seconds, size_bytes, created_at, ' +
  'game:schedule_id (id, gameid, gamedate, gametime, awayteam, hometeam, season)';

// Newest first. Far more than any official's crew will build up in a season;
// paging can come later if admins ever need more.
const CLIP_LIST_LIMIT = 1000;

export async function fetchClips(): Promise<Clip[]> {
  const { data, error } = await supabase
    .from('clips')
    .select(CLIP_SELECT)
    .order('created_at', { ascending: false })
    .limit(CLIP_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as Clip[];
}

export async function fetchClip(id: string): Promise<Clip | null> {
  const { data, error } = await supabase
    .from('clips')
    .select(CLIP_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Clip | null) ?? null;
}

export type NewClip = {
  id: string;
  schedule_id: number;
  title: string;
  notes: string | null;
  tags: string[];
  video_path: string;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
};

export async function insertClip(clip: NewClip): Promise<Clip> {
  const { data, error } = await supabase
    .from('clips')
    .insert(clip)
    .select(CLIP_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Clip;
}

/** Removes the files, then the row. The row is what everyone's list reads. */
export async function deleteClip(clip: Pick<Clip, 'id' | 'video_path' | 'thumbnail_path'>): Promise<void> {
  const paths = [clip.video_path, clip.thumbnail_path].filter((p): p is string => !!p);
  const { error: storageError } = await supabase.storage.from(CLIPS_BUCKET).remove(paths);
  if (storageError) console.warn('⚠️ CLIPS: Could not remove clip files:', storageError);
  const { error } = await supabase.from('clips').delete().eq('id', clip.id);
  if (error) throw error;
  forgetSignedUrls(paths);
}

// ------------------------------------------------------------ signed URLs --
// The bucket is private, so every file is read through a signed URL. They are
// cached in memory until shortly before they expire, and thumbnails are signed
// in one batch call for the whole list rather than one request per row.

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;
const SIGNED_URL_REFRESH_MARGIN_MS = 10 * 60 * 1000;
const SIGN_BATCH_SIZE = 100;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function cachedUrl(path: string): string | null {
  const hit = signedUrlCache.get(path);
  return hit && hit.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS > Date.now() ? hit.url : null;
}

function forgetSignedUrls(paths: string[]) {
  paths.forEach((p) => signedUrlCache.delete(p));
}

export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of new Set(paths)) {
    const url = cachedUrl(p);
    if (url) out[p] = url;
    else missing.push(p);
  }
  for (let i = 0; i < missing.length; i += SIGN_BATCH_SIZE) {
    const { data, error } = await supabase.storage
      .from(CLIPS_BUCKET)
      .createSignedUrls(missing.slice(i, i + SIGN_BATCH_SIZE), SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signedUrlCache.set(item.path, { url: item.signedUrl, expiresAt });
        out[item.path] = item.signedUrl;
      }
    }
  }
  return out;
}

export async function getSignedUrl(path: string): Promise<string> {
  const urls = await getSignedUrls([path]);
  const url = urls[path];
  if (!url) throw new Error('Clip file not found');
  return url;
}

// ------------------------------------------------------------- crew alert --

/**
 * Pushes "new clip" to the rest of the game's crew (native only — web has no
 * push tokens). Crew members with the app open also hear about it through the
 * Realtime subscription in ClipsProvider; NotificationProvider shows it once.
 */
export async function sendClipUploadedNotification(clip: Clip): Promise<void> {
  try {
    const game = clip.game;
    if (!game) return;
    const { data: crewGame, error: gameError } = await supabase
      .from('schedule')
      .select('referee1, referee2, linesperson1, linesperson2')
      .eq('id', clip.schedule_id)
      .single();
    if (gameError || !crewGame) return;

    const names = [crewGame.referee1, crewGame.referee2, crewGame.linesperson1, crewGame.linesperson2]
      .filter((n): n is string => !!n && n !== clip.uploader_name);
    if (names.length === 0) return;

    const { data: crew } = await supabase.from('roster').select('auth_id').in('lastfirstfullname', names);
    const authIds = (crew ?? []).map((r) => r.auth_id).filter((id) => id && id !== clip.uploaded_by);
    if (authIds.length === 0) return;

    const { data: tokens } = await supabase
      .from('user_push_tokens')
      .select('push_token')
      .in('auth_id', authIds);
    if (!tokens || tokens.length === 0) return;

    const { title, body } = clipAlertText(clip);
    const messages = tokens.map((t) => ({
      to: t.push_token,
      sound: 'default',
      title,
      body,
      priority: 'high',
      android: { channelId: 'game_changes', priority: 'high', sound: 'default' },
      data: {
        type: 'clip_uploaded',
        clipId: clip.id,
        scheduleId: String(clip.schedule_id),
      },
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.warn('⚠️ CLIPS: Could not send clip notification:', e);
  }
}

// --------------------------------------------------------------- display --

/** "Dietrich, Mike" -> "Mike Dietrich". */
export function displayName(lastFirst: string): string {
  const [last, first] = lastFirst.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : lastFirst;
}

export function formatClipDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatGameShort(game: ClipGame | null): string {
  if (!game) return 'Unknown game';
  const [y, m, d] = game.gamedate.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date} · Game ${game.gameid} · ${game.awayteam} @ ${game.hometeam}`;
}

export function clipAlertText(clip: Pick<Clip, 'uploader_name' | 'title' | 'game'>): { title: string; body: string } {
  return {
    title: '🎬 New Clip',
    body: `${displayName(clip.uploader_name)} uploaded "${clip.title}" to ${formatGameShort(clip.game)}.`,
  };
}

/** Random v4-style id, used as both the row id and the file name. */
export function newClipId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
