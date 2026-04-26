// app/(protected)/(tabs)/roster/details.tsx
import { useContactsPermissions } from '@/src/hooks/useContactsPermissions';
import { useRoster } from '@/src/providers/RosterProvider';
import { AntDesign, FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const Details = () => {
    const { rosterId } = useLocalSearchParams<{ rosterId: string; source: string }>();
    const { allRosters } = useRoster();
    const { hasPermission, requestPermissions } = useContactsPermissions();
    const [photoBase64, setPhotoBase64] = useState<string | null>(null);

    const selectedRoster = allRosters.find(r => r.id === parseInt(rosterId));

    // Fetch and convert the photo to base64 if it exists
    useEffect(() => {
        const fetchPhoto = async () => {
            if (selectedRoster?.photo) {
                try {
                    // Use only FileSystem.cacheDirectory, which is always available in Expo
                    const cacheDir = FileSystem.cacheDirectory ?? '';
                    const fileUri = `${cacheDir}temp_contact_photo.jpg`;
                    const downloadResult = await FileSystem.downloadAsync(
                        selectedRoster.photo,
                        fileUri
                    );

                    if (downloadResult.status === 200) {
                        const base64 = await FileSystem.readAsStringAsync(fileUri, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        setPhotoBase64(base64);
                    }
                } catch (error) {
                    console.error('Error fetching photo:', error);
                }
            }
        };

        fetchPhoto();
    }, [selectedRoster?.photo]);

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

    const createContact = async () => {
        if (!selectedRoster) return;

        try {
            if (!hasPermission) {
                const granted = await requestPermissions();
                if (!granted) {
                    Alert.alert(
                        'Permission Required',
                        'This app needs permission to add contacts.',
                        [
                            { text: 'OK', onPress: () => requestPermissions() }
                        ]
                    );
                    return;
                }
            }

            const contact: Contacts.Contact = {
                firstName: selectedRoster.firstname,
                lastName: selectedRoster.lastname,
                phoneNumbers: [{
                    label: Contacts.Fields.PhoneNumbers,
                    number: selectedRoster.phonenumber,
                }],
                emails: [{
                    label: Contacts.Fields.Emails,
                    email: selectedRoster.email,
                }],
                company: 'AHL Officials',
                jobTitle: 'Official',
                contactType: Contacts.ContactTypes.Person,
                name: `${selectedRoster.firstname} ${selectedRoster.lastname}`
            };

            // Add photo to contact if available
            if (photoBase64) {
                contact.imageAvailable = true;
                contact.image = {
                    uri: `data:image/jpeg;base64,${photoBase64}`
                };
            }

            const result = await Contacts.addContactAsync(contact);

            if (result) {
                Alert.alert(
                    'Success',
                    'Contact was successfully added to your contacts!',
                    [{ text: 'OK' }]
                );
            } else {
                throw new Error('Failed to add contact');
            }
        } catch (error) {
            console.error('Error adding contact:', error);
            Alert.alert(
                'Error',
                'Unable to add contact. Please try again.',
                [{ text: 'OK' }]
            );
        }
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
                    source={selectedRoster.photo ?
                        { uri: selectedRoster.photo }
                        : require('../../../../assets/images/noPhoto.png')
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
                                    <AntDesign name="message" size={24} color="#ff6600" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                    <View style={styles.fieldContainer}>
                        <TouchableOpacity
                            onPress={createContact}
                            style={styles.addContactButton}
                        >
                            <View style={styles.iconTextContainer}>
                                <FontAwesome name="address-card-o" size={18} color="#ff6600" />
                                <Text style={styles.addContactText}>Add to Contacts</Text>
                            </View>
                        </TouchableOpacity>
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
        paddingTop: 0,  // Remove top padding
        marginTop: -40, // Pull content up
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
    },
    addContactButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        padding: 12,
        borderRadius: 8,
        marginTop: 15,
        borderWidth: 1,
        borderColor: '#333',
    },
    iconTextContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    addContactText: {
        color: '#ff6600',
        fontSize: 14,
        fontWeight: '500',
    }
});

export default Details;