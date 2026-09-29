// src/lib/fetchImageBase64.web.ts
//
// Browser implementation: there is no filesystem to stage the download in, so
// read the response straight out of the blob.

export async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });

    // Strip the `data:<mime>;base64,` prefix to match the native return value.
    const commaIndex = dataUrl.indexOf(',');
    return commaIndex === -1 ? null : dataUrl.slice(commaIndex + 1);
  } catch (error) {
    console.error('Error fetching photo:', error);
    return null;
  }
}
