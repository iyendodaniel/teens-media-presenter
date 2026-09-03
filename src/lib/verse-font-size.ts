/**
 * Continuous font-size scaling so long verses still fit on screen and short
 * ones still read big at the back of the room. clamp() keeps it fluid across
 * projector resolutions without a hard breakpoint list.
 *
 * `scale` is the operator-controlled multiplier (see the Text size slider in
 * the scripture control panel) applied on top of the auto-fit tiers below.
 */
const TIERS = [
  { max: 60, min: 2.75, vw: 3, base: 2.75, cap: 7 },
  { max: 120, min: 2.25, vw: 2.4, base: 2, cap: 5.5 },
  { max: 220, min: 1.85, vw: 1.8, base: 1.5, cap: 4.25 },
  { max: 340, min: 1.5, vw: 1.3, base: 1.2, cap: 3.25 },
  { max: Infinity, min: 1.25, vw: 1, base: 1, cap: 2.5 },
];

export function verseFontSize(length: number, scale = 1): string {
  const tier = TIERS.find((t) => length <= t.max) ?? TIERS[TIERS.length - 1]!;
  const min = (tier.min * scale).toFixed(2);
  const vw = (tier.vw * scale).toFixed(2);
  const base = (tier.base * scale).toFixed(2);
  const cap = (tier.cap * scale).toFixed(2);
  return `clamp(${min}rem, ${vw}vw + ${base}rem, ${cap}rem)`;
}

/** Same tiers, expressed in container-query units for the in-panel preview. */
const PREVIEW_TIERS = [
  { max: 60, min: 0.9, cqw: 3.6, cap: 1.9 },
  { max: 120, min: 0.8, cqw: 2.9, cap: 1.5 },
  { max: 220, min: 0.7, cqw: 2.3, cap: 1.2 },
  { max: 340, min: 0.62, cqw: 1.9, cap: 1 },
  { max: Infinity, min: 0.55, cqw: 1.5, cap: 0.85 },
];

export function previewVerseFontSize(length: number, scale = 1): string {
  const tier =
    PREVIEW_TIERS.find((t) => length <= t.max) ?? PREVIEW_TIERS[PREVIEW_TIERS.length - 1]!;
  const min = (tier.min * scale).toFixed(2);
  const cqw = (tier.cqw * scale).toFixed(2);
  const cap = (tier.cap * scale).toFixed(2);
  return `clamp(${min}rem, ${cqw}cqw, ${cap}rem)`;
}
