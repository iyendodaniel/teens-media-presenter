/**
 * Service plan (running order). Deliberately presentation-type agnostic so
 * scripture, media and future item types (lyrics, timers, YouTube) all share
 * one queue and one Preview -> Go Live path.
 *
 * Every item is self-contained: enough is stored on the item itself to
 * reconstruct the matching LiveState and push it live directly from the
 * builder, without needing to look anything up in the media library or
 * scripture index first (media items are the one exception - they resolve
 * their src from the media library by id, same as everywhere else).
 */

import type { LiveState, Translation } from "./presenter-sync";

export type ServiceItemType = "scripture" | "song" | "image" | "video" | "gif" | "note";

/** Enough of a scripture selection to reconstruct `LiveState` for mode "scripture". */
export type ServiceScriptureData = {
  verseId: string;
  reference: string;
  text: string;
  translation: Translation;
};

/** Enough of a song section to reconstruct `LiveState` for mode "song". */
export type ServiceSongData = {
  songId: string;
  title: string;
  section: string;
  text: string;
};

export type ServiceItem = {
  id: string;
  type: ServiceItemType;
  label: string;
  detail?: string | undefined;
  /** Set for media-backed items (image/video/gif). */
  mediaId?: string | undefined;
  /** Set for scripture items - carries the full go-live payload. */
  scripture?: ServiceScriptureData | undefined;
  /** Set for song items - carries the full go-live payload. */
  song?: ServiceSongData | undefined;
};

const KEY = "tmp.service.items";
const EVENT = "tmp:service-changed";

export const DEFAULT_SERVICE: ServiceItem[] = [
  { id: "svc-welcome", type: "note", label: "Welcome" },
  { id: "svc-prayer", type: "note", label: "Opening Prayer" },
  { id: "svc-sermon", type: "note", label: "Sermon" },
];

/** Whether clicking this item can send something live directly. */
export function isLiveCapable(item: ServiceItem): boolean {
  switch (item.type) {
    case "scripture":
      return !!item.scripture;
    case "song":
      return !!item.song;
    case "image":
    case "video":
    case "gif":
      return !!item.mediaId;
    default:
      return false;
  }
}

/**
 * Builds the LiveState a service item would push if sent live right now.
 * Returns null for items that aren't go-live capable (plain notes, or media
 * items missing a mediaId). Image/video items need the resolved media
 * src/fit, which the caller already has via the media library - pass it in
 * as `mediaExtra`.
 */
export function liveStateForServiceItem(
  item: ServiceItem,
  mediaExtra?: { src?: string; fit?: "fit" | "fill" | "center"; embed?: boolean },
): LiveState | null {
  if (item.type === "scripture" && item.scripture) {
    return {
      mode: "scripture",
      revision: 0,
      verseId: item.scripture.verseId,
      reference: item.scripture.reference,
      text: item.scripture.text,
      translation: item.scripture.translation,
    };
  }
  if (item.type === "song" && item.song) {
    return {
      mode: "song",
      revision: 0,
      songId: item.song.songId,
      title: item.song.title,
      section: item.song.section,
      text: item.song.text,
    };
  }
  if ((item.type === "image" || item.type === "video" || item.type === "gif") && item.mediaId) {
    if (item.type === "video") {
      return {
        mode: "video",
        revision: 0,
        mediaId: item.mediaId,
        src: mediaExtra?.src,
        name: item.label,
        fit: mediaExtra?.fit ?? "fit",
        playing: true,
        seekTo: 0,
        seekRev: 0,
        loop: false,
        muted: false,
        embed: mediaExtra?.embed,
      };
    }
    return {
      mode: "image",
      revision: 0,
      mediaId: item.mediaId,
      src: mediaExtra?.src,
      name: item.label,
      fit: mediaExtra?.fit ?? "fit",
    };
  }
  return null;
}

export function loadService(): ServiceItem[] {
  if (typeof window === "undefined") return DEFAULT_SERVICE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SERVICE;
    const parsed = JSON.parse(raw) as ServiceItem[];
    return Array.isArray(parsed) ? parsed : DEFAULT_SERVICE;
  } catch {
    return DEFAULT_SERVICE;
  }
}

export function saveService(items: ServiceItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeService(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function newServiceId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
