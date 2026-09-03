/**
 * Turns a pasted "order of service" text block into ServiceItem[]. One line
 * in, one item out — matched against the media library by filename so
 * entries like "05 Announcement.mp4" come out already wired to that media
 * item (immediately go-live-able), same as adding it by hand.
 */

import type { MediaItem } from "./media-library";
import { newServiceId, type ServiceItem, type ServiceItemType } from "./service";

const LEADING_MARKER_RE = /^\s*(?:\d+[.)]?|[-*•])\s+/;

function stripLeadingMarker(line: string): string {
  const stripped = line.replace(LEADING_MARKER_RE, "").trim();
  return stripped || line.trim();
}

/**
 * Direction is the reverse of the search box (line text -> best media item),
 * so this is a small dedicated heuristic rather than a reuse of searchMedia:
 * match if the line contains the item's filename (or its stem, extension
 * dropped) or vice versa.
 */
function matchMedia(label: string, items: MediaItem[]): MediaItem | null {
  const norm = label.toLowerCase().trim();
  if (!norm) return null;
  let best: MediaItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const name = item.name.toLowerCase();
    const stem = name.replace(/\.[a-z0-9]+$/, "");
    let score = 0;
    if (norm === name || norm === stem) score = 100;
    else if (norm.includes(name) || (stem.length > 3 && norm.includes(stem))) score = 80;
    else if (name.includes(norm) && norm.length > 3) score = 60;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 60 ? best : null;
}

function typeForMediaKind(kind: MediaItem["kind"]): ServiceItemType {
  return kind; // "image" | "video" | "gif" all line up with ServiceItemType directly.
}

export function parseOrderOfService(text: string, mediaItems: MediaItem[]): ServiceItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw) => {
      const label = stripLeadingMarker(raw);
      const match = matchMedia(label, mediaItems);
      if (match) {
        return {
          id: newServiceId(),
          type: typeForMediaKind(match.kind),
          label: match.name,
          mediaId: match.id,
        };
      }
      return { id: newServiceId(), type: "note" as const, label };
    });
}
