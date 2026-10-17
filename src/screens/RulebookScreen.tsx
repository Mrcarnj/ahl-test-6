// src/screens/RulebookScreen.tsx
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BookSearchNavBar,
  BookSearchResultsModal,
} from "@/src/components/BookSearchResults";
import PdfViewer from "@/src/components/PdfViewer";
import {
  buildRuleRefs,
  formatRuleRef,
  refAt,
  type BookPage,
} from "@/src/lib/bookRefs";
import {
  findMatches,
  getSnippet,
  matchesFuzzy,
  toTitleCase,
  type BookSearchHit,
} from "@/src/lib/bookSearch";

// ~860 KB of extracted text: loaded when the screen opens rather than bundled
// into the app's first download (it was ~20% of the web bundle).
const loadRuleBookText = () =>
  import("@/src/lib/RuleBookPdfText_2026_27.json").then(
    (m) => ((m as { default?: unknown }).default ?? m) as BookPage[],
  );

const RULEBOOK_URL =
  "https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2026-27%20AHL%20Rule%20Book.pdf";

const getRuleTitle = (pageText: string, searchTerm: string) => {
  const headingMatches = Array.from(
    pageText.matchAll(/(?:^|\n)\s*Rule\s+(\d+)\s*[–-]\s*([^\n]+)/gi),
  );
  if (headingMatches.length === 0) return null;

  const exactNameMatch = headingMatches.find((match) =>
    matchesFuzzy(match[2], searchTerm),
  );
  const chosen = exactNameMatch ?? headingMatches[0];
  const ruleNumber = chosen[1];
  const ruleName = chosen[2].trim();
  return `Rule ${ruleNumber} - ${toTitleCase(ruleName)}`;
};

const getSectionTitle = (pageText: string) => {
  const lines = pageText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const printedPageMatch = lines[0]?.match(/^\d{1,3}$/);
  const printedPageNumber = printedPageMatch
    ? Number.parseInt(printedPageMatch[0], 10)
    : null;

  // The "INDEX" heading is a side label mid-page, so go by printed page
  // (2026-27 book: index 236–285, glossary 286–288, schedule from 289).
  if (
    printedPageNumber !== null &&
    printedPageNumber >= 236 &&
    printedPageNumber <= 285
  ) {
    return "Index";
  }

  // Only trust the very top of the page for section headers.
  for (const line of lines.slice(0, 8)) {
    if (/^table of contents$/i.test(line)) {
      return "Table of Contents";
    }

    if (/^reference tables?$/i.test(line)) {
      return "Reference Tables";
    }

    if (/^index$/i.test(line)) {
      return "Index";
    }

    if (/^glossary of terms$/i.test(line)) {
      return "Glossary of Terms";
    }

    if (/^\d{4}-\d{2} AHL SCHEDULE$/i.test(line)) {
      return "AHL Schedule";
    }

    const sectionMatch = line.match(
      /^SECTION\s+\d+\s*[–-]\s*([A-Z][A-Z\s&/-]{2,})$/i,
    );
    if (sectionMatch) {
      return toTitleCase(sectionMatch[1].trim());
    }
  }

  return null;
};

// Pages that aren't rule text. Their own numbered lists ("(i) Butt-ending")
// must not read as items of whichever rule came last.
const NON_RULE_SECTIONS = new Set([
  "Table of Contents",
  "Reference Tables",
  "Index",
  "Glossary of Terms",
  "AHL Schedule",
]);

export default function Rulebook() {
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
  const rulebookUri = selectedPage
    ? `${RULEBOOK_URL}#page=${selectedPage}`
    : RULEBOOK_URL;
  const [ruleBookText, setRuleBookText] = useState<BookPage[]>([]);
  useEffect(() => {
    let alive = true;
    loadRuleBookText()
      .then((pages) => alive && setRuleBookText(pages))
      .catch((e) => console.warn("Rulebook search text failed to load", e));
    return () => {
      alive = false;
    };
  }, []);
  const sectionByPage = useMemo(
    () =>
      ruleBookText.reduce<Record<number, string>>((acc, page) => {
        const detectedSection = getSectionTitle(page.text);
        const previousSection = acc[page.page - 1];
        acc[page.page] = detectedSection ?? previousSection ?? `Page ${page.page}`;
        return acc;
      }, {}),
    [ruleBookText],
  );
  const ruleRefs = useMemo(
    () =>
      buildRuleRefs(
        ruleBookText,
        (page) => !NON_RULE_SECTIONS.has(sectionByPage[page] ?? ""),
      ),
    [ruleBookText, sectionByPage],
  );

  const handleSearch = () => {
    const trimmedTerm = searchTerm.trim();
    if (!trimmedTerm) return;
    if (ruleBookText.length === 0) {
      alert("Search is still loading. Try again in a moment.");
      return;
    }

    // One result per rule a page's hits fall under, so two hits in 75.3 make
    // one row but a hit in 75.3 and one in 75.4 make two.
    const results = ruleBookText
      .flatMap((page) => {
        const sectionTitle = sectionByPage[page.page] ?? `Page ${page.page}`;
        const isInfractionSection = /infraction(s)?/i.test(sectionTitle);
        const hits = new Map<string, BookSearchHit & { isInfractionSection: boolean }>();
        for (const match of findMatches(page.text, trimmedTerm)) {
          const ref = refAt(ruleRefs, page.page, match.index);
          const ruleRef = ref ? formatRuleRef(ref) : null;
          const key = ruleRef ?? "";
          if (hits.has(key)) continue;
          const ruleTitle = ref
            ? `Rule ${ref.rule} - ${toTitleCase(ref.ruleName)}`
            : getRuleTitle(page.text, trimmedTerm);
          hits.set(key, {
            page: page.page,
            title: ruleRef ? `${sectionTitle} - ${ruleRef}` : sectionTitle,
            subtitle: `${ruleTitle ? `${ruleTitle} - ` : ""}Page ${page.page}`,
            navLabel: `${ruleRef ? `${ruleRef} · ` : ""}Page ${page.page}`,
            snippet: getSnippet(page.text, match),
            isFuzzy: match.fuzzy,
            isInfractionSection,
          });
        }
        return Array.from(hits.values());
      })
      .sort((a, b) => {
        if (a.isFuzzy !== b.isFuzzy) return a.isFuzzy ? 1 : -1;
        if (a.isInfractionSection !== b.isInfractionSection) {
          return a.isInfractionSection ? -1 : 1;
        }
        return a.page - b.page;
      });

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
          <Text style={styles.errorText}>Failed to load rulebook.</Text>
          <Text style={styles.errorHint}>Try restarting the app.</Text>
        </View>
      )}

      {!loadError && (
        <PdfViewer
          uri={rulebookUri}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setLoadError(true); }}
        />
      )}

      {loading && !loadError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ff6600" />
          <Text style={styles.loadingText}>Loading rulebook…</Text>
        </View>
      )}

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search rulebook…"
          placeholderTextColor="#ccc"
          value={searchTerm}
          maxLength={50}
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
    color: "#888",
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
