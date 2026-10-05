import { useEffect, useMemo, useState } from 'react';
import { type Clip, getSignedUrls } from '@/src/lib/clips';

/**
 * Signed thumbnail URLs for a list of clips, fetched in one batch. URLs are
 * cached in clips.ts, so revisiting a screen costs nothing; the images
 * themselves are disk-cached by expo-image under the storage path.
 */
export function useThumbnailUrls(clips: Clip[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const paths = useMemo(
    () => clips.map((c) => c.thumbnail_path).filter((p): p is string => !!p),
    [clips],
  );
  const key = paths.join('|');

  useEffect(() => {
    if (paths.length === 0) return;
    let cancelled = false;
    getSignedUrls(paths)
      .then((next) => {
        if (!cancelled) setUrls((prev) => ({ ...prev, ...next }));
      })
      .catch((e) => console.warn('⚠️ CLIPS: Thumbnail URLs failed:', e));
    return () => {
      cancelled = true;
    };
    // `key` stands in for `paths`, which is a new array on every clips change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
