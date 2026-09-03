import indexRaw from "@/data/bible/index.json";
import type { Translation } from "@/lib/presenter-sync";

export type Verse = {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  ref: string;
  text: Record<Translation, string>;
};

export type BookFile = {
  book: string;
  bookNum: number;
  slug: string;
  chapters: number;
  verses: Verse[];
};

export type BookMeta = {
  bookNum: number;
  name: string;
  slug: string;
  abbrevs: string[];
  chapters: number;
  /** Count of verses in each chapter, 1-indexed by position (index 0 = chapter 1). */
  versesPerChapter: number[];
  testament: "OT" | "NT";
};

export const TRANSLATIONS = indexRaw.translations as Translation[];
export const BOOK_META = indexRaw.books as BookMeta[];

export function getBookMeta(bookNum: number): BookMeta | undefined {
  return BOOK_META.find((b) => b.bookNum === bookNum);
}

export function getBookMetaBySlug(slug: string): BookMeta | undefined {
  return BOOK_META.find((b) => b.slug === slug);
}

/* ------------------------------------------------------------------------ */
/* On-demand book loading (one JSON chunk per book, code-split by Vite).    */
/* Nothing here touches the network - the chunks ship inside the app build, */
/* so lookups work fully offline once the app itself has loaded.            */
/* ------------------------------------------------------------------------ */

const bookModules = import.meta.glob<{ default: BookFile }>("../data/bible/books/*.json");

function modulePathFor(meta: BookMeta) {
  return `../data/bible/books/${String(meta.bookNum).padStart(2, "0")}-${meta.slug}.json`;
}

const bookCache = new Map<number, BookFile>();
const bookLoadPromises = new Map<number, Promise<BookFile>>();

export function getCachedBook(bookNum: number): BookFile | undefined {
  return bookCache.get(bookNum);
}

export async function loadBook(bookNum: number): Promise<BookFile> {
  const cached = bookCache.get(bookNum);
  if (cached) return cached;

  const inFlight = bookLoadPromises.get(bookNum);
  if (inFlight) return inFlight;

  const meta = getBookMeta(bookNum);
  if (!meta) throw new Error(`Unknown book number: ${bookNum}`);

  const path = modulePathFor(meta);
  const loader = bookModules[path];
  if (!loader) throw new Error(`No data chunk registered for ${meta.name} (${path})`);

  const promise = loader().then((mod) => {
    const data = mod.default;
    bookCache.set(bookNum, data);
    bookLoadPromises.delete(bookNum);
    return data;
  });
  bookLoadPromises.set(bookNum, promise);
  return promise;
}

export async function getVerse(
  bookNum: number,
  chapter: number,
  verse: number,
): Promise<Verse | undefined> {
  const book = await loadBook(bookNum);
  return book.verses.find((v) => v.chapter === chapter && v.verse === verse);
}

/** Every verse id is `${slug}-${chapter}-${verse}`, so a book number can be recovered from it. */
export function bookNumFromVerseId(id: string): number | undefined {
  const meta = BOOK_META.find((b) => id.startsWith(`${b.slug}-`));
  return meta?.bookNum;
}

export async function findVerseById(id: string): Promise<Verse | undefined> {
  const bookNum = bookNumFromVerseId(id);
  if (bookNum === undefined) return undefined;
  const book = await loadBook(bookNum);
  return book.verses.find((v) => v.id === id);
}

/* ------------------------------------------------------------------------ */
/* Reference parsing - "John 3:16", "Romans 8:28-31", "1 John 4:8", "Ps 23" */
/* ------------------------------------------------------------------------ */

export type ParsedReference = {
  bookMeta: BookMeta;
  chapter: number;
  verseStart: number;
  verseEnd: number; // inclusive; equals verseStart for a single verse
  /** True if the reference spans more than one verse (explicit range or whole chapter). */
  isRange: boolean;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
}

const ABBREV_INDEX = new Map<string, BookMeta>();
for (const meta of BOOK_META) {
  ABBREV_INDEX.set(normalize(meta.name), meta);
  ABBREV_INDEX.set(normalize(meta.name).replace(/\s+/g, ""), meta);
  for (const abbrev of meta.abbrevs) {
    ABBREV_INDEX.set(normalize(abbrev), meta);
    ABBREV_INDEX.set(normalize(abbrev).replace(/\s+/g, ""), meta);
  }
}

function resolveBook(text: string): BookMeta | undefined {
  const norm = normalize(text);
  if (!norm) return undefined;

  const exact = ABBREV_INDEX.get(norm) ?? ABBREV_INDEX.get(norm.replace(/\s+/g, ""));
  if (exact) return exact;

  // Unique-prefix fallback so partial typing ("gene", "revel") still resolves
  // once it's unambiguous - useful while a Quick Search box is mid-type.
  const candidates = BOOK_META.filter((b) => normalize(b.name).startsWith(norm));
  if (candidates.length === 1) return candidates[0];
  return undefined;
}

const REFERENCE_PATTERN = /^(.*?)\s*(\d+)\s*(?::\s*(\d+)\s*(?:[-–-]\s*(\d+))?)?\s*$/;

/**
 * Parses a typed Bible reference into a book/chapter/verse-range. Returns
 * null if the text isn't a recognizable reference (caller should fall back
 * to a plain keyword/book search in that case).
 */
export function parseReference(input: string): ParsedReference | null {
  const raw = input.trim();
  if (!raw) return null;

  const match = raw.match(REFERENCE_PATTERN);
  if (!match) return null;

  const [, bookPart, chapterStr, verseStartStr, verseEndStr] = match;
  if (!bookPart || !bookPart.trim() || !chapterStr) return null;

  const bookMeta = resolveBook(bookPart);
  if (!bookMeta) return null;

  const chapter = parseInt(chapterStr, 10);

  // Single-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude) are
  // conventionally referenced as "Jude 14" meaning verse 14 of the one
  // chapter, not "chapter 14" of a book that only has one chapter.
  if (bookMeta.chapters === 1 && !verseStartStr) {
    const versesInOnlyChapter = bookMeta.versesPerChapter[0] ?? 0;
    if (chapter < 1 || chapter > versesInOnlyChapter) return null;
    return { bookMeta, chapter: 1, verseStart: chapter, verseEnd: chapter, isRange: false };
  }

  if (chapter < 1 || chapter > bookMeta.chapters) return null;
  const versesInChapter = bookMeta.versesPerChapter[chapter - 1] ?? 0;
  if (versesInChapter === 0) return null;

  if (!verseStartStr) {
    // Chapter-only reference ("Psalm 23") -> the whole chapter.
    return {
      bookMeta,
      chapter,
      verseStart: 1,
      verseEnd: versesInChapter,
      isRange: versesInChapter > 1,
    };
  }

  const verseStart = parseInt(verseStartStr, 10);
  if (verseStart < 1 || verseStart > versesInChapter) return null;

  const verseEndRaw = verseEndStr ? parseInt(verseEndStr, 10) : verseStart;
  const verseEnd = Math.max(verseStart, Math.min(verseEndRaw, versesInChapter));

  return { bookMeta, chapter, verseStart, verseEnd, isRange: verseEnd > verseStart };
}

/** Loads and returns every verse covered by a parsed reference, in order. */
export async function resolveReference(ref: ParsedReference): Promise<Verse[]> {
  const book = await loadBook(ref.bookMeta.bookNum);
  return book.verses
    .filter(
      (v) => v.chapter === ref.chapter && v.verse >= ref.verseStart && v.verse <= ref.verseEnd,
    )
    .sort((a, b) => a.verse - b.verse);
}

/**
 * Convenience one-shot: parse text straight to its verses, or null if it
 * isn't a valid reference.
 */
export async function searchReference(input: string): Promise<Verse[] | null> {
  const parsed = parseReference(input);
  if (!parsed) return null;
  const verses = await resolveReference(parsed);
  return verses.length > 0 ? verses : null;
}

/**
 * Keyword search across book names (always available - this list is tiny).
 * Full-Bible free-text search across every translation and verse is a
 * heavier feature slated for the upcoming UI/UX pass; for now, reference
 * search (above) plus this book-name filter keeps the sidebar useful
 * without eagerly loading all 31,000+ verses on every keystroke.
 */
export function filterBookMeta(query: string): BookMeta[] {
  const q = normalize(query);
  if (!q) return BOOK_META;
  return BOOK_META.filter((b) => normalize(b.name).includes(q));
}

/** Adjacent verse in canonical Bible order, loading the next/previous book as needed. */
export async function stepVerse(current: Verse, direction: 1 | -1): Promise<Verse | undefined> {
  const bookNum = bookNumFromVerseId(current.id);
  if (bookNum === undefined) return undefined;
  const book = await loadBook(bookNum);
  const idx = book.verses.findIndex((v) => v.id === current.id);
  if (idx === -1) return undefined;
  const nextIdx = idx + direction;
  if (nextIdx >= 0 && nextIdx < book.verses.length) return book.verses[nextIdx];

  // Crossed a book boundary - load the neighboring book.
  const neighborNum = bookNum + direction;
  const neighborMeta = getBookMeta(neighborNum);
  if (!neighborMeta) return undefined; // start/end of the whole Bible
  const neighbor = await loadBook(neighborNum);
  return direction === 1 ? neighbor.verses[0] : neighbor.verses[neighbor.verses.length - 1];
}
