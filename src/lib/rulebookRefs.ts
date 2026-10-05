// src/lib/rulebookRefs.ts
//
// Works out which rule a spot in the rulebook text belongs to, so a search hit
// can say "75.4 (iii)" rather than just a page. The book is read front to back
// and every rule heading ("Rule 75 – Unsportsmanlike Conduct"), sub-rule
// ("75.4") and numbered item ("(iii)") is recorded with its position; a hit
// belongs to the last one at or before it, even when that was pages earlier.

export type BookPage = { page: number; text: string };

export type RuleRef = {
  rule: number;
  ruleName: string;
  /** Sub-rule number after the dot, e.g. 4 for 75.4. */
  sub: number | null;
  /** Roman numeral of the numbered item, e.g. "iii". */
  item: string | null;
};

type RuleMark = { offset: number; ref: RuleRef | null };
type PageRefs = { start: RuleRef | null; marks: RuleMark[] };

// The text is a PDF extraction, so a line that looks like a heading isn't
// always one: rule names show up in the table of contents and mid-sentence
// ("…Rule 75 – Unsportsmanlike Conduct shall be applied"), and a wrapped
// sentence can start a line with "69.6 for exception". Headings only count
// when they come in order: Rule N+1 after Rule N, and N.x only inside Rule N
// with x rising.
const RULE_HEADING = /^\s*Rule\s+(\d{1,2})\s*[–-]\s*(.+?)\s*$/;
const SUB_RULE = /^\s*(\d{1,2})\.(\d{1,2})(?:\s*$|\s+(?=[A-Z]))/;
const ITEM = /^\s*\(([ivx]+)\)(?=\s|$)/;
const TOC_LEADER = /\.{4,}/;

export const formatRuleRef = (ref: RuleRef) => {
  if (ref.sub === null) return `Rule ${ref.rule}`;
  const base = `${ref.rule}.${ref.sub}`;
  return ref.item ? `${base} (${ref.item})` : base;
};

/**
 * Builds the rule markers for every page. `isRulePage` says whether a page is
 * rule text at all; the reference tables, index and the like have numbered
 * lists of their own that would otherwise read as items of the last rule.
 */
export const buildRuleRefs = (
  pages: BookPage[],
  isRulePage: (page: number) => boolean,
): Map<number, PageRefs> => {
  const byPage = new Map<number, PageRefs>();
  let current: RuleRef | null = null;

  for (const { page, text } of pages) {
    if (!isRulePage(page)) {
      byPage.set(page, { start: null, marks: [] });
      continue;
    }

    const entry: PageRefs = { start: current, marks: [] };
    let offset = 0;
    for (const line of text.split("\n")) {
      const next = nextRef(current, line);
      if (next) {
        current = next;
        entry.marks.push({ offset, ref: current });
      }
      offset += line.length + 1;
    }
    byPage.set(page, entry);
  }

  return byPage;
};

const nextRef = (current: RuleRef | null, line: string): RuleRef | null => {
  if (TOC_LEADER.test(line)) return null;

  const heading = line.match(RULE_HEADING);
  if (heading && Number(heading[1]) === (current?.rule ?? 0) + 1) {
    return { rule: Number(heading[1]), ruleName: heading[2], sub: null, item: null };
  }
  if (!current) return null;

  const sub = line.match(SUB_RULE);
  if (
    sub &&
    Number(sub[1]) === current.rule &&
    Number(sub[2]) > (current.sub ?? 0)
  ) {
    return { ...current, sub: Number(sub[2]), item: null };
  }

  const item = line.match(ITEM);
  if (item) return { ...current, item: item[1] };

  return null;
};

/** The rule a character offset in a page's text falls under. */
export const ruleRefAt = (
  refs: Map<number, PageRefs>,
  page: number,
  offset: number,
): RuleRef | null => {
  const entry = refs.get(page);
  if (!entry) return null;
  let ref = entry.start;
  for (const mark of entry.marks) {
    if (mark.offset > offset) break;
    ref = mark.ref;
  }
  return ref;
};
