import { createFileRoute } from "@tanstack/react-router";
import { useOutput } from "@/hooks/use-presenter-sync";
import { MediaStage } from "@/components/media/media-stage";
import { useResolvedUrl } from "@/hooks/use-media-library";
import { DEFAULT_FONT_SCALE, fontFamilyFor } from "@/lib/presenter-sync";
import { verseFontSize } from "@/lib/verse-font-size";

export const Route = createFileRoute("/output")({
  head: () => ({
    meta: [{ title: "Output - Teens Media Presenter" }],
  }),
  component: OutputPage,
});

function OutputPage() {
  const live = useOutput();
  const background =
    live.mode === "scripture" || live.mode === "song" ? live.background : undefined;
  const backgroundUrl = useResolvedUrl(background?.mediaId, background?.src);

  if (live.mode === "image" || live.mode === "video") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-stage">
        <MediaStage state={live} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-stage">
      {live.mode === "scripture" || live.mode === "song" ? (
        <div
          key={live.revision}
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
          <div className="relative z-10 flex flex-col items-center gap-10">
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
    </div>
  );
}
