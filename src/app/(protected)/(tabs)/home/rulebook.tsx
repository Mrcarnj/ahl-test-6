// app/(protected)/(tabs)/home/rulebook.tsx
import { View, StyleSheet, Dimensions, TextInput, Text, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useState, useEffect } from 'react';
import Pdf from 'react-native-pdf';
import AntDesign from '@expo/vector-icons/AntDesign';
import ruleBookText from '../../../../lib/RuleBookPdfText.json';  // Adjust path as needed

export default function Rulebook() {
    const source = {
        uri: 'https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2024-25%20AHL%20Rule%20Book.pdf?t=2024-11-07T22%3A19%3A04.158Z',
        cache: true
    };

    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<number[]>([]);
    const [currentResultIndex, setCurrentResultIndex] = useState(0);

    useEffect(() => {
        // Navigate to the current result page if searchResults and currentResultIndex are set
        if (searchResults.length > 0) {
            setCurrentPage(searchResults[currentResultIndex]);
        }
    }, [searchResults, currentResultIndex]);

    const handleSearch = () => {
        // Find pages containing the search term
        const results = ruleBookText
            .filter(page => page.text.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(page => page.page);

        setSearchResults(results);
        setCurrentResultIndex(0);  // Reset to first result
        if (results.length > 0) {
            setCurrentPage(results[0]);
            console.log(`Found ${results.length} results on pages: ${results}`);
        } else {
            alert('No results found.');
        }
    };

    const goToNextResult = () => {
        if (searchResults.length > 0) {
            const nextIndex = (currentResultIndex + 1) % searchResults.length;
            setCurrentResultIndex(nextIndex);
        }
    };

    const goToPreviousResult = () => {
        if (searchResults.length > 0) {
            const prevIndex = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
            setCurrentResultIndex(prevIndex);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}
        keyboardVerticalOffset={90}>
            <Pdf
                trustAllCerts={false}
                source={source}
                page={currentPage}
                onLoadComplete={(numberOfPages, filePath) => {
                    console.log(`Number of pages: ${numberOfPages}`);
                }}
                onPageChanged={(page, numberOfPages) => {
                    console.log(`Current page: ${page}`);
                }}
                onError={(error) => {
                    console.log(error);
                }}
                onPressLink={(uri) => {
                    console.log(`Link pressed: ${uri}`);
                }}
                style={styles.pdf}
            />

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchBar}
                    placeholder="Search..."
                    placeholderTextColor={'#ccc'}
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    returnKeyType="search"
                    onSubmitEditing={handleSearch}
                />
                {searchTerm.length > 0 && (
                    <TouchableOpacity
                        onPress={() => setSearchTerm('')}
                        style={styles.clearButton}
                    >
                        <AntDesign name="closecircle" size={16} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {searchResults.length > 0 && searchTerm !== '' && (
                <View style={styles.navigationContainer}>
                    <TouchableOpacity onPress={goToPreviousResult}>
                        <AntDesign name="up" size={24} color="#ff6600" />
                    </TouchableOpacity>
                    <Text style={styles.resultInfo}>
                        Result {currentResultIndex + 1} of {searchResults.length}
                    </Text>
                    <TouchableOpacity onPress={goToNextResult}>
                        <AntDesign name="down" size={24} color="#ff6600" />
                    </TouchableOpacity>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    pdf: {
        flex: 1,
        width: Dimensions.get('window').width,
        backgroundColor: '#000',
    },
    searchContainer: {
        position: 'relative',
        margin: 10,
    },
    searchBar: {
        height: 40,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        paddingHorizontal: 10,
        paddingRight: 35,  // Make room for the clear button
        color: '#fff',
    },
    clearButton: {
        position: 'absolute',
        right: 10,
        top: 7,  // Centers the icon vertically
        padding: 5,  // Larger touch target
    },
    navigationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        backgroundColor: '#333',
    },
    resultInfo: {
        color: '#fff',
        fontSize: 16,
        marginHorizontal: 10,
    },
});
