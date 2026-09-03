import { useCallback, useEffect, useState } from "react";
import {
  importFile,
  kindForFile,
  loadItems,
  removeItem,
  saveItems,
  type MediaItem,
} from "@/lib/media-library";
import { resolveBlobUrl } from "@/lib/media-store";
import {
  loadService,
  newServiceId,
  saveService,
  subscribeService,
  type ServiceItem,
} from "@/lib/service";

export function useMediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [importing, setImporting] = useState(0);

  useEffect(() => setItems(loadItems()), []);

  const update = useCallback((next: MediaItem[]) => {
    setItems(next);
    saveItems(next);
  }, []);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const accepted = [...files].filter((f) => kindForFile(f));
    if (accepted.length === 0) return [] as MediaItem[];
    setImporting((n) => n + accepted.length);
    const created: MediaItem[] = [];
    for (const file of accepted) {
      try {
        const item = await importFile(file);
        if (item) {
          created.push(item);
          // Append incrementally so the grid fills in while the rest decode.
          setItems((prev) => {
            const next = [item, ...prev];
            saveItems(next);
            return next;
          });
        }
      } finally {
        setImporting((n) => Math.max(0, n - 1));
      }
    }
    return created;
  }, []);

  const toggleFavorite = useCallback(
    (id: string) =>
      setItems((prev) => {
        const next = prev.map((i) => (i.id === id ? { ...i, favorite: !i.favorite } : i));
        saveItems(next);
        return next;
      }),
    [],
  );

  const markUsed = useCallback(
    (id: string) =>
      setItems((prev) => {
        const next = prev.map((i) => (i.id === id ? { ...i, lastUsedAt: Date.now() } : i));
        saveItems(next);
        return next;
      }),
    [],
  );

  const remove = useCallback((item: MediaItem) => {
    void removeItem(item);
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== item.id);
      saveItems(next);
      return next;
    });
  }, []);

  const addLinked = useCallback((item: MediaItem) => {
    setItems((prev) => {
      const next = [item, ...prev];
      saveItems(next);
      return next;
    });
  }, []);

  return { items, importFiles, importing, toggleFavorite, markUsed, remove, update, addLinked };
}

/** Resolves a playable/renderable URL for an item in the current window. */
export function useMediaUrl(item: MediaItem | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!item) {
      setUrl(null);
      return;
    }
    if ((item.source === "builtin" || item.source === "linked") && item.url) {
      setUrl(item.url);
      return;
    }
    setUrl(null);
    void resolveBlobUrl(item.id).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.source, item?.url]);

  return url;
}

export function useService() {
  const [items, setItems] = useState<ServiceItem[]>([]);

  useEffect(() => {
    setItems(loadService());
    return subscribeService(() => setItems(loadService()));
  }, []);

  const add = useCallback((item: Omit<ServiceItem, "id">) => {
    const next = [...loadService(), { ...item, id: newServiceId() }];
    setItems(next);
    saveService(next);
  }, []);

  const remove = useCallback((id: string) => {
    const next = loadService().filter((i) => i.id !== id);
    setItems(next);
    saveService(next);
  }, []);

  /** Wholesale swap — used by the "Paste order of service" import. */
  const replace = useCallback((next: ServiceItem[]) => {
    setItems(next);
    saveService(next);
  }, []);

  return { items, add, remove, replace };
}
