import { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  TURNSTILE_ACTION,
  TURNSTILE_PAGE_URL,
  TURNSTILE_SITE_KEY,
  type TurnstileHandle,
  type TurnstileProps,
} from '@/src/lib/turnstile';

// Native: render the widget inside a WebView pointed at public/turnstile.html
// on the web deployment, which posts the token back through postMessage.
const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile({ onToken }, ref) {
  const [generation, setGeneration] = useState(0);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onToken(null);
      setGeneration((g) => g + 1); // remount = fresh challenge
    },
  }));

  if (!TURNSTILE_SITE_KEY) return null;

  const uri =
    `${TURNSTILE_PAGE_URL}?sitekey=${encodeURIComponent(TURNSTILE_SITE_KEY)}` +
    `&action=${encodeURIComponent(TURNSTILE_ACTION)}`;

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      onToken(msg.type === 'token' && typeof msg.token === 'string' ? msg.token : null);
    } catch {
      onToken(null);
    }
  };

  return (
    <View style={styles.frame}>
      <WebView
        key={generation}
        source={{ uri }}
        onMessage={onMessage}
        onError={() => onToken(null)}
        originWhitelist={['https://*']}
        javaScriptEnabled
        scrollEnabled={false}
        style={styles.webview}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { height: 70, marginTop: 8, overflow: 'hidden' },
  webview: { backgroundColor: 'transparent' },
});

export default Turnstile;
