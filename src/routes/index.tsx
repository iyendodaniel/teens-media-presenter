import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, CornerDownLeft, Image as ImageIcon, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useController } from "@/hooks/use-presenter-sync";
import {
  DEFAULT_FONT_KEY,
  DEFAULT_FONT_SCALE,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  SCRIPTURE_FONTS,
  fontFamilyFor,
  type LiveState,
  type ScriptureFontKey,
  type Translation,
} from "@/lib/presenter-sync";
import {
  BOOK_META,
  TRANSLATIONS,
  loadBook,
  stepVerse,
  type BookFile,
  type BookMeta,
  type Verse,
} from "@/lib/scriptures";
import { buildSuggestions, type Suggestion } from "@/lib/search-suggestions";
import { useMediaLibrary, useMediaUrl, useResolvedUrl } from "@/hooks/use-media-library";
import { MediaStage } from "@/components/media/media-stage";
import type { MediaItem } from "@/lib/media-library";
import { previewVerseFontSize } from "@/lib/verse-font-size";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Teens Media Presenter - Control Panel" },
      {
        name: "description",
        content:
          "Live scripture control panel: command-palette search, resizable panels and a large Live on Output preview.",
      },
      { property: "og:title", content: "Teens Media Presenter - Control Panel" },
      {
        property: "og:description",
        content:
          "Live scripture control panel: command-palette search, resizable panels and a large Live on Output preview.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ControlPanel,
});

/**
 * Mirrors whatever is actually live on the Output window — scripture, image,
 * video, black or blank — regardless of which control panel (scripture or
 * media) is currently open. There is only ever one Live on Output; this
 * preview must never go stale just because the operator switched sections.
 */
function PreviewStage({ live }: { live: LiveState }) {
  const background = live.mode === "scripture" ? live.background : undefined;
  const backgroundUrl = useResolvedUrl(background?.mediaId, background?.src);

  if (live.mode === "image" || live.mode === "video") {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-stage shadow-stage">
        <MediaStage state={live} forceMuted />
      </div>
    );
  }

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-stage shadow-stage"
      style={{ containerType: "inline-size" }}
    >
      {live.mode === "scripture" ? (
        <div
          key={live.revision}
          className="stage-fade-enter absolute inset-0 flex flex-col items-center justify-center gap-[3cqw] px-[6cqw] py-[6cqw] text-center"
        >
          {backgroundUrl ? (
            <>
              <img
                src={backgroundUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/55" />
            </>
          ) : null}
          <div className="relative z-10 flex flex-col items-center gap-[3cqw]">
            <p
              className="max-w-[92%] font-medium leading-[1.35] text-foreground"
              style={{
                fontSize: previewVerseFontSize(
                  live.text.length,
                  live.fontScale ?? DEFAULT_FONT_SCALE,
                ),
                fontFamily: fontFamilyFor(live.fontFamily),
              }}
            >
              {live.text}
            </p>
            <p
              className="font-display text-accent"
              style={{ fontSize: "clamp(0.55rem, 2cqw, 1.1rem)", letterSpacing: "0.04em" }}
            >
              {live.reference}
              <span className="ml-2 align-middle text-[0.6em] text-accent-dim">
                {live.translation}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {live.mode === "black" ? "Output is black" : "Output is blank"}
        </div>
      )}
    </div>
  );
}

/** Joins a verse range into one Output-ready string, e.g. "28 ...text... 29 ...text...". */
function combineVerses(verses: Verse[], translation: Translation): string {
  if (verses.length === 0) return "";
  if (verses.length === 1) return verses[0]!.text[translation];
  return verses.map((v) => `${v.verse} ${v.text[translation]}`).join("  ");
}

function combineReference(verses: Verse[]): string {
  if (verses.length === 0) return "";
  if (verses.length === 1) return verses[0]!.ref;
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  return `${first.book} ${first.chapter}:${first.verse}-${last.verse}`;
}

/* ---------------------------------------------------------------- split -- */

const BACKGROUND_KEY = "tmp.scripture.backgroundId";
const FONT_SCALE_KEY = "tmp.scripture.fontScale";
const FONT_FAMILY_KEY = "tmp.scripture.fontFamily";
const SPLIT_KEY = "tmp.controlPanel.splitRatio";
/** Fraction of the row taken by the verse list; the preview gets the rest. */
const DEFAULT_SPLIT = 0.38;
const MIN_SPLIT = 0.2;
const MAX_SPLIT = 0.7;

function useSplitRatio() {
  const [ratio, setRatio] = useState(DEFAULT_SPLIT);

  useEffect(() => {
    const stored = window.localStorage.getItem(SPLIT_KEY);
    const parsed = stored ? Number.parseFloat(stored) : NaN;
    if (Number.isFinite(parsed)) {
      setRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, parsed)));
    }
  }, []);

  const commit = useCallback((next: number) => {
    const clamped = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, next));
    setRatio(clamped);
    window.localStorage.setItem(SPLIT_KEY, String(clamped));
  }, []);

  return { ratio, setRatio, commit };
}

/* --------------------------------------------------------- background ---- */

function BackgroundSwatch({
  item,
  selected,
  onSelect,
  onRemove,
}: {
  item: MediaItem;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const url = useMediaUrl(item);
  return (
    <div className="group/bg relative shrink-0">
      <button
        onClick={onSelect}
        title={item.name}
        aria-pressed={selected}
        className={cn(
          "h-9 w-14 overflow-hidden rounded-md border bg-panel transition-colors",
          selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-accent/50",
        )}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove background"
        aria-label="Remove background"
        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover/bg:flex"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- panel ---- */

function ControlPanel() {
  const { live, outputs, push } = useController();
  const library = useMediaLibrary();
  const [translation, setTranslation] = useState<Translation>("WEB");
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [fontScale, setFontScale] = useState(DEFAULT_FONT_SCALE);
  const [fontFamily, setFontFamily] = useState<ScriptureFontKey>(DEFAULT_FONT_KEY);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const preBlankRef = useRef<LiveState | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const inputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Search overlay (command palette).
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [, setCacheTick] = useState(0);

  // Resizable split.
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const { ratio, setRatio, commit } = useSplitRatio();

  // Book / chapter / verse browser.
  const [navBook, setNavBook] = useState<BookMeta | null>(null);
  const [navBookData, setNavBookData] = useState<BookFile | null>(null);
  const [navChapter, setNavChapter] = useState<number | null>(null);
  const [navLoading, setNavLoading] = useState(false);

  const liveVerseId = live.mode === "scripture" ? live.verseId : null;

  // Restore the last-chosen scripture background/text settings once on mount.
  useEffect(() => {
    const stored = window.localStorage.getItem(BACKGROUND_KEY);
    if (stored) setBackgroundId(stored);
    const storedScale = Number.parseFloat(window.localStorage.getItem(FONT_SCALE_KEY) ?? "");
    if (Number.isFinite(storedScale)) {
      setFontScale(Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, storedScale)));
    }
    const storedFont = window.localStorage.getItem(FONT_FAMILY_KEY);
    if (storedFont && SCRIPTURE_FONTS.some((f) => f.key === storedFont)) {
      setFontFamily(storedFont as ScriptureFontKey);
    }
  }, []);

  useEffect(() => {
    if (backgroundId) window.localStorage.setItem(BACKGROUND_KEY, backgroundId);
    else window.localStorage.removeItem(BACKGROUND_KEY);
  }, [backgroundId]);

  useEffect(() => {
    window.localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    window.localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
  }, [fontFamily]);

  // Bible backgrounds live in their own dedicated collection, kept separate
  // from the general Media library so it isn't cluttered with every photo
  // and clip the team has imported for slides/videos.
  const backgroundOptions = useMemo(
    () => library.items.filter((i) => i.collection === "background"),
    [library.items],
  );

  const addBackgroundFiles = useCallback(
    async (files: FileList | File[]) => {
      const created = await library.importFiles(files, "background");
      const first = created[0];
      if (first) setBackgroundId(first.id);
    },
    [library],
  );
  const selectedBackground = useMemo(
    () => backgroundOptions.find((i) => i.id === backgroundId) ?? null,
    [backgroundOptions, backgroundId],
  );
  const liveBackground = useMemo(
    () =>
      selectedBackground
        ? {
            mediaId: selectedBackground.id,
            src:
              selectedBackground.source === "builtin" || selectedBackground.source === "linked"
                ? selectedBackground.url
                : undefined,
          }
        : undefined,
    [selectedBackground],
  );

  // Background changes apply live without re-sending the whole verse.
  useEffect(() => {
    if (live.mode !== "scripture") return;
    if (live.background?.mediaId === liveBackground?.mediaId) return;
    push({ ...live, background: liveBackground });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBackground]);

  // Text size / font changes apply live without re-sending the whole verse.
  useEffect(() => {
    if (live.mode !== "scripture") return;
    if (live.fontScale === fontScale && live.fontFamily === fontFamily) return;
    push({ ...live, fontScale, fontFamily });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontScale, fontFamily]);

  /* --- suggestions: recomputed synchronously on every keystroke ---------- */
  const suggestions = useMemo(
    // cacheTick re-runs this once a book chunk lands so previews fill in.
    () => (query.trim() ? buildSuggestions(query, translation) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, translation, setCacheTick],
  );

  useEffect(() => setActiveIndex(0), [query]);

  // Warm the book chunk of the top suggestion so verse previews and the
  // eventual Go Live are instant.
  useEffect(() => {
    const top = suggestions[0];
    if (!top) return;
    let cancelled = false;
    void loadBook(top.meta.bookNum).then(() => {
      if (!cancelled) setCacheTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [suggestions]);

  const openBook = useCallback((meta: BookMeta, chapter: number | null = null) => {
    setNavBook(meta);
    setNavChapter(chapter);
    setNavBookData(null);
    setNavLoading(true);
    void loadBook(meta.bookNum).then((data) => {
      setNavBookData(data);
      setNavLoading(false);
    });
  }, []);

  const chapterVerses = useMemo(() => {
    if (!navBookData || navChapter === null) return [];
    return navBookData.verses.filter((v) => v.chapter === navChapter);
  }, [navBookData, navChapter]);

  const goLive = useCallback(
    (verses: Verse[]) => {
      if (verses.length === 0) return;
      push({
        mode: "scripture",
        verseId: verses[0]!.id,
        reference: combineReference(verses),
        text: combineVerses(verses, translation),
        translation,
        background: liveBackground,
        fontScale,
        fontFamily,
      });
    },
    [push, translation, liveBackground, fontScale, fontFamily],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    inputRef.current?.blur();
  }, []);

  const chooseSuggestion = useCallback(
    async (s: Suggestion) => {
      if (s.kind === "book") {
        openBook(s.meta);
      } else if (s.kind === "chapter") {
        openBook(s.meta, s.chapter);
      } else {
        const book = await loadBook(s.meta.bookNum);
        const verses = book.verses.filter(
          (v) => v.chapter === s.chapter && v.verse >= s.verseStart && v.verse <= s.verseEnd,
        );
        goLive(verses);
        openBook(s.meta, s.chapter);
      }
      setQuery("");
      closeSearch();
    },
    [closeSearch, goLive, openBook],
  );

  const toggleBlank = () => {
    if (live.mode === "scripture") {
      preBlankRef.current = live;
      push({ mode: "blank" });
    } else if (preBlankRef.current && preBlankRef.current.mode === "scripture") {
      const restore = preBlankRef.current;
      push({
        mode: "scripture",
        verseId: restore.verseId,
        reference: restore.reference,
        text: restore.text,
        translation: restore.translation,
        background: restore.background,
        fontScale: restore.fontScale,
        fontFamily: restore.fontFamily,
      });
    }
  };

  const step = async (direction: 1 | -1) => {
    if (chapterVerses.length > 0) {
      const currentIndex = liveVerseId ? chapterVerses.findIndex((v) => v.id === liveVerseId) : -1;
      const nextIndex =
        currentIndex === -1
          ? direction === 1
            ? 0
            : chapterVerses.length - 1
          : Math.min(Math.max(currentIndex + direction, 0), chapterVerses.length - 1);
      const next = chapterVerses[nextIndex];
      if (next) goLive([next]);
      return;
    }

    if (live.mode !== "scripture") return;
    const current = navBookData?.verses.find((v) => v.id === live.verseId);
    const base: Verse = current ?? {
      id: live.verseId,
      book: "",
      chapter: 0,
      verse: 0,
      ref: live.reference,
      text: { WEB: live.text, KJV: live.text, ASV: live.text },
    };
    const next = await stepVerse(base, direction);
    if (next) goLive([next]);
  };

  // Keep the live verse in step with the translation switcher.
  useEffect(() => {
    if (live.mode !== "scripture") return;
    const verseInChapter = chapterVerses.find((v) => v.id === live.verseId);
    if (verseInChapter) {
      const nextText = verseInChapter.text[translation];
      if (live.translation === translation && live.text === nextText) return;
      push({
        mode: "scripture",
        verseId: live.verseId,
        reference: live.reference,
        text: nextText,
        translation,
        background: live.background,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation]);

  useEffect(() => {
    if (liveVerseId) {
      rowRefs.current.get(liveVerseId)?.scrollIntoView({ block: "nearest" });
    }
  }, [liveVerseId, navChapter]);

  // Close the overlay on outside click.
  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [searchOpen]);

  // Global shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (!isTyping && e.key === "/")) {
        e.preventDefault();
        setSearchOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (e.key === "Escape") {
        if (isTyping) {
          setSearchOpen(false);
          (target as HTMLInputElement).blur();
          return;
        }
        e.preventDefault();
        toggleBlank();
        return;
      }

      if (isTyping) return;

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        void step(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        void step(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterVerses, navBookData, liveVerseId, live]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen && (e.key === "ArrowDown" || e.key === "Enter")) setSearchOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = suggestions[activeIndex];
      if (picked) void chooseSuggestion(picked);
    }
  };

  /* --- divider drag ------------------------------------------------------ */
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = (e.clientX - rect.left) / rect.width;
      setRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, next)));
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

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-6 py-4">
        <div className="flex min-w-0 items-baseline gap-4">
          <h1 className="truncate font-display text-2xl tracking-wide">
            TEENS MEDIA <span className="text-accent">PRESENTER</span>
          </h1>
          <nav className="flex items-center gap-1 text-xs">
            <span className="rounded bg-accent px-2.5 py-1 font-semibold text-accent-ink">
              Scripture
            </span>
            <Link
              to="/media"
              className="rounded px-2.5 py-1 text-muted-foreground transition-colors hover:bg-panel hover:text-foreground"
            >
              Media
            </Link>
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
        {/* Left: search + browser */}
        <div
          className="flex min-h-0 flex-1 flex-col border-b border-border lg:flex-none lg:border-b-0 lg:border-r"
          style={{ flexBasis: `${ratio * 100}%` }}
        >
          <div className="relative flex shrink-0 flex-col gap-3 border-b border-border p-4">
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
                placeholder="Search a reference - John 3:16, Rom 8:28-31…"
                className="w-full rounded-md border border-input bg-panel py-2 pl-9 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {query ? (
                <button
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-panel-raised px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ⌘K
                </kbd>
              )}

              {/* Command-palette overlay */}
              {overlayVisible && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-lg border border-border bg-panel shadow-stage">
                  <div className="max-h-[60vh] overflow-y-auto py-1">
                    {suggestions.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No match for "{query}".
                      </p>
                    ) : (
                      suggestions.map((s, i) => (
                        <button
                          key={s.key}
                          onMouseEnter={() => setActiveIndex(i)}
                          onClick={() => void chooseSuggestion(s)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                            i === activeIndex ? "bg-accent/15" : "hover:bg-panel-raised",
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span
                              className={cn(
                                "font-display text-sm tracking-wide",
                                i === activeIndex ? "text-accent" : "text-foreground",
                              )}
                            >
                              {s.label}
                            </span>
                            {s.detail && (
                              <span className="line-clamp-1 text-xs text-muted-foreground">
                                {s.detail}
                              </span>
                            )}
                          </span>
                          {i === activeIndex && (
                            <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-border bg-panel-raised px-3 py-1.5 text-[10px] text-muted-foreground">
                    <span>↑↓ navigate · ↵ go live · Esc close</span>
                    <span>
                      {suggestions.length} result{suggestions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="inline-flex w-fit rounded-md border border-border bg-panel p-1">
                {TRANSLATIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTranslation(t)}
                    className={cn(
                      "rounded px-3 py-1 text-xs font-semibold tracking-wide transition-colors",
                      translation === t
                        ? "bg-accent text-accent-ink"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bible Background
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setBackgroundId(null)}
                    aria-pressed={!backgroundId}
                    className={cn(
                      "flex h-9 w-14 shrink-0 items-center justify-center rounded-md border text-[9px] font-semibold tracking-wide transition-colors",
                      !backgroundId
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border bg-panel text-muted-foreground hover:text-foreground",
                    )}
                  >
                    NONE
                  </button>
                  {backgroundOptions.map((item) => (
                    <BackgroundSwatch
                      key={item.id}
                      item={item}
                      selected={backgroundId === item.id}
                      onSelect={() => setBackgroundId(item.id)}
                      onRemove={() => {
                        if (backgroundId === item.id) setBackgroundId(null);
                        library.remove(item);
                      }}
                    />
                  ))}
                  <button
                    onClick={() => bgFileRef.current?.click()}
                    title="Add a Bible background image"
                    aria-label="Add a Bible background image"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        void addBackgroundFiles(e.target.files);
                      }
                      e.target.value = "";
                    }}
                  />
                  {backgroundOptions.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">
                      This is a dedicated set, separate from the Media library — add images just for
                      scripture backgrounds.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Text
                </span>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value as ScriptureFontKey)}
                  className="h-8 shrink-0 rounded-md border border-border bg-panel px-2 text-xs text-foreground transition-colors hover:border-accent/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  {SCRIPTURE_FONTS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <input
                  type="range"
                  min={MIN_FONT_SCALE}
                  max={MAX_FONT_SCALE}
                  step={0.05}
                  value={fontScale}
                  onChange={(e) => setFontScale(Number.parseFloat(e.target.value))}
                  className="h-8 w-28 shrink-0 accent-accent"
                  aria-label="Scripture text size"
                />
                <span className="w-9 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(fontScale * 100)}%
                </span>
                {fontScale !== DEFAULT_FONT_SCALE ? (
                  <button
                    onClick={() => setFontScale(DEFAULT_FONT_SCALE)}
                    className="shrink-0 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
            {!navBook ? (
              <section className="pt-4">
                <h2 className="px-2 py-1.5 font-display text-sm tracking-wider text-muted-foreground">
                  BOOKS
                </h2>
                <div className="grid grid-cols-2 gap-1 px-1 sm:grid-cols-3">
                  {BOOK_META.map((b) => (
                    <button
                      key={b.bookNum}
                      onClick={() => openBook(b)}
                      className="rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-panel-raised"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </section>
            ) : navChapter === null ? (
              <section className="pt-2">
                <button
                  onClick={() => setNavBook(null)}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> All books
                </button>
                <h2 className="px-2 pb-2 pt-1 font-display text-sm tracking-wider text-foreground">
                  {navBook.name.toUpperCase()}
                </h2>
                <div className="grid grid-cols-6 gap-1.5 px-2 sm:grid-cols-8">
                  {Array.from({ length: navBook.chapters }, (_, i) => i + 1).map((c) => (
                    <button
                      key={c}
                      onClick={() => setNavChapter(c)}
                      className="rounded-md border border-border bg-panel py-2 text-center text-sm text-foreground transition-colors hover:bg-panel-raised"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section className="pt-2">
                <button
                  onClick={() => setNavChapter(null)}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> {navBook.name} chapters
                </button>
                <h2 className="sticky top-0 z-10 bg-background/95 px-2 py-1.5 font-display text-sm tracking-wider text-muted-foreground backdrop-blur">
                  {navBook.name.toUpperCase()} {navChapter}
                </h2>
                {navLoading ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {chapterVerses.map((verse) => {
                      const isLive = verse.id === liveVerseId;
                      return (
                        <button
                          key={verse.id}
                          ref={(el) => {
                            if (el) rowRefs.current.set(verse.id, el);
                            else rowRefs.current.delete(verse.id);
                          }}
                          onClick={() => goLive([verse])}
                          className={cn(
                            "flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                            isLive
                              ? "bg-accent/15 ring-1 ring-inset ring-accent"
                              : "hover:bg-panel-raised",
                          )}
                        >
                          <span
                            className={cn(
                              "font-display text-sm tracking-wide",
                              isLive ? "text-accent" : "text-foreground",
                            )}
                          >
                            {verse.ref}
                          </span>
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {verse.text[translation]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Draggable divider */}
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
          <span className="h-8 w-0.5 rounded-full bg-muted-foreground/60 group-hover:bg-accent-ink/40" />
        </div>

        {/* Right: live preview + controls */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live on Output
            </p>
            <PreviewStage live={live} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void step(-1)}
              className="flex-1 rounded-md border border-border bg-panel py-2.5 text-sm font-semibold tracking-wide text-foreground transition-colors hover:bg-panel-raised"
            >
              ← Previous
            </button>
            <button
              onClick={() => void step(1)}
              className="flex-1 rounded-md border border-border bg-panel py-2.5 text-sm font-semibold tracking-wide text-foreground transition-colors hover:bg-panel-raised"
            >
              Next →
            </button>
          </div>

          <button
            onClick={toggleBlank}
            className={cn(
              "w-full rounded-md py-3 text-sm font-semibold tracking-wide transition-colors",
              live.mode === "blank"
                ? "border border-border bg-panel text-muted-foreground hover:text-foreground"
                : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {live.mode === "blank" ? "Output is blank" : "Blank Output"}
          </button>

          <div className="rounded-md border border-border bg-panel p-4 text-xs text-muted-foreground">
            <p className="mb-2 font-semibold text-foreground">Keyboard shortcuts</p>
            <dl className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <dt>Search verses</dt>
                <dd className="font-mono text-foreground">⌘K / /</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Next / previous verse</dt>
                <dd className="font-mono text-foreground">↑ / ↓</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Blank / restore Output</dt>
                <dd className="font-mono text-foreground">Esc</dd>
              </div>
            </dl>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Full 66-book Bible in {TRANSLATIONS.join(", ")}. Drag the divider to resize the panels -
            your split is remembered. {BOOK_META.length} books load on demand.
          </p>
        </div>
      </div>
    </div>
  );
}
