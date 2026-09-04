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
  loadSongs,
  newSong as createNewSong,
  newSongSection,
  saveSongs,
  subscribeSongs,
  type Song,
  type SongSection,
} from "@/lib/songs";
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

  const importFiles = useCallback(async (files: FileList | File[], collection?: "background") => {
    const accepted = [...files].filter((f) => kindForFile(f));
    if (accepted.length === 0) return [] as MediaItem[];
    setImporting((n) => n + accepted.length);
    const created: MediaItem[] = [];
    for (const file of accepted) {
      try {
        const item = await importFile(file, collection);
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

/**
 * Resolves a renderable URL from a raw mediaId/src pair (as carried on
 * LiveState, e.g. a scripture background) rather than a full MediaItem.
 * Builtin/linked items carry `src` directly; imported items resolve from
 * IndexedDB by id.
 */
export function useResolvedUrl(mediaId?: string | null, src?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!mediaId) {
      setUrl(null);
      return;
    }
    if (src) {
      setUrl(src);
      return;
    }
    setUrl(null);
    void resolveBlobUrl(mediaId).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaId, src]);

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

  const duplicate = useCallback((id: string) => {
    const current = loadService();
    const idx = current.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const copy = { ...current[idx]!, id: newServiceId() };
    const next = [...current.slice(0, idx + 1), copy, ...current.slice(idx + 1)];
    setItems(next);
    saveService(next);
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    const current = loadService();
    const fromIdx = current.findIndex((i) => i.id === fromId);
    const toIdx = current.findIndex((i) => i.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const next = [...current];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setItems(next);
    saveService(next);
  }, []);

  /** Appends new items to the end of the current list - the default for pasting an order of service. */
  const append = useCallback((newItems: ServiceItem[]) => {
    const next = [...loadService(), ...newItems];
    setItems(next);
    saveService(next);
  }, []);

  /** Wholesale swap - the explicit "replace entire service" action. */
  const replace = useCallback((next: ServiceItem[]) => {
    setItems(next);
    saveService(next);
  }, []);

  return { items, add, remove, duplicate, reorder, append, replace };
}

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    setSongs(loadSongs());
    return subscribeSongs(() => setSongs(loadSongs()));
  }, []);

  const create = useCallback((title: string) => {
    const song = createNewSong(title);
    const next = [song, ...loadSongs()];
    setSongs(next);
    saveSongs(next);
    return song;
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<Song, "id">>) => {
    const next = loadSongs().map((s) => (s.id === id ? { ...s, ...patch } : s));
    setSongs(next);
    saveSongs(next);
  }, []);

  const remove = useCallback((id: string) => {
    const next = loadSongs().filter((s) => s.id !== id);
    setSongs(next);
    saveSongs(next);
  }, []);

  const markUsed = useCallback((id: string) => {
    const next = loadSongs().map((s) => (s.id === id ? { ...s, lastUsedAt: Date.now() } : s));
    setSongs(next);
    saveSongs(next);
  }, []);

  const addSection = useCallback((songId: string, label?: string) => {
    const section: SongSection = newSongSection(label);
    const next = loadSongs().map((s) =>
      s.id === songId ? { ...s, sections: [...s.sections, section] } : s,
    );
    setSongs(next);
    saveSongs(next);
    return section;
  }, []);

  const updateSection = useCallback(
    (songId: string, sectionId: string, patch: Partial<Omit<SongSection, "id">>) => {
      const next = loadSongs().map((s) =>
        s.id === songId
          ? {
              ...s,
              sections: s.sections.map((sec) =>
                sec.id === sectionId ? { ...sec, ...patch } : sec,
              ),
            }
          : s,
      );
      setSongs(next);
      saveSongs(next);
    },
    [],
  );

  const removeSection = useCallback((songId: string, sectionId: string) => {
    const next = loadSongs().map((s) =>
      s.id === songId ? { ...s, sections: s.sections.filter((sec) => sec.id !== sectionId) } : s,
    );
    setSongs(next);
    saveSongs(next);
  }, []);

  return { songs, create, update, remove, markUsed, addSection, updateSection, removeSection };
}
