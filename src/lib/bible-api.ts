import { createServerFn } from "@tanstack/react-start";
import { usfmCodeFor } from "@/lib/bible-book-codes";
import { getBookMeta } from "@/lib/scriptures";
import type { Translation } from "@/lib/presenter-sync";

/** Translations served by API.Bible (rest.api.bible) - id from your dashboard. */
const API_BIBLE_IDS: Partial<Record<Translation, string>> = {
  NIV: "78a9f6124f344018-01",
  MSG: "6f11a7de016f942e-01",
  AMP: "a81b73293d3080c9-01",
};

type FetchVerseInput = {
  translation: Translation;
  bookNum: number;
  chapter: number;
  verse: number;
};

async function fetchFromApiBible(bibleId: string, bookNum: number, chapter: number, verse: number) {
  const key = process.env["API_BIBLE_KEY"];
  if (!key) throw new Error("API_BIBLE_KEY is not set");

  const usfm = usfmCodeFor(bookNum);
  const url = `https://rest.api.bible/v1/bibles/${bibleId}/verses/${usfm}.${chapter}.${verse}`;

  const res = await fetch(`${url}?content-type=text`, {
    headers: { "api-key": key },
  });
  if (!res.ok) {
    throw new Error(`API.Bible request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: { content: string } };
  return json.data.content.trim();
}

async function fetchFromEsvApi(bookNum: number, chapter: number, verse: number) {
  const key = process.env["ESV_API_KEY"];
  if (!key) throw new Error("ESV_API_KEY is not set");

  const meta = getBookMeta(bookNum);
  if (!meta) throw new Error(`No book metadata for book number ${bookNum}`);

  // Crossway's API takes a plain-text reference, not a book code - "John 3:16".
  const passage = `${meta.name} ${chapter}:${verse}`;
  const url = new URL("https://api.esv.org/v3/passage/text/");
  url.searchParams.set("q", passage);
  // Strip everything but the verse itself - footnotes/headings/verse numbers
  // would otherwise show up inline in the returned text, wrong for a
  // fullscreen display.
  url.searchParams.set("include-footnotes", "false");
  url.searchParams.set("include-footnote-body", "false");
  url.searchParams.set("include-headings", "false");
  url.searchParams.set("include-verse-numbers", "false");
  url.searchParams.set("include-short-copyright", "false");
  url.searchParams.set("include-passage-references", "false");

  const res = await fetch(url, {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) {
    throw new Error(`ESV API request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { passages: string[] };
  const text = json.passages[0]?.trim();
  if (!text) throw new Error(`ESV API returned no passage for "${passage}"`);
  return text;
}

/**
 * Runs server-side only — this is what keeps API_BIBLE_KEY / ESV_API_KEY out
 * of the Electron renderer bundle. The client calls this like a normal
 * async function; TanStack Start handles the fetch under the hood.
 */
export const fetchLicensedVerseText = createServerFn({ method: "GET" })
  .validator((input: FetchVerseInput) => input)
  .handler(async ({ data }) => {
    if (data.translation === "ESV") {
      return fetchFromEsvApi(data.bookNum, data.chapter, data.verse);
    }
    const bibleId = API_BIBLE_IDS[data.translation];
    if (!bibleId) throw new Error(`No source configured for translation ${data.translation}`);
    return fetchFromApiBible(bibleId, data.bookNum, data.chapter, data.verse);
  });
