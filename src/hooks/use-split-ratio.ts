import { useCallback, useEffect, useState } from "react";

/** Persisted horizontal split between a left panel and the live preview. */
export function useSplitRatio(
  storageKey: string,
  defaultRatio = 0.34,
  min = 0.18,
  max = 0.6,
) {
  const [ratio, setRatio] = useState(defaultRatio);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? Number.parseFloat(stored) : NaN;
    if (Number.isFinite(parsed)) setRatio(Math.min(max, Math.max(min, parsed)));
  }, [storageKey, min, max]);

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      setRatio(clamped);
      window.localStorage.setItem(storageKey, String(clamped));
    },
    [storageKey, min, max],
  );

  return { ratio, setRatio, commit, defaultRatio, min, max };
}
