// Shown for any URL that matches no route -- mostly reached on web, where
// every path serves index.html and the router decides what exists.
import { Link, Stack } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FORM_MAX_WIDTH } from '@/src/lib/platform';

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Page not found · AHL Officials', headerShown: false }} />
      <View style={styles.inner}>
        <Image
          source={require('../../assets/images/icon-256.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
          alt=""
        />
        <Text style={styles.code} accessibilityRole="header">404</Text>
        <Text style={styles.title}>Offside.</Text>
        <Text style={styles.body}>
          This page doesn&apos;t exist or has moved. Check the address, or head back to your schedule.
        </Text>
        <Link href="/" replace asChild>
          <Pressable style={styles.button} accessibilityRole="link">
            <Text style={styles.buttonText}>Back to AHL Officials</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  inner: {
    width: '100%',
    maxWidth: FORM_MAX_WIDTH,
    alignItems: 'center',
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 24,
  },
  code: {
    color: '#ff6600',
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  body: {
    color: '#ccc',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 28,
  },
  button: {
    backgroundColor: '#ff6600',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonText: {
    // Black on #ff6600 is 7.8:1; white would be 2.9:1 and fail WCAG AA.
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
