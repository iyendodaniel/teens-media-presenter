import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveState, MediaFitMode } from "@/lib/presenter-sync";
import { resolveBlobUrl } from "@/lib/media-store";

export function fitClass(fit: MediaFitMode): string {
  if (fit === "fill") return "h-full w-full object-cover";
  if (fit === "center") return "max-h-full max-w-full object-none";
  return "h-full w-full object-contain";
}

/** Resolves the renderable URL for a live media state in the current window. */
export function useLiveMediaUrl(state: LiveState): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const mediaId = state.mode === "image" || state.mode === "video" ? state.mediaId : null;
  const src = state.mode === "image" || state.mode === "video" ? state.src : undefined;

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

type Props = {
  state: LiveState;
  /** Control-panel mirrors stay silent; the Output window carries the audio. */
  forceMuted?: boolean;
  /** Report playback position back to the operator UI. */
  onTime?: (current: number, duration: number) => void;
};

/**
 * Renders a live media state. Used by both the Output window and the
 * Control Panel mirror, so what the operator sees is what the room sees.
 */
export function MediaStage({ state, forceMuted = false, onTime }: Props) {
  const url = useLiveMediaUrl(state);
  const videoRef = useRef<HTMLVideoElement>(null);
  const appliedSeek = useRef<number>(-1);

  const playing = state.mode === "video" ? state.playing : false;
  const seekRev = state.mode === "video" ? state.seekRev : 0;
  const seekTo = state.mode === "video" ? state.seekTo : 0;
  const mediaId = state.mode === "video" ? state.mediaId : null;

  // Sticky autoplay-muted fallback. Browsers block programmatic unmuted
  // autoplay unless this document has "media engagement" — the Output
  // window usually doesn't. When a play() attempt gets rejected we force
  // muted and remember that in state (not just on the DOM node), because a
  // re-render would otherwise snap `muted` back to state.muted (false) and
  // the next play() attempt would fail again. Resets when a genuinely new
  // video comes in, so a fresh item still gets one honest unmuted attempt.
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  useEffect(() => setAutoplayMuted(false), [mediaId]);

  const attemptPlay = useCallback((video: HTMLVideoElement) => {
    void video.play().catch(() => {
      video.muted = true;
      setAutoplayMuted(true);
      void video.play().catch(() => {
        /* still blocked — needs a real click on the Output window */
      });
    });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || state.mode !== "video") return;
    if (appliedSeek.current !== seekRev) {
      appliedSeek.current = seekRev;
      try {
        video.currentTime = seekTo;
      } catch {
        /* metadata not ready yet; loadedmetadata handler retries */
      }
    }
    if (playing) {
      attemptPlay(video);
    } else {
      video.pause();
    }
  }, [playing, seekRev, seekTo, url, state.mode, attemptPlay]);

  if (state.mode === "image") {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-stage">
        {url ? (
          <img
            key={state.revision}
            src={url}
            alt={state.name}
            className={`stage-fade-enter ${fitClass(state.fit)}`}
          />
        ) : null}
      </div>
    );
  }

  if (state.mode === "video" && state.embed) {
    // YouTube/Vimeo: src is an iframe embed URL, not a video file. Playback
    // transport (play/pause) isn't wired for embeds — restart re-mounts the
    // iframe via the key below, which is the one control that reliably works
    // across providers without a postMessage integration per provider.
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-stage">
        {url ? (
          <iframe
            key={`${state.mediaId}-${seekRev}`}
            src={url}
            title={state.name}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : null}
      </div>
    );
  }

  if (state.mode === "video") {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-stage">
        {url ? (
          <video
            ref={videoRef}
            key={state.mediaId}
            src={url}
            className={fitClass(state.fit)}
            playsInline
            loop={state.loop}
            muted={forceMuted || state.muted || autoplayMuted}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              try {
                video.currentTime = seekTo;
              } catch {
                /* ignore */
              }
              if (playing) attemptPlay(video);
            }}
            onTimeUpdate={(e) =>
              onTime?.(e.currentTarget.currentTime, e.currentTarget.duration || 0)
            }
          />
        ) : null}
      </div>
    );
  }

  return <div className="h-full w-full bg-stage" />;
}
