// src/lib/bookSearch.ts
//
// Text search shared by the Rulebook and Situation Book screens.

export type TextMatch = { index: number; length: number; fuzzy: boolean };

/** One row in a book's search results. */
export type BookSearchHit = {
  /** Physical PDF page, what `#page=` jumps to. */
  page: number;
  /** e.g. "Other Infractions - 75.4 (iii)" */
  title: string;
  /** e.g. "Rule 75 - Unsportsmanlike Conduct - Page 164" */
  subtitle: string;
  /** Shown in the bar above the search box, e.g. "75.4 (iii) · Page 164". */
  navLabel: string;
  snippet: string;
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

const allMatches = (text: string, pattern: RegExp, fuzzy = false): TextMatch[] =>
  Array.from(text.matchAll(pattern), (m) => ({
    index: m.index ?? 0,
    length: m[0].length,
    fuzzy,
  }));

// Every place the term matches in the text, by the first rule below that finds
// anything (so a typo-tolerant match is only used when nothing exact is there).
export const findMatches = (pageText: string, searchTerm: string): TextMatch[] => {
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

export const matchesFuzzy = (pageText: string, searchTerm: string) =>
  findMatches(pageText, searchTerm).length > 0;

export const getSnippet = (pageText: string, { index, length }: TextMatch) => {
  const start = Math.max(0, index - 45);
  const end = Math.min(pageText.length, index + length + 75);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < pageText.length ? "..." : "";
  return `${prefix}${pageText.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
};

export const toTitleCase = (raw: string) =>
  raw
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
