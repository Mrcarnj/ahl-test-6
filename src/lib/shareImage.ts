// src/lib/shareImage.ts
//
// Native implementation: hand the captured file to the OS share sheet. See
// shareImage.web.ts for the browser version.

import * as Sharing from 'expo-sharing';

export async function shareImage(uri: string, filename = 'calendar.jpg') {
  if (!(await Sharing.isAvailableAsync())) {
    console.warn('Sharing is not available on this device');
    return;
  }
  await Sharing.shareAsync(uri, { UTI: 'public.jpeg', mimeType: 'image/jpeg' });
}
