// app/(protected)/home/_layout.tsx
import { useRoster } from "@/src/providers/RosterProvider";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { View, Text } from 'react-native';

const HeaderTitle = () => {
    const { roster } = useRoster();
    
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: '#ffffff', fontSize: 20 }}>
                Welcome, {roster?.firstname}
            </Text>
            <MaterialCommunityIcons 
                name="whistle" 
                size={26} 
                color="#ff6600" 
                style={{ marginLeft: 8 }} 
            />
        </View>
    );
};

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="index" 
          options={{
            headerShown: true,
            headerTitle: HeaderTitle,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen 
          name="[gameId]" 
          options={{
            headerTitle: "Game Details",
            headerShown: true,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen 
          name="rulebook" 
          options={{
            headerTitle: "Rulebook",
            headerShown: true,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen 
          name="SituationBook" 
          options={{
            headerTitle: "Situation Book",
            headerShown: true,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#ffffff',
          }}
        />
    </Stack>
  );
}