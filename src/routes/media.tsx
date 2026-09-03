import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardPaste,
  CornerDownLeft,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  ListPlus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useController } from "@/hooks/use-presenter-sync";
import { useMediaLibrary, useMediaUrl, useService } from "@/hooks/use-media-library";
import { useFolderLibrary } from "@/hooks/use-folder-library";
import { useSplitRatio } from "@/hooks/use-split-ratio";
import { MediaStage, fitClass } from "@/components/media/media-stage";
import { createLinkedItem, formatDuration, searchMedia, type MediaItem } from "@/lib/media-library";
import { parseOrderOfService } from "@/lib/order-of-service";
import type { FolderEntry } from "@/lib/media-folder";
import type { LiveState, MediaFitMode } from "@/lib/presenter-sync";

export const Route = createFileRoute("/media")({
  head: () => ({
    meta: [
      { title: "Media Control Panel — Teens Media Presenter" },
      {
        name: "description",
        content:
          "Fire images and videos to the projector in seconds: thumbnail library, instant search overlay, preview then GO LIVE, and full playback control.",
      },
      { property: "og:title", content: "Media Control Panel — Teens Media Presenter" },
      {
        property: "og:description",
        content:
          "Thumbnail media library with instant search, preview-then-go-live and live video transport controls for church services.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MediaPanel,
});

const SPLIT_KEY = "tmp.mediaPanel.splitRatio";
const DEFAULT_SPLIT = 0.32;
const MIN_SPLIT = 0.18;
const MAX_SPLIT = 0.6;

type Tab = "all" | "images" | "videos" | "recent" | "favorites" | "folder";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "recent", label: "Recent" },
  { id: "favorites", label: "Favorites" },
  { id: "folder", label: "Folder" },
];

/* ---------------------------------------------------------------- thumbs -- */

function MediaThumb({
  item,
  selected,
  live,
  onSelect,
  onFavorite,
  onAddToService,
  onRemove,
}: {
  item: MediaItem;
  selected: boolean;
  live: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onAddToService: () => void;
  onRemove: () => void;
}) {
  const url = useMediaUrl(item);
  const poster = item.kind === "video" ? item.thumb : url;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-panel transition-colors",
        live
          ? "border-destructive ring-1 ring-destructive"
          : selected
            ? "border-accent ring-1 ring-accent"
            : "border-border hover:border-accent/50",
      )}
    >
      <button onClick={onSelect} className="block w-full text-left" title={item.name}>
        <span className="flex aspect-video w-full items-center justify-center overflow-hidden bg-stage">
          {poster ? (
            <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="text-muted-foreground">
              {item.kind === "video" ? (
                <Film className="h-6 w-6" />
              ) : (
                <ImageIcon className="h-6 w-6" />
              )}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 px-2 py-1.5">
          {item.kind === "video" ? (
            <Film className="h-3 w-3 shrink-0 text-accent" />
          ) : (
            <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="line-clamp-1 flex-1 text-xs text-foreground">{item.name}</span>
        </span>
      </button>

      {item.kind === "video" ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
          {formatDuration(item.duration)}
        </span>
      ) : null}

      {live ? (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-destructive px-1.5 py-0.5 font-display text-[10px] tracking-wider text-destructive-foreground">
          LIVE
        </span>
      ) : item.source === "linked" ? (
        <span
          title="Linked — streams from the web, not stored locally"
          className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          <Link2 className="h-2.5 w-2.5" /> Linked
        </span>
      ) : null}

      <div className="absolute bottom-8 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={onAddToService}
          aria-label={`Add ${item.name} to service`}
          className="rounded bg-background/85 p-1 text-muted-foreground hover:text-accent"
        >
          <ListPlus className="h-3.5 w-3.5" />
        </button>
        {item.source === "imported" || item.source === "linked" ? (
          <button
            onClick={onRemove}
            aria-label={`Remove ${item.name}`}
            className="rounded bg-background/85 p-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <button
        onClick={onFavorite}
        aria-label={item.favorite ? `Unfavorite ${item.name}` : `Favorite ${item.name}`}
        className={cn(
          "absolute left-1.5 bottom-8 rounded bg-background/85 p-1 transition-opacity",
          item.favorite
            ? "text-accent opacity-100"
            : "text-muted-foreground opacity-0 hover:text-accent group-hover:opacity-100 focus:opacity-100",
        )}
      >
        <Star className={cn("h-3.5 w-3.5", item.favorite && "fill-current")} />
      </button>
    </div>
  );
}

function SelectedPreview({ item, fit }: { item: MediaItem; fit: MediaFitMode }) {
  const url = useMediaUrl(item);
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-stage">
      {url ? (
        item.kind === "video" ? (
          <video src={url} className={fitClass(fit)} muted playsInline preload="metadata" />
        ) : (
          <img src={url} alt={item.name} className={fitClass(fit)} />
        )
      ) : (
        <span className="text-xs text-muted-foreground">Loading preview…</span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- folder */

function FolderTab({
  folder,
  onSelectEntry,
}: {
  folder: ReturnType<typeof useFolderLibrary>;
  onSelectEntry: (entry: FolderEntry) => void;
}) {
  if (!folder.supported) {
    return (
      <p className="rounded-md border border-border bg-panel p-4 text-xs text-muted-foreground">
        Folder reading needs the File System Access API — Chrome or Edge on desktop. Firefox and
        Safari don't support it yet; use Import or a URL link there instead.
      </p>
    );
  }

  if (!folder.dirName) {
    return (
      <button
        onClick={() => void folder.choose()}
        className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
      >
        <FolderOpen className="h-5 w-5" />
        <span className="font-display tracking-wider">CHOOSE A FOLDER</span>
        <span className="text-xs">Read media straight from a folder on this PC</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-foreground">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent" /> {folder.dirName}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={folder.refresh}
            aria-label="Refresh folder"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => void folder.choose()}
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
          >
            Change
          </button>
        </div>
      </div>

      {folder.needsPermission ? (
        <button
          onClick={() => void folder.grantPermission()}
          className="rounded-md border border-accent bg-accent/10 px-3 py-2 text-left text-xs text-foreground"
        >
          Click to reconnect to &ldquo;{folder.dirName}&rdquo; — the browser drops folder access
          between sessions, so this needs one click to restore it.
        </button>
      ) : folder.loading ? (
        <p className="text-xs text-muted-foreground">Reading folder…</p>
      ) : folder.entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No images or videos in this folder.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {folder.entries.map((entry) => (
            <li key={entry.name}>
              <button
                onClick={() => onSelectEntry(entry)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-panel-raised"
              >
                {entry.kind === "video" ? (
                  <Film className="h-3.5 w-3.5 shrink-0 text-accent" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- panel -- */

function MediaPanel() {
  const { live, outputs, push } = useController();
  const library = useMediaLibrary();
  const service = useService();
  const folder = useFolderLibrary();

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [fit, setFit] = useState<MediaFitMode>("fit");
  const [dropping, setDropping] = useState(false);
  const [position, setPosition] = useState({ current: 0, duration: 0 });

  // Add-from-URL box: linkUrl is the text input; linkAskKind holds the URL
  // while we wait for the operator to say image/video (extension didn't tell us).
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkAskKind, setLinkAskKind] = useState<string | null>(null);

  // Paste-order-of-service modal.
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderText, setOrderText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const { ratio, setRatio, commit } = useSplitRatio(SPLIT_KEY, DEFAULT_SPLIT, MIN_SPLIT, MAX_SPLIT);

  const liveMediaId = live.mode === "image" || live.mode === "video" ? live.mediaId : null;

  /* --- filtering: synchronous, every keystroke -------------------------- */
  const results = useMemo(() => searchMedia(library.items, query), [library.items, query]);

  const visible = useMemo(() => {
    const items = [...library.items];
    if (tab === "images") return items.filter((i) => i.kind !== "video");
    if (tab === "videos") return items.filter((i) => i.kind === "video");
    if (tab === "favorites") return items.filter((i) => i.favorite);
    if (tab === "recent")
      return items
        .filter((i) => i.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    return items.sort((a, b) => (b.lastUsedAt ?? b.addedAt) - (a.lastUsedAt ?? a.addedAt));
  }, [library.items, tab]);

  const recent = useMemo(
    () =>
      library.items
        .filter((i) => i.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
        .slice(0, 4),
    [library.items],
  );

  useEffect(() => setActiveIndex(0), [query]);

  /* --- output actions (reuse the scripture Preview -> Go Live bus) ------- */

  const goLive = useCallback(
    (item: MediaItem, opts?: { playing?: boolean }) => {
      library.markUsed(item.id);
      const common = {
        mediaId: item.id,
        // Builtin (data URL) and linked (remote URL) items carry their src
        // directly; imported items resolve from IndexedDB on the other end.
        src: item.source === "builtin" || item.source === "linked" ? item.url : undefined,
        name: item.name,
        fit,
      };
      if (item.kind === "video") {
        push({
          mode: "video",
          ...common,
          playing: opts?.playing ?? true,
          seekTo: 0,
          seekRev: Date.now(),
          loop: false,
          muted: false,
          embed: item.embed,
        });
      } else {
        push({ mode: "image", ...common });
      }
    },
    [fit, library, push],
  );

  const setPlaying = useCallback(
    (playing: boolean) => {
      if (live.mode !== "video") return;
      push({ ...live, playing });
    },
    [live, push],
  );

  const restart = useCallback(() => {
    if (live.mode !== "video") return;
    push({ ...live, seekTo: 0, seekRev: Date.now(), playing: true });
  }, [live, push]);

  const clearOutput = useCallback(() => push({ mode: "blank" }), [push]);
  const blackOutput = useCallback(() => push({ mode: "black" }), [push]);

  // Fit changes apply live without re-sending the whole item.
  useEffect(() => {
    if (live.mode === "image" || live.mode === "video") {
      if (live.fit !== fit) push({ ...live, fit });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  const selectItem = useCallback((item: MediaItem) => {
    setSelected(item);
    setPosition({ current: 0, duration: item.duration ?? 0 });
  }, []);

  const addToService = useCallback(
    (item: MediaItem) => service.add({ type: item.kind, label: item.name, mediaId: item.id }),
    [service],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    inputRef.current?.blur();
  }, []);

  const chooseResult = useCallback(
    (item: MediaItem) => {
      selectItem(item);
      setQuery("");
      closeSearch();
    },
    [closeSearch, selectItem],
  );

  /* --- import ------------------------------------------------------------ */
  const onFiles = useCallback(
    async (files: FileList | File[]) => {
      const created = await library.importFiles(files);
      const first = created[0];
      if (first) selectItem(first);
    },
    [library, selectItem],
  );

  const selectFolderEntry = useCallback(
    async (entry: FolderEntry) => {
      // Folder files aren't stored anywhere until picked — once picked, they
      // go through the normal import path (blob copied into IndexedDB) so
      // playback uses the exact same, already-working pipeline as any other
      // imported file. From here on it behaves like a regular library item.
      const file = await entry.handle.getFile();
      const created = await library.importFiles([file]);
      const item = created[0];
      if (item) selectItem(item);
    },
    [library, selectItem],
  );

  /* --- add from URL ------------------------------------------------------- */
  const addLink = useCallback(
    (url: string, kindHint?: "image" | "video") => {
      const result = createLinkedItem(url, kindHint);
      if (result.ok === "ambiguous") {
        setLinkAskKind(result.url);
        setLinkError(null);
        return;
      }
      if (!result.ok) {
        setLinkError(result.reason);
        return;
      }
      library.addLinked(result.item);
      selectItem(result.item);
      setLinkUrl("");
      setLinkError(null);
      setLinkAskKind(null);
    },
    [library, selectItem],
  );

  /* --- order of service ---------------------------------------------------- */
  const importOrderOfService = useCallback(() => {
    const parsed = parseOrderOfService(orderText, library.items);
    if (parsed.length === 0) return;
    service.replace(parsed);
    setOrderOpen(false);
    setOrderText("");
  }, [orderText, library.items, service]);

  /* --- overlay dismissal ------------------------------------------------- */
  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [searchOpen]);

  /* --- keyboard map (page-scoped, mirrors the scripture bindings) -------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (!isTyping && (e.key === "/" || e.key === "m" || e.key === "M"))
      ) {
        e.preventDefault();
        setSearchOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (e.key === "Escape") {
        if (isTyping || searchOpen) {
          setSearchOpen(false);
          (target as HTMLInputElement | null)?.blur();
          return;
        }
        e.preventDefault();
        blackOutput();
        return;
      }

      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === " ") {
        e.preventDefault();
        if (live.mode === "video") setPlaying(!live.playing);
        else if (selected) goLive(selected);
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        const first = visible[0];
        if (!selected && first) selectItem(first);
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        blackOutput();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        clearOutput();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    blackOutput,
    clearOutput,
    goLive,
    live,
    restart,
    searchOpen,
    selectItem,
    selected,
    setPlaying,
    visible,
  ]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen && (e.key === "ArrowDown" || e.key === "Enter")) setSearchOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[activeIndex];
      if (picked) chooseResult(picked);
    }
  };

  /* --- divider drag ------------------------------------------------------ */
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;
      setRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, (e.clientX - rect.left) / rect.width)));
    };
    const onUp = () => {
      setDragging(false);
      commit(ratio);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, ratio, commit, setRatio]);

  const overlayVisible = searchOpen && query.trim().length > 0;
  const liveLabel =
    live.mode === "image" || live.mode === "video"
      ? live.name
      : live.mode === "black"
        ? "Black screen"
        : live.mode === "scripture"
          ? live.reference
          : "Nothing live";

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-6 py-4">
        <div className="flex min-w-0 items-baseline gap-4">
          <h1 className="truncate font-display text-2xl tracking-wide">
            TEENS MEDIA <span className="text-accent">PRESENTER</span>
          </h1>
          <nav className="flex items-center gap-1 text-xs">
            <Link
              to="/"
              className="rounded px-2.5 py-1 text-muted-foreground transition-colors hover:bg-panel hover:text-foreground"
            >
              Scripture
            </Link>
            <span className="rounded bg-accent px-2.5 py-1 font-semibold text-accent-ink">
              Media
            </span>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              outputs > 0 ? "bg-accent pulse-dot" : "bg-muted-foreground",
            )}
          />
          <span className="text-muted-foreground">
            {outputs > 0
              ? `${outputs} Output window${outputs === 1 ? "" : "s"} connected`
              : "No Output window connected"}
          </span>
        </div>
      </header>

      <div ref={rowRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* LEFT — library */}
        <div
          className="flex min-h-0 flex-1 flex-col border-b border-border lg:flex-none lg:border-b-0 lg:border-r"
          style={{ flexBasis: `${ratio * 100}%` }}
          onDragOver={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            void onFiles(e.dataTransfer.files);
          }}
        >
          <div className="relative flex shrink-0 flex-col gap-3 border-b border-border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-wider text-muted-foreground">MEDIA</h2>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-panel-raised"
              >
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div ref={searchWrapRef} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search media…"
                className="w-full rounded-md border border-input bg-panel py-2 pl-9 pr-14 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {query ? (
                <button
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear media search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-panel-raised px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  M
                </kbd>
              )}

              {overlayVisible ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-lg border border-border bg-panel shadow-stage">
                  <div className="max-h-[55vh] overflow-y-auto py-1">
                    {results.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No media matching “{query}”.
                      </p>
                    ) : (
                      results.map((item, i) => (
                        <button
                          key={item.id}
                          onMouseEnter={() => setActiveIndex(i)}
                          onClick={() => chooseResult(item)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                            i === activeIndex ? "bg-accent/15" : "hover:bg-panel-raised",
                          )}
                        >
                          {item.kind === "video" ? (
                            <Film className="h-4 w-4 shrink-0 text-accent" />
                          ) : (
                            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                          {item.kind === "video" ? (
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                              {formatDuration(item.duration)}
                            </span>
                          ) : null}
                          {i === activeIndex ? (
                            <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" />
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-border bg-panel-raised px-3 py-1.5 text-[10px] text-muted-foreground">
                    <span>↑↓ navigate · ↵ preview · Esc close</span>
                    <span>
                      {results.length} result{results.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <Link2 className="pointer-events-none h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setLinkError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && linkUrl.trim()) addLink(linkUrl);
                  }}
                  placeholder="Paste a URL (image, video, YouTube, Vimeo)…"
                  className="w-full rounded-md border border-input bg-panel py-1.5 px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => linkUrl.trim() && addLink(linkUrl)}
                  disabled={!linkUrl.trim()}
                  className="shrink-0 rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-panel-raised disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {linkError ? <p className="mt-1 text-[10px] text-destructive">{linkError}</p> : null}
              {linkAskKind ? (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-border bg-panel-raised px-2 py-1.5 text-[10px] text-muted-foreground">
                  <span className="flex-1">
                    Couldn't tell the file type — is this an image or a video?
                  </span>
                  <button
                    onClick={() => addLink(linkAskKind, "image")}
                    className="rounded bg-accent px-2 py-1 font-semibold text-accent-ink"
                  >
                    Image
                  </button>
                  <button
                    onClick={() => addLink(linkAskKind, "video")}
                    className="rounded bg-accent px-2 py-1 font-semibold text-accent-ink"
                  >
                    Video
                  </button>
                  <button
                    onClick={() => setLinkAskKind(null)}
                    aria-label="Cancel"
                    className="rounded p-1 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors",
                    tab === t.id
                      ? "bg-accent text-accent-ink"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto p-3">
            {dropping ? (
              <div className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-accent bg-background/90">
                <p className="font-display text-lg tracking-wider text-accent">DROP MEDIA HERE</p>
                <p className="text-xs text-muted-foreground">Images and videos</p>
              </div>
            ) : null}

            {library.importing > 0 ? (
              <p className="mb-2 rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-muted-foreground">
                Importing {library.importing} file{library.importing === 1 ? "" : "s"} — thumbnails
                are generating in the background.
              </p>
            ) : null}

            {tab === "folder" ? (
              <FolderTab folder={folder} onSelectEntry={(entry) => void selectFolderEntry(entry)} />
            ) : visible.length === 0 ? (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
              >
                <Plus className="h-5 w-5" />
                <span className="font-display tracking-wider">DROP MEDIA HERE</span>
                <span className="text-xs">Images and videos</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {visible.map((item) => (
                  <MediaThumb
                    key={item.id}
                    item={item}
                    selected={selected?.id === item.id}
                    live={liveMediaId === item.id}
                    onSelect={() => selectItem(item)}
                    onFavorite={() => library.toggleFavorite(item.id)}
                    onAddToService={() => addToService(item)}
                    onRemove={() => {
                      library.remove(item);
                      if (selected?.id === item.id) setSelected(null);
                    }}
                  />
                ))}
              </div>
            )}

            {recent.length > 0 && tab !== "recent" ? (
              <section className="mt-5">
                <h3 className="mb-1.5 font-display text-xs tracking-wider text-muted-foreground">
                  RECENT
                </h3>
                <ul className="flex flex-col">
                  {recent.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => selectItem(item)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-panel-raised"
                      >
                        {item.kind === "video" ? (
                          <Film className="h-3 w-3 text-accent" />
                        ) : (
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="truncate">{item.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-5">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="font-display text-xs tracking-wider text-muted-foreground">
                  SUNDAY SERVICE
                </h3>
                <button
                  onClick={() => setOrderOpen(true)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-panel-raised hover:text-foreground"
                >
                  <ClipboardPaste className="h-3 w-3" /> Paste order of service
                </button>
              </div>
              <ol className="flex flex-col">
                {service.items.map((entry, i) => {
                  const item = entry.mediaId
                    ? library.items.find((m) => m.id === entry.mediaId)
                    : undefined;
                  return (
                    <li key={entry.id} className="group flex items-center gap-2">
                      <button
                        onClick={() => item && selectItem(item)}
                        disabled={!item}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                          item
                            ? "text-foreground hover:bg-panel-raised"
                            : "cursor-default text-muted-foreground",
                        )}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">{entry.label}</span>
                      </button>
                      <button
                        onClick={() => service.remove(entry.id)}
                        aria-label={`Remove ${entry.label} from service`}
                        className="mr-1 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </div>

        {/* Divider */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          tabIndex={0}
          onMouseDown={() => setDragging(true)}
          onDoubleClick={() => commit(DEFAULT_SPLIT)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              commit(ratio - 0.02);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              commit(ratio + 0.02);
            }
          }}
          className={cn(
            "group hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border/40 transition-colors hover:bg-accent/60 focus:outline-none focus-visible:bg-accent lg:flex",
            dragging && "bg-accent",
          )}
        >
          <span className="h-8 w-0.5 rounded-full bg-muted-foreground/60" />
        </div>

        {/* RIGHT — live output */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Live on Output
              </p>
              <span className="truncate text-xs text-muted-foreground">{liveLabel}</span>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-stage shadow-stage">
              <LiveMirror
                live={live}
                onTime={(current, duration) => setPosition({ current, duration })}
              />
            </div>
          </div>

          {live.mode === "video" ? (
            <div className="rounded-md border border-border bg-panel px-3 py-2">
              <div className="flex items-center justify-between font-mono text-xs text-foreground">
                <span className="flex items-center gap-1.5">
                  {live.playing ? (
                    <Play className="h-3 w-3 text-accent" />
                  ) : (
                    <Pause className="h-3 w-3" />
                  )}
                  {formatDuration(position.current)} /{" "}
                  {formatDuration(position.duration || selected?.duration)}
                </span>
                <span className="text-muted-foreground">{live.name}</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-panel-raised">
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{
                    width: `${position.duration ? Math.min(100, (position.current / position.duration) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {/* Selected / preview */}
          <div className="rounded-lg border border-border bg-panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Selected media
              </p>
              <span className="truncate text-xs text-foreground">
                {selected ? selected.name : "Nothing selected"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="aspect-video w-full max-w-md overflow-hidden rounded-md border border-border bg-stage">
                {selected ? (
                  <SelectedPreview item={selected} fit={fit} />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Pick media on the left, or press M to search
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => selected && goLive(selected)}
                  disabled={!selected}
                  className="rounded-md bg-accent px-6 py-3 font-display text-lg tracking-wider text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  GO LIVE
                </button>
                <button
                  onClick={() => selected && addToService(selected)}
                  disabled={!selected}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-panel px-4 py-2 text-xs text-foreground transition-colors hover:bg-panel-raised disabled:opacity-40"
                >
                  <ListPlus className="h-3.5 w-3.5" /> Add to service
                </button>
              </div>
            </div>
          </div>

          {/* Transport + output controls */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setPlaying(true)}
              disabled={live.mode !== "video" || live.playing || live.embed}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-panel py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-panel-raised disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> Play
            </button>
            <button
              onClick={() => setPlaying(false)}
              disabled={live.mode !== "video" || !live.playing || live.embed}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-panel py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-panel-raised disabled:opacity-40"
            >
              <Pause className="h-4 w-4" /> Pause
            </button>
            <button
              onClick={restart}
              disabled={live.mode !== "video"}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-panel py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-panel-raised disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" /> Restart
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={clearOutput}
              className="rounded-md border border-border bg-panel py-2.5 text-sm font-semibold tracking-wide text-foreground transition-colors hover:bg-panel-raised"
            >
              CLEAR
            </button>
            <button
              onClick={blackOutput}
              className={cn(
                "rounded-md py-2.5 text-sm font-semibold tracking-wide transition-colors",
                live.mode === "black"
                  ? "border border-border bg-panel text-muted-foreground"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              {live.mode === "black" ? "OUTPUT IS BLACK" : "BLACK"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Screen fit</span>
            <div className="inline-flex rounded-md border border-border bg-panel p-1">
              {(["fit", "fill", "center"] as MediaFitMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFit(mode)}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-semibold capitalize tracking-wide transition-colors",
                    fit === mode
                      ? "bg-accent text-accent-ink"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-panel p-4 text-xs text-muted-foreground">
            <p className="mb-2 font-semibold text-foreground">Keyboard shortcuts</p>
            <dl className="flex flex-col gap-1.5">
              {[
                ["Search media", "M / ⌘K"],
                ["Go live / play-pause", "Space"],
                ["Black screen", "B"],
                ["Clear output", "C"],
                ["Restart video", "R"],
                ["Close overlay", "Esc"],
              ].map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt>{label}</dt>
                  <dd className="font-mono text-foreground">{keys}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {orderOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOrderOpen(false);
          }}
        >
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-panel p-4 shadow-stage">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-wider text-foreground">
                PASTE ORDER OF SERVICE
              </h2>
              <button
                onClick={() => setOrderOpen(false)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              One line per item. Numbering is optional. Lines that match a filename in your media
              library (e.g. "05 Announcement.mp4") are linked automatically — everything else
              becomes a plain note, same as adding one by hand. This replaces the current list.
            </p>
            <textarea
              value={orderText}
              onChange={(e) => setOrderText(e.target.value)}
              rows={10}
              placeholder={
                "01 Welcome\n02 Opening Prayer\n03 Way Maker\n04 Scripture — Psalm 23\n05 Announcement.mp4\n06 Sermon"
              }
              className="w-full resize-none rounded-md border border-input bg-background p-2.5 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOrderOpen(false)}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-panel-raised"
              >
                Cancel
              </button>
              <button
                onClick={importOrderOfService}
                disabled={!orderText.trim()}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Replace service
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LiveMirror({
  live,
  onTime,
}: {
  live: LiveState;
  onTime: (current: number, duration: number) => void;
}) {
  if (live.mode === "image" || live.mode === "video") {
    return <MediaStage state={live} forceMuted onTime={onTime} />;
  }
  if (live.mode === "scripture") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="line-clamp-4 text-sm text-foreground">{live.text}</p>
        <p className="font-display text-accent">{live.reference}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      {live.mode === "black" ? "Output is black" : "Output is clear"}
    </div>
  );
}
