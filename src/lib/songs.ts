/**
 * Song/lyrics library. Unlike scripture (bundled, static JSON), there's no
 * public-domain song set to ship - songs are entirely user-created, so this
 * mirrors the media-library.ts persistence pattern (metadata in localStorage,
 * cheap to read synchronously on boot) rather than scriptures.ts's bundled
 * on-demand loading.
 */

export type SongSection = {
  id: string;
  /** "Verse 1", "Chorus", "Bridge", or a custom label. */
  label: string;
  text: string;
};

export type Song = {
  id: string;
  title: string;
  artist?: string | undefined;
  ccli?: string | undefined;
  sections: SongSection[];
  addedAt: number;
  lastUsedAt?: number | undefined;
};

const ITEMS_KEY = "tmp.songs.items";
const EVENT = "tmp:songs-changed";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function newSongSectionId() {
  return newId();
}

export function loadSongs(): Song[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Song[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSongs(songs: Song[]) {
  try {
    window.localStorage.setItem(ITEMS_KEY, JSON.stringify(songs));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeSongs(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function newSong(title: string): Song {
  return {
    id: newId(),
    title: title.trim() || "Untitled Song",
    sections: [{ id: newId(), label: "Verse 1", text: "" }],
    addedAt: Date.now(),
  };
}

export function newSongSection(label = "Verse"): SongSection {
  return { id: newId(), label, text: "" };
}

/** Substring + prefix scoring across title/artist, same shape as searchMedia. */
export function searchSongs(songs: Song[], query: string): Song[] {
  const q = query.trim().toLowerCase();
  if (!q) return songs;
  const scored: Array<{ song: Song; score: number }> = [];
  for (const song of songs) {
    const title = song.title.toLowerCase();
    const artist = (song.artist ?? "").toLowerCase();
    let score = -1;
    if (title.startsWith(q)) score = 100;
    else if (title.includes(q)) score = 60;
    else if (artist.includes(q)) score = 40;
    if (score < 0) continue;
    if (song.lastUsedAt) score += 4;
    scored.push({ song, score });
  }
  scored.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
  return scored.map((s) => s.song);
}

/** Adjacent section within a song, for prev/next-section keyboard navigation. */
export function stepSection(song: Song, currentSectionId: string, direction: 1 | -1): SongSection | undefined {
  const idx = song.sections.findIndex((s) => s.id === currentSectionId);
  if (idx === -1) return undefined;
  return song.sections[idx + direction];
}
