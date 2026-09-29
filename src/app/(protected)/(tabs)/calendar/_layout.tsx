// app/(protected)/(tabs)/calendar/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { TouchableOpacity } from 'react-native';
import { shareImage } from '@/src/lib/shareImage';

declare global {
  var captureCalendar: (() => Promise<string | null>) | undefined;
}
 

export default function HomeLayout() {
  const shareCalendar = async () => {
    try {
      // Capture the screenshot (this will be implemented in the index.tsx file)
      if (global.captureCalendar) {
        const uri = await global.captureCalendar();
        if (uri) {
          await shareImage(uri);
        }
      } else {
        console.error('captureCalendar function not found');
      }
    } catch (error) {
      console.error('Error sharing calendar:', error);
    }
  };


  return (
    <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="index" 
          options={{
            headerTitle: "Calendar",
            headerShown: true,
            headerRight: () => (
              <TouchableOpacity onPress={shareCalendar} style={{ marginRight: 15 }}>
                <Ionicons name="share-outline" size={24} color="#ff6600" />
              </TouchableOpacity>
            ),
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
    </Stack>
  );
}
