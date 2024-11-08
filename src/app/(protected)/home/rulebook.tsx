// app/(protected)/drawer/rulebook.tsx
import { View, StyleSheet, Text, Image } from 'react-native';
import React from 'react';

export default function Rulebook() {
    return (
        <View style={styles.container}>
            <View style={styles.placeholderContainer}>
                <Text style={styles.text}>Rulebook PDF will appear here</Text>
                <Text style={styles.subText}>This is a placeholder for development in Expo Go</Text>
                {/* Optional: Add a placeholder image */}
                <Image 
                    source={{ uri: 'https://via.placeholder.com/300x400?text=PDF+Preview' }}
                    style={styles.placeholderImage}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    placeholderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    text: {
        color: '#fff',
        fontSize: 20,
        marginBottom: 10,
    },
    subText: {
        color: '#666',
        fontSize: 14,
        marginBottom: 20,
    },
    placeholderImage: {
        width: 300,
        height: 400,
        borderRadius: 8,
    }
});