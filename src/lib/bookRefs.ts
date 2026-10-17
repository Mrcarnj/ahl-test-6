// src/lib/bookRefs.ts
//
// Works out where in a book a spot in its extracted text sits, so a search hit
// can say "75.4 (iii)" (rulebook) or "8E" (situation book) rather than just a
// page. Each book is read front to back and every heading is recorded with its
// position; a hit belongs to the last one at or before it, even when that was
// pages earlier.

import { toTitleCase } from "@/src/lib/bookSearch";

export type BookPage = { page: number; text: string };

type Mark<T> = { offset: number; ref: T | null };
type PageRefs<T> = { start: T | null; marks: Mark<T>[] };
export type BookRefs<T> = Map<number, PageRefs<T>>;

// Table-of-contents lines ("Rule 75 – Unsportsmanlike Conduct ......... 162")
// look like headings; the dot leaders give them away.
const TOC_LEADER = /\.{4,}/;

/**
 * Reads the pages in order. `step` sees each line with the ref in force before
 * it and returns the new ref when the line is a heading, otherwise undefined.
 */
const buildRefs = <T>(
  pages: BookPage[],
  step: (current: T | null, line: string, lineIndex: number) => T | null | undefined,
  isRefPage: (page: number) => boolean = () => true,
): BookRefs<T> => {
  const byPage: BookRefs<T> = new Map();
  let current: T | null = null;

  for (const { page, text } of pages) {
    if (!isRefPage(page)) {
      byPage.set(page, { start: null, marks: [] });
      continue;
    }

    const entry: PageRefs<T> = { start: current, marks: [] };
    let offset = 0;
    text.split("\n").forEach((line, lineIndex) => {
      const next = TOC_LEADER.test(line) ? undefined : step(current, line, lineIndex);
      if (next !== undefined) {
        current = next;
        entry.marks.push({ offset, ref: current });
      }
      offset += line.length + 1;
    });
    byPage.set(page, entry);
  }

  return byPage;
};

/** The ref a character offset in a page's text falls under. */
export const refAt = <T>(refs: BookRefs<T>, page: number, offset: number): T | null => {
  const entry = refs.get(page);
  if (!entry) return null;
  let ref = entry.start;
  for (const mark of entry.marks) {
    if (mark.offset > offset) break;
    ref = mark.ref;
  }
  return ref;
};

// ---------------------------------------------------------------- Rulebook --

export type RuleRef = {
  rule: number;
  ruleName: string;
  /** Sub-rule number after the dot, e.g. 4 for 75.4. */
  sub: number | null;
  /** Roman numeral of the numbered item, e.g. "iii". */
  item: string | null;
};

// The text is a PDF extraction, so a line that looks like a heading isn't
// always one: rule names show up mid-sentence ("…Rule 75 – Unsportsmanlike
// Conduct shall be applied"), and a wrapped sentence can start a line with
// "69.6 for exception". Headings only count when they come in order: Rule N+1
// after Rule N, and N.x only inside Rule N with x rising.
const RULE_HEADING = /^\s*Rule\s+(\d{1,2})\s*[–-]\s*(.+?)\s*$/;
const SUB_RULE = /^\s*(\d{1,2})\.(\d{1,2})(?:\s*$|\s+(?=[A-Z]))/;
const ITEM = /^\s*\(([ivx]+)\)(?=\s|$)/;

export const formatRuleRef = (ref: RuleRef) => {
  if (ref.sub === null) return `Rule ${ref.rule}`;
  const base = `${ref.rule}.${ref.sub}`;
  return ref.item ? `${base} (${ref.item})` : base;
};

const ruleStep = (current: RuleRef | null, line: string) => {
  const heading = line.match(RULE_HEADING);
  if (heading && Number(heading[1]) === (current?.rule ?? 0) + 1) {
    return { rule: Number(heading[1]), ruleName: heading[2], sub: null, item: null };
  }
  if (!current) return undefined;

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

  return undefined;
};

/**
 * `isRulePage` says whether a page is rule text at all; the reference tables,
 * index and the like have numbered lists of their own that would otherwise
 * read as items of the last rule.
 */
export const buildRuleRefs = (
  pages: BookPage[],
  isRulePage: (page: number) => boolean,
): BookRefs<RuleRef> => buildRefs(pages, ruleStep, isRulePage);

// ---------------------------------------------------------- Situation book --

export type SituationRef = {
  section: string | null;
  rule: number | null;
  ruleName: string | null;
  /** The situation's label, e.g. "8E" or "M-1". */
  situation: string | null;
};

// Every page carries a running "Rule 8 – Injured Players" header in its first
// lines (after the printed page number); the same words can turn up in an
// answer further down, so only the top of the page counts. Situations are
// labelled on a line of their own just above "SITUATION": "8E", "85EE", and
// "M-1" in the Miscellaneous section at the end.
const SITUATION_RULE_HEADER = /^\s*Rule\s+(\d{1,2})\s*[–-]\s*(.+?)\s*$/;
const SITUATION_SECTION = /^\s*SECTION\s+(\d+)\s*(?:[–-]\s*(.+?)\s*(?:\(Continued\))?)?\s*$/i;
// Some section pages break the name onto its own line: "SECTION 6" then
// "PHYSICAL INFRACTIONS".
const UNNAMED_SECTION = /^Section \d+$/;
const SECTION_NAME = /^\s*[A-Z][A-Z\s&/-]+\s*$/;
const SITUATION_ID = /^\s*(\d{1,2})[A-Z]{1,2}\s*$/;
const MISC_ID = /^\s*M-\d+\s*$/;
const MISC_HEADER = /^\s*miscellaneous\s*$/i;

const situationStep = (
  current: SituationRef | null,
  line: string,
  lineIndex: number,
): SituationRef | undefined => {
  const empty: SituationRef = { section: null, rule: null, ruleName: null, situation: null };
  const base = current ?? empty;

  const section = line.match(SITUATION_SECTION);
  if (section) {
    return {
      ...empty,
      section: section[2] ? toTitleCase(section[2]) : `Section ${section[1]}`,
    };
  }
  if (
    current?.section &&
    UNNAMED_SECTION.test(current.section) &&
    SECTION_NAME.test(line)
  ) {
    return { ...current, section: toTitleCase(line.trim()) };
  }

  if (lineIndex <= 2) {
    if (MISC_HEADER.test(line)) {
      return base.section === "Miscellaneous"
        ? undefined
        : { ...empty, section: "Miscellaneous" };
    }
    const header = line.match(SITUATION_RULE_HEADER);
    if (header) {
      const rule = Number(header[1]);
      // Repeated on every page of the rule: only a new rule resets the label.
      if (rule === base.rule) return undefined;
      return { ...base, rule, ruleName: header[2], situation: null };
    }
  }

  const id = line.match(SITUATION_ID);
  if (id) {
    const rule = Number(id[1]);
    return {
      ...base,
      rule,
      ruleName: rule === base.rule ? base.ruleName : null,
      situation: line.trim(),
    };
  }

  if (MISC_ID.test(line)) {
    return { ...empty, section: "Miscellaneous", situation: line.trim() };
  }

  return undefined;
};

// The contents pages head their columns "PAGE"; their section lines carry no
// dot leaders, so they're left out as a whole.
const isContentsPage = (text: string) => /^\s*(?:PAGE|Table of Contents)\s*$/m.test(text);

export const buildSituationRefs = (pages: BookPage[]): BookRefs<SituationRef> => {
  const contents = new Set(pages.filter((p) => isContentsPage(p.text)).map((p) => p.page));
  return buildRefs(pages, situationStep, (page) => !contents.has(page));
};
