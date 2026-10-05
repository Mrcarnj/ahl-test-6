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
import { Video } from 'react-native-compressor';
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
    // Hand over the original (trimmed at full quality); compressVideo does the
    // real compression. The picker's own presets were tried first and are a
    // poor fit: "640x480" fits *inside* 640x480, so a portrait clip came out
    // 296 px wide, and it still ran ~3.5 Mbps at 60 fps (15 MB per 30 s).
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
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

// Target for uploaded clips: 480p (long edge 854) H.264 at 1.5 Mbps, frame
// rate kept (max 60). Measured on a 32 s, 61 MB 60 fps iPhone recording:
// 6.2 MB, against 4.3 MB at 1.0 Mbps (smears on fast plays) and 10.1 MB for
// 720p at 2.5 Mbps.
const CLIP_MAX_EDGE = 854;
const CLIP_BITRATE = 1_500_000;

export type CompressHandle = {
  promise: Promise<PickedVideo>;
  cancel: () => void;
};

/**
 * Re-encodes a picked clip to the upload target. Output is H.264 MP4, which
 * also fixes iPhone HEVC that Android and most browsers can't play. A clip
 * already at or under the target bitrate is returned as-is, since
 * re-encoding it would only make it bigger.
 */
export function compressVideo(video: PickedVideo, onProgress?: (fraction: number) => void): CompressHandle {
  let cancellationId: string | null = null;
  let cancelled = false;

  const promise = (async (): Promise<PickedVideo> => {
    const sourceBitrate =
      video.sizeBytes && video.durationSeconds ? (video.sizeBytes * 8) / video.durationSeconds : null;
    if (sourceBitrate !== null && sourceBitrate <= CLIP_BITRATE * 1.15 && video.ext === 'mp4') {
      onProgress?.(1);
      return video;
    }
    const uri = await Video.compress(
      video.uri,
      {
        compressionMethod: 'manual',
        maxSize: CLIP_MAX_EDGE,
        bitrate: CLIP_BITRATE,
        progressDivider: 2,
        getCancellationId: (id) => {
          cancellationId = id;
        },
      },
      (p) => onProgress?.(Math.min(Math.max(p, 0), 1)),
    );
    if (cancelled) throw new Error('Compression cancelled');
    const info = await FileSystem.getInfoAsync(uri);
    onProgress?.(1);
    return {
      uri,
      durationSeconds: video.durationSeconds,
      sizeBytes: info.exists ? info.size ?? null : null,
      mimeType: 'video/mp4',
      ext: 'mp4',
    };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (cancellationId) Video.cancelCompression(cancellationId);
    },
  };
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
