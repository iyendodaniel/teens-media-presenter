import { toast } from "sonner";
import { fetchLicensedVerseText } from "@/lib/bible-api";
import { LICENSED_TRANSLATIONS, type Translation } from "@/lib/presenter-sync";
import { bookNumFromVerseId } from "@/lib/scriptures";
import type { Verse } from "@/lib/scriptures";

// Cache key: "NIV:john-3-16". Lives for the life of the app session —
// fine for a desktop app that restarts occasionally.
const cache = new Map<string, string>();

// Same id on every call, so a burst of failures (e.g. every verse in a
// multi-verse range failing at once via Promise.all) collapses into one
// toast instead of stacking a copy per verse.
const OFFLINE_TOAST_ID = "licensed-translation-offline";

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

  // Checked up front so a dead connection fails instantly with a clear
  // message, instead of the operator waiting on a fetch to time out first.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    toast.error(`${translation} needs an internet connection`, {
      id: OFFLINE_TOAST_ID,
      description: "Connect to the internet, or switch to WEB / KJV / ASV.",
    });
    throw new Error(`Offline - can't load ${translation}`);
  }

  try {
    const text = await fetchLicensedVerseText({
      data: { translation, bookNum, chapter: verse.chapter, verse: verse.verse },
    });
    cache.set(key, text);
    return text;
  } catch (err) {
    // navigator.onLine can say "online" on a connection that's up but has no
    // real route out (captive portal, router down, etc.) - this catches
    // that case, where the failure only shows up once the fetch is tried.
    toast.error(`Couldn't reach ${translation}`, {
      id: OFFLINE_TOAST_ID,
      description: "Check your internet connection, or switch to WEB / KJV / ASV.",
    });
    throw err;
  }
}