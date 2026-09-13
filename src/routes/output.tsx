import { createFileRoute } from "@tanstack/react-router";
import { useOutput, useTimerOverlay } from "@/hooks/use-presenter-sync";
import { MediaStage } from "@/components/media/media-stage";
import { useResolvedUrl } from "@/hooks/use-media-library";
import { DEFAULT_FONT_SCALE, fontFamilyFor } from "@/lib/presenter-sync";
import { verseFontSize } from "@/lib/verse-font-size";
import { useFitText } from "@/hooks/use-fit-text";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/output")({
  head: () => ({
    meta: [{ title: "Output - Teens Media Presenter" }],
  }),
  component: OutputPage,
});

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Countdown overlay, rendered on top of whatever else is live. */
function TimerOverlay() {
  const timer = useTimerOverlay();
  if (!timer) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-[5vh] right-[5vw] z-20 rounded-2xl border px-8 py-4 font-mono tabular-nums shadow-stage backdrop-blur-sm transition-colors",
        timer.alarming
          ? "timer-flash border-destructive bg-destructive/20 text-destructive"
          : "border-white/15 bg-black/45 text-foreground",
      )}
      style={{ fontSize: "clamp(2rem, 3.5vw, 5rem)" }}
    >
      {timer.alarming ? "TIME'S UP" : formatClock(timer.remaining)}
    </div>
  );
}

function OutputPage() {
  const live = useOutput();
  const background =
    live.mode === "scripture" || live.mode === "song" ? live.background : undefined;
  const backgroundUrl = useResolvedUrl(background?.mediaId, background?.src);

  // Guarantees the verse + reference block never overflows the screen, no
  // matter how large the Text Size slider pushes the base font-size - see
  // use-fit-text.ts for why the clamp()-based sizing alone isn't enough.
  //
  // Keyed directly on fontScale/fontFamily/text rather than just
  // live.revision: revision is Date.now(), and a fast slider drag can fire
  // two pushes within the same millisecond, so revision alone can miss a
  // change even though the rendered font-size did change.
  const isScriptureOrSong = live.mode === "scripture" || live.mode === "song";
  const { containerRef, contentRef, scale } = useFitText<HTMLDivElement, HTMLDivElement>([
    isScriptureOrSong ? live.revision : null,
    isScriptureOrSong ? live.fontScale : null,
    isScriptureOrSong ? live.fontFamily : null,
    isScriptureOrSong ? live.text : null,
  ]);

  if (live.mode === "image" || live.mode === "video") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-stage">
        <MediaStage state={live} />
        <TimerOverlay />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-stage">
      {live.mode === "scripture" || live.mode === "song" ? (
        <div
          key={live.revision}
          ref={containerRef}
          className="stage-fade-enter relative flex h-full w-full flex-col items-center justify-center gap-10 px-[6vw] py-[6vh] text-center"
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
          <div
            ref={contentRef}
            className="relative z-10 flex flex-col items-center gap-10"
            style={{ transform: `scale(${scale})` }}
          >
            <p
              className="max-w-[86vw] whitespace-pre-line font-medium leading-[1.35] text-foreground"
              style={{
                fontSize: verseFontSize(live.text.length, live.fontScale ?? DEFAULT_FONT_SCALE),
                fontFamily: fontFamilyFor(live.fontFamily),
              }}
            >
              {live.text}
            </p>
            <p
              className="font-display text-accent"
              style={{
                fontSize: "clamp(1.25rem, 1.4vw + 1rem, 2.75rem)",
                letterSpacing: "0.04em",
              }}
            >
              {live.mode === "scripture" ? (
                <>
                  {live.reference}
                  <span className="ml-3 align-middle text-[0.55em] text-accent-dim">
                    {live.translation}
                  </span>
                </>
              ) : (
                <>
                  {live.title}
                  <span className="ml-3 align-middle text-[0.55em] text-accent-dim">
                    {live.section}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div key="blank" className="stage-fade-enter h-full w-full" />
      )}
      <TimerOverlay />
    </div>
  );
}