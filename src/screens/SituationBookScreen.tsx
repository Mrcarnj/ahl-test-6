// src/screens/SituationBookScreen.tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BookSearchNavBar,
  BookSearchResultsModal,
} from "@/src/components/BookSearchResults";
import PdfViewer from "@/src/components/PdfViewer";
import {
  buildSituationRefs,
  refAt,
  type BookPage,
} from "@/src/lib/bookRefs";
import {
  findMatches,
  getSnippet,
  toTitleCase,
  type BookSearchHit,
} from "@/src/lib/bookSearch";
import AntDesign from "@expo/vector-icons/AntDesign";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// `page` is the physical PDF page (what `#page=` jumps to); each page's text
// starts with the number printed on it, which is 4 lower in the 2026-27 book.

const printedPageNumber = (page: BookPage) => {
  const first = page.text.split("\n", 1)[0].trim();
  return /^\d{1,3}$/.test(first) ? Number(first) : page.page;
};

// ~450 KB of extracted text: loaded when the screen opens rather than bundled
// into the app's first download.
const loadSituationBookText = () =>
  import("@/src/lib/SituationBookPdfText.json").then(
    (m) => ((m as { default?: unknown }).default ?? m) as BookPage[],
  );

const SITUATION_BOOK_URL =
  "https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2026-27%20NHL%20Situation%20Handbook.pdf";

export default function SituationBook() {
  // No header above this screen, so keep the PDF out from under the status
  // bar / Dynamic Island ourselves.
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<BookSearchHit[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  const situationBookUri = selectedPage
    ? `${SITUATION_BOOK_URL}#page=${selectedPage}`
    : SITUATION_BOOK_URL;

  const [ruleBookText, setRuleBookText] = useState<BookPage[]>([]);
  useEffect(() => {
    let alive = true;
    loadSituationBookText()
      .then((pages) => alive && setRuleBookText(pages))
      .catch((e) =>
        console.warn("Situation Book search text failed to load", e),
      );
    return () => {
      alive = false;
    };
  }, []);

  const situationRefs = useMemo(
    () => buildSituationRefs(ruleBookText),
    [ruleBookText],
  );

  const handleSearch = () => {
    const trimmedTerm = searchTerm.trim();
    if (!trimmedTerm) return;
    if (ruleBookText.length === 0) {
      alert("Search is still loading. Try again in a moment.");
      return;
    }

    // One result per situation a page's hits fall under, so a page holding
    // 8D and 8E with a hit in each makes two rows.
    const results = ruleBookText
      .flatMap((page) => {
        const printed = printedPageNumber(page);
        const hits = new Map<string, BookSearchHit>();
        for (const match of findMatches(page.text, trimmedTerm)) {
          const ref = refAt(situationRefs, page.page, match.index);
          const key = ref?.situation ?? "";
          if (hits.has(key)) continue;
          const section = ref?.section ?? `Page ${printed}`;
          const ruleTitle =
            ref?.rule != null
              ? `Rule ${ref.rule}${ref.ruleName ? ` - ${toTitleCase(ref.ruleName)}` : ""}`
              : null;
          hits.set(key, {
            page: page.page,
            title: ref?.situation ? `${section} - ${ref.situation}` : section,
            subtitle: `${ruleTitle ? `${ruleTitle} - ` : ""}Page ${printed}`,
            navLabel: `${ref?.situation ? `${ref.situation} · ` : ""}Page ${printed}`,
            snippet: getSnippet(page.text, match),
            isFuzzy: match.fuzzy,
          });
        }
        return Array.from(hits.values());
      })
      // Exact matches first, each group in book order (flatMap keeps it).
      .sort((a, b) => Number(a.isFuzzy) - Number(b.isFuzzy));

    setSearchResults(results);
    setCurrentResultIndex(0);
    setSelectedPage(null);
    if (results.length === 0) {
      alert("No results found.");
      setResultsVisible(false);
    } else {
      setResultsVisible(true);
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

  const goToResult = (index: number) => {
    setCurrentResultIndex(index);
    setSelectedPage(searchResults[index].page);
    setResultsVisible(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingTop: insets.top }]}
      keyboardVerticalOffset={90}
    >
      {loadError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load situation book.</Text>
          <Text style={styles.errorHint}>
            Check your connection and try again.
          </Text>
        </View>
      )}

      {!loadError && (
        <PdfViewer
          uri={situationBookUri}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setLoadError(true);
          }}
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
            onPress={() => {
              setSearchTerm("");
              setSearchResults([]);
              setSelectedPage(null);
              setResultsVisible(false);
            }}
            style={styles.clearButton}
          >
            <AntDesign name="close-circle" size={16} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {searchResults.length > 0 && searchTerm !== "" && (
        <BookSearchNavBar
          results={searchResults}
          currentIndex={currentResultIndex}
          onPrevious={goToPreviousResult}
          onNext={goToNextResult}
          onShowResults={() => setResultsVisible(true)}
        />
      )}

      <BookSearchResultsModal
        visible={resultsVisible}
        searchTerm={searchTerm}
        results={searchResults}
        currentIndex={currentResultIndex}
        onSelect={goToResult}
        onClose={() => setResultsVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadingText: {
    color: "#fff",
    marginTop: 12,
    fontSize: 15,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  errorText: {
    color: "#ff6600",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  errorHint: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
  },
  searchContainer: {
    position: "relative",
    margin: 10,
  },
  searchBar: {
    height: 40,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingRight: 35,
    color: "#fff",
  },
  clearButton: {
    position: "absolute",
    right: 10,
    top: 7,
    padding: 5,
  },
});
