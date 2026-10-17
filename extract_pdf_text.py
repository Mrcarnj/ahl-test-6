"""Extract a rule/situation book PDF into the app's per-page search text JSON.

The app searches this JSON and jumps the PDF viewer to `#page=<page>`, so
`page` is the physical PDF page (1-based), not the number printed on it.

    pip install pymupdf
    python extract_pdf_text.py book.pdf src/lib/SituationBookPdfText.json \
        --strip "NHL Rules" --strip "Situation Handbook"

--strip drops running-header lines that appear on every page; left in, they
make a search for e.g. "rules" match the whole book. Pages with no text
(blank pages) are skipped.
"""

import argparse
import json

import fitz  # pymupdf


def page_text(page, strip):
    # Tabs separate list markers from text in some books; search wants spaces.
    lines = [line.replace("\t", " ").rstrip() for line in page.get_text().split("\n")]
    lines = [line for line in lines if line.strip() and line.strip() not in strip]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("out")
    parser.add_argument("--strip", action="append", default=[],
                        help="running-header line to drop (repeatable)")
    args = parser.parse_args()

    pages = []
    with fitz.open(args.pdf) as doc:
        for i, page in enumerate(doc):
            text = page_text(page, set(args.strip))
            if text:
                pages.append({"page": i + 1, "text": text})

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False, indent=2)
    print(f"{len(pages)} pages with text -> {args.out}")


if __name__ == "__main__":
    main()
