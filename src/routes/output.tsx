import { createFileRoute } from "@tanstack/react-router";
import { useOutput } from "@/hooks/use-presenter-sync";
import { MediaStage } from "@/components/media/media-stage";

export const Route = createFileRoute("/output")({
  head: () => ({
    meta: [{ title: "Output - Teens Media Presenter" }],
  }),
  component: OutputPage,
});

/**
 * Continuous font-size scaling so long verses still fit on screen and short
 * ones still read big at the back of the room. clamp() keeps it fluid across
 * projector resolutions without a hard breakpoint list.
 */
function verseFontSize(length: number): string {
  if (length <= 60) return "clamp(2.75rem, 3vw + 2.75rem, 7rem)";
  if (length <= 120) return "clamp(2.25rem, 2.4vw + 2rem, 5.5rem)";
  if (length <= 220) return "clamp(1.85rem, 1.8vw + 1.5rem, 4.25rem)";
  if (length <= 340) return "clamp(1.5rem, 1.3vw + 1.2rem, 3.25rem)";
  return "clamp(1.25rem, 1vw + 1rem, 2.5rem)";
}

function OutputPage() {
  const live = useOutput();

  if (live.mode === "image" || live.mode === "video") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-stage">
        <MediaStage state={live} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-stage">
      {live.mode === "scripture" ? (
        <div
          key={live.revision}
          className="stage-fade-enter flex h-full w-full flex-col items-center justify-center gap-10 px-[6vw] py-[6vh] text-center"
        >
          <p
            className="max-w-[86vw] font-sans font-medium leading-[1.35] text-foreground"
            style={{ fontSize: verseFontSize(live.text.length) }}
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
            {live.reference}
            <span className="ml-3 align-middle text-[0.55em] text-accent-dim">
              {live.translation}
            </span>
          </p>
        </div>
      ) : (
        <div key="blank" className="stage-fade-enter h-full w-full" />
      )}
    </div>
  );
}
