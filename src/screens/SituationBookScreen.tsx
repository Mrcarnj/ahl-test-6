// src/screens/SituationBookScreen.tsx
import AntDesign from '@expo/vector-icons/AntDesign';
import React, { useEffect, useState } from 'react';
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

// `page` is the physical PDF page (what `#page=` jumps to); each page's text
// starts with the number printed on it, which is 4 lower in the 2026-27 book.
type BookPage = { page: number; text: string };

const printedPageNumber = (page: BookPage) => {
    const first = page.text.split('\n', 1)[0].trim();
    return /^\d{1,3}$/.test(first) ? Number(first) : page.page;
};

// ~450 KB of extracted text: loaded when the screen opens rather than bundled
// into the app's first download.
const loadSituationBookText = () =>
    import('@/src/lib/SituationBookPdfText.json').then(
        (m) => ((m as { default?: unknown }).default ?? m) as BookPage[],
    );

const SITUATION_BOOK_URL =
    'https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2026-27%20NHL%20Situation%20Handbook.pdf';

export default function SituationBook() {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<BookPage[]>([]);
    const [currentResultIndex, setCurrentResultIndex] = useState(0);
    const [selectedPage, setSelectedPage] = useState<number | null>(null);
    const situationBookUri = selectedPage
        ? `${SITUATION_BOOK_URL}#page=${selectedPage}`
        : SITUATION_BOOK_URL;

    const [ruleBookText, setRuleBookText] = useState<BookPage[]>([]);
    useEffect(() => {
        let alive = true;
        loadSituationBookText()
            .then((pages) => alive && setRuleBookText(pages))
            .catch((e) => console.warn('Situation Book search text failed to load', e));
        return () => {
            alive = false;
        };
    }, []);

    const handleSearch = () => {
        if (ruleBookText.length === 0) {
            alert('Search is still loading. Try again in a moment.');
            return;
        }
        const results = ruleBookText.filter(page =>
            page.text.toLowerCase().includes(searchTerm.toLowerCase()),
        );

        setSearchResults(results);
        setCurrentResultIndex(0);
        setSelectedPage(results[0]?.page ?? null);
        if (results.length === 0) {
            alert('No results found.');
        }
    };

    const goToNextResult = () => {
        if (searchResults.length > 0) {
            const nextIndex = (currentResultIndex + 1) % searchResults.length;
            setCurrentResultIndex(nextIndex);
            setSelectedPage(searchResults[nextIndex].page);
        }
    };

    const goToPreviousResult = () => {
        if (searchResults.length > 0) {
            const prevIndex =
                (currentResultIndex - 1 + searchResults.length) % searchResults.length;
            setCurrentResultIndex(prevIndex);
            setSelectedPage(searchResults[prevIndex].page);
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
                    uri={situationBookUri}
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
                        onPress={() => { setSearchTerm(''); setSearchResults([]); setSelectedPage(null); }}
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
                        Page {printedPageNumber(searchResults[currentResultIndex])} ({currentResultIndex + 1} of {searchResults.length})
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
        color: '#aaa',
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
