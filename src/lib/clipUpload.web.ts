// src/lib/clipUpload.web.ts — browser. Native sibling: clipUpload.ts.
//
// expo-image-picker on web reads the whole file into a data: URI, which for a
// video means hundreds of MB of base64 in memory. A plain <input type="file">
// keeps the File object instead, and XHR uploads it with progress events.

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

// blob: URL -> the File/Blob it points at, so uploadFile can send the original.
const blobsByUri = new Map<string, Blob>();

export function pickVideo(): Promise<PickedVideo | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/x-m4v,video/webm';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const uri = URL.createObjectURL(file);
        blobsByUri.set(uri, file);
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        resolve({
          uri,
          durationSeconds: await readDuration(uri),
          sizeBytes: file.size,
          mimeType: file.type || 'video/mp4',
          ext,
        });
      } catch (e) {
        reject(e);
      }
    };
    // Some browsers fire no event at all on cancel; the promise just stays
    // pending, which is harmless for a one-shot picker.
    input.click();
  });
}

function readDuration(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => resolve(null);
    video.src = uri;
  });
}

export function makeThumbnail(video: PickedVideo): Promise<string | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.onloadeddata = () => {
      el.currentTime = video.durationSeconds && video.durationSeconds > 2 ? 1 : 0;
    };
    el.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 640 / (el.videoWidth || 640));
        canvas.width = Math.round((el.videoWidth || 640) * scale);
        canvas.height = Math.round((el.videoHeight || 360) * scale);
        canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(null);
            const uri = URL.createObjectURL(blob);
            blobsByUri.set(uri, blob);
            resolve(uri);
          },
          'image/jpeg',
          0.7,
        );
      } catch {
        resolve(null);
      }
    };
    el.onerror = () => resolve(null);
    el.src = video.uri;
  });
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
    const blob = blobsByUri.get(localUri) ?? (await (await fetch(localUri)).blob());
    const { data, error } = await supabase.storage.from(CLIPS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error('Could not start upload');
    if (cancelled) throw new Error('Upload cancelled');

    await new Promise<void>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      xhr.open('PUT', data.signedUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr!.status >= 200 && xhr!.status < 300) return resolve();
        let message = `Upload failed (${xhr!.status})`;
        try {
          const body = JSON.parse(xhr!.responseText);
          if (body?.message) message = body.message;
        } catch {
          // keep the status message
        }
        reject(new Error(message));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(blob);
    });
    onProgress?.(1);
    blobsByUri.delete(localUri);
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      xhr?.abort();
    },
  };
}
