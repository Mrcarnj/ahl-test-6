// app/_layout.tsx
import "react-native-url-polyfill/auto";
import { Stack } from "expo-router";
import AuthProvider, { useAuth } from "../providers/AuthProvider";

const RootLayoutNav = () => {
  const { session, initializing, recoveringPassword } = useAuth();
  // A password reset signs in before the new password is set; stay on (auth)
  // until it is.
  const signedIn = session !== null && !recoveringPassword;
  // Until the stored session is read, neither group is open, so only index
  // (a spinner) can show: no flash of the login screen on every launch, and
  // no redirect there while the session is still loading.

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!initializing && !signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!initializing && signedIn}>
        <Stack.Screen name="(loginflow)" />
        <Stack.Screen name="(protected)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
