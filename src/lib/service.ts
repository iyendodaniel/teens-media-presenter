/**
 * Service plan (running order). Deliberately presentation-type agnostic so
 * scripture, media and future item types (lyrics, timers, YouTube) all share
 * one queue and one Preview -> Go Live path.
 */

export type ServiceItemType = "scripture" | "image" | "video" | "gif" | "note";

export type ServiceItem = {
  id: string;
  type: ServiceItemType;
  label: string;
  detail?: string | undefined;
  /** Set for media-backed items. */
  mediaId?: string | undefined;
};

const KEY = "tmp.service.items";
const EVENT = "tmp:service-changed";

export const DEFAULT_SERVICE: ServiceItem[] = [
  { id: "svc-welcome", type: "note", label: "Welcome" },
  { id: "svc-prayer", type: "note", label: "Opening Prayer" },
  { id: "svc-sermon", type: "note", label: "Sermon" },
];

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
