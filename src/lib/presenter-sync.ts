/**
 * Cross-window sync bus for the presenter.
 *
 * Primary transport: BroadcastChannel (works across separate windows/monitors,
 * same origin). Fallback: localStorage "storage" events, which also fire across
 * windows. Both are wrapped behind the same publish/subscribe API.
 *
 * Catch-up: every published live state is persisted to localStorage, so a
 * newly-opened Output window immediately restores whatever is currently live.
 * It additionally broadcasts a "request-state" message so any Control Panel can
 * re-publish authoritative state.
 */

export type Translation = "WEB" | "KJV" | "ASV";

export type MediaFitMode = "fit" | "fill" | "center";

export type ScriptureFontKey = "sans" | "serif" | "elegant" | "display";

export const SCRIPTURE_FONTS: { key: ScriptureFontKey; label: string; family: string }[] = [
  { key: "sans", label: "Sans", family: "'Barlow', ui-sans-serif, system-ui, sans-serif" },
  { key: "serif", label: "Serif", family: "'Lora', Georgia, 'Times New Roman', serif" },
  {
    key: "elegant",
    label: "Elegant",
    family: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  },
  { key: "display", label: "Bold", family: "'Bebas Neue', 'Barlow', sans-serif" },
];

export const DEFAULT_FONT_KEY: ScriptureFontKey = "sans";
export const DEFAULT_FONT_SCALE = 1;
export const MIN_FONT_SCALE = 0.6;
export const MAX_FONT_SCALE = 1.8;

export function fontFamilyFor(key: ScriptureFontKey | undefined): string {
  return SCRIPTURE_FONTS.find((f) => f.key === key)?.family ?? SCRIPTURE_FONTS[0]!.family;
}

export type LiveState =
  | { mode: "blank"; revision: number }
  | { mode: "black"; revision: number }
  | {
      mode: "image";
      revision: number;
      mediaId: string;
      /** Inline data URL for builtin media; imported media resolves from IndexedDB. */
      src?: string | undefined;
      name: string;
      fit: MediaFitMode;
    }
  | {
      mode: "video";
      revision: number;
      mediaId: string;
      src?: string | undefined;
      name: string;
      fit: MediaFitMode;
      playing: boolean;
      /** Seek target in seconds, applied whenever seekRev changes. */
      seekTo: number;
      seekRev: number;
      loop: boolean;
      muted: boolean;
      /** True for linked YouTube/Vimeo items: src is an iframe embed URL, not a video file. */
      embed?: boolean | undefined;
    }
  | {
      mode: "scripture";
      revision: number;
      verseId: string;
      reference: string;
      text: string;
      translation: Translation;
      /** Optional background image behind the verse text. */
      background?: { mediaId: string; src?: string | undefined } | undefined;
      /** Multiplier applied to the auto-fit verse font size. Defaults to 1. */
      fontScale?: number | undefined;
      /** Which of SCRIPTURE_FONTS to render the verse text in. Defaults to "sans". */
      fontFamily?: ScriptureFontKey | undefined;
    };

export type SyncMessage =
  | { type: "state"; state: LiveState }
  | { type: "request-state"; from: string }
  | { type: "presence"; role: "output" | "control"; clientId: string; at: number }
  | { type: "bye"; clientId: string };

const CHANNEL = "teens-media-presenter";
const STATE_KEY = "tmp:live-state";
const RELAY_KEY = "tmp:relay";

export const INITIAL_STATE: LiveState = { mode: "blank", revision: 0 };

export const clientId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function readPersistedState(): LiveState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as LiveState;
    const modes = ["blank", "black", "scripture", "image", "video"];
    if (parsed && modes.includes(parsed.mode)) return parsed;
  } catch {
    /* ignore */
  }
  return INITIAL_STATE;
}

function persistState(state: LiveState) {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export type SyncBus = {
  publish: (message: SyncMessage) => void;
  close: () => void;
};

export function createBus(onMessage: (message: SyncMessage) => void): SyncBus {
  if (typeof window === "undefined") {
    return { publish: () => {}, close: () => {} };
  }

  const hasBC = typeof BroadcastChannel !== "undefined";
  let channel: BroadcastChannel | null = null;

  const handleIncoming = (message: SyncMessage) => {
    if (message.type === "state") persistState(message.state);
    onMessage(message);
  };

  if (hasBC) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<SyncMessage>) => handleIncoming(event.data);
  }

  // localStorage relay: used as fallback transport, and harmless duplication
  // is filtered by message identity below.
  const seen = new Set<string>();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== RELAY_KEY || !event.newValue) return;
    try {
      const envelope = JSON.parse(event.newValue) as { id: string; message: SyncMessage };
      if (seen.has(envelope.id)) return;
      seen.add(envelope.id);
      handleIncoming(envelope.message);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);

  const publish = (message: SyncMessage) => {
    if (message.type === "state") persistState(message.state);
    if (channel) {
      channel.postMessage(message);
      return;
    }
    const id = `${clientId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    seen.add(id);
    try {
      window.localStorage.setItem(RELAY_KEY, JSON.stringify({ id, message }));
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };

  return { publish, close };
}
