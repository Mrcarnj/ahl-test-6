// app/_layout.tsx
import "react-native-url-polyfill/auto";
import { Stack } from "expo-router";
import AuthProvider, { useAuth } from "../providers/AuthProvider";

const RootLayoutNav = () => {
  const { session, recoveringPassword } = useAuth();
  // A password reset signs in before the new password is set; stay on (auth)
  // until it is.
  const signedIn = session !== null && !recoveringPassword;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
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
