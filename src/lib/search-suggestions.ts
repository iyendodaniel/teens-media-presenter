import { BOOK_META, getCachedBook, type BookMeta } from "@/lib/scriptures";
import type { Translation } from "@/lib/presenter-sync";

/**
 * Command-palette style suggestions for the Scripture search overlay.
 *
 * This is a pure, synchronous, per-keystroke helper: it never loads data.
 * If the matching book chunk happens to already be cached, verse previews
 * are filled in; otherwise the suggestion still works and the caller loads
 * the book when the entry is chosen.
 */

export type Suggestion =
  | { kind: "book"; key: string; meta: BookMeta; label: string; detail: string }
  | { kind: "chapter"; key: string; meta: BookMeta; chapter: number; label: string; detail: string }
  | {
      kind: "verse";
      key: string;
      meta: BookMeta;
      chapter: number;
      verseStart: number;
      verseEnd: number;
      label: string;
      detail: string;
    };

function normalize(s: string): string {
  return s.toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
}

const QUERY_PATTERN =
  /^\s*([^0-9]*?(?:^\s*[1-3]\s*[a-zA-Z][^0-9]*)?)\s*(\d+)?\s*(?::\s*(\d+)?\s*(?:[-–-]\s*(\d+)?)?)?\s*$/;

/** Splits "1 john 3:1" into { bookPart: "1 john", chapter: "3", verse: "1" }. */
function splitQuery(query: string) {
  const raw = query.trim();
  // Leading book number (1/2/3 John, 1 Kings…) must not be read as a chapter.
  const lead = raw.match(/^([1-3])\s*([a-zA-Z].*)$/);
  const rest = lead ? lead[2]! : raw;
  const prefix = lead ? `${lead[1]} ` : "";
  const m = rest.match(QUERY_PATTERN);
  if (!m) return null;
  return {
    bookPart: `${prefix}${(m[1] ?? "").trim()}`.trim(),
    chapter: m[2] ?? "",
    verse: m[3] ?? "",
    verseEnd: m[4] ?? "",
    hasColon: /:/.test(rest),
  };
}

function matchBooks(bookPart: string): BookMeta[] {
  const q = normalize(bookPart);
  if (!q) return [];
  const compact = q.replace(/\s+/g, "");
  const scored = BOOK_META.map((b) => {
    const name = normalize(b.name);
    const nameCompact = name.replace(/\s+/g, "");
    const abbrevHit = b.abbrevs.some((a) => normalize(a).startsWith(q));
    let score = -1;
    if (name === q || nameCompact === compact) score = 0;
    else if (name.startsWith(q) || nameCompact.startsWith(compact)) score = 1;
    else if (abbrevHit) score = 2;
    else if (name.includes(q)) score = 3;
    return { b, score };
  }).filter((s) => s.score >= 0);
  scored.sort((a, b) => a.score - b.score || a.b.bookNum - b.b.bookNum);
  return scored.map((s) => s.b);
}

function verseText(meta: BookMeta, chapter: number, verse: number, translation: Translation) {
  const book = getCachedBook(meta.bookNum);
  if (!book) return "";
  const v = book.verses.find((x) => x.chapter === chapter && x.verse === verse);
  return v ? v.text[translation] : "";
}

function versesIn(meta: BookMeta, chapter: number): number {
  return meta.versesPerChapter[chapter - 1] ?? 0;
}

const MAX = 40;

export function buildSuggestions(query: string, translation: Translation): Suggestion[] {
  const parts = splitQuery(query);
  if (!parts) return [];
  const { bookPart, chapter, verse, verseEnd, hasColon } = parts;
  if (!bookPart) return [];

  const books = matchBooks(bookPart);
  if (books.length === 0) return [];

  // Still typing the book name - offer books.
  if (!chapter) {
    return books.slice(0, MAX).map((meta) => ({
      kind: "book" as const,
      key: `b-${meta.bookNum}`,
      meta,
      label: meta.name,
      detail: `${meta.chapters} chapter${meta.chapters === 1 ? "" : "s"}`,
    }));
  }

  const meta = books[0]!;
  const out: Suggestion[] = [];

  // Chapter digits typed, no verse yet: exact chapter first, then chapters
  // that start with the same digits ("3" -> 3, 30, 31…).
  if (!hasColon) {
    const chapters = Array.from({ length: meta.chapters }, (_, i) => i + 1)
      .filter((c) => String(c) === chapter || String(c).startsWith(chapter))
      .sort((a, b) => (String(a) === chapter ? -1 : String(b) === chapter ? 1 : a - b));
    for (const c of chapters.slice(0, MAX)) {
      out.push({
        kind: "chapter",
        key: `c-${meta.bookNum}-${c}`,
        meta,
        chapter: c,
        label: `${meta.name} ${c}`,
        detail: `${versesIn(meta, c)} verses`,
      });
    }
    // Other books that also matched stay reachable.
    for (const other of books.slice(1, 6)) {
      out.push({
        kind: "book",
        key: `b-${other.bookNum}`,
        meta: other,
        label: other.name,
        detail: `${other.chapters} chapters`,
      });
    }
    return out.slice(0, MAX);
  }

  const chapterNum = parseInt(chapter, 10);
  if (!chapterNum || chapterNum > meta.chapters) return [];
  const total = versesIn(meta, chapterNum);

  if (!verse) {
    out.push({
      kind: "verse",
      key: `v-${meta.bookNum}-${chapterNum}-all`,
      meta,
      chapter: chapterNum,
      verseStart: 1,
      verseEnd: total,
      label: `${meta.name} ${chapterNum}`,
      detail: `Whole chapter · ${total} verses`,
    });
    for (let v = 1; v <= Math.min(total, MAX - 1); v++) {
      out.push({
        kind: "verse",
        key: `v-${meta.bookNum}-${chapterNum}-${v}`,
        meta,
        chapter: chapterNum,
        verseStart: v,
        verseEnd: v,
        label: `${meta.name} ${chapterNum}:${v}`,
        detail: verseText(meta, chapterNum, v, translation),
      });
    }
    return out;
  }

  const startNum = parseInt(verse, 10);

  // Explicit range "3:16-18"
  if (verseEnd) {
    const endNum = Math.min(parseInt(verseEnd, 10), total);
    if (startNum >= 1 && startNum <= total && endNum >= startNum) {
      out.push({
        kind: "verse",
        key: `v-${meta.bookNum}-${chapterNum}-${startNum}-${endNum}`,
        meta,
        chapter: chapterNum,
        verseStart: startNum,
        verseEnd: endNum,
        label: `${meta.name} ${chapterNum}:${startNum}-${endNum}`,
        detail: `Range · ${endNum - startNum + 1} verses`,
      });
    }
  }

  // Verses whose number starts with the typed digits: "1" -> 1, 10-19, 100…
  const candidates: number[] = [];
  for (let v = 1; v <= total; v++) {
    if (String(v) === verse) candidates.unshift(v);
    else if (String(v).startsWith(verse)) candidates.push(v);
  }
  for (const v of candidates.slice(0, MAX)) {
    out.push({
      kind: "verse",
      key: `v-${meta.bookNum}-${chapterNum}-${v}`,
      meta,
      chapter: chapterNum,
      verseStart: v,
      verseEnd: v,
      label: `${meta.name} ${chapterNum}:${v}`,
      detail: verseText(meta, chapterNum, v, translation),
    });
  }
  return out.slice(0, MAX);
}
