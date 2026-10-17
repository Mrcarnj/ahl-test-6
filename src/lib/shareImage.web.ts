// src/lib/shareImage.web.ts
//
// Browser implementation of shareImage. react-native-view-shot renders through
// html2canvas on web and returns a data URL, so convert that to a File and use
// the Web Share API where it exists (mobile Safari, Android Chrome), falling
// back to a plain download on desktop.

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

function download(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function shareImage(uri: string, filename = 'calendar.jpg') {
  try {
    const file = await dataUrlToFile(uri, filename);

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'AHL Officials Calendar' });
      return;
    }
  } catch (error) {
    // AbortError just means the user dismissed the share sheet.
    if ((error as Error)?.name === 'AbortError') return;
    console.error('Share failed, falling back to download:', error);
  }

  download(uri, filename);
}
