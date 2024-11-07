import { Button, Text, View, StyleSheet } from "react-native";
import { useAuth } from "../providers/AuthProvider";
import { Redirect } from "expo-router";
import { supabase } from "../lib/supabase";

export default function Index() {
  const { session, user } = useAuth();

  if (!user) {
    return <Redirect href="../login" />;
  }

}
