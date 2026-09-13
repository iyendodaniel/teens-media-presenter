import { useEffect, useRef, useState } from "react";
import type { LiveState, MediaFitMode } from "@/lib/presenter-sync";
import { resolveBlobUrl } from "@/lib/media-store";
import { youtubeIdFromEmbedUrl } from "@/lib/media-library";

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
  const embedRef = useRef<HTMLIFrameElement>(null);
  const appliedSeek = useRef<number>(-1);
  const appliedEmbedSeek = useRef<number>(-1);

  const playing = state.mode === "video" ? state.playing : false;
  const seekRev = state.mode === "video" ? state.seekRev : 0;
  const seekTo = state.mode === "video" ? state.seekTo : 0;
  // Vimeo also sets embed:true but speaks a different postMessage protocol
  // than the one below - only YouTube gets play/pause/seek control this way,
  // detected by whether we can pull a video id back out of the embed URL.
  const youtubeId = state.mode === "video" && state.embed ? youtubeIdFromEmbedUrl(url ?? "") : null;

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
      void video.play().catch(() => {
        // Autoplay policies can block unmuted playback; fall back to muted.
        video.muted = true;
        void video.play().catch(() => {});
      });
    } else {
      video.pause();
    }
  }, [playing, seekRev, seekTo, url, state.mode]);

  // Drives play/pause/seek on THIS window's own YouTube iframe via
  // postMessage, from the same synced playing/seekRev/seekTo state that
  // drives the plain <video> effect above. Runs in BOTH windows - Output
  // and the (muted) Control Panel mirror both actually play the video, kept
  // in lockstep by reacting to the same shared state, so pausing on either
  // one pauses both. Only the audio differs (see the mute effect below).
  useEffect(() => {
    const iframe = embedRef.current;
    if (!iframe || !youtubeId) return;
    const win = iframe.contentWindow;
    if (!win) return;

    const post = (func: string, args: unknown[] = []) =>
      win.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube.com");

    if (appliedEmbedSeek.current !== seekRev) {
      appliedEmbedSeek.current = seekRev;
      post("seekTo", [seekTo, true]);
    }
    post(playing ? "playVideo" : "pauseVideo");
  }, [playing, seekRev, seekTo, youtubeId, url]);

  // Silences the Control Panel's copy so there's still only ONE audible
  // source even though both windows are genuinely playing the video. Fires
  // repeatedly for a couple seconds after the iframe (re)loads, since
  // YouTube's player briefly ignores postMessage commands sent before it's
  // actually ready - a single mute call right on mount can land too early
  // and get dropped, letting a flash of audio through.
  useEffect(() => {
    const iframe = embedRef.current;
    if (!iframe || !youtubeId || !forceMuted) return;
    const win = iframe.contentWindow;
    if (!win) return;

    const sendMute = () =>
      win.postMessage(
        JSON.stringify({ event: "command", func: "mute" }),
        "https://www.youtube.com",
      );
    sendMute();
    let attempts = 0;
    const id = setInterval(() => {
      sendMute();
      attempts += 1;
      if (attempts >= 6) clearInterval(id);
    }, 300);
    return () => clearInterval(id);
  }, [youtubeId, forceMuted, url]);

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
    // YouTube: both windows genuinely load and play the same video, kept in
    // lockstep by the effects above - so Pause on either window pauses
    // both. The Control Panel's copy is muted (see above), so there's still
    // only one audible source even though two copies are actually playing.
    //
    // Vimeo speaks a different postMessage protocol that isn't wired up
    // here, so muting its Control Panel copy isn't possible - it falls back
    // to a placeholder there instead of risking a second, unmuted copy.
    if (forceMuted && !youtubeId) {
      return (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-stage">
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Live on Output
          </span>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-stage">
        {url ? (
          <iframe
            // YouTube's iframe stays mounted across a restart - restart is
            // just a seekTo(0) command via the effect above. Vimeo has no
            // such command wired here, so it keeps the old behaviour of
            // remounting the iframe on seekRev to restart.
            ref={embedRef}
            key={youtubeId ? state.mediaId : `${state.mediaId}-${seekRev}`}
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
            muted={forceMuted || state.muted}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              try {
                video.currentTime = seekTo;
              } catch {
                /* ignore */
              }
              if (playing) void video.play().catch(() => {});
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