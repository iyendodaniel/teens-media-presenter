import { useResolvedUrl } from "@/hooks/use-media-library";
import type { StageBackground } from "@/lib/presenter-sync";

/**
 * Image or looping muted video behind scripture/lyrics, plus a dim layer so
 * text stays readable. Render it as a direct child of a `relative` stage,
 * BEFORE the text, and keep it outside any element keyed on `revision` -
 * otherwise a video restarts every time the lyrics advance.
 */
export function StageBackgroundLayer({
  background,
  dim = 0.55,
}: {
  background?: StageBackground | undefined;
  dim?: number;
}) {
  const url = useResolvedUrl(background?.mediaId, background?.src);
  if (!url) return null;
  return (
    <>
      {background?.kind === "video" ? (
        <video
          key={url}
          src={url}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />
    </>
  );
}
