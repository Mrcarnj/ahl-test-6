// src/lib/fetchImageBase64.ts
//
// Native implementation: download to the cache directory, then read it back as
// base64. See fetchImageBase64.web.ts for the browser version.

import * as FileSystem from 'expo-file-system/legacy';

export async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const cacheDir = FileSystem.cacheDirectory ?? '';
    const fileUri = `${cacheDir}temp_contact_photo.jpg`;
    const download = await FileSystem.downloadAsync(url, fileUri);
    if (download.status !== 200) return null;

    return await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    console.error('Error fetching photo:', error);
    return null;
  }
}
