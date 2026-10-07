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
  /** Per-song display style - saved with the song so it comes back next time. */
  position?: LyricsPosition | undefined;
  fontScale?: number | undefined;
  background?: StageBackground | undefined;
  addedAt: number;
  lastUsedAt?: number | undefined;
};

import type { LyricsPosition, StageBackground } from "./presenter-sync";

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

/* ------------------------------------------------------- paste-a-whole-song */

export type SplitMode = "auto" | "blocks" | "lines" | "pairs";

const HEADER_RE =
  /^\s*[[(]?\s*(verse|chorus|pre-?chorus|bridge|intro|outro|tag|refrain|hook|interlude)\s*(\d+)?\s*[\])]?\s*:?\s*$/i;

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Turns one big pasted lyric into sections.
 *  - "blocks": a blank line starts a new section (how lyrics are normally pasted)
 *  - "lines":  every line is its own section (one slide per line)
 *  - "pairs":  every 2 lines is a section
 *  - "auto":   blocks if the paste has blank lines, otherwise lines
 * Headers like "[Chorus]" or "Verse 2:" are used as labels, not as lyrics.
 */
export function splitLyrics(raw: string, mode: SplitMode = "auto"): Array<{ label: string; text: string }> {
  const blocks: Array<{ label?: string; lines: string[] }> = [];
  let current: { label?: string; lines: string[] } = { lines: [] };
  const flush = () => {
    if (current.lines.length) blocks.push(current);
    current = { lines: [] };
  };

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const header = HEADER_RE.exec(line);
    if (header) {
      flush();
      current = { label: `${titleCase(header[1]!)}${header[2] ? ` ${header[2]}` : ""}`, lines: [] };
    } else if (!line.trim()) {
      flush();
    } else {
      current.lines.push(line.trim());
    }
  }
  flush();

  const effective: SplitMode = mode === "auto" ? (blocks.length > 1 ? "blocks" : "lines") : mode;
  const size = effective === "pairs" ? 2 : 1;

  const out: Array<{ label: string; text: string }> = [];
  let verseNo = 0;
  for (const block of blocks) {
    const chunks: string[][] = [];
    if (effective === "blocks") chunks.push(block.lines);
    else for (let i = 0; i < block.lines.length; i += size) chunks.push(block.lines.slice(i, i + size));

    chunks.forEach((chunk, i) => {
      const label = block.label
        ? chunks.length > 1
          ? `${block.label} (${i + 1})`
          : block.label
        : `Verse ${++verseNo}`;
      out.push({ label, text: chunk.join("\n") });
    });
  }
  return out;
}
