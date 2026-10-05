// src/providers/ClipsProvider.tsx
//
// Every clip this official can see (their own games' crews, or everything for
// admins), kept fresh three ways:
//   * a cached copy in AsyncStorage, so the Clips tab renders instantly;
//   * a fetch on startup and on each return to the app (APP_REFRESH_EVENT);
//   * a Realtime subscription for clips added or deleted while open.
//
// Each load is also compared with the newest clip the official has already
// been told about (persisted per user). Clips another crew member added to one
// of this official's games since then go out as CLIPS_UPLOADED_EVENT, which
// NotificationProvider turns into the "New Clip" pop-up. The first load on a
// device only records a baseline.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { APP_REFRESH_EVENT, CLIPS_UPLOADED_EVENT } from '../lib/events';
import { Clip, fetchClip, fetchClips } from '../lib/clips';
import { supabase } from '../lib/supabase';
import { useRoster } from './RosterProvider';

type ClipsContextType = {
  clips: Clip[];
  /** False until the first cached or fetched list lands. */
  loaded: boolean;
  refreshing: boolean;
  error: string | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  /** Put a just-uploaded clip in the list without waiting for a refetch. */
  addClip: (clip: Clip) => void;
  removeClip: (id: string) => void;
};

const ClipsContext = createContext<ClipsContextType>({
  clips: [],
  loaded: false,
  refreshing: false,
  error: null,
  isAdmin: false,
  refresh: async () => {},
  addClip: () => {},
  removeClip: () => {},
});

const cacheKey = (authId: string) => `clipsCache_v1_${authId}`;
const seenKey = (authId: string) => `clipsSeenAt_v1_${authId}`;

const BEFORE_ANY_CLIP = '1970-01-01T00:00:00+00:00';

const byNewest = (a: Clip, b: Clip) => b.created_at.localeCompare(a.created_at);

export default function ClipsProvider({ children }: PropsWithChildren) {
  const { roster } = useRoster();
  const authId = roster?.auth_id ?? null;
  const myName = roster?.lastfirstfullname ?? null;
  const isAdmin = !!(roster?.isAdmin || roster?.ahlAdmin);

  const [clips, setClips] = useState<Clip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  /**
   * Clips by someone else on a game this official is crew on. Read from the
   * clip's joined game rather than the schedule list, so it also works for a
   * game that has dropped out of the loaded schedule.
   */
  const isCrewClipFromOthers = useCallback(
    async (list: Clip[]): Promise<Clip[]> => {
      if (!authId || !myName) return [];
      const others = list.filter((c) => c.uploaded_by !== authId);
      if (others.length === 0) return [];
      const ids = [...new Set(others.map((c) => c.schedule_id))];
      const { data } = await supabase
        .from('schedule')
        .select('id, referee1, referee2, linesperson1, linesperson2')
        .in('id', ids);
      const mine = new Set(
        (data ?? [])
          .filter((g) => [g.referee1, g.referee2, g.linesperson1, g.linesperson2].includes(myName))
          .map((g) => g.id as number),
      );
      return others.filter((c) => mine.has(c.schedule_id));
    },
    [authId, myName],
  );

  /** Emits anything newer than the stored watermark, then advances it. */
  const announceNew = useCallback(
    async (list: Clip[]) => {
      if (!authId) return;
      const newest = list.reduce((max, c) => (c.created_at > max ? c.created_at : max), '');
      const seenAt = await AsyncStorage.getItem(seenKey(authId)).catch(() => null);
      if (!seenAt) {
        // Baseline. With no clips yet, mark "seen nothing" so the very first
        // crew clip still alerts.
        await AsyncStorage.setItem(seenKey(authId), newest || BEFORE_ANY_CLIP).catch(() => {});
        return;
      }
      const fresh = list.filter((c) => c.created_at > seenAt);
      if (fresh.length === 0) return;
      await AsyncStorage.setItem(seenKey(authId), newest > seenAt ? newest : seenAt).catch(() => {});
      const toAnnounce = await isCrewClipFromOthers(fresh);
      if (toAnnounce.length > 0) DeviceEventEmitter.emit(CLIPS_UPLOADED_EVENT, toAnnounce);
    },
    [authId, isCrewClipFromOthers],
  );

  const refresh = useCallback(async () => {
    if (!authId) return;
    const seq = ++loadSeqRef.current;
    setRefreshing(true);
    try {
      const list = await fetchClips();
      if (seq !== loadSeqRef.current) return;
      setClips(list);
      setError(null);
      setLoaded(true);
      void AsyncStorage.setItem(cacheKey(authId), JSON.stringify(list)).catch(() => {});
      void announceNew(list);
    } catch (e) {
      console.error('❌ CLIPS: Load failed:', e);
      if (seq === loadSeqRef.current) setError(e instanceof Error ? e.message : 'Could not load clips');
    } finally {
      if (seq === loadSeqRef.current) setRefreshing(false);
    }
  }, [authId, announceNew]);

  // Cached list first, then the network.
  useEffect(() => {
    if (!authId) {
      setClips([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey(authId));
        if (!cancelled && cached) {
          setClips(JSON.parse(cached));
          setLoaded(true);
        }
      } catch {
        // a bad cache just means waiting for the network
      }
      if (!cancelled) void refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [authId, refresh]);

  useEffect(() => {
    if (!authId) return;
    const sub = DeviceEventEmitter.addListener(APP_REFRESH_EVENT, () => void refresh());
    return () => sub.remove();
  }, [authId, refresh]);

  // RLS applies to Realtime, so only clips this official may see arrive here.
  useEffect(() => {
    if (!authId) return;
    const channel = supabase
      .channel('clips-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clips' }, async (payload) => {
        const id = (payload.new as { id?: string })?.id;
        if (!id) return;
        try {
          // The payload has no joined game, so read the row back.
          const clip = await fetchClip(id);
          if (!clip) return;
          setClips((prev) => (prev.some((c) => c.id === clip.id) ? prev : [clip, ...prev].sort(byNewest)));
          void announceNew([clip]);
        } catch (e) {
          console.warn('⚠️ CLIPS: Realtime insert fetch failed:', e);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clips' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (id) setClips((prev) => prev.filter((c) => c.id !== id));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authId, announceNew]);

  // Keep the cache in step with local adds/removes too.
  useEffect(() => {
    if (!authId || !loaded) return;
    void AsyncStorage.setItem(cacheKey(authId), JSON.stringify(clips)).catch(() => {});
  }, [authId, loaded, clips]);

  const addClip = useCallback((clip: Clip) => {
    setClips((prev) => (prev.some((c) => c.id === clip.id) ? prev : [clip, ...prev].sort(byNewest)));
  }, []);

  const removeClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(
    () => ({ clips, loaded, refreshing, error, isAdmin, refresh, addClip, removeClip }),
    [clips, loaded, refreshing, error, isAdmin, refresh, addClip, removeClip],
  );

  return <ClipsContext.Provider value={value}>{children}</ClipsContext.Provider>;
}

export const useClips = () => useContext(ClipsContext);
