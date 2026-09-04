/**
 * Countdown timer state, kept OUTSIDE React component lifecycle.
 *
 * The timer widget used to hold its state in local `useState` inside the
 * Media route. That meant switching to the Scripture section (which
 * unmounts the Media route) threw the timer away completely — it wasn't
 * just paused, it forgot the time and stopped ticking.
 *
 * This module-level store lives for as long as the tab is open, so any
 * route can mount/unmount freely without resetting or pausing the count.
 * State is also mirrored to localStorage (keyed off an absolute end
 * timestamp) so a full page reload while running still shows correct time
 * elapsed instead of silently resuming from where it left off.
 */

export type TimerState = {
  totalSeconds: number;
  remaining: number;
  running: boolean;
};

type Listener = () => void;

const TOTAL_KEY = "tmp.timer.totalSeconds";
const REMAINING_KEY = "tmp.timer.remaining";
const END_AT_KEY = "tmp.timer.endAt";

function loadInitial(): TimerState {
  if (typeof window === "undefined") {
    return { totalSeconds: 300, remaining: 300, running: false };
  }
  try {
    const storedTotal = Number.parseInt(window.localStorage.getItem(TOTAL_KEY) ?? "", 10);
    const totalSeconds = Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : 300;
    const endAt = Number.parseInt(window.localStorage.getItem(END_AT_KEY) ?? "", 10);
    if (Number.isFinite(endAt)) {
      const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      return { totalSeconds, remaining, running: remaining > 0 };
    }
    const storedRemaining = Number.parseInt(window.localStorage.getItem(REMAINING_KEY) ?? "", 10);
    return {
      totalSeconds,
      remaining: Number.isFinite(storedRemaining) ? storedRemaining : totalSeconds,
      running: false,
    };
  } catch {
    return { totalSeconds: 300, remaining: 300, running: false };
  }
}

let state: TimerState = loadInitial();
const listeners = new Set<Listener>();
let intervalId: number | null = null;

function persist() {
  try {
    window.localStorage.setItem(TOTAL_KEY, String(state.totalSeconds));
    window.localStorage.setItem(REMAINING_KEY, String(state.remaining));
    if (!state.running) window.localStorage.removeItem(END_AT_KEY);
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  for (const listener of listeners) listener();
}

function tick() {
  if (!state.running) return;
  if (state.remaining <= 1) {
    state = { ...state, remaining: 0, running: false };
    emit();
    return;
  }
  state = { ...state, remaining: state.remaining - 1 };
  emit();
}

function ensureTicking() {
  if (intervalId !== null || typeof window === "undefined") return;
  intervalId = window.setInterval(tick, 1000);
}

if (typeof window !== "undefined") ensureTicking();

export function getTimerState(): TimerState {
  return state;
}

export function subscribeTimer(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTimerMinutes(minutes: number): void {
  const clamped = Math.max(0, Math.min(180, minutes));
  const totalSeconds = clamped * 60;
  state = { totalSeconds, remaining: totalSeconds, running: false };
  try {
    window.localStorage.removeItem(END_AT_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function toggleTimer(): void {
  if (state.running) {
    state = { ...state, running: false };
    try {
      window.localStorage.removeItem(END_AT_KEY);
    } catch {
      /* ignore */
    }
  } else {
    if (state.remaining <= 0) return;
    try {
      window.localStorage.setItem(END_AT_KEY, String(Date.now() + state.remaining * 1000));
    } catch {
      /* ignore */
    }
    state = { ...state, running: true };
  }
  emit();
}

export function resetTimer(): void {
  state = { ...state, remaining: state.totalSeconds, running: false };
  try {
    window.localStorage.removeItem(END_AT_KEY);
  } catch {
    /* ignore */
  }
  emit();
}
