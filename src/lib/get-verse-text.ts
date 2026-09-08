import { fetchLicensedVerseText } from "@/lib/bible-api";
import { LICENSED_TRANSLATIONS, type Translation } from "@/lib/presenter-sync";
import { bookNumFromVerseId } from "@/lib/scriptures";
import type { Verse } from "@/lib/scriptures";

// Cache key: "NIV:john-3-16". Lives for the life of the app session —
// fine for a desktop app that restarts occasionally.
const cache = new Map<string, string>();

/**
 * Resolves the display text for one verse in one translation, whichever
 * source it needs: instant lookup for WEB/KJV/ASV (already in memory),
 * cache hit for a licensed translation you've already fetched, or a live
 * API.Bible call (cached after) for a licensed translation you haven't.
 */
export async function getVerseText(verse: Verse, translation: Translation): Promise<string> {
  if (!LICENSED_TRANSLATIONS.has(translation)) {
    return verse.text[translation];
  }

  const key = `${translation}:${verse.id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const bookNum = bookNumFromVerseId(verse.id);
  if (bookNum === undefined) throw new Error(`Could not resolve book for verse ${verse.id}`);

  const text = await fetchLicensedVerseText({
    data: { translation, bookNum, chapter: verse.chapter, verse: verse.verse },
  });
  cache.set(key, text);
  return text;
}
