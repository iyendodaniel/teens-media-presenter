/**
 * Countdown timer state, kept OUTSIDE React component lifecycle.
 *
 * The timer widget used to hold its state in local `useState` inside the
 * Media route. That meant switching to the Scripture section (which
 * unmounts the Media route) threw the timer away completely - it wasn't
 * just paused, it forgot the time and stopped ticking.
 *
 * This module-level store lives for as long as the tab is open, so any
 * route can mount/unmount freely without resetting or pausing the count.
 * State is also mirrored to localStorage (keyed off an absolute end
 * timestamp) so a full page reload while running still shows correct time
 * elapsed instead of silently resuming from where it left off.
 *
 * When the countdown hits zero it also sounds a repeating chime (Web Audio,
 * no audio file needed) until the operator dismisses it - a color change
 * alone is easy to miss when you're not looking at the screen.
 */

export type TimerState = {
  totalSeconds: number;
  remaining: number;
  running: boolean;
  /** True from the moment the countdown hits 0 until the operator dismisses
   * it (via silenceAlarm/resetTimer/setting a new duration). Drives both
   * the repeating chime and any "time's up" visual treatment. */
  alarming: boolean;
};

type Listener = () => void;

export const MAX_TIMER_SECONDS = 12 * 60 * 60; // 12 hours, generous ceiling for a service clock

const TOTAL_KEY = "tmp.timer.totalSeconds";
const REMAINING_KEY = "tmp.timer.remaining";
const END_AT_KEY = "tmp.timer.endAt";
const ALARMING_KEY = "tmp.timer.alarming";

function loadInitial(): TimerState {
  if (typeof window === "undefined") {
    return { totalSeconds: 300, remaining: 300, running: false, alarming: false };
  }
  try {
    const storedTotal = Number.parseInt(window.localStorage.getItem(TOTAL_KEY) ?? "", 10);
    const totalSeconds = Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : 300;
    const endAt = Number.parseInt(window.localStorage.getItem(END_AT_KEY) ?? "", 10);
    if (Number.isFinite(endAt)) {
      const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      return { totalSeconds, remaining, running: remaining > 0, alarming: remaining <= 0 };
    }
    const storedRemaining = Number.parseInt(window.localStorage.getItem(REMAINING_KEY) ?? "", 10);
    const remaining = Number.isFinite(storedRemaining) ? storedRemaining : totalSeconds;
    return {
      totalSeconds,
      remaining,
      running: false,
      alarming: remaining <= 0 && window.localStorage.getItem(ALARMING_KEY) === "1",
    };
  } catch {
    return { totalSeconds: 300, remaining: 300, running: false, alarming: false };
  }
}

let state: TimerState = loadInitial();
const listeners = new Set<Listener>();
let intervalId: number | null = null;
let alarmIntervalId: number | null = null;
let audioCtx: AudioContext | null = null;

function persist() {
  try {
    window.localStorage.setItem(TOTAL_KEY, String(state.totalSeconds));
    window.localStorage.setItem(REMAINING_KEY, String(state.remaining));
    window.localStorage.setItem(ALARMING_KEY, state.alarming ? "1" : "0");
    if (!state.running) window.localStorage.removeItem(END_AT_KEY);
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  for (const listener of listeners) listener();
}

/* --------------------------------------------------------------- audio -- */
/* Browsers only let an AudioContext make sound after a user gesture. The
 * Start/Pause button click is that gesture, so we lazily create + resume
 * the context there; once resumed it stays usable for the later,
 * gesture-less chimes fired from setInterval when the countdown ends. */

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

export function primeAlarmAudio(): void {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function beep(freq: number, delaySec: number, duration = 0.2) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const start = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function chime() {
  beep(988, 0);
  beep(1318, 0.22);
}

function stopAlarmSound() {
  if (alarmIntervalId !== null) {
    window.clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
}

function startAlarmSound() {
  if (alarmIntervalId !== null || typeof window === "undefined") return;
  chime();
  alarmIntervalId = window.setInterval(chime, 4000);
}

/* --------------------------------------------------------------- ticking */

function tick() {
  if (!state.running) return;
  if (state.remaining <= 1) {
    state = { ...state, remaining: 0, running: false, alarming: true };
    emit();
    startAlarmSound();
    return;
  }
  state = { ...state, remaining: state.remaining - 1 };
  emit();
}

function ensureTicking() {
  if (intervalId !== null || typeof window === "undefined") return;
  intervalId = window.setInterval(tick, 1000);
}

if (typeof window !== "undefined") {
  ensureTicking();
  if (state.alarming) startAlarmSound();
}

/* ----------------------------------------------------------------- API -- */

export function getTimerState(): TimerState {
  return state;
}

export function subscribeTimer(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Set the duration from separate hours/minutes/seconds fields (any can be 0). */
export function setTimerDuration(hours: number, minutes: number, seconds: number): void {
  const totalSeconds = Math.max(
    0,
    Math.min(
      MAX_TIMER_SECONDS,
      Math.round(hours) * 3600 + Math.round(minutes) * 60 + Math.round(seconds),
    ),
  );
  stopAlarmSound();
  state = { totalSeconds, remaining: totalSeconds, running: false, alarming: false };
  try {
    window.localStorage.removeItem(END_AT_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Convenience wrapper for the minute-only preset buttons. */
export function setTimerMinutes(minutes: number): void {
  setTimerDuration(0, minutes, 0);
}

export function toggleTimer(): void {
  primeAlarmAudio();
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
    state = { ...state, running: true, alarming: false };
    stopAlarmSound();
  }
  emit();
}

export function resetTimer(): void {
  stopAlarmSound();
  state = { ...state, remaining: state.totalSeconds, running: false, alarming: false };
  try {
    window.localStorage.removeItem(END_AT_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Stop the repeating chime without resetting the clock - the "TIME'S UP"
 * display stays visible until Reset or a new duration is set. */
export function silenceAlarm(): void {
  if (!state.alarming) return;
  stopAlarmSound();
  emit();
}
