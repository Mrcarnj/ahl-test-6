// app/(protected)/(tabs)/roster/details.tsx
import { View, Text, StyleSheet, ScrollView, Image, Alert, Linking, TouchableOpacity } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { getOfficialPhoto, useRoster } from '@/src/providers/RosterProvider';
import { FontAwesome, FontAwesome6, AntDesign } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

const Details = () => {
    const { rosterId } = useLocalSearchParams<{ rosterId: string }>();
    const { allRosters } = useRoster();

    const selectedRoster = allRosters.find(r => r.id === parseInt(rosterId));

    const cleanPhoneNumber = (phone: string) => {
        // Remove all non-numeric characters
        return phone.replace(/\D/g, '');
    };

    const copyToClipboard = async (email: string) => {
        await Clipboard.setStringAsync(email);
        Alert.alert(
            "Success",
            "Email copied to clipboard!",
            [
                { text: "Close", style: "default" }
            ]
        );
    };


    if (!selectedRoster) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <Text style={styles.loadingText}>Official not found</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
                <Image
                    source={ selectedRoster.photo ?
                        { uri: selectedRoster.photo }
                        : require('../../../../../assets/images/noPhoto.png')
                    }
                    style={styles.profileImage}
                    defaultSource={{ uri: selectedRoster.photo }}
                />
                <Text style={styles.name}>
                    {selectedRoster.firstname} {selectedRoster.lastname}
                </Text>

                <View style={styles.infoSection}>
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value}>{selectedRoster.email}</Text>
                            <TouchableOpacity
                                onPress={() => copyToClipboard(selectedRoster.email)}
                                style={styles.iconButton}
                            >
                                <FontAwesome6 name="copy" size={24} color="#ff6600" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Phone</Text>
                        <View style={styles.valueContainer}>
                            <Text style={styles.value}>{selectedRoster.phonenumber}</Text>
                            <View style={styles.iconsContainer}>
                                <TouchableOpacity
                                    onPress={() => {
                                        if (selectedRoster.phonenumber) {
                                            const cleanedNumber = cleanPhoneNumber(selectedRoster.phonenumber);
                                            Linking.openURL(`tel:${cleanedNumber}`);
                                        }
                                    }}
                                    style={styles.iconButton}
                                >
                                    <FontAwesome name="phone" size={24} color="#ff6600" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => {
                                        if (selectedRoster.phonenumber) {
                                            const cleanedNumber = cleanPhoneNumber(selectedRoster.phonenumber);
                                            Linking.openURL(`sms:${cleanedNumber}?body=`);
                                        }
                                    }}
                                    style={styles.iconButton}
                                >
                                    <AntDesign name="message1" size={24} color="#ff6600" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileImage: {
        width: 150,
        height: 150,
        borderRadius: 75,
        borderWidth: 3,
        borderColor: '#ff6600',
        marginBottom: 20,
    },
    name: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 10,
    },
    infoSection: {
        width: '100%',
        marginBottom: 20,
    },
    fieldContainer: {
        marginBottom: 15,
    },
    label: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ff6600',
        marginBottom: 5,
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    value: {
        fontSize: 16,
        color: '#fff',
        flex: 1,
    },
    loadingText: {
        fontSize: 18,
        color: '#fff',
        textAlign: 'center',
    },
    phoneNumber: {
        color: '#4287f5',  // Blue color for the phone number
        textDecorationLine: 'underline',  // Underline to indicate it's tappable
    },
    iconsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15, // Space between icons
    },
    iconButton: {
        padding: 5, // Touchable area around icon
    }
});

export default Details;