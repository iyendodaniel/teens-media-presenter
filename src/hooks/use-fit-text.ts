import { useLayoutEffect, useRef, useState } from "react";

/**
 * Hard backstop on top of the clamp()-based auto-fit tiers in
 * verse-font-size.ts. Those get the font size close using a character-count
 * heuristic, but the operator's Text Size slider (up to MAX_FONT_SCALE) can
 * still push it past what actually fits - especially for a long verse at a
 * high scale. This measures the real rendered box and shrinks with a CSS
 * transform if it doesn't fit, so Output can never clip text off-screen no
 * matter how the slider is set.
 *
 * One measurement, not an iterative loop: `transform: scale()` doesn't
 * affect layout size, so we measure the content at its natural (unscaled)
 * size once, compute the exact ratio needed, and apply it directly.
 *
 * Re-measures whenever `deps` changes (pass things like the live revision,
 * text, translation, fontScale, fontFamily) or when the container resizes -
 * e.g. the Output window moving to a different-resolution second screen.
 */
export function useFitText<
  TContainer extends HTMLElement = HTMLDivElement,
  TContent extends HTMLElement = HTMLDivElement,
>(deps: unknown[]) {
  const containerRef = useRef<TContainer>(null);
  const contentRef = useRef<TContent>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const fit = () => {
      // Reset before measuring - a leftover transform from a previous fit
      // doesn't affect scrollWidth/Height, but resetting avoids compounding
      // sub-pixel rounding across repeated resizes in some browsers.
      content.style.transform = "scale(1)";

      const cs = getComputedStyle(container);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = container.clientWidth - padX;
      const availH = container.clientHeight - padY;

      const naturalW = content.scrollWidth;
      const naturalH = content.scrollHeight;
      if (naturalW === 0 || naturalH === 0) return;

      // 0.98 leaves a small safety margin so text doesn't sit flush against
      // the very edge of the projected area.
      const next = Math.min(1, availW / naturalW, availH / naturalH) * 0.98;
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);

    // Fonts load via Google Fonts with display=swap, so the first paint can
    // use a fallback font with different metrics than the real one. If the
    // real font swaps in after we've already measured, the box can grow and
    // overflow again - re-fit once web fonts are actually ready to catch
    // that. document.fonts.ready resolves immediately if fonts were already
    // loaded (e.g. cached from a previous verse), so this is a no-op then.
    let cancelled = false;
    void document.fonts?.ready?.then(() => {
      if (!cancelled) fit();
    });

    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, contentRef, scale };
}