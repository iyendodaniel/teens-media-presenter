import { useEffect } from "react";

/**
 * One shared keydown listener for the control-panel screens (Scripture,
 * Media, Lyrics). Each screen used to hand-roll its own `window.addEventListener("keydown", ...)`
 * with slightly different copies of the same "is the user typing in an
 * input" guard, the same Cmd/Ctrl+K + "/" search-open binding, the same
 * Escape handling, and the same arrow-key stepping. This hook centralizes
 * that shared shape; screen-specific bindings (media's space/p/b/c/r, for
 * example) are passed in via `extraKeys` rather than forked into their own
 * listener.
 *
 * Every callback is optional - a screen only wires up what it needs. Pass
 * `deps` with everything the callbacks close over, the same way you would
 * for a hand-written `useEffect`.
 */
export type ShortcutConfig = {
  /** Extra keys (besides Cmd/Ctrl+K and "/") that should also open search, e.g. ["m", "M"]. */
  searchOpenKeys?: string[];
  /** Fired on Cmd/Ctrl+K, "/", or any `searchOpenKeys` match (all ignored while typing, except Cmd/Ctrl+K). */
  onOpenSearch?: () => void;
  /**
   * Whether a search overlay is currently open. When true, Escape closes it
   * instead of running `onEscape` - matching the "close the palette first"
   * behavior of the Media screen. Screens without a search overlay (Lyrics)
   * can omit this.
   */
  searchOpen?: boolean;
  /** Fired when Escape should close the search overlay/blur the focused input, instead of running `onEscape`. */
  onCloseSearch?: () => void;
  /** Fired on Escape when not typing and the search overlay (if any) isn't open. Typically "blank the output". */
  onEscape?: () => void;
  /** Fired on ArrowDown / ArrowRight, when not typing. Typically "advance the live item". */
  onStepNext?: () => void;
  /** Fired on ArrowUp / ArrowLeft, when not typing. Typically "go back one live item". */
  onStepPrev?: () => void;
  /**
   * Additional single-key bindings (space, letters, etc.), only checked
   * while not typing and with no modifier key held. Keys are matched
   * case-insensitively, so a single `p` entry covers both "p" and "P".
   */
  extraKeys?: Record<string, (e: KeyboardEvent) => void>;
  /** Re-binds the listener when any of these change - pass everything the callbacks above close over. */
  deps: React.DependencyList;
};

export function useShortcuts(config: ShortcutConfig) {
  const {
    searchOpenKeys = [],
    onOpenSearch,
    searchOpen = false,
    onCloseSearch,
    onEscape,
    onStepNext,
    onStepPrev,
    extraKeys,
  } = config;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (onOpenSearch) {
        const opensSearch =
          (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
          (!isTyping && (e.key === "/" || searchOpenKeys.includes(e.key)));
        if (opensSearch) {
          e.preventDefault();
          onOpenSearch();
          return;
        }
      }

      if (e.key === "Escape") {
        if (isTyping || searchOpen) {
          onCloseSearch?.();
          if (isTyping) (target as HTMLInputElement | null)?.blur();
          return;
        }
        if (onEscape) {
          e.preventDefault();
          onEscape();
        }
        return;
      }

      if (isTyping) return;

      if (onStepNext && (e.key === "ArrowDown" || e.key === "ArrowRight")) {
        e.preventDefault();
        onStepNext();
        return;
      }
      if (onStepPrev && (e.key === "ArrowUp" || e.key === "ArrowLeft")) {
        e.preventDefault();
        onStepPrev();
        return;
      }

      if (extraKeys && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const handler = extraKeys[e.key.toLowerCase()];
        if (handler) {
          e.preventDefault();
          handler(e);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, config.deps);
}
