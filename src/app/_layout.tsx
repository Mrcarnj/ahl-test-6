// app/_layout.tsx
// Polyfills for Node.js modules - must be imported before any other modules
import "react-native-url-polyfill/auto";
// import { Buffer } from 'buffer';
// import process from 'process';

// // Make Buffer and process available globally
// global.Buffer = Buffer;
// global.process = process;

import { Stack } from "expo-router";
import AuthProvider from "../providers/AuthProvider";
import { useAuth } from "../providers/AuthProvider";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";

const RootLayoutNav = () => {
  const { session } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={session !== null}>
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
