// app/(protected)/official/[rosterId].tsx
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OfficialDetails from '@/src/components/OfficialDetails';

const Details = () => {
    const { rosterId } = useLocalSearchParams<{ rosterId: string; source: string }>();

    return (
        <SafeAreaView style={styles.safeArea}>
            <OfficialDetails rosterId={parseInt(rosterId)} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#000',
    },
});

export default Details;
