// src/screens/SituationBookScreen.tsx
import AntDesign from '@expo/vector-icons/AntDesign';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import PdfViewer from '@/src/components/PdfViewer';
import ruleBookText from '@/src/lib/SituationBookPdfText.json';

const SITUATION_BOOK_URL =
    'https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/sign/rules/2024-25%20NHL%20Situation%20Handbook%20(CONFIDENTIAL).pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82ZDg3NmJiYS03YjlmLTRlYWItYjk3MS1kZDNhZGEyNTgyZWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJydWxlcy8yMDI0LTI1IE5ITCBTaXR1YXRpb24gSGFuZGJvb2sgKENPTkZJREVOVElBTCkucGRmIiwiaWF0IjoxNzc3MjUzNjg5LCJleHAiOjE5MzQ5MzM2ODl9.M5pvM1xCRUE3R7M8cJjtCWYytv-0uHSI9dK_8QHIgyU';

export default function SituationBook() {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<number[]>([]);
    const [currentResultIndex, setCurrentResultIndex] = useState(0);

    const handleSearch = () => {
        const results = ruleBookText
            .filter(page => page.text.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(page => page.page);

        setSearchResults(results);
        setCurrentResultIndex(0);
        if (results.length === 0) {
            alert('No results found.');
        }
    };

    const goToNextResult = () => {
        if (searchResults.length > 0) {
            setCurrentResultIndex((currentResultIndex + 1) % searchResults.length);
        }
    };

    const goToPreviousResult = () => {
        if (searchResults.length > 0) {
            setCurrentResultIndex(
                (currentResultIndex - 1 + searchResults.length) % searchResults.length,
            );
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={90}
        >
            {loadError && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Failed to load situation book.</Text>
                    <Text style={styles.errorHint}>Check your connection and try again.</Text>
                </View>
            )}

            {!loadError && (
                <PdfViewer
                    uri={SITUATION_BOOK_URL}
                    style={styles.webview}
                    onLoadStart={() => setLoading(true)}
                    onLoad={() => setLoading(false)}
                    onError={() => { setLoading(false); setLoadError(true); }}
                />
            )}

            {loading && !loadError && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#ff6600" />
                    <Text style={styles.loadingText}>Loading situation book…</Text>
                </View>
            )}

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchBar}
                    maxLength={50}
                    placeholder="Search situation book…"
                    placeholderTextColor="#ccc"
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    returnKeyType="search"
                    onSubmitEditing={handleSearch}
                />
                {searchTerm.length > 0 && (
                    <TouchableOpacity
                        onPress={() => { setSearchTerm(''); setSearchResults([]); }}
                        style={styles.clearButton}
                    >
                        <AntDesign name="close-circle" size={16} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {searchResults.length > 0 && searchTerm !== '' && (
                <View style={styles.navigationContainer}>
                    <TouchableOpacity onPress={goToPreviousResult}>
                        <AntDesign name="up" size={24} color="#ff6600" />
                    </TouchableOpacity>
                    <Text style={styles.resultInfo}>
                        Page {searchResults[currentResultIndex]} ({currentResultIndex + 1} of {searchResults.length})
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
    webview: {
        flex: 1,
        backgroundColor: '#000',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    loadingText: {
        color: '#fff',
        marginTop: 12,
        fontSize: 15,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
    },
    errorText: {
        color: '#ff6600',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    errorHint: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
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
        paddingRight: 35,
        color: '#fff',
    },
    clearButton: {
        position: 'absolute',
        right: 10,
        top: 7,
        padding: 5,
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
