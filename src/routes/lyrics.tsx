import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardPaste, ListPlus, Music, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useController } from "@/hooks/use-presenter-sync";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useMediaLibrary, useService, useSongs } from "@/hooks/use-media-library";
import {
  searchSongs,
  splitLyrics,
  stepSection,
  type Song,
  type SongSection,
  type SplitMode,
} from "@/lib/songs";
import type { LyricsPosition, StageBackground } from "@/lib/presenter-sync";
import { previewVerseFontSize } from "@/lib/verse-font-size";

export const Route = createFileRoute("/lyrics")({
  head: () => ({
    meta: [
      { title: "Lyrics - Teens Media Presenter" },
      {
        name: "description",
        content: "Song/lyrics control panel: search, edit sections, preview then GO LIVE.",
      },
    ],
  }),
  component: LyricsPanel,
});

function LyricsPanel() {
  const { live, outputs, push } = useController();
  const {
    songs,
    create,
    update,
    remove,
    markUsed,
    addSection,
    updateSection,
    removeSection,
    importSections,
  } = useSongs();
  const service = useService();
  const library = useMediaLibrary();

  // Anything that can sit behind lyrics: images, GIFs, and video files
  // (not YouTube/Vimeo embeds - those are iframes, they can't be a looping bg).
  const backgroundChoices = useMemo(
    () => library.items.filter((i) => !i.embed),
    [library.items],
  );

  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("auto");
  const pastePreview = useMemo(() => splitLyrics(pasteText, splitMode), [pasteText, splitMode]);

  const [query, setQuery] = useState("");
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const results = useMemo(() => searchSongs(songs, query), [songs, query]);
  const selectedSong = useMemo(
    () => songs.find((s) => s.id === selectedSongId) ?? null,
    [songs, selectedSongId],
  );
  const selectedSection = useMemo(
    () => selectedSong?.sections.find((sec) => sec.id === selectedSectionId) ?? null,
    [selectedSong, selectedSectionId],
  );

  const liveSongId = live.mode === "song" ? live.songId : null;

  const selectSong = useCallback((song: Song) => {
    setSelectedSongId(song.id);
    setSelectedSectionId(song.sections[0]?.id ?? null);
    setEditing(false);
  }, []);

  const goLive = useCallback(
    (song: Song, section: SongSection) => {
      if (!section.text.trim()) return;
      markUsed(song.id);
      push({
        mode: "song",
        songId: song.id,
        title: song.title,
        section: section.label,
        text: section.text,
        position: song.position ?? "top",
        fontScale: song.fontScale,
        background: song.background,
      });
    },
    [push, markUsed],
  );

  const addToService = useCallback(
    (song: Song, section: SongSection) => {
      service.add({
        type: "song",
        label: `${song.title} - ${section.label}`,
        song: {
          songId: song.id,
          title: song.title,
          section: section.label,
          text: section.text,
          position: song.position ?? "top",
          fontScale: song.fontScale,
          background: song.background,
        },
      });
    },
    [service],
  );

  const newSong = useCallback(() => {
    const song = create("Untitled Song");
    setSelectedSongId(song.id);
    setSelectedSectionId(song.sections[0]?.id ?? null);
    setEditing(true);
    setShowPaste(true);
    setPasteText("");
  }, [create]);

  /* --- style changes apply live if this song is what's on screen ------------ */
  const styleKey = selectedSong
    ? `${selectedSong.position ?? "top"}|${selectedSong.fontScale ?? 1}|${selectedSong.background?.mediaId ?? ""}`
    : "";
  useEffect(() => {
    if (!selectedSong || live.mode !== "song" || live.songId !== selectedSong.id) return;
    push({
      ...live,
      position: selectedSong.position ?? "top",
      fontScale: selectedSong.fontScale,
      background: selectedSong.background,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);

  const chooseBackground = useCallback(
    (song: Song, mediaId: string) => {
      const item = backgroundChoices.find((i) => i.id === mediaId);
      if (!item) {
        update(song.id, { background: undefined });
        return;
      }
      const background: StageBackground = {
        mediaId: item.id,
        src: item.source === "builtin" || item.source === "linked" ? item.url : undefined,
        kind: item.kind === "video" ? "video" : "image",
      };
      update(song.id, { background });
    },
    [backgroundChoices, update],
  );

  const applyPaste = useCallback(
    (song: Song, replace: boolean) => {
      if (pastePreview.length === 0) return;
      importSections(song.id, pastePreview, replace);
      setPasteText("");
      setShowPaste(false);
    },
    [pastePreview, importSections],
  );

  /* --- keyboard shortcuts: Esc to blank, Up/Down to step sections -------- */
  useShortcuts({
    onEscape: () => push({ mode: "blank" }),
    onStepNext: () => {
      if (!selectedSong || !selectedSectionId) return;
      const next = stepSection(selectedSong, selectedSectionId, 1);
      if (next) {
        setSelectedSectionId(next.id);
        goLive(selectedSong, next);
      }
    },
    onStepPrev: () => {
      if (!selectedSong || !selectedSectionId) return;
      const prev = stepSection(selectedSong, selectedSectionId, -1);
      if (prev) {
        setSelectedSectionId(prev.id);
        goLive(selectedSong, prev);
      }
    },
    deps: [selectedSong, selectedSectionId, goLive, push],
  });

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
            <Link
              to="/media"
              className="rounded px-2.5 py-1 text-muted-foreground transition-colors hover:bg-panel hover:text-foreground"
            >
              Media
            </Link>
            <span className="rounded bg-accent px-2.5 py-1 font-semibold text-accent-ink">
              Lyrics
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

      <div className="flex min-h-0 flex-1">
        {/* --- song list ------------------------------------------------- */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs..."
                className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={newSong}
              aria-label="New song"
              className="shrink-0 rounded-md bg-accent p-1.5 text-accent-ink transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-2 py-8 text-center text-xs text-muted-foreground">
                {songs.length === 0 ? "No songs yet - add one to get started." : "No matches."}
              </li>
            ) : (
              results.map((song) => (
                <li key={song.id}>
                  <button
                    onClick={() => selectSong(song)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                      song.id === selectedSongId
                        ? "bg-panel-raised"
                        : "hover:bg-panel-raised/60",
                      song.id === liveSongId && "ring-1 ring-inset ring-accent",
                    )}
                  >
                    <span className="flex items-center gap-1.5 truncate text-sm text-foreground">
                      <Music className="h-3 w-3 shrink-0 text-muted-foreground" />
                      {song.title}
                    </span>
                    {song.artist ? (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {song.artist}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* --- selected song: sections ------------------------------------ */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
          {!selectedSong ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a song, or add a new one.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        value={selectedSong.title}
                        onChange={(e) => update(selectedSong.id, { title: e.target.value })}
                        placeholder="Song title"
                        className="rounded-md border border-input bg-background px-2.5 py-1.5 font-display text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex gap-2">
                        <input
                          value={selectedSong.artist ?? ""}
                          onChange={(e) => update(selectedSong.id, { artist: e.target.value })}
                          placeholder="Artist (optional)"
                          className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <input
                          value={selectedSong.ccli ?? ""}
                          onChange={(e) => update(selectedSong.id, { ccli: e.target.value })}
                          placeholder="CCLI # (optional)"
                          className="w-40 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="truncate font-display text-lg tracking-wide text-foreground">
                        {selectedSong.title}
                      </h2>
                      {selectedSong.artist ? (
                        <p className="text-xs text-muted-foreground">
                          {selectedSong.artist}
                          {selectedSong.ccli ? ` · CCLI ${selectedSong.ccli}` : ""}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setEditing((v) => !v)}
                    className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-panel-raised"
                  >
                    {editing ? "Done" : "Edit"}
                  </button>
                  <button
                    onClick={() => {
                      remove(selectedSong.id);
                      setSelectedSongId(null);
                      setSelectedSectionId(null);
                    }}
                    aria-label="Delete song"
                    className="rounded-md border border-border bg-panel p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* --- how this song looks on Output ------------------------------ */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-panel p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Position</span>
                  <div className="flex overflow-hidden rounded-md border border-border">
                    {(["top", "center", "bottom"] as LyricsPosition[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => update(selectedSong.id, { position: p })}
                        aria-pressed={(selectedSong.position ?? "top") === p}
                        className={cn(
                          "px-2.5 py-1 capitalize transition-colors",
                          (selectedSong.position ?? "top") === p
                            ? "bg-accent font-semibold text-accent-ink"
                            : "text-muted-foreground hover:bg-panel-raised hover:text-foreground",
                        )}
                      >
                        {p === "center" ? "Middle" : p}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Size</span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={selectedSong.fontScale ?? 1}
                    onChange={(e) => update(selectedSong.id, { fontScale: Number(e.target.value) })}
                    className="w-28 accent-[var(--accent)]"
                  />
                </label>
                <label className="flex min-w-0 items-center gap-2">
                  <span className="text-muted-foreground">Background</span>
                  <select
                    value={selectedSong.background?.mediaId ?? ""}
                    onChange={(e) => chooseBackground(selectedSong, e.target.value)}
                    className="max-w-48 truncate rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">None (black)</option>
                    {backgroundChoices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.kind === "video" ? "Video: " : ""}
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {backgroundChoices.length <= 5 ? (
                  <span className="text-[11px] text-muted-foreground">
                    Add videos/images in the Media tab and they show up here.
                  </span>
                ) : null}
              </div>

              {editing ? (
                <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
                  <button
                    onClick={() => setShowPaste((v) => !v)}
                    className="flex items-center gap-1.5 self-start text-xs font-medium text-foreground hover:text-accent"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    Paste full lyrics {showPaste ? "(hide)" : ""}
                  </button>
                  {showPaste ? (
                    <>
                      <textarea
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        rows={8}
                        placeholder={"Paste the whole song here.\nBlank line = new slide. [Chorus] / Verse 2: lines are used as labels."}
                        className="w-full resize-y rounded-md border border-input bg-background p-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <select
                          value={splitMode}
                          onChange={(e) => setSplitMode(e.target.value as SplitMode)}
                          className="rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="auto">Auto (blank lines, else every line)</option>
                          <option value="blocks">Split on blank lines</option>
                          <option value="lines">One line per slide</option>
                          <option value="pairs">Two lines per slide</option>
                        </select>
                        <span className="text-muted-foreground">
                          {pastePreview.length} slide{pastePreview.length === 1 ? "" : "s"}
                        </span>
                        <div className="ml-auto flex gap-2">
                          <button
                            onClick={() => applyPaste(selectedSong, false)}
                            disabled={pastePreview.length === 0}
                            className="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink disabled:opacity-40"
                          >
                            Add slides
                          </button>
                          <button
                            onClick={() => applyPaste(selectedSong, true)}
                            disabled={pastePreview.length === 0}
                            className="rounded-md border border-border bg-panel px-3 py-1 text-foreground hover:bg-panel-raised disabled:opacity-40"
                          >
                            Replace all
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                {selectedSong.sections.map((section) => {
                  const isLive =
                    live.mode === "song" &&
                    live.songId === selectedSong.id &&
                    live.section === section.label &&
                    live.text === section.text;
                  return (
                    <div
                      key={section.id}
                      className={cn(
                        "group rounded-lg border p-3 transition-colors",
                        isLive
                          ? "border-accent bg-accent/10"
                          : "border-border bg-panel hover:bg-panel-raised",
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        {editing ? (
                          <input
                            value={section.label}
                            onChange={(e) =>
                              updateSection(selectedSong.id, section.id, { label: e.target.value })
                            }
                            className="w-32 rounded border border-input bg-background px-1.5 py-0.5 font-display text-xs tracking-wider focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        ) : (
                          <span
                            className={cn(
                              "font-display text-xs tracking-wider",
                              isLive ? "text-accent" : "text-muted-foreground",
                            )}
                          >
                            {section.label.toUpperCase()}
                          </span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => addToService(selectedSong, section)}
                            aria-label={`Add ${section.label} to service`}
                            className="rounded p-1 text-muted-foreground hover:bg-panel-raised hover:text-foreground"
                          >
                            <ListPlus className="h-3.5 w-3.5" />
                          </button>
                          {editing ? (
                            <button
                              onClick={() => removeSection(selectedSong.id, section.id)}
                              aria-label={`Remove ${section.label}`}
                              className="rounded p-1 text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {editing ? (
                        <textarea
                          value={section.text}
                          onChange={(e) =>
                            updateSection(selectedSong.id, section.id, { text: e.target.value })
                          }
                          rows={4}
                          placeholder="Lyrics for this section..."
                          className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedSectionId(section.id);
                            goLive(selectedSong, section);
                          }}
                          disabled={!section.text.trim()}
                          className="w-full text-left"
                        >
                          <p
                            className="whitespace-pre-line leading-snug text-foreground"
                            style={{ fontSize: previewVerseFontSize(section.text.length) }}
                          >
                            {section.text.trim() || "(empty - click Edit to add lyrics)"}
                          </p>
                        </button>
                      )}
                    </div>
                  );
                })}
                {editing ? (
                  <button
                    onClick={() => addSection(selectedSong.id, "Verse")}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add section
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
