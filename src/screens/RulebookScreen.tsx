// src/screens/RulebookScreen.tsx
import AntDesign from "@expo/vector-icons/AntDesign";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PdfViewer from "@/src/components/PdfViewer";
import {
  buildRuleRefs,
  formatRuleRef,
  ruleRefAt,
  type BookPage,
} from "@/src/lib/rulebookRefs";

// ~860 KB of extracted text: loaded when the screen opens rather than bundled
// into the app's first download (it was ~20% of the web bundle).
const loadRuleBookText = () =>
  import("@/src/lib/RuleBookPdfText_2026_27.json").then(
    (m) => ((m as { default?: unknown }).default ?? m) as BookPage[],
  );

const RULEBOOK_URL =
  "https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2026-27%20AHL%20Rule%20Book.pdf";

type SearchHit = {
  page: number;
  sectionTitle: string;
  ruleTitle: string | null;
  /** Where on the page the hit is, e.g. "75.4 (iii)". */
  ruleRef: string | null;
  snippet: string;
  isInfractionSection: boolean;
  /** Only a typo-tolerant match ("incident" for "incite"); listed last. */
  isFuzzy: boolean;
};

const normalizeWord = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const levenshteinDistance = (a: string, b: string) => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
};

type TextMatch = { index: number; length: number; fuzzy: boolean };

const allMatches = (text: string, pattern: RegExp, fuzzy = false): TextMatch[] =>
  Array.from(text.matchAll(pattern), (m) => ({
    index: m.index ?? 0,
    length: m[0].length,
    fuzzy,
  }));

// Every place the term matches in the text, by the first rule below that finds
// anything (so a typo-tolerant match is only used when nothing exact is there).
const findMatches = (pageText: string, searchTerm: string): TextMatch[] => {
  const rawTerm = searchTerm.toLowerCase().trim();
  const normalizedTerm = normalizeWord(rawTerm);
  if (!normalizedTerm) return [];

  const termParts = rawTerm.split(/[^a-z0-9]+/).filter(Boolean);

  if (termParts.length > 1) {
    // Multi-word queries should match hyphenated forms like "head butt" -> "head-butting".
    const joinedPattern = `\\b${termParts
      .map(escapeRegex)
      .join("[\\s-]*")}[a-z0-9-]*\\b`;
    const joined = allMatches(pageText, new RegExp(joinedPattern, "gi"));
    if (joined.length > 0) return joined;
  }

  // Prefer token boundary matching so "rough" matches "roughing" but not "through".
  // A final "e" is dropped so "incite" also finds "inciting" and "incitement"
  // here rather than only as a fuzzy match.
  const stem =
    termParts.length === 1 && rawTerm.length >= 4 && rawTerm.endsWith("e")
      ? rawTerm.slice(0, -1)
      : rawTerm;
  const stemRegex = new RegExp(`\\b${escapeRegex(stem)}[a-z0-9]*\\b`, "gi");
  const stems = allMatches(pageText, stemRegex);
  if (stems.length > 0) return stems;

  return allMatches(pageText, /\S+/g, true).filter(({ index, length }) => {
    const word = normalizeWord(pageText.slice(index, index + length));
    if (word.length < 3) return false;
    if (word === normalizedTerm) return true;
    if (word.startsWith(normalizedTerm)) return true;
    if (normalizedTerm.length >= 5 && normalizedTerm.startsWith(word)) {
      return true;
    }

    // Typo tolerance is anchored at word start to avoid mid-word false positives.
    const compareChunk = word.slice(0, normalizedTerm.length);
    const maxDistance =
      normalizedTerm.length >= 8 ? 2 : normalizedTerm.length >= 5 ? 1 : 0;

    if (maxDistance === 0) return false;
    return levenshteinDistance(compareChunk, normalizedTerm) <= maxDistance;
  });
};

const matchesFuzzy = (pageText: string, searchTerm: string) =>
  findMatches(pageText, searchTerm).length > 0;

const toTitleCase = (raw: string) =>
  raw
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

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

const getSnippet = (pageText: string, { index, length }: TextMatch) => {
  const start = Math.max(0, index - 45);
  const end = Math.min(pageText.length, index + length + 75);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < pageText.length ? "..." : "";
  return `${prefix}${pageText.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
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
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
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
    const results: SearchHit[] = ruleBookText
      .flatMap((page) => {
        const sectionTitle = sectionByPage[page.page] ?? `Page ${page.page}`;
        const hits = new Map<string, SearchHit>();
        for (const match of findMatches(page.text, trimmedTerm)) {
          const ref = ruleRefAt(ruleRefs, page.page, match.index);
          const ruleRef = ref ? formatRuleRef(ref) : null;
          const key = ruleRef ?? "";
          if (hits.has(key)) continue;
          hits.set(key, {
            page: page.page,
            sectionTitle,
            ruleTitle: ref
              ? `Rule ${ref.rule} - ${toTitleCase(ref.ruleName)}`
              : getRuleTitle(page.text, trimmedTerm),
            ruleRef,
            snippet: getSnippet(page.text, match),
            isInfractionSection: /infraction(s)?/i.test(sectionTitle),
            isFuzzy: match.fuzzy,
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
        <View style={styles.navigationContainer}>
          <TouchableOpacity onPress={goToPreviousResult}>
            <AntDesign name="up" size={24} color="#ff6600" />
          </TouchableOpacity>
          <Text style={styles.resultInfo}>
            {searchResults[currentResultIndex].ruleRef
              ? `${searchResults[currentResultIndex].ruleRef} · `
              : ""}
            Page {searchResults[currentResultIndex].page} ({currentResultIndex + 1} of {searchResults.length})
          </Text>
          <TouchableOpacity onPress={() => setResultsVisible(true)}>
            <Text style={styles.resultsButtonText}>Results</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToNextResult}>
            <AntDesign name="down" size={24} color="#ff6600" />
          </TouchableOpacity>
        </View>
      )}

      <Modal
        transparent
        animationType="slide"
        visible={resultsVisible}
        onRequestClose={() => setResultsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Results for &quot;{searchTerm.trim()}&quot;
              </Text>
              <TouchableOpacity onPress={() => setResultsVisible(false)}>
                <AntDesign name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator>
              {searchResults.map((result, index) => (
                <React.Fragment key={`${result.page}-${index}`}>
                {result.isFuzzy && !searchResults[index - 1]?.isFuzzy && (
                  <Text style={styles.resultDivider}>Similar matches</Text>
                )}
                <TouchableOpacity
                  style={[
                    styles.resultRow,
                    index === currentResultIndex && styles.resultRowActive,
                  ]}
                  onPress={() => goToResult(index)}
                >
                  <Text style={styles.resultTitle}>
                    {result.ruleRef
                      ? `${result.sectionTitle} - ${result.ruleRef}`
                      : result.sectionTitle}
                  </Text>
                  <Text style={styles.resultMeta}>
                    {result.ruleTitle ? `${result.ruleTitle} - ` : ""}
                    Page {result.page}
                  </Text>
                  <Text style={styles.resultSnippet}>{result.snippet}</Text>
                </TouchableOpacity>
                </React.Fragment>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  navigationContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#333",
  },
  resultInfo: {
    color: "#fff",
    fontSize: 16,
    marginHorizontal: 10,
  },
  resultsButtonText: {
    color: "#ff6600",
    fontSize: 14,
    marginHorizontal: 10,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalContent: {
    maxHeight: "62%",
    backgroundColor: "#111",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    paddingRight: 8,
    flex: 1,
  },
  resultRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#1a1a1a",
  },
  resultRowActive: {
    borderColor: "#ff6600",
  },
  resultTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  resultDivider: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  resultMeta: {
    color: "#ff6600",
    fontSize: 13,
    marginTop: 2,
    marginBottom: 4,
  },
  resultSnippet: {
    color: "#bbb",
    fontSize: 13,
    lineHeight: 18,
  },
});
