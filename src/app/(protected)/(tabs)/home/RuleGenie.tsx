import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ruleBookText from '../../../../lib/RuleBookPdfText_2025_26.json';

type RuleHeading = {
  ruleNumber: string;
  title: string;
};

type RuleBlock = RuleHeading & {
  text: string;
};

type PenaltyOption = {
  label: string;
  condition?: string;
  automatic: boolean;
  triggerText: string;
  source: string;
};

type IntentType = 'rule-number-lookup' | 'penalty-options' | 'general-rule-qa';

type RuleNumberLookupResult = {
  intent: 'rule-number-lookup';
  term: string;
  matches: GeneralQaMatch[];
};

type PenaltyOptionsResult = {
  intent: 'penalty-options';
  infraction: string;
  heading: RuleHeading | null;
  options: PenaltyOption[];
};

type GeneralQaMatch = {
  /** e.g. "Rule 75.4" when a subsection is detected, else "Rule 75". */
  citation: string;
  title: string;
  /** Roman clause under the subsection, e.g. "(iii)". */
  clauseRef: string | null;
  /** Short explanation of which terms hit the embedded text. */
  matchWhy: string | null;
  excerpt: string;
};

type GeneralQaResult = {
  intent: 'general-rule-qa';
  question: string;
  matches: GeneralQaMatch[];
};

type GenieResult = RuleNumberLookupResult | PenaltyOptionsResult | GeneralQaResult;

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const detectInfractionFromQuestion = (question: string) => {
  const lower = question.toLowerCase().trim();
  const forMatch = lower.match(/(?:for|on|about)\s+(.+)$/);
  if (forMatch?.[1]) return forMatch[1].replace(/[?.!]+$/, '').trim();
  return lower.replace(/[?.!]+$/, '').trim();
};

const stopWords = new Set([
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'why',
  'rule',
  'number',
  'for',
  'from',
  'that',
  'this',
  'with',
  'into',
  'onto',
  'about',
  'under',
  'there',
  'their',
  'they',
  'them',
  'can',
  'could',
  'should',
  'would',
  'does',
  'is',
  'are',
  'be',
  'a',
  'an',
  'the',
  'of',
  'to',
  'on',
  'in',
  'if',
  'it',
  'all',
  'any',
  'normal',
  'line',
  'change',
  'ice',
  'back',
  'go',
  'goes',
  'going',
  'give',
  'me',
]);

const extractKeywords = (query: string) =>
  query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3 && !stopWords.has(part));

/** Extra forms so e.g. "inciting" still matches rule text that uses "incite". */
const expandKeywordVariants = (keyword: string): string[] => {
  const k = keyword.toLowerCase();
  const variants = new Set<string>([k]);
  if (k.length >= 5 && k.endsWith('ing')) {
    const stem = k.slice(0, -3);
    variants.add(stem);
    if (!stem.endsWith('e')) variants.add(`${stem}e`);
  }
  return [...variants].filter((v) => v.length >= 3);
};

const keywordsForMatch = (query: string) => {
  const expanded = new Set<string>();
  for (const kw of extractKeywords(query)) {
    for (const v of expandKeywordVariants(kw)) expanded.add(v);
  }
  return [...expanded];
};

const classifyIntent = (question: string): IntentType => {
  const lower = question.toLowerCase();

  if (
    /(what|which)\s+rule\b/.test(lower) ||
    /rule number/.test(lower) ||
    /\bwhat rule number is\b/.test(lower)
  ) {
    return 'rule-number-lookup';
  }

  if (
    /\bpenalt(?:y|ies)\b/.test(lower) ||
    /\bdouble[- ]minor\b/.test(lower) ||
    /\bmajor\b/.test(lower) ||
    /\bmatch\b/.test(lower) ||
    /\bmisconduct\b/.test(lower) ||
    /\boptions?\b/.test(lower)
  ) {
    return 'penalty-options';
  }

  return 'general-rule-qa';
};

const extractRuleBlocks = (allText: string): RuleBlock[] => {
  const blocks: RuleBlock[] = [];
  const regex = /Rule\s+(\d+)\s*[–-]\s*([^\n]+)([\s\S]*?)(?=\nRule\s+\d+\s*[–-]|$)/gi;

  let match = regex.exec(allText);
  while (match) {
    const blockText = `Rule ${match[1]} - ${match[2]}${match[3]}`;
    blocks.push({
      ruleNumber: match[1],
      title: match[2].trim(),
      text: blockText,
    });
    match = regex.exec(allText);
  }

  return blocks;
};

const scoreRuleMatch = (rule: RuleBlock, query: string) => {
  const normalizedTitle = normalize(rule.title);
  const normalizedQuery = normalize(query);
  const lowerText = rule.text.toLowerCase();
  const lowerTitle = rule.title.toLowerCase();
  const keywords = keywordsForMatch(query);

  let score = 0;

  if (normalizedTitle === normalizedQuery) score += 120;
  if (normalizedTitle.includes(normalizedQuery) && normalizedQuery.length >= 4) score += 70;
  if (normalizedQuery.includes(normalizedTitle) && normalizedTitle.length >= 4) score += 60;

  if (lowerTitle.includes(query.toLowerCase().trim())) score += 45;

  for (const keyword of keywords) {
    if (lowerTitle.includes(keyword)) score += 16;
    if (lowerText.includes(keyword)) score += 8;
  }

  return score;
};

const summarizeCondition = (sentence: string) => {
  const normalized = sentence.replace(/\s+/g, ' ').trim();

  if (/attempts?\s+to/i.test(normalized)) return 'attempting';
  if (/injur(?:y|ies|ed|ing)/i.test(normalized)) return 'if injury occurs';
  if (/when a major penalty is assessed under this rule/i.test(normalized)) {
    return 'if a Major is assessed under this rule';
  }
  if (/when a major penalty is assessed/i.test(normalized)) {
    return 'if a Major is assessed';
  }

  const conditionMatch = normalized.match(/\b(?:when|if)\b(.+)/i);
  if (conditionMatch?.[1]) {
    return conditionMatch[1].replace(/\.$/, '').trim();
  }

  return undefined;
};

const mapPenaltyLabel = (raw: string) => {
  const penaltyName = raw.toLowerCase();
  if (penaltyName.includes('double-minor')) return 'Double-Minor';
  if (penaltyName.includes('minor')) return 'Minor';
  if (penaltyName.includes('major')) return 'Major';
  if (penaltyName.includes('match')) return 'Match';
  if (penaltyName.includes('game misconduct')) return 'Game Misconduct';
  if (penaltyName.includes('misconduct')) return 'Misconduct';
  if (penaltyName.includes('penalty shot')) return 'Penalty Shot';
  return titleCase(raw.replace(/penalty/gi, '').trim());
};

const extractPenaltyOptions = (ruleNumber: string, ruleBlock: string): PenaltyOption[] => {
  const flattened = ruleBlock.replace(/\s+/g, ' ');
  const regex = new RegExp(
    `${ruleNumber}\\s*\\.?\\s*(\\d+)\\s+([A-Za-z- ]+Penalty)\\s*[–-]\\s*(.*?)(?=${ruleNumber}\\s*\\.?\\s*\\d+\\s+[A-Za-z- ]+Penalty\\s*[–-]|$)`,
    'gi',
  );

  const options: PenaltyOption[] = [];
  let match = regex.exec(flattened);
  while (match) {
    const clause = match[1];
    const rawPenaltyLabel = match[2].trim();
    const body = match[3].trim();
    const label = mapPenaltyLabel(rawPenaltyLabel);
    const condition = summarizeCondition(body);
    const automatic = /\bmust be imposed\b/i.test(body);
    options.push({
      label,
      condition,
      automatic,
      triggerText: body,
      source: `Rule ${ruleNumber}.${clause}`,
    });
    match = regex.exec(flattened);
  }

  const unique = new Map<string, PenaltyOption>();
  for (const option of options) {
    const key = `${option.label}|${option.condition ?? ''}|${option.automatic ? '1' : '0'}`;
    if (!unique.has(key)) unique.set(key, option);
  }
  return Array.from(unique.values());
};

const extractLookupTerm = (question: string) => {
  const lower = question.toLowerCase().replace(/[?.!]+$/, '');
  const match = lower.match(/(?:what|which)\s+rule(?:\s+number)?\s+(?:is|for)\s+(.+)$/);
  if (match?.[1]) return match[1].trim();
  const fallback = lower
    .replace(/what|which|rule|number|is|for|the/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return fallback;
};

const anchorIndexInRuleText = (ruleText: string, excerpt: string | null, keywords: string[]) => {
  const lower = ruleText.toLowerCase();
  if (excerpt) {
    const probe = excerpt.replace(/\s+/g, ' ').trim().slice(0, 48).toLowerCase();
    if (probe.length >= 8) {
      const i = lower.replace(/\s+/g, ' ').indexOf(probe);
      if (i >= 0) return i;
    }
  }
  const excerptLower = (excerpt ?? '').toLowerCase();
  const kwsInExcerpt = keywords.filter((k) => excerptLower.includes(k));
  const searchList = kwsInExcerpt.length > 0 ? kwsInExcerpt : keywords;
  let anchor = -1;
  for (const kw of searchList) {
    const i = lower.indexOf(kw);
    if (i >= 0 && (anchor < 0 || i < anchor)) anchor = i;
  }
  return anchor;
};

const resolveSubsection = (ruleNumber: string, text: string, anchorIndex: number) => {
  if (anchorIndex < 0) return { decimal: null as string | null, clauseRoman: null as string | null };

  const before = text.slice(0, anchorIndex + 1);
  const subRe = new RegExp(`\\b${ruleNumber}\\.(\\d+)\\b`, 'gi');
  const subMatches = [...before.matchAll(subRe)];
  const lastSub = subMatches.at(-1);
  const decimal = lastSub?.[1] ?? null;

  let clauseRoman: string | null = null;
  if (lastSub?.index !== undefined) {
    const fromSub = text.slice(lastSub.index, anchorIndex + 1);
    const romanMatches = [...fromSub.matchAll(/\(([ivxlcdm]+)\)/gi)];
    const lastRm = romanMatches.at(-1)?.[1];
    clauseRoman = lastRm ? `(${lastRm})` : null;
  }

  return { decimal, clauseRoman };
};

const buildMatchWhy = (excerpt: string, keywords: string[], query: string) => {
  const ex = excerpt.toLowerCase();
  const hitSet = keywords.filter((k) => ex.includes(k));
  if (hitSet.length === 0) return null;
  const hits = [...new Set(hitSet)].sort((a, b) => b.length - a.length);
  const primary = hits[0];
  const rawTerms = extractKeywords(query);
  for (const r of rawTerms) {
    const vars = expandKeywordVariants(r);
    if (vars.includes(primary) && r.toLowerCase() !== primary) {
      return `Matched “${primary}” (search: ${r})`;
    }
  }
  return `Matched “${primary}”`;
};

const pickExcerptForRule = (
  ruleText: string,
  keywords: string[],
): { excerpt: string; anchorIndex: number } | null => {
  const lower = ruleText.toLowerCase();

  const sentenceCandidates = ruleText
    .replace(/\n/g, ' ')
    .split(/(?<=[.])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const bySentence = sentenceCandidates.find((sentence) =>
    keywords.some((keyword) => sentence.toLowerCase().includes(keyword)),
  );
  if (bySentence) {
    const anchor = anchorIndexInRuleText(ruleText, bySentence, keywords);
    return { excerpt: bySentence, anchorIndex: anchor >= 0 ? anchor : 0 };
  }

  const lineCandidates = ruleText
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const scoreLine = (line: string) =>
    keywords.reduce((acc, kw) => acc + (line.toLowerCase().includes(kw) ? kw.length : 0), 0);

  const rankedLines = [...lineCandidates].sort((a, b) => scoreLine(b) - scoreLine(a));
  if (rankedLines.length > 0 && scoreLine(rankedLines[0]) > 0) {
    const top = rankedLines[0];
    const idx = lineCandidates.indexOf(top);
    const context = [lineCandidates[idx - 1], top, lineCandidates[idx + 1]].filter(Boolean).join(' ');
    const excerpt = context.trim();
    const anchor = anchorIndexInRuleText(ruleText, top, keywords);
    return { excerpt, anchorIndex: anchor >= 0 ? anchor : anchorIndexInRuleText(ruleText, excerpt, keywords) };
  }

  let bestIdx = -1;
  let bestKw = '';
  for (const kw of keywords) {
    const i = lower.indexOf(kw);
    if (i >= 0 && (bestIdx < 0 || i < bestIdx)) {
      bestIdx = i;
      bestKw = kw;
    }
  }
  if (bestIdx >= 0 && bestKw.length > 0) {
    const start = Math.max(0, bestIdx - 60);
    const end = Math.min(ruleText.length, bestIdx + bestKw.length + 220);
    const excerpt = ruleText.slice(start, end).replace(/\s+/g, ' ').trim();
    return { excerpt, anchorIndex: bestIdx };
  }

  const fallback = sentenceCandidates[0];
  return fallback ? { excerpt: fallback, anchorIndex: 0 } : null;
};

const buildCitedRuleMatch = (rule: RuleBlock, queryText: string): GeneralQaMatch | null => {
  const keywords = keywordsForMatch(queryText);
  if (keywords.length === 0) return null;

  const picked = pickExcerptForRule(rule.text, keywords);
  if (!picked) return null;

  const { excerpt, anchorIndex } = picked;
  const { decimal, clauseRoman } = resolveSubsection(rule.ruleNumber, rule.text, anchorIndex);
  const citation =
    decimal != null ? `Rule ${rule.ruleNumber}.${decimal}` : `Rule ${rule.ruleNumber}`;
  const matchWhy = buildMatchWhy(excerpt, keywords, queryText);

  return {
    citation,
    title: titleCase(rule.title),
    clauseRef: clauseRoman,
    matchWhy,
    excerpt,
  };
};

const lookupFallbackMatch = (rule: RuleBlock): GeneralQaMatch => ({
  citation: `Rule ${rule.ruleNumber}`,
  title: titleCase(rule.title),
  clauseRef: null,
  matchWhy: null,
  excerpt: '',
});

const extractRuleNumberLookupMatches = (term: string, rules: RuleBlock[]): GeneralQaMatch[] => {
  const scored = [...rules]
    .map((rule) => ({ rule, score: scoreRuleMatch(rule, term) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ rule }) => buildCitedRuleMatch(rule, term) ?? lookupFallbackMatch(rule));
};

const extractGeneralQaMatches = (question: string, rules: RuleBlock[]): GeneralQaMatch[] => {
  const keywords = keywordsForMatch(question);
  if (keywords.length === 0) return [];

  const scored = rules
    .map((rule) => ({ rule, score: scoreRuleMatch(rule, question) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const matches: GeneralQaMatch[] = [];

  for (const entry of scored) {
    const m = buildCitedRuleMatch(entry.rule, question);
    if (m) matches.push(m);
  }

  return matches.slice(0, 3);
};

function CitedRuleMatchRow({ match }: { match: GeneralQaMatch }) {
  let meta: string | null = null;
  if (match.clauseRef && match.matchWhy) meta = `${match.clauseRef} · ${match.matchWhy}`;
  else if (match.matchWhy) meta = match.matchWhy;
  else if (match.clauseRef) meta = match.clauseRef;
  else if (match.excerpt.length > 0) meta = 'Clause excerpt';

  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionText}>
        - {match.citation} — {match.title}
      </Text>
      {meta ? (
        <Text style={styles.optionSource}>{meta}</Text>
      ) : null}
      {match.excerpt.length > 0 ? <Text style={styles.triggerText}>{match.excerpt}</Text> : null}
    </View>
  );
}

export default function RuleGenie() {
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');

  const allRuleText = useMemo(() => ruleBookText.map((page) => page.text).join('\n'), []);
  const ruleBlocks = useMemo(() => extractRuleBlocks(allRuleText), [allRuleText]);

  const result = useMemo<GenieResult | null>(() => {
    if (!submittedQuestion.trim()) return null;

    const intent = classifyIntent(submittedQuestion);

    if (intent === 'rule-number-lookup') {
      const term = extractLookupTerm(submittedQuestion);
      return {
        intent,
        term,
        matches: extractRuleNumberLookupMatches(term, ruleBlocks),
      };
    }

    if (intent === 'penalty-options') {
      const infraction = detectInfractionFromQuestion(submittedQuestion);
      const target = [...ruleBlocks]
        .map((rule) => ({ rule, score: scoreRuleMatch(rule, infraction) }))
        .sort((a, b) => b.score - a.score)[0]?.rule;

      if (!target) {
        return {
          intent,
          infraction,
          heading: null,
          options: [],
        };
      }

      return {
        intent,
        infraction,
        heading: {
          ruleNumber: target.ruleNumber,
          title: target.title,
        },
        options: extractPenaltyOptions(target.ruleNumber, target.text),
      };
    }

    return {
      intent,
      question: submittedQuestion,
      matches: extractGeneralQaMatches(submittedQuestion, ruleBlocks),
    };
  }, [ruleBlocks, submittedQuestion]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Rule Genie</Text>
        <Text style={styles.subtitle}>
          Supports three intent types: rule number lookup, penalty options, and
          general rule Q&A. Answers are built only from embedded rule clauses with citations.
        </Text>

        <TextInput
          value={question}
          onChangeText={setQuestion}
          style={styles.input}
          placeholder="Examples: What rule number is inciting? / Give me all penalty options for head-butting / When can a goalie not go back on the ice?"
          placeholderTextColor="#888"
          multiline
        />

        <TouchableOpacity
          style={styles.button}
          onPress={() => setSubmittedQuestion(question)}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Run Rule Genie</Text>
        </TouchableOpacity>

        {result && (
          <View style={styles.resultCard}>
            <Text style={styles.intentBadge}>Intent: {result.intent}</Text>

            {result.intent === 'rule-number-lookup' && (
              <>
                <Text style={styles.resultTitle}>
                  Rule number lookup for "{result.term}"
                </Text>
                {result.matches.length > 0 ? (
                  result.matches.map((match) => (
                    <CitedRuleMatchRow
                      key={`${match.citation}-${match.clauseRef ?? ''}-${match.excerpt.slice(0, 40)}`}
                      match={match}
                    />
                  ))
                ) : (
                  <Text style={styles.noResults}>
                    No matching rule title found. Try a specific infraction or keyword.
                  </Text>
                )}
              </>
            )}

            {result.intent === 'penalty-options' && (
              <>
                <Text style={styles.resultTitle}>
                  Penalty options for {titleCase(result.infraction)}
                </Text>
                {result.heading && (
                  <Text style={styles.ruleMeta}>
                    Source Rule: {result.heading.ruleNumber} -{' '}
                    {titleCase(result.heading.title)}
                  </Text>
                )}

                {result.options.length > 0 ? (
                  result.options.map((option) => (
                    <View key={`${option.label}-${option.source}`} style={styles.optionRow}>
                      <Text style={styles.optionText}>
                        - {option.label}
                        {option.automatic ? ' (automatic)' : ''}
                        {option.condition ? ` (${option.condition})` : ''}
                      </Text>
                      <Text style={styles.optionSource}>{option.source}</Text>
                      <Text style={styles.triggerText}>{option.triggerText}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noResults}>
                    No penalty options found from the matched rule block.
                  </Text>
                )}
              </>
            )}

            {result.intent === 'general-rule-qa' && (
              <>
                <Text style={styles.resultTitle}>Best matching rule clauses</Text>
                {result.matches.length > 0 ? (
                  result.matches.map((match) => (
                    <CitedRuleMatchRow
                      key={`${match.citation}-${match.clauseRef ?? ''}-${match.excerpt.slice(0, 40)}`}
                      match={match}
                    />
                  ))
                ) : (
                  <Text style={styles.noResults}>
                    I could not find a confident clause match from the embedded rule text. Try adding key terms (for example: goalkeeper, substitution, line change, penalty bench).
                  </Text>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 8,
    color: '#fff',
    minHeight: 90,
    padding: 12,
    textAlignVertical: 'top',
    backgroundColor: '#121212',
  },
  button: {
    backgroundColor: '#ff6600',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  resultCard: {
    marginTop: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    borderColor: '#2a2a2a',
    borderWidth: 1,
    gap: 8,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  ruleMeta: {
    color: '#ff6600',
    fontSize: 13,
  },
  intentBadge: {
    color: '#9ecbff',
    fontSize: 12,
    fontWeight: '700',
  },
  optionRow: {
    gap: 4,
  },
  optionText: {
    color: '#fff',
    fontSize: 15,
  },
  optionSource: {
    color: '#888',
    fontSize: 12,
  },
  triggerText: {
    color: '#bbb',
    fontSize: 12,
    lineHeight: 18,
  },
  noResults: {
    color: '#bbb',
    fontSize: 14,
    lineHeight: 20,
  },
});
