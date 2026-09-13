/**
 * Media library model.
 *
 * Metadata (name, kind, duration, thumbnail, favorite, last-used) lives in
 * localStorage so it is cheap to read synchronously on boot; the heavy file
 * bytes live in IndexedDB (see media-store.ts).
 */

import { putBlob, deleteBlob } from "./media-store";

export type MediaKind = "image" | "video" | "gif";
export type MediaFit = "fit" | "fill" | "center";

export type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  /**
   * "builtin" items carry an inline data URL; "imported" items live in IndexedDB;
   * "linked" items point straight at a remote URL (nothing stored locally).
   */
  source: "builtin" | "imported" | "linked";
  url?: string | undefined;
  /** Data-URL poster frame, generated on import for videos. */
  thumb?: string | undefined;
  /** Seconds, videos only. */
  duration?: number | undefined;
  favorite?: boolean | undefined;
  addedAt: number;
  lastUsedAt?: number | undefined;
  /**
   * Set on "linked" video items from YouTube/Vimeo: the URL is an iframe embed
   * src, not a direct video file, so the Output window renders it in an
   * <iframe> instead of a <video> tag (see MediaStage).
   */
  embed?: boolean | undefined;
  /**
   * "background" items live in their own dedicated Bible Background picker
   * (scripture control panel) and are kept out of the general Media library
   * grid/search/tabs. Undefined means "regular media item".
   */
  collection?: "background" | undefined;
};

const ITEMS_KEY = "tmp.media.items";

/* --------------------------------------------------------------- builtins */

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function gradientSlide(title: string, subtitle: string, from: string, to: string): string {
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
      </linearGradient></defs>
      <rect width="1920" height="1080" fill="url(#g)"/>
      <circle cx="1560" cy="220" r="320" fill="#ffffff" opacity="0.05"/>
      <circle cx="300" cy="900" r="420" fill="#ffffff" opacity="0.04"/>
      <text x="960" y="530" text-anchor="middle" font-family="Bebas Neue, Barlow, sans-serif"
        font-size="150" letter-spacing="8" fill="#f3ede4">${title}</text>
      <text x="960" y="620" text-anchor="middle" font-family="Barlow, sans-serif"
        font-size="52" letter-spacing="10" fill="#f3ede4" opacity="0.65">${subtitle}</text>
    </svg>`,
  );
}

export const BUILTIN_MEDIA: MediaItem[] = [
  {
    id: "builtin-worship-background",
    name: "Main Worship Background.jpg",
    kind: "image",
    source: "builtin",
    url: gradientSlide("WORSHIP", "background", "#1b1207", "#5b3a0d"),
    addedAt: 0,
  },
  {
    id: "builtin-announcement-slide",
    name: "Announcement Slide.png",
    kind: "image",
    source: "builtin",
    url: gradientSlide("ANNOUNCEMENTS", "this sunday", "#0a0908", "#2c2724"),
    addedAt: 0,
  },
  {
    id: "builtin-countdown-background",
    name: "Countdown Background.jpg",
    kind: "image",
    source: "builtin",
    url: gradientSlide("STARTING SOON", "countdown", "#0b1418", "#123640"),
    addedAt: 0,
  },
  {
    id: "builtin-church-logo",
    name: "Church Logo.png",
    kind: "image",
    source: "builtin",
    url: gradientSlide("TEENS CHURCH", "logo", "#100c06", "#3a2a08"),
    addedAt: 0,
  },
  {
    id: "builtin-annual-conference",
    name: "Annual Conference.jpg",
    kind: "image",
    source: "builtin",
    url: gradientSlide("TEC 2026", "annual conference", "#180a12", "#4a1030"),
    addedAt: 0,
  },
];

/* ------------------------------------------------------------- persistence */

export function loadItems(): MediaItem[] {
  if (typeof window === "undefined") return BUILTIN_MEDIA;
  let stored: MediaItem[] = [];
  try {
    const raw = window.localStorage.getItem(ITEMS_KEY);
    if (raw) stored = JSON.parse(raw) as MediaItem[];
  } catch {
    stored = [];
  }
  const byId = new Map<string, MediaItem>();
  for (const item of BUILTIN_MEDIA) byId.set(item.id, { ...item });
  for (const item of stored) {
    const base = byId.get(item.id);
    // Builtin data URLs are never persisted; re-attach them after a reload.
    byId.set(item.id, base ? { ...base, ...item, url: base.url } : item);
  }
  return [...byId.values()];
}

export function saveItems(items: MediaItem[]) {
  try {
    const slim = items.map((item) =>
      item.source === "builtin" ? { ...item, url: undefined, thumb: undefined } : item,
    );
    window.localStorage.setItem(ITEMS_KEY, JSON.stringify(slim));
  } catch {
    /* quota - metadata is best-effort */
  }
}

export async function removeItem(item: MediaItem) {
  if (item.source === "imported") await deleteBlob(item.id);
}

/* ----------------------------------------------------------------- import */

export function kindForFile(file: File): MediaKind | null {
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Grabs a poster frame + duration from a video file, off the main render path. */
async function videoMeta(
  url: string,
): Promise<{ thumb?: string | undefined; duration?: number | undefined }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    const done = (result: { thumb?: string | undefined; duration?: number | undefined }) => {
      video.removeAttribute("src");
      resolve(result);
    };
    const timeout = window.setTimeout(() => done({}), 6000);
    video.onloadeddata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      try {
        const canvas = document.createElement("canvas");
        const scale = 320 / (video.videoWidth || 320);
        canvas.width = 320;
        canvas.height = Math.max(1, Math.round((video.videoHeight || 180) * scale));
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        window.clearTimeout(timeout);
        done({ thumb: canvas.toDataURL("image/jpeg", 0.7), duration });
      } catch {
        window.clearTimeout(timeout);
        done({ duration });
      }
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      done({});
    };
    video.onloadedmetadata = () => {
      if (video.duration && video.duration > 0.2) video.currentTime = 0.1;
    };
  });
}

export async function importFile(file: File, collection?: "background"): Promise<MediaItem | null> {
  const kind = kindForFile(file);
  if (!kind) return null;
  const id = newId();
  await putBlob(id, file);
  const item: MediaItem = {
    id,
    name: file.name,
    kind,
    source: "imported",
    addedAt: Date.now(),
    collection,
  };
  if (kind === "video") {
    const url = URL.createObjectURL(file);
    const meta = await videoMeta(url);
    URL.revokeObjectURL(url);
    item.thumb = meta.thumb;
    item.duration = meta.duration;
  }
  return item;
}

/* -------------------------------------------------------------- linked -- */

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|svg)(\?.*)?$/i;
const GIF_EXT_RE = /\.gif(\?.*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export type LinkedMediaResult =
  | { ok: true; item: MediaItem }
  /** Extension gave no hint - caller should ask the user to pick image/video. */
  | { ok: "ambiguous"; url: string }
  | { ok: false; reason: string };

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Extracts the video id back out of an embed URL built above, e.g.
 * "https://www.youtube.com/embed/dQw4w9WgXcQ?..." -> "dQw4w9WgXcQ". Used to
 * show a static thumbnail (img.youtube.com) wherever we want a preview
 * without loading a second live player alongside Output's.
 */
export function youtubeIdFromEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("youtube.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds a "linked" MediaItem from a pasted URL. YouTube/Vimeo links become
 * embeddable items (`embed: true`); direct image/video links are used as-is.
 * When the file type can't be inferred from the URL, returns "ambiguous" so
 * the caller can ask the operator whether it's an image or a video.
 */
export function createLinkedItem(
  rawUrl: string,
  kindHint?: "image" | "video",
  collection?: "background",
): LinkedMediaResult {
  const url = rawUrl.trim();
  if (!url) return { ok: false, reason: "Enter a URL first." };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) links are supported." };
  }

  const youtube = url.match(YOUTUBE_RE);
  if (youtube?.[1]) {
    // enablejsapi=1 lets the Output window drive play/pause/seek on its own
    // iframe via postMessage (see media-stage.tsx) instead of the Control
    // Panel loading a second, independent copy of the video. origin is the
    // security check YouTube's player does on incoming postMessage commands.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return {
      ok: true,
      item: {
        id: newId(),
        name: `YouTube - ${youtube[1]}`,
        kind: "video",
        source: "linked",
        url: `https://www.youtube.com/embed/${youtube[1]}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(origin)}`,
        embed: true,
        addedAt: Date.now(),
        collection,
      },
    };
  }

  const vimeo = url.match(VIMEO_RE);
  if (vimeo?.[1]) {
    return {
      ok: true,
      item: {
        id: newId(),
        name: `Vimeo - ${vimeo[1]}`,
        kind: "video",
        source: "linked",
        url: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`,
        embed: true,
        addedAt: Date.now(),
        collection,
      },
    };
  }

  let kind: MediaKind | null = kindHint ?? null;
  if (!kind) {
    if (GIF_EXT_RE.test(url)) kind = "gif";
    else if (IMAGE_EXT_RE.test(url)) kind = "image";
    else if (VIDEO_EXT_RE.test(url)) kind = "video";
  }
  if (!kind) return { ok: "ambiguous", url };

  const label = decodeURIComponent(url.split("/").pop() || hostname(url) || "Linked media");
  return {
    ok: true,
    item: {
      id: newId(),
      name: label,
      kind,
      source: "linked",
      url,
      addedAt: Date.now(),
      collection,
    },
  };
}

/* ----------------------------------------------------------------- search */

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Substring + per-word-prefix scoring; runs synchronously on every keystroke. */
export function searchMedia(items: MediaItem[], query: string): MediaItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ item: MediaItem; score: number }> = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    const words = name.split(/[\s._\-]+/).filter(Boolean);
    let score = -1;
    if (name.startsWith(q)) score = 100;
    else if (words.some((w) => w.startsWith(q))) score = 80;
    else if (name.includes(q)) score = 50;
    if (score < 0) continue;
    if (item.favorite) score += 6;
    if (item.lastUsedAt) score += 4;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return scored.map((s) => s.item);
}