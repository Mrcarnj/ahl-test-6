// src/lib/clipUpload.ts — native. Web sibling: clipUpload.web.ts.
//
// Picks a video from the library, makes a thumbnail on the device, and PUTs
// both to a signed upload URL.
//
// Uploads go through React Native's XMLHttpRequest with a `{ uri }` body: the
// file is loaded on the native side (never into JS memory; the 500 MB cap
// keeps that reasonable) and `xhr.upload.onprogress` reports real progress. expo-file-system's createUploadTask was used first,
// but its progress callback never fired here — the bar sat at 0% and jumped
// to done — in both background and foreground sessions.

import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { CLIPS_BUCKET } from './clips';
import { supabase } from './supabase';

export type PickedVideo = {
  uri: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  mimeType: string;
  ext: string;
};

export type UploadHandle = {
  promise: Promise<void>;
  cancel: () => void;
};

export async function pickVideo(): Promise<PickedVideo | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Allow photo library access in Settings to upload clips.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    // iOS: the trim editor, so officials can cut a clip down before it uploads.
    allowsEditing: true,
    // iOS: transcode to H.264 at 640x480 (fit within, aspect kept). iPhones
    // record HEVC, which Android and most browsers can't play, and 480p is
    // plenty for reviewing a play at a fraction of the size (a few MB per
    // 10 s instead of ~15 MB at full quality).
    //
    // Both settings are needed. allowsEditing uses UIImagePickerController,
    // which encodes a trimmed clip with `videoQuality` and ignores
    // `videoExportPreset` — with only the preset set (and videoQuality left at
    // its High default) clips uploaded uncompressed at ~12 Mbps.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_640x480,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.VGA640x480,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  let sizeBytes = asset.fileSize ?? null;
  if (sizeBytes == null) {
    const info = await FileSystem.getInfoAsync(asset.uri);
    sizeBytes = info.exists ? info.size ?? null : null;
  }
  const ext = (asset.uri.split('?')[0].split('.').pop() || 'mp4').toLowerCase();
  return {
    uri: asset.uri,
    durationSeconds: asset.duration != null ? asset.duration / 1000 : null,
    sizeBytes,
    mimeType: asset.mimeType ?? mimeForExt(ext),
    ext,
  };
}

function mimeForExt(ext: string): string {
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

/** A JPEG of a frame one second in (or the first frame for very short clips). */
export async function makeThumbnail(video: PickedVideo): Promise<string | null> {
  try {
    const time = video.durationSeconds && video.durationSeconds > 2 ? 1000 : 0;
    const { uri } = await VideoThumbnails.getThumbnailAsync(video.uri, { time, quality: 0.6 });
    return uri;
  } catch (e) {
    console.warn('⚠️ CLIPS: Thumbnail failed:', e);
    return null;
  }
}

export function uploadFile(
  path: string,
  localUri: string,
  contentType: string,
  onProgress?: (fraction: number) => void,
): UploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const promise = (async () => {
    const { data, error } = await supabase.storage.from(CLIPS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error('Could not start upload');
    if (cancelled) throw new Error('Upload cancelled');

    await new Promise<void>((resolve, reject) => {
      const req = new XMLHttpRequest();
      xhr = req;
      req.open('PUT', data.signedUrl);
      req.setRequestHeader('Content-Type', contentType);
      req.setRequestHeader('x-upsert', 'false');
      req.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
      };
      req.onload = () => {
        if (req.status >= 200 && req.status < 300) return resolve();
        let message = `Upload failed (${req.status})`;
        try {
          const body = JSON.parse(req.responseText);
          if (body?.message) message = body.message;
        } catch {
          // keep the status message
        }
        reject(new Error(message));
      };
      req.onerror = () => reject(new Error('Network error during upload'));
      req.onabort = () => reject(new Error('Upload cancelled'));
      // RN's XHR accepts `{ uri }` and reads the file natively; the DOM
      // typings don't know about it.
      req.send({ uri: localUri } as unknown as XMLHttpRequestBodyInit);
    });
    onProgress?.(1);
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      xhr?.abort();
    },
  };
}
